import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT) || 3000;
const host = '0.0.0.0';

app.use(express.json());

// Proxy helper for Binance if needed
app.get('/api/binance/*', async (req, res) => {
  try {
    const targetPath = req.originalUrl.replace(/^\/api\/binance/, '');
    const targetUrl = `https://api.binance.com${targetPath}`;
    const response = await fetch(targetUrl);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Unified Cache for active BTC prediction market and live prices
let cachedActiveBtc = null;
let lastBtcFetchTime = 0;
let limitlessWsInstance = null;
let currentWsStatus = 'DISCONNECTED';
let latestOrderbookData = null;
const orderbookVersions = new Map();
let latestOracleData = null;
let latestPositionsData = null;
let recentOrderEvents = [];
let recentTxEvents = [];
const sseClients = new Set();
let subscribedSlugs = new Set();

// ============================================================================
// VM Persistent Trade Guard (RAM + Disk: trade-guard.json)
// ============================================================================
const TRADE_GUARD_FILE = path.join(process.cwd(), 'trade-guard.json');
let inMemoryTradeGuard = null;
let isServerExecutingOrder = false;

function loadTradeGuardFromDisk() {
  try {
    if (fs.existsSync(TRADE_GUARD_FILE)) {
      const raw = fs.readFileSync(TRADE_GUARD_FILE, 'utf8');
      inMemoryTradeGuard = JSON.parse(raw);
      console.log(`[VM Trade Guard] Loaded persistent lock from disk: ${inMemoryTradeGuard?.marketSlug || 'none'}`);
      return inMemoryTradeGuard;
    }
  } catch (err) {
    console.warn('[VM Trade Guard] Error reading trade-guard.json:', err.message);
  }
  inMemoryTradeGuard = null;
  return null;
}

function persistTradeGuard(guard) {
  inMemoryTradeGuard = guard;
  try {
    fs.writeFileSync(TRADE_GUARD_FILE, JSON.stringify(guard, null, 2), 'utf8');
    console.log(`[VM Trade Guard] Persisted trade lock on VM disk: ${guard?.marketSlug}`);
  } catch (err) {
    console.warn('[VM Trade Guard] Error writing trade-guard.json:', err.message);
  }
}

function clearTradeGuardFromDisk() {
  inMemoryTradeGuard = null;
  try {
    if (fs.existsSync(TRADE_GUARD_FILE)) {
      fs.unlinkSync(TRADE_GUARD_FILE);
      console.log('[VM Trade Guard] Cleared trade lock from VM disk.');
    }
  } catch (err) {
    console.warn('[VM Trade Guard] Error removing trade-guard.json:', err.message);
  }
}

// Initial load into RAM on server boot
loadTradeGuardFromDisk();

function is15MinBtcMarket(m) {
  if (!m) return false;
  const slug = (m.slug || '').toLowerCase();
  const title = (m.title || '').toLowerCase();
  const isBtc = slug.includes('btc') || title.includes('btc') || title.includes('bitcoin');
  if (!isBtc) return false;
  const is15 = /(^|[^0-9])15-min/i.test(slug) || /15\s*min/i.test(title) || /(^|[^0-9])15m/i.test(slug);
  const is5 = /(^|[^0-9])5-min/i.test(slug) || /(^|[^0-9])5\s*min/i.test(title);
  if (slug.includes('hourly') || slug.includes('daily')) return false;
  return is15 && !is5;
}

function broadcastSse(eventType, payload) {
  const msg = `event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(msg);
      if (typeof client.flush === 'function') client.flush();
    } catch {
      sseClients.delete(client);
    }
  }
}

async function fetchLive15MinBtcMarket() {
  try {
    const response = await fetch('https://api.limitless.exchange/markets/active');
    if (!response.ok) return null;
    const json = await response.json();
    const list = json?.data || [];
    const now = Date.now();
    // Strictly require unexpired 15-minute BTC market (expirationTimestamp > now)
    const valid15mMkts = list.filter((m) => is15MinBtcMarket(m) && m.expirationTimestamp && Number(m.expirationTimestamp) > now);
    
    // Sort so the currently active (closing soonest, but in the future) or funded market is first
    valid15mMkts.sort((a, b) => {
      if (a.status === 'FUNDED' && b.status !== 'FUNDED') return -1;
      if (b.status === 'FUNDED' && a.status !== 'FUNDED') return 1;
      return (Number(a.expirationTimestamp) || 0) - (Number(b.expirationTimestamp) || 0);
    });

    return valid15mMkts[0] || null;
  } catch {
    return null;
  }
}

async function pollActiveBtcMarket() {
  try {
    const now = Date.now();

    // Wipe cached market if expired
    if (cachedActiveBtc?.expirationTimestamp && Number(cachedActiveBtc.expirationTimestamp) <= now) {
      console.log(`[Limitless Rollover] Current contract expired (${cachedActiveBtc.slug}). Clearing cached active market...`);
      cachedActiveBtc = null;
      latestOrderbookData = null;
      subscribedSlugs.clear();
    }

    const market = await fetchLive15MinBtcMarket();
    if (!market) {
      // If no new market found yet, ensure socket is still healthy
      if (!limitlessWsInstance || typeof limitlessWsInstance.isConnected !== 'function' || !limitlessWsInstance.isConnected()) {
        initLimitlessSdkWebSocket().catch(() => {});
      }
      return;
    }

    const previousSlug = cachedActiveBtc?.slug;
    const slugChanged = previousSlug && previousSlug !== market.slug;

    // Fetch live orderbook directly to guarantee real-time moving contract prices
    let liveYesPrice = null;
    try {
      const obRes = await fetch(`https://api.limitless.exchange/markets/${encodeURIComponent(market.slug)}/orderbook`);
      if (obRes.ok) {
        const obJson = await obRes.json();
        latestOrderbookData = {
          marketSlug: market.slug,
          orderbook: obJson,
          timestamp: now,
        };

        if (typeof obJson?.adjustedMidpoint === 'number' && obJson.adjustedMidpoint > 0 && obJson.adjustedMidpoint < 1) {
          liveYesPrice = obJson.adjustedMidpoint;
        } else if (obJson?.bids?.[0]?.price && obJson?.asks?.[0]?.price) {
          liveYesPrice = (obJson.bids[0].price + obJson.asks[0].price) / 2;
        } else if (obJson?.bids?.[0]?.price && obJson.bids[0].price > 0 && obJson.bids[0].price < 1) {
          liveYesPrice = obJson.bids[0].price;
        } else if (obJson?.asks?.[0]?.price && obJson.asks[0].price > 0 && obJson.asks[0].price < 1) {
          liveYesPrice = obJson.asks[0].price;
        }

        broadcastSse('orderbookUpdate', latestOrderbookData);
      }
    } catch {
      // safe continuation
    }

    // Determine freshest prices
    let resolvedPrices = market.prices || [0.5, 0.5];
    if (liveYesPrice !== null && liveYesPrice > 0 && liveYesPrice < 1) {
      const p0 = parseFloat(Number(liveYesPrice).toFixed(4));
      const p1 = parseFloat((1 - p0).toFixed(4));
      resolvedPrices = [p0, p1];
    } else if (cachedActiveBtc?.prices && (!slugChanged)) {
      resolvedPrices = cachedActiveBtc.prices;
    }

    const prevPrices = cachedActiveBtc?.prices;
    const pricesChanged = !prevPrices || prevPrices[0] !== resolvedPrices[0] || prevPrices[1] !== resolvedPrices[1];

    cachedActiveBtc = {
      slug: market.slug,
      title: market.title,
      status: market.status,
      prices: resolvedPrices,
      tradePrices: market.tradePrices || { buy: { market: resolvedPrices } },
      address: market.address,
      expirationTimestamp: market.expirationTimestamp,
      startAt: market.startAt,
      openPrice: market.metadata?.openPrice,
      tokens: market.tokens,
      venueExchange: market.venue?.exchange,
      volumeFormatted: market.volumeFormatted,
      oracleSource: market.priceOracleMetadata?.name || 'Chainlink BTC 60s TWAP',
    };
    lastBtcFetchTime = now;

    if (pricesChanged) {
      broadcastSse('priceUpdate', { marketSlug: market.slug, prices: resolvedPrices });
    }

    if (slugChanged) {
      latestOrderbookData = null;
      subscribedSlugs.clear();
      console.log(`[Limitless Rollover] New 15m contract active on VM: ${market.slug}`);
      broadcastSse('marketChange', cachedActiveBtc);
    }

    // Always maintain live WebSocket health & subscription
    if (!limitlessWsInstance || typeof limitlessWsInstance.isConnected !== 'function' || !limitlessWsInstance.isConnected()) {
      initLimitlessSdkWebSocket().catch(() => {});
    } else if (!subscribedSlugs.has(market.slug)) {
      try {
        const subParams = { marketSlugs: [market.slug] };
        if (market.address) subParams.marketAddresses = [market.address];
        limitlessWsInstance.subscribe('subscribe_market_prices', subParams).catch(() => {});
        subscribedSlugs.add(market.slug);
        console.log(`[Limitless WS] Subscribed to market prices for: ${market.slug}`);
      } catch {
        // ignore
      }
    }
  } catch (err) {
    // safe continuation
  }
}

// ============================================================================
// Limitless Official WebSocketClient Streaming Manager (per official docs)
// ============================================================================
let isWsConnecting = false;

async function initLimitlessSdkWebSocket() {
  if (isWsConnecting) return;
  isWsConnecting = true;

  try {
    const sdk = await import('@limitless-exchange/sdk');
    const tokenId = (process.env.LMTS_TOKEN_ID || '').trim();
    const secret = (process.env.LMTS_TOKEN_SECRET || process.env['.MTS_TOKEN_SECRET'] || '').trim();
    let hasAuth = Boolean(tokenId && secret);

    // If an existing socket exists, disconnect first
    if (limitlessWsInstance) {
      try {
        await limitlessWsInstance.disconnect().catch(() => {});
      } catch {}
      limitlessWsInstance = null;
    }

    const wsConfig = {
      url: 'wss://ws.limitless.exchange',
      autoReconnect: false, // Per Limitless docs: manual reconnect ensures fresh handshake signature & avoids Invalid HMAC
      timeout: 10000,
    };
    if (hasAuth) {
      wsConfig.hmacCredentials = { tokenId, secret };
    }

    let ws = new sdk.WebSocketClient(wsConfig);
    limitlessWsInstance = ws;
    currentWsStatus = 'CONNECTING';
    broadcastSse('status', { status: 'CONNECTING' });

    // Setup event listeners
    const attachListeners = (targetWs) => {
      // CLOB Orderbook updates
      targetWs.on('orderbookUpdate', (data) => {
        const slug = data?.marketSlug;
        const lastVer = slug ? orderbookVersions.get(slug) || 0 : 0;
        if (data?.version && data.version <= lastVer) {
          return; // Drop frames with version <= last seen (per docs)
        }
        if (data?.version && slug) {
          orderbookVersions.set(slug, data.version);
        }
        latestOrderbookData = data;

        // Extract real-time live contract price from orderbook update
        const ob = data?.orderbook;
        let liveYesPrice = null;
        if (typeof ob?.adjustedMidpoint === 'number' && ob.adjustedMidpoint > 0 && ob.adjustedMidpoint < 1) {
          liveYesPrice = ob.adjustedMidpoint;
        } else if (ob?.bids?.[0]?.price && ob?.asks?.[0]?.price) {
          liveYesPrice = (ob.bids[0].price + ob.asks[0].price) / 2;
        } else if (ob?.bids?.[0]?.price && ob.bids[0].price > 0 && ob.bids[0].price < 1) {
          liveYesPrice = ob.bids[0].price;
        } else if (ob?.asks?.[0]?.price && ob.asks[0].price > 0 && ob.asks[0].price < 1) {
          liveYesPrice = ob.asks[0].price;
        }

        if (liveYesPrice !== null && liveYesPrice > 0 && liveYesPrice < 1) {
          const p0 = parseFloat(Number(liveYesPrice).toFixed(4));
          const p1 = parseFloat((1 - p0).toFixed(4));
          if (cachedActiveBtc) {
            cachedActiveBtc.prices = [p0, p1];
            if (cachedActiveBtc.tradePrices?.buy?.market) {
              cachedActiveBtc.tradePrices.buy.market = [p0, p1];
            }
          }
          broadcastSse('priceUpdate', { marketSlug: slug || cachedActiveBtc?.slug, prices: [p0, p1] });
        }

        broadcastSse('orderbookUpdate', data);
      });

      // Handle AMM price stream events
      targetWs.on('newPriceData', (data) => {
        const updates = Array.isArray(data?.updatedPrices)
          ? data.updatedPrices
          : (data?.updatedPrices ? [data.updatedPrices] : [data]);

        for (const p of updates) {
          if (!p) continue;
          const yes = typeof p.yesPrice === 'number' ? p.yesPrice : (typeof p.price === 'number' ? p.price : null);
          const no = typeof p.noPrice === 'number' ? p.noPrice : (yes !== null ? 1 - yes : null);
          if (yes !== null && no !== null && yes > 0 && no > 0) {
            const p0 = parseFloat(Number(yes).toFixed(4));
            const p1 = parseFloat(Number(no).toFixed(4));
            if (cachedActiveBtc) {
              cachedActiveBtc.prices = [p0, p1];
              if (cachedActiveBtc.tradePrices?.buy?.market) {
                cachedActiveBtc.tradePrices.buy.market = [p0, p1];
              }
            }
            broadcastSse('priceUpdate', { marketSlug: p.marketSlug || cachedActiveBtc?.slug, prices: [p0, p1] });
          }
        }
      });

      targetWs.on('oraclePriceData', (data) => {
        latestOracleData = data;
        broadcastSse('oraclePriceData', data);
      });

      targetWs.on('positions', (data) => {
        latestPositionsData = data;
        broadcastSse('positions', data);
      });

      targetWs.on('orderEvent', (event) => {
        recentOrderEvents.unshift(event);
        if (recentOrderEvents.length > 50) recentOrderEvents.pop();
        broadcastSse('orderEvent', event);
      });

      targetWs.on('tx', (data) => {
        recentTxEvents.unshift(data);
        if (recentTxEvents.length > 50) recentTxEvents.pop();
        broadcastSse('tx', data);
      });

      targetWs.on('system', (data) => {
        broadcastSse('system', data);
      });

      targetWs.on('disconnect', (reason) => {
        currentWsStatus = 'CONNECTING';
        console.log(`[Limitless WS] Disconnected (${reason}). Re-initiating connection in 1.5s...`);
        broadcastSse('status', { status: 'CONNECTING', reason });
        subscribedSlugs.clear();
        limitlessWsInstance = null;
        setTimeout(() => {
          initLimitlessSdkWebSocket().catch(() => {});
        }, 1500);
      });

      targetWs.on('error', async (err) => {
        const errMsg = err?.message || String(err);
        console.warn('[Limitless WS] Event error notice:', errMsg);
        // If market resolved or auth failure, recover immediately
        if (errMsg.includes('resolved') || errMsg.includes('Invalid') || !targetWs.isConnected()) {
          console.log('[Limitless WS] Detected market resolution or disconnect. Auto-recovering...');
          cachedActiveBtc = null;
          subscribedSlugs.clear();
          try { await targetWs.disconnect(); } catch {}
          limitlessWsInstance = null;
          setTimeout(() => {
            pollActiveBtcMarket().then(() => initLimitlessSdkWebSocket().catch(() => {}));
          }, 1000);
        }
      });
    };

    attachListeners(ws);

    // Try connecting
    try {
      await ws.connect();
    } catch (authErr) {
      if (hasAuth) {
        console.warn('[Limitless WS] HMAC connection failed, falling back to public mode for prices:', authErr?.message || authErr);
        // Fallback to public mode (no credentials) so UP/DOWN prices never stop streaming
        hasAuth = false;
        try { await ws.disconnect().catch(() => {}); } catch {}
        ws = new sdk.WebSocketClient({
          url: 'wss://ws.limitless.exchange',
          autoReconnect: false,
          timeout: 10000,
        });
        limitlessWsInstance = ws;
        attachListeners(ws);
        await ws.connect();
      } else {
        throw authErr;
      }
    }

    currentWsStatus = hasAuth ? 'AUTHENTICATED' : 'CONNECTED';
    console.log(`[Limitless WS] Connected successfully. Status: ${currentWsStatus}`);
    broadcastSse('status', { status: currentWsStatus });

    // Initial market discovery before issuing subscriptions
    if (!cachedActiveBtc) {
      await pollActiveBtcMarket();
    }

    const now = Date.now();
    const activeSlug = cachedActiveBtc?.slug &&
      is15MinBtcMarket(cachedActiveBtc) &&
      (!cachedActiveBtc.expirationTimestamp || Number(cachedActiveBtc.expirationTimestamp) > now)
        ? cachedActiveBtc.slug
        : null;

    if (activeSlug) {
      try {
        const subParams = { marketSlugs: [activeSlug] };
        if (cachedActiveBtc?.address) {
          subParams.marketAddresses = [cachedActiveBtc.address];
        }
        await ws.subscribe('subscribe_market_prices', subParams);
        subscribedSlugs.add(activeSlug);
        console.log(`[Limitless WS] Subscribed to live market prices for: ${activeSlug}`);

        if (hasAuth) {
          await ws.subscribe('subscribe_positions', subParams);
          await ws.subscribe('subscribe_order_events');
          await ws.subscribe('subscribe_transactions');
          console.log('[Limitless WS] Subscribed to authenticated positions, order events & tx');
        }
      } catch (subErr) {
        console.warn('[Limitless WS] Initial subscribe warning:', subErr?.message || subErr);
      }
    }
  } catch (err) {
    console.error('[Limitless WS] Connection failed:', err?.message || err);
    currentWsStatus = 'ERROR';
    broadcastSse('status', { status: 'ERROR', message: err?.message || String(err) });
    // Auto-retry in 3s so the bot never stays dead in ERROR
    setTimeout(() => {
      initLimitlessSdkWebSocket().catch(() => {});
    }, 3000);
  } finally {
    isWsConnecting = false;
  }
}

// Background poller every 2 seconds for continuous orderbook and market state sync
pollActiveBtcMarket();
setInterval(pollActiveBtcMarket, 2000);

// Start WebSocket connection in background
initLimitlessSdkWebSocket().catch((err) => {
  console.warn('[Limitless WS] Background init error:', err?.message);
});

// Server-Sent Events (SSE) live stream to deliver zero-latency updates to frontend
app.get('/api/limitless/live-stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  // Initial heartbeat
  res.write(': connected\n\n');

  // Send initial state snapshots immediately
  res.write(`event: status\ndata: ${JSON.stringify({ status: currentWsStatus })}\n\n`);
  if (latestOrderbookData) {
    res.write(`event: orderbookUpdate\ndata: ${JSON.stringify(latestOrderbookData)}\n\n`);
  }
  if (cachedActiveBtc?.prices) {
    res.write(`event: priceUpdate\ndata: ${JSON.stringify({ marketSlug: cachedActiveBtc.slug, prices: cachedActiveBtc.prices })}\n\n`);
  }
  if (latestOracleData) {
    res.write(`event: oraclePriceData\ndata: ${JSON.stringify(latestOracleData)}\n\n`);
  }
  if (latestPositionsData) {
    res.write(`event: positions\ndata: ${JSON.stringify(latestPositionsData)}\n\n`);
  }
  const initGuard = inMemoryTradeGuard || loadTradeGuardFromDisk();
  if (initGuard) {
    res.write(`event: tradeGuardUpdate\ndata: ${JSON.stringify(initGuard)}\n\n`);
  }

  // Keepalive ping every 5 seconds to prevent Google Cloud VM / Nginx proxy timeouts
  const pingTimer = setInterval(() => {
    try {
      res.write(`: ping\n\n`);
      if (typeof res.flush === 'function') res.flush();
    } catch {
      clearInterval(pingTimer);
    }
  }, 5000);

  sseClients.add(res);

  req.on('close', () => {
    clearInterval(pingTimer);
    sseClients.delete(res);
  });
});

// ============================================================================
// VM Persistent Trade Guard REST Endpoints
// ============================================================================
app.get('/api/trade-guard', (_req, res) => {
  const guard = inMemoryTradeGuard || loadTradeGuardFromDisk();
  res.json({ success: true, guard });
});

app.post('/api/trade-guard', (req, res) => {
  try {
    const { marketSlug, timestamp, candleTime, direction, outcome, price, size, orderId } = req.body || {};
    const guard = {
      marketSlug: String(marketSlug || '').trim(),
      timestamp: Number(timestamp) || Date.now(),
      candleTime: Number(candleTime) || Date.now(),
      direction: direction || 'LONG',
      outcome: outcome || 'UP',
      price: price ? Number(price) : undefined,
      size: size ? Number(size) : undefined,
      orderId: orderId || undefined,
    };
    persistTradeGuard(guard);
    broadcastSse('tradeGuardUpdate', guard);
    res.json({ success: true, guard });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

app.post('/api/trade-guard/clear', (_req, res) => {
  try {
    clearTradeGuardFromDisk();
    broadcastSse('tradeGuardUpdate', null);
    res.json({ success: true, message: 'Trade guard cleared from VM disk and RAM' });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

app.post('/api/limitless/subscribe', async (req, res) => {
  try {
    let { marketSlug } = req.body || {};
    const now = Date.now();
    // Prevent subscribing to resolved or expired slugs
    if (cachedActiveBtc?.slug && cachedActiveBtc.expirationTimestamp && Number(cachedActiveBtc.expirationTimestamp) > now) {
      marketSlug = cachedActiveBtc.slug;
    }

    if (marketSlug && limitlessWsInstance && typeof limitlessWsInstance.isConnected === 'function' && limitlessWsInstance.isConnected()) {
      if (!subscribedSlugs.has(marketSlug)) {
        await limitlessWsInstance.subscribe('subscribe_market_prices', {
          marketSlugs: [marketSlug],
        });
        subscribedSlugs.add(marketSlug);
        console.log(`[Limitless WS] Subscribed via API for: ${marketSlug}`);
      }
    }
    res.json({ success: true, subscribed: marketSlug });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Snapshot endpoint for polling or quick state recovery
app.get('/api/limitless/live-state', (_req, res) => {
  res.json({
    status: currentWsStatus,
    orderbook: latestOrderbookData,
    oracle: latestOracleData,
    positions: latestPositionsData,
    market: cachedActiveBtc,
    recentOrderEvents: recentOrderEvents.slice(0, 10),
    recentTxEvents: recentTxEvents.slice(0, 10),
  });
});

app.get('/api/limitless/active-btc', async (_req, res) => {
  try {
    const now = Date.now();
    if (
      cachedActiveBtc &&
      is15MinBtcMarket(cachedActiveBtc) &&
      (!cachedActiveBtc.expirationTimestamp || Number(cachedActiveBtc.expirationTimestamp) > now) &&
      now - lastBtcFetchTime < 1500
    ) {
      return res.json({ success: true, ...cachedActiveBtc });
    }

    await pollActiveBtcMarket();

    if (
      cachedActiveBtc &&
      (!cachedActiveBtc.expirationTimestamp || Number(cachedActiveBtc.expirationTimestamp) > now)
    ) {
      return res.json({ success: true, ...cachedActiveBtc });
    }

    res.json({ success: false, message: 'No active 15-minute BTC prediction market found' });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// Orderbook endpoint for specific market slug
app.get('/api/limitless/orderbook', async (req, res) => {
  try {
    const slug = req.query.slug || cachedActiveBtc?.slug || 'btc-up-or-down-15-min';
    if (latestOrderbookData && latestOrderbookData.marketSlug === slug) {
      return res.json(latestOrderbookData.orderbook || latestOrderbookData);
    }

    const targetUrl = `https://api.limitless.exchange/markets/${encodeURIComponent(slug)}/orderbook`;
    const response = await fetch(targetUrl);
    if (!response.ok) {
      return res.status(response.status).json({ error: `Limitless API returned status ${response.status}` });
    }
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Dedicated EIP-712 Order Execution Endpoint according to Limitless specification
app.post('/api/limitless/order', async (req, res) => {
  // 1. Concurrency In-Flight Mutex (Immediate 0.1ms rejection of parallel calls)
  if (isServerExecutingOrder) {
    console.warn('[VM SHIELD BLOCKED] Concurrent order already in-flight.');
    return res.status(429).json({
      success: false,
      mode: 'IN_FLIGHT_LOCKED',
      error: 'يوجد أمر شراء قيد التنفيذ والتوقيع حالياً على السيرفر. تم حظر الأمر المزدوج.',
    });
  }

  // 2. STRICT ANTI-DUPLICATE SHIELD: Check VM persistent trade lock across ALL 15m contracts
  const currentGuard = inMemoryTradeGuard || loadTradeGuardFromDisk();
  const nowMs = Date.now();
  const COOLDOWN_MS = 14 * 60 * 1000; // 14-minute absolute cooldown
  const requestedSlug = (req.body?.market || '').trim();

  if (!req.body?.ignoreLock && currentGuard && currentGuard.timestamp > 0) {
    const timeSinceLast = nowMs - Number(currentGuard.timestamp);
    const isSameSlug = currentGuard.marketSlug && requestedSlug && (
      currentGuard.marketSlug === requestedSlug ||
      currentGuard.marketSlug.includes(requestedSlug) ||
      requestedSlug.includes(currentGuard.marketSlug)
    );

    // Condition 1: Within 14-minute cooldown window (ABSOLUTE BLOCK)
    // Condition 2: Or exactly the same contract slug
    if (timeSinceLast < COOLDOWN_MS || isSameSlug) {
      const remainingMins = Math.max(1, Math.ceil((COOLDOWN_MS - timeSinceLast) / 60000));
      console.warn(`[VM STRICT SHIELD BLOCKED] Blocked duplicate order attempt! Last trade was ${Math.round(timeSinceLast / 1000)}s ago (${currentGuard.marketSlug}). Locked for ${remainingMins} more minutes.`);
      return res.status(429).json({
        success: false,
        mode: 'VM_TRADE_LOCKED',
        error: `حظر التكرار الصارم على السيرفر: تم تنفيذ صفقة سابقة منذ ${Math.round(timeSinceLast / 60000)} دقيقة على عقد [${currentGuard.marketSlug}]. غير مسموح بفتح صفقة جديدة إلا بعد انتهاء 15 دقيقة كاملة (متبقي ${remainingMins} دقيقة).`,
        cooldownRemainingMinutes: remainingMins,
        lockedGuard: currentGuard,
      });
    }
  }

  isServerExecutingOrder = true;

  try {
    const { market, direction, outcome, type, price, size, chunkId, privateKey, tokenId: bodyTokenId, secret: bodySecret } = req.body || {};
    const pk = (privateKey || process.env.PRIVATE_KEY || '').trim();
    const tokenId = (bodyTokenId || process.env.LMTS_TOKEN_ID || '').trim();
    const secret = (bodySecret || process.env.LMTS_TOKEN_SECRET || process.env['.MTS_TOKEN_SECRET'] || '').trim();

    // Check if live credentials are provided for on-chain EIP-712 signing
    const hasLiveAuth = Boolean(pk && tokenId && secret);

    // Fetch market data to obtain token IDs and venue contract address
    let activeMarketSlug = market || 'btc-100k-weekly';
    let marketData = null;

    // Check if market exists, and verify it has not expired or resolved
    let isExpiredOrResolved = false;
    if (activeMarketSlug && is15MinBtcMarket({ slug: activeMarketSlug })) {
      try {
        const mRes = await fetch(`https://api.limitless.exchange/markets/${encodeURIComponent(activeMarketSlug)}`);
        if (mRes.ok) {
          marketData = await mRes.json();
          if (marketData?.expirationTimestamp && marketData.expirationTimestamp <= Date.now()) {
            isExpiredOrResolved = true;
          }
          if (marketData?.status && marketData.status !== 'FUNDED') {
            isExpiredOrResolved = true;
          }
        } else {
          isExpiredOrResolved = true;
        }
      } catch {
        isExpiredOrResolved = true;
      }
    } else {
      isExpiredOrResolved = true;
    }

    if (isExpiredOrResolved || !marketData) {
      const activeRes = await fetch('https://api.limitless.exchange/markets/active');
      if (activeRes.ok) {
        const activeJson = await activeRes.json();
        const list = activeJson?.data || [];
        const now = Date.now();
        const live15 = list.find((m) => is15MinBtcMarket(m) && m.status === 'FUNDED' && (!m.expirationTimestamp || m.expirationTimestamp > now))
          || list.find((m) => is15MinBtcMarket(m) && (!m.expirationTimestamp || m.expirationTimestamp > now));
        if (live15) {
          activeMarketSlug = live15.slug;
          marketData = live15;
          cachedActiveBtcServer = live15;
          console.log(`[ORDER ROUTER] Market was expired/inactive. Auto-routed to current live 15m market: '${live15.slug}'`);
        }
      }
    }

    if (!marketData || !is15MinBtcMarket(marketData)) {
      return res.status(400).json({
        success: false,
        error: `Safety Guard Blocked: No active, unexpired 15-minute BTC market was found on Limitless Exchange. Order aborted.`,
      });
    }

    // Ensure marketData has tokens and venue
    if (!marketData?.tokens?.yes || !marketData?.tokens?.no || !marketData?.venue?.exchange) {
      try {
        const mFullRes = await fetch(`https://api.limitless.exchange/markets/${encodeURIComponent(activeMarketSlug)}`);
        if (mFullRes.ok) {
          const mFull = await mFullRes.json();
          marketData = { ...marketData, ...mFull };
        }
      } catch {
        // Safe continuation
      }
    }

    const venueExchange = marketData?.venue?.exchange || '0x05c748E2f4DcDe0ec9Fa8DDc40DE6b867f923fa5';
    const isLong = direction === 'LONG' || outcome === 'UP';
    const targetTokenId = isLong ? marketData?.tokens?.yes : marketData?.tokens?.no;

    if (!targetTokenId) {
      return res.status(400).json({
        success: false,
        error: `Token ID for outcome ${outcome} could not be resolved for market '${activeMarketSlug}'. Order cancelled.`,
      });
    }

    // Require live credentials for on-chain execution - do not silently fake execution!
    if (!hasLiveAuth) {
      return res.status(400).json({
        success: false,
        mode: 'MISSING_CREDENTIALS',
        error: 'تعذر تنفيذ الصفقة: المفتاح الخاص PRIVATE_KEY أو توثيق HMAC (LMTS_TOKEN_ID و LMTS_TOKEN_SECRET) غير موجود في ملف .env في الخادم! يرجى إدخال هذه المفاتيح في ملف .env في الخادم ليتم توقيع وإرسال الصفقات الحية مباشرة إلى Limitless.',
        missing: {
          privateKey: !pk,
          tokenId: !tokenId,
          secret: !secret,
        },
      });
    }

    // Extract market ask price for this outcome so FAK orders fill immediately
    const marketAsk = isLong
      ? (marketData?.tradePrices?.buy?.market?.[0] ?? marketData?.prices?.[0] ?? 0.50)
      : (marketData?.tradePrices?.buy?.market?.[1] ?? marketData?.prices?.[1] ?? 0.50);

    let inputPrice = Number(price) > 1 ? Number(price) / 100 : (Number(price) || marketAsk);
    // Add 1.5% slippage buffer for FAK to guarantee execution against book movements
    if (type === 'FAK' && inputPrice <= marketAsk) {
      inputPrice = Math.min(0.999, marketAsk * 1.015);
    }
    // Price must have max 3 decimal places for Limitless SDK tick alignment (0.001)
    const tickAlignedPrice = Math.max(0.001, Math.min(0.999, parseFloat(Number(inputPrice).toFixed(3))));
    const contractCount = Math.max(1, Math.round(Number(size) || 1));

    const { ethers } = await import('ethers');
    const sdk = await import('@limitless-exchange/sdk');

    const formattedPk = pk.startsWith('0x') ? pk : `0x${pk}`;
    const wallet = new ethers.Wallet(formattedPk);

    const httpClient = new sdk.HttpClient({
      baseURL: sdk.DEFAULT_API_URL,
      hmacCredentials: {
        tokenId,
        secret,
      },
    });

    // Ensure account is in EOA trading mode as required by Limitless EIP-712 specification
    try {
      const axiosClient = httpClient.http?.client;
      if (axiosClient && typeof axiosClient.put === 'function') {
        await axiosClient.put('/profiles', { tradeWalletOption: 'eoa' });
      }
    } catch {
      // Safe continuation if already in eoa mode
    }

    // Initialize official OrderClient with wallet and HMAC HttpClient
    const orderClient = new sdk.OrderClient({
      httpClient,
      wallet,
      logger: new sdk.ConsoleLogger(),
    });

    const orderTypeEnum = type === 'GTC'
      ? sdk.OrderType.GTC
      : type === 'FOK'
      ? sdk.OrderType.FOK
      : sdk.OrderType.FAK;

    const orderArgs = {
      marketSlug: activeMarketSlug,
      tokenId: String(targetTokenId),
      side: sdk.Side.BUY,
      orderType: orderTypeEnum,
      price: tickAlignedPrice,
      size: contractCount,
    };

    if (orderTypeEnum === sdk.OrderType.FOK) {
      orderArgs.makerAmount = Math.max(0.1, Number((contractCount * tickAlignedPrice).toFixed(2)));
      delete orderArgs.price;
      delete orderArgs.size;
    }

    console.log(`[Limitless LIVE ORDER] Sending order via SDK...`, {
            account: wallet.address,
            slug: activeMarketSlug,
            outcome: isLong ? 'UP' : 'DOWN',
            type: orderTypeEnum,
            price: tickAlignedPrice,
            contracts: contractCount,
          });

          const result = await orderClient.createOrder(orderArgs);

          console.log(`[EIP-712 LIVE ORDER] Order submitted successfully! ID: ${result?.id || 'OK'}`);

          // Automatically persist execution to VM RAM & disk (trade-guard.json)
          const orderIdResolved = result?.id || result?.order?.id || `ord_${Date.now()}`;
          const guardRecord = {
            marketSlug: activeMarketSlug,
            candleTime: req.body?.candleTime || Date.now(),
            timestamp: Date.now(),
            direction: isLong ? 'LONG' : 'SHORT',
            outcome: isLong ? 'UP' : 'DOWN',
            price: tickAlignedPrice,
            size: contractCount,
            orderId: orderIdResolved,
          };
          persistTradeGuard(guardRecord);
          broadcastSse('tradeGuardUpdate', guardRecord);

          return res.json({
            success: true,
            mode: 'LIVE_EIP712_EXECUTED',
            orderId: orderIdResolved,
            marketSlug: activeMarketSlug,
            direction: isLong ? 'LONG' : 'SHORT',
            outcome: isLong ? 'UP' : 'DOWN',
            tokenId: targetTokenId,
            price: tickAlignedPrice,
            size: contractCount,
            chunkId,
            details: result,
            guard: guardRecord,
          });
  } catch (err) {
    const errorDetail = err?.response?.data?.message || err?.response?.data?.error || err?.message || String(err);
    console.warn('[EIP-712 ORDER NOTICE]', errorDetail);
    res.status(500).json({ success: false, error: errorDetail });
  } finally {
    isServerExecutingOrder = false;
  }
});

// General Limitless API proxy to avoid CORS and browser restrictions
app.all('/api/limitless/*', async (req, res) => {
  try {
    const targetPath = req.originalUrl.replace(/^\/api\/limitless/, '');
    const targetUrl = `https://api.limitless.exchange${targetPath}`;
    const headers = { 'Content-Type': 'application/json' };
    if (process.env.LIMITLESS_API_KEY) {
      headers['X-API-Key'] = process.env.LIMITLESS_API_KEY;
    }
    const fetchOptions = {
      method: req.method,
      headers,
    };
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body && Object.keys(req.body).length > 0) {
      fetchOptions.body = JSON.stringify(req.body);
    }
    const response = await fetch(targetUrl, fetchOptions);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

async function fetchLiveWalletAndBalance(customAddress = '') {
  let address = (customAddress || process.env.WALLET_ADDRESS || '').trim();
  const pk = process.env.PRIVATE_KEY?.trim();
  if (pk) {
    try {
      const { ethers } = await import('ethers');
      const formattedPk = pk.startsWith('0x') ? pk : `0x${pk}`;
      const wallet = new ethers.Wallet(formattedPk);
      address = wallet.address;
    } catch {
      // Ignore
    }
  }

  let profileData = null;
  const tokenId = (process.env.LMTS_TOKEN_ID || '').trim();
  const tokenSecret = (process.env.LMTS_TOKEN_SECRET || process.env['.MTS_TOKEN_SECRET'] || '').trim();

  if (tokenId && tokenSecret) {
    try {
      const sdk = await import('@limitless-exchange/sdk');
      const client = new sdk.HttpClient({
        baseURL: sdk.DEFAULT_API_URL,
        hmacCredentials: {
          tokenId,
          secret: tokenSecret,
        },
      });
      const pf = new sdk.PortfolioFetcher(client);
      profileData = await pf.getProfile();
      if (!address && profileData?.account) {
        address = profileData.account;
      }
    } catch {
      // Ignore
    }
  }

  let usdcBalance = 0;
  let ethBalance = 0;

  if (address) {
    const { ethers } = await import('ethers');
    const customRpc = process.env.BASE_RPC_URL?.trim();
    const rpcs = [
      ...(customRpc ? [customRpc] : []),
      'https://mainnet.base.org',
      'https://base.llamarpc.com',
      'https://base-rpc.publicnode.com',
    ];
    const usdcAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
    const usdcAbi = ['function balanceOf(address) view returns (uint256)'];

    for (const rpc of rpcs) {
      try {
        const provider = new ethers.JsonRpcProvider(rpc);
        const usdc = new ethers.Contract(usdcAddress, usdcAbi, provider);
        const [rawUsdc, rawEth] = await Promise.all([
          usdc.balanceOf(address),
          provider.getBalance(address),
        ]);
        usdcBalance = parseFloat(ethers.formatUnits(rawUsdc, 6));
        ethBalance = parseFloat(ethers.formatEther(rawEth));
        break;
      } catch {
        // try next rpc
      }
    }
  }

  return {
    isLive: Boolean(address),
    address,
    usdcBalance,
    ethBalance,
    network: 'Base Mainnet (8453)',
    profile: profileData ? {
      username: profileData.username,
      displayName: profileData.displayName,
      points: profileData.points,
      rank: profileData.rank?.name,
    } : null,
  };
}

app.get('/api/balance', async (req, res) => {
  try {
    const customAddress = req.query.address || req.query.wallet;
    const data = await fetchLiveWalletAndBalance(customAddress);
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

app.get('/api/credentials', async (_req, res) => {
  try {
    const walletData = await fetchLiveWalletAndBalance();
    const resolvedSecret = process.env.LMTS_TOKEN_SECRET || process.env['.MTS_TOKEN_SECRET'] || '';
    res.json({
      hasLmtsTokenId: Boolean(process.env.LMTS_TOKEN_ID),
      hasLmtsTokenSecret: Boolean(resolvedSecret),
      hasPrivateKey: Boolean(process.env.PRIVATE_KEY),
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
      hasApiKey: Boolean(process.env.LIMITLESS_API_KEY),
      hasBaseRpc: Boolean(process.env.BASE_RPC_URL),
      limitlessTokenId: process.env.LMTS_TOKEN_ID || '',
      limitlessTokenSecret: resolvedSecret,
      limitlessApiKey: process.env.LIMITLESS_API_KEY || '',
      walletAddress: walletData.address,
      liveUsdcBalance: walletData.usdcBalance,
      ethBalance: walletData.ethBalance,
      username: walletData.profile?.username,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// Save credentials directly from UI to server environment and .env file
app.post('/api/config/save-credentials', async (req, res) => {
  try {
    const {
      privateKey,
      limitlessTokenId,
      limitlessTokenSecret,
      limitlessApiKey,
      walletAddress,
    } = req.body || {};

    if (privateKey !== undefined) process.env.PRIVATE_KEY = String(privateKey).trim();
    if (limitlessTokenId !== undefined) process.env.LMTS_TOKEN_ID = String(limitlessTokenId).trim();
    if (limitlessTokenSecret !== undefined) process.env.LMTS_TOKEN_SECRET = String(limitlessTokenSecret).trim();
    if (limitlessApiKey !== undefined) process.env.LIMITLESS_API_KEY = String(limitlessApiKey).trim();
    if (walletAddress !== undefined) process.env.WALLET_ADDRESS = String(walletAddress).trim();

    // Persist to .env file in root
    try {
      const envLines = [
        `LIMITLESS_API_KEY=${process.env.LIMITLESS_API_KEY || ''}`,
        `LMTS_TOKEN_ID=${process.env.LMTS_TOKEN_ID || ''}`,
        `LMTS_TOKEN_SECRET=${process.env.LMTS_TOKEN_SECRET || ''}`,
        `PRIVATE_KEY=${process.env.PRIVATE_KEY || ''}`,
        `WALLET_ADDRESS=${process.env.WALLET_ADDRESS || ''}`,
      ];
      fs.writeFileSync(path.join(__dirname, '.env'), envLines.join('\n'), 'utf8');
    } catch (fsErr) {
      console.warn('[CONFIG] Could not write .env file:', fsErr.message);
    }

    // Refresh Limitless SDK WebSocket if credentials changed
    initLimitlessSdkWebSocket().catch(() => {});

    // Fetch updated wallet and balance
    const walletData = await fetchLiveWalletAndBalance();

    res.json({
      success: true,
      message: 'Credentials updated and saved successfully',
      wallet: walletData,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// Serve frontend static build if dist exists
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  // Graceful fallback page so PM2 never crashes in an infinite restart loop
  app.get('*', (_req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
        <head>
          <meta charset="utf-8">
          <title>Limitless Quant Bot Terminal - قيد البناء</title>
          <style>
            body { background: #080c14; color: #e2e8f0; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .card { background: #0f172a; padding: 2rem; border-radius: 1rem; border: 1px solid #334155; text-align: center; max-width: 500px; }
            h1 { color: #10b981; font-size: 1.5rem; margin-bottom: 1rem; }
            code { background: #020617; padding: 0.4rem 0.8rem; border-radius: 0.4rem; color: #38bdf8; font-family: monospace; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>تم تشغيل الخادم بنجاح 🚀</h1>
            <p>يجب بناء الواجهة أولاً عن طريق تنفيذ الأمر:</p>
            <p><code>npm run build</code></p>
            <p>ثم أعد تشغيل التطبيق في PM2.</p>
          </div>
        </body>
      </html>
    `);
  });
}

app.listen(port, host, () => {
  console.log(`[Limitless Quant Bot] Server running at http://${host}:${port}`);
});

process.on('SIGINT', async () => {
  console.log('[Limitless Quant Bot] Gracefully shutting down WebSocket and server...');
  if (limitlessWsInstance) {
    try { await limitlessWsInstance.disconnect(); } catch {}
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[Limitless Quant Bot] SIGTERM received. Gracefully shutting down...');
  if (limitlessWsInstance) {
    try { await limitlessWsInstance.disconnect(); } catch {}
  }
  process.exit(0);
});
