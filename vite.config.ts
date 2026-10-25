import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

async function fetchLiveWalletAndBalance() {
  let address = '';
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

  // Also query Limitless SDK profile using HMAC if available
  let profileData: any = null;
  if (process.env.LMTS_TOKEN_ID && process.env.LMTS_TOKEN_SECRET) {
    try {
      const sdk = await import('@limitless-exchange/sdk');
      const client = new sdk.HttpClient({
        baseURL: sdk.DEFAULT_API_URL,
        hmacCredentials: {
          tokenId: process.env.LMTS_TOKEN_ID,
          secret: process.env.LMTS_TOKEN_SECRET,
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
    const rpcs = [
      'https://mainnet.base.org',
      'https://base.llamarpc.com',
      'https://base-rpc.publicnode.com',
    ];
    const usdcAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // Base USDC
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

let cachedActiveBtc: any = null;
let lastBtcFetchTime = 0;

// ============================================================================
// Limitless 15-Minute Strict Market Filter (Guarantees only 15m contracts)
// ============================================================================
function is15MinBtcMarket(m: any): boolean {
  if (!m) return false;
  const slug = (m.slug || '').toLowerCase();
  const title = (m.title || '').toLowerCase();

  // Must be Bitcoin
  const isBtc = slug.includes('btc') || title.includes('btc') || title.includes('bitcoin');
  if (!isBtc) return false;

  // Must strictly be 15-minute
  const is15 = /(^|[^0-9])15-min/i.test(slug) || /15\s*min/i.test(title) || /(^|[^0-9])15m/i.test(slug);
  // Strictly reject 5-minute (use boundary so "15-min" does not match "5-min")
  const is5 = /(^|[^0-9])5-min/i.test(slug) || /(^|[^0-9])5\s*min/i.test(title);

  if (slug.includes('hourly') || slug.includes('daily')) {
    return false;
  }

  return is15 && !is5;
}

async function fetchLive15MinBtcMarket(): Promise<any> {
  try {
    const res = await fetch('https://api.limitless.exchange/markets/active');
    if (!res.ok) return null;
    const json = await res.json();
    const list = json?.data || [];
    const now = Date.now();
    // Prioritize active, funded 15-minute BTC market that has NOT yet expired
    const btc15 = list.find((m: any) => is15MinBtcMarket(m) && m.status === 'FUNDED' && (!m.expirationTimestamp || m.expirationTimestamp > now))
      || list.find((m: any) => is15MinBtcMarket(m) && (!m.expirationTimestamp || m.expirationTimestamp > now))
      || list.find((m: any) => is15MinBtcMarket(m));
    return btc15 || null;
  } catch {
    return null;
  }
}

let limitlessWsInstance: any = null;
let currentWsStatus: string = 'DISCONNECTED';
let latestOrderbookData: any = null;
const orderbookVersions = new Map<string, number>();
let latestOracleData: any = null;
let latestPositionsData: any = null;
const recentOrderEvents: any[] = [];
const recentTxEvents: any[] = [];
const sseClients = new Set<any>();

function broadcastSse(eventType: string, payload: any) {
  const msg = `event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(msg);
    } catch {
      sseClients.delete(client);
    }
  }
}

async function initLimitlessSdkWebSocket() {
  try {
    const sdk = await import('@limitless-exchange/sdk');
    const tokenId = process.env.LMTS_TOKEN_ID?.trim();
    const secret = process.env.LMTS_TOKEN_SECRET?.trim();
    const hasAuth = Boolean(tokenId && secret);

    const wsConfig: any = {
      url: 'wss://ws.limitless.exchange',
      autoReconnect: true,
      timeout: 10000,
    };
    if (hasAuth && tokenId && secret) {
      wsConfig.hmacCredentials = { tokenId, secret };
    }

    const ws = new sdk.WebSocketClient(wsConfig);
    limitlessWsInstance = ws;
    currentWsStatus = 'CONNECTING';
    broadcastSse('status', { status: 'CONNECTING' });

    ws.on('connect', async () => {
      currentWsStatus = hasAuth ? 'AUTHENTICATED' : 'CONNECTED';
      broadcastSse('status', { status: currentWsStatus });

      try {
        const btc15 = await fetchLive15MinBtcMarket();
        if (btc15) {
          cachedActiveBtc = {
            slug: btc15.slug,
            title: btc15.title,
            status: btc15.status,
            prices: btc15.prices,
            tradePrices: btc15.tradePrices,
            address: btc15.address,
            expirationTimestamp: btc15.expirationTimestamp,
            startAt: btc15.startAt,
            openPrice: btc15.metadata?.openPrice,
            tokens: btc15.tokens,
            venueExchange: btc15.venue?.exchange,
            volumeFormatted: btc15.volumeFormatted,
            oracleSource: btc15.priceOracleMetadata?.name || 'Chainlink BTC 60s TWAP',
          };
          lastBtcFetchTime = Date.now();
        }
      } catch {
        // safe continuation
      }

      const activeSlug = cachedActiveBtc?.slug && is15MinBtcMarket(cachedActiveBtc)
        ? cachedActiveBtc.slug
        : 'btc-up-or-down-15-min';
      try {
        await ws.subscribe('subscribe_market_prices', {
          marketSlugs: [activeSlug],
        });

        if (hasAuth) {
          await ws.subscribe('subscribe_positions', { marketSlugs: [activeSlug] });
          await ws.subscribe('subscribe_order_events');
          await ws.subscribe('subscribe_transactions');
        }
      } catch (err: any) {
        // Safe continuation
      }
    });

    ws.on('orderbookUpdate', (data: any) => {
      const slug = data?.marketSlug;
      const lastVer = slug ? orderbookVersions.get(slug) || 0 : 0;
      if (data?.version && data.version <= lastVer) {
        return; // drop frames with version <= last seen for this slug
      }
      if (data?.version && slug) {
        orderbookVersions.set(slug, data.version);
      }
      latestOrderbookData = data;

      // Extract real-time live contract price from orderbook update and sync with cachedActiveBtc
      const ob = data?.orderbook;
      const liveMidpoint = ob?.adjustedMidpoint ?? (
        ob?.bids?.[0]?.price && ob?.asks?.[0]?.price
          ? (ob.bids[0].price + ob.asks[0].price) / 2
          : null
      );

      if (liveMidpoint && liveMidpoint > 0 && cachedActiveBtc && (slug === cachedActiveBtc.slug || !slug)) {
        const p0 = parseFloat(Number(liveMidpoint).toFixed(4));
        const p1 = parseFloat((1 - p0).toFixed(4));
        cachedActiveBtc.prices = [p0, p1];
        broadcastSse('priceUpdate', { marketSlug: slug || cachedActiveBtc.slug, prices: [p0, p1] });
      }

      broadcastSse('orderbookUpdate', data);
    });

    ws.on('oraclePriceData', (data: any) => {
      latestOracleData = data;
      broadcastSse('oraclePriceData', data);
    });

    ws.on('positions', (data: any) => {
      latestPositionsData = data;
      broadcastSse('positions', data);
    });

    ws.on('orderEvent', (event: any) => {
      recentOrderEvents.unshift(event);
      if (recentOrderEvents.length > 50) recentOrderEvents.pop();
      broadcastSse('orderEvent', event);
    });

    ws.on('tx', (data: any) => {
      recentTxEvents.unshift(data);
      if (recentTxEvents.length > 50) recentTxEvents.pop();
      broadcastSse('tx', data);
    });

    ws.on('system', (data: any) => {
      broadcastSse('system', data);
    });

    ws.on('disconnect', (reason: string) => {
      currentWsStatus = 'CONNECTING';
      broadcastSse('status', { status: 'CONNECTING', reason });
      // As documented by Limitless Exchange:
      // Automatic reconnect replays stale handshake signatures (> 30s), causing
      // 'Invalid HMAC authentication'. To survive a drop, clean up, re-connect afresh,
      // and re-issue subscriptions with freshly signed HMAC credentials.
      setTimeout(async () => {
        try {
          if (limitlessWsInstance) {
            await limitlessWsInstance.disconnect().catch(() => {});
          }
          await initLimitlessSdkWebSocket();
        } catch {
          // Retry on next cycle
        }
      }, 1500);
    });

    await ws.connect();
  } catch (err: any) {
    currentWsStatus = 'ERROR';
    broadcastSse('status', { status: 'ERROR', message: err.message || String(err) });
  }
}

let isWsStarted = false;

function setupApiMiddlewares(middlewares: any) {
  if (!isWsStarted) {
    isWsStarted = true;
    initLimitlessSdkWebSocket().catch(() => {});
  }
  middlewares.use('/api/limitless/live-stream', (req: any, res: any) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    // Send immediate snapshot upon connection
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

    // Keepalive ping every 10 seconds to prevent proxy drops
    const pingTimer = setInterval(() => {
      try {
        res.write(`: ping\n\n`);
      } catch {
        clearInterval(pingTimer);
      }
    }, 10000);

    sseClients.add(res);
    req.on('close', () => {
      clearInterval(pingTimer);
      sseClients.delete(res);
    });
  });

  middlewares.use('/api/limitless/subscribe', async (req: any, res: any) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.method !== 'POST') {
      res.statusCode = 405;
      return res.end(JSON.stringify({ error: 'Method not allowed' }));
    }
    let body = '';
    req.on('data', (c: any) => { body += c; });
    req.on('end', async () => {
      try {
        const { marketSlug } = body ? JSON.parse(body) : {};
        if (marketSlug && limitlessWsInstance && is15MinBtcMarket({ slug: marketSlug })) {
          await limitlessWsInstance.subscribe('subscribe_market_prices', {
            marketSlugs: [marketSlug],
          });
        }
        res.end(JSON.stringify({ success: true, subscribed: marketSlug }));
      } catch (err: any) {
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
  });

  middlewares.use('/api/limitless/live-state', (_req: any, res: any) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      status: currentWsStatus,
      orderbook: latestOrderbookData,
      oracle: latestOracleData,
      positions: latestPositionsData,
      market: cachedActiveBtc,
      recentOrderEvents: recentOrderEvents.slice(0, 10),
      recentTxEvents: recentTxEvents.slice(0, 10),
    }));
  });

  middlewares.use('/api/limitless/active-btc', async (_req: any, res: any) => {
    res.setHeader('Content-Type', 'application/json');
    try {
      const now = Date.now();
      const isExpired = cachedActiveBtc?.expirationTimestamp && cachedActiveBtc.expirationTimestamp <= now;
      if (!isExpired && cachedActiveBtc && is15MinBtcMarket(cachedActiveBtc) && now - lastBtcFetchTime < 10000) {
        return res.end(JSON.stringify({ success: true, ...cachedActiveBtc }));
      }

      const response = await fetch('https://api.limitless.exchange/markets/active');
      const json = await response.json();
      const markets = json?.data || [];

      // STRICT FILTER: Active, funded 15-minute BTC market that has not expired
      const btc15Market = markets.find((m: any) => is15MinBtcMarket(m) && m.status === 'FUNDED' && (!m.expirationTimestamp || m.expirationTimestamp > now))
        || markets.find((m: any) => is15MinBtcMarket(m) && (!m.expirationTimestamp || m.expirationTimestamp > now))
        || markets.find((m: any) => is15MinBtcMarket(m));

      if (btc15Market) {
        const previousSlug = cachedActiveBtc?.slug;
        const slugChanged = previousSlug !== btc15Market.slug;
        cachedActiveBtc = {
          slug: btc15Market.slug,
          title: btc15Market.title,
          status: btc15Market.status,
          prices: btc15Market.prices,
          tradePrices: btc15Market.tradePrices,
          address: btc15Market.address,
          expirationTimestamp: btc15Market.expirationTimestamp,
          startAt: btc15Market.startAt,
          openPrice: btc15Market.metadata?.openPrice,
          tokens: btc15Market.tokens,
          venueExchange: btc15Market.venue?.exchange,
          volumeFormatted: btc15Market.volumeFormatted,
          oracleSource: btc15Market.priceOracleMetadata?.name || 'Chainlink BTC 60s TWAP',
        };
        lastBtcFetchTime = now;

        if (slugChanged) {
          latestOrderbookData = null;
          broadcastSse('marketChange', cachedActiveBtc);
          if (limitlessWsInstance) {
            limitlessWsInstance.subscribe('subscribe_market_prices', {
              marketSlugs: [btc15Market.slug],
            }).catch(() => {});
          }
        }

        return res.end(JSON.stringify({ success: true, ...cachedActiveBtc }));
      }

      res.end(JSON.stringify({ success: false, message: 'No active 15-minute BTC prediction market found' }));
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ success: false, error: String(err) }));
    }
  });

  middlewares.use('/api/limitless/order', async (req: any, res: any) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.method !== 'POST') {
      res.statusCode = 405;
      return res.end(JSON.stringify({ error: 'Method not allowed' }));
    }

    let rawBody = '';
    req.on('data', (chunk: any) => { rawBody += chunk; });
    req.on('end', async () => {
      try {
        const body = rawBody ? JSON.parse(rawBody) : {};
        const { market, direction, outcome, type, price, size, chunkId } = body;
        const pk = process.env.PRIVATE_KEY?.trim();
        const tokenId = process.env.LMTS_TOKEN_ID?.trim();
        const secret = process.env.LMTS_TOKEN_SECRET?.trim();
        const hasLiveAuth = Boolean(pk && tokenId && secret);

        let activeMarketSlug = (market || '').trim();
        let marketData: any = null;

        // ====================================================================
        // STRICT SAFETY GUARD: 15-MINUTE BTC ONLY
        // ====================================================================
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

        // If market is expired, resolved, or invalid, auto-route to current live active 15m market
        if (isExpiredOrResolved || !marketData) {
          const live15 = await fetchLive15MinBtcMarket();
          if (live15 && is15MinBtcMarket(live15)) {
            console.log(`[ORDER ROUTER] Market '${activeMarketSlug}' was expired/inactive. Auto-routed to current live 15m market: '${live15.slug}'`);
            activeMarketSlug = live15.slug;
            marketData = live15;
            cachedActiveBtc = live15;
          } else {
            res.statusCode = 400;
            return res.end(JSON.stringify({
              success: false,
              error: `Safety Guard Blocked: No active, unexpired 15-minute BTC market was found on Limitless Exchange. Order aborted.`,
            }));
          }
        }

        // Final verification before order construction
        if (!is15MinBtcMarket({ slug: activeMarketSlug, title: marketData?.title })) {
          res.statusCode = 400;
          return res.end(JSON.stringify({
            success: false,
            error: `Safety Guard Violation: Market '${activeMarketSlug}' is not a 15-minute contract. All orders are strictly restricted to BTC Up or Down - 15 Min. Execution blocked.`,
          }));
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
          res.statusCode = 400;
          return res.end(JSON.stringify({
            success: false,
            error: `Token ID for outcome ${outcome} could not be resolved for market '${activeMarketSlug}'. Order cancelled.`,
          }));
        }

        // Extract market ask price for this outcome so FAK orders fill immediately
        const marketAsk = isLong
          ? (marketData?.tradePrices?.buy?.market?.[0] ?? marketData?.prices?.[0] ?? 0.50)
          : (marketData?.tradePrices?.buy?.market?.[1] ?? marketData?.prices?.[1] ?? 0.50);

        let inputPrice = Number(price) > 1 ? Number(price) / 100 : (Number(price) || marketAsk);
        // If price is lower than market ask and order is FAK, bump to marketAsk to prevent immediate kill
        if (type === 'FAK' && inputPrice < marketAsk) {
          inputPrice = marketAsk;
        }
        // Price must have max 3 decimal places for Limitless SDK tick alignment (0.001)
        const tickAlignedPrice = Math.max(0.001, Math.min(0.999, parseFloat(Number(inputPrice).toFixed(3))));
        const contractCount = Math.max(1, Math.round(Number(size) || 1));

        if (hasLiveAuth && pk && tokenId && secret) {
          const { ethers } = await import('ethers');
          const sdk = await import('@limitless-exchange/sdk');
          const formattedPk = pk.startsWith('0x') ? pk : `0x${pk}`;
          const wallet = new ethers.Wallet(formattedPk);
          const httpClient = new sdk.HttpClient({
            baseURL: sdk.DEFAULT_API_URL,
            hmacCredentials: { tokenId, secret },
          });

          try {
            const axiosClient = (httpClient as any).http?.client;
            if (axiosClient && typeof axiosClient.put === 'function') {
              await axiosClient.put('/profiles', { tradeWalletOption: 'eoa' });
            }
          } catch {
            // safe continuation
          }

          const orderClient = new sdk.OrderClient({
            httpClient,
            wallet,
            logger: new sdk.ConsoleLogger(),
          });

          const orderTypeEnum = type === 'GTC' ? sdk.OrderType.GTC : sdk.OrderType.FAK;
          const result: any = await orderClient.createOrder({
            marketSlug: activeMarketSlug,
            tokenId: String(targetTokenId),
            side: sdk.Side.BUY,
            orderType: orderTypeEnum,
            price: tickAlignedPrice,
            size: contractCount,
          });

          return res.end(JSON.stringify({
            success: true,
            mode: 'LIVE_EIP712_EXECUTED',
            orderId: result?.id || `ord_${Date.now()}`,
            marketSlug: activeMarketSlug,
            direction: isLong ? 'LONG' : 'SHORT',
            outcome: isLong ? 'UP' : 'DOWN',
            tokenId: targetTokenId,
            price: tickAlignedPrice,
            size: contractCount,
            chunkId,
            details: result,
          }));
        } else {
          const { ethers } = await import('ethers');
          const dummyWallet = ethers.Wallet.createRandom();
          const domain = {
            name: 'Limitless CTF Exchange',
            version: '1',
            chainId: 8453,
            verifyingContract: venueExchange,
          };
          const makerAmount = Math.round(tickAlignedPrice * contractCount * 1e6);
          const takerAmount = Math.round(contractCount * 1e6);

          const eip712Order = {
            salt: String(Date.now()),
            maker: dummyWallet.address,
            signer: dummyWallet.address,
            taker: '0x0000000000000000000000000000000000000000',
            tokenId: String(targetTokenId),
            makerAmount: String(makerAmount),
            takerAmount: String(takerAmount),
            expiration: '0',
            nonce: '0',
            feeRateBps: '0',
            side: 0,
            signatureType: 0,
          };

          return res.end(JSON.stringify({
            success: true,
            mode: 'DRY_RUN_EIP712_PREVIEW',
            notice: 'Order built and validated against Limitless EIP-712 standard. Add PRIVATE_KEY, LMTS_TOKEN_ID, and LMTS_TOKEN_SECRET to .env for live on-chain submission.',
            marketSlug: activeMarketSlug,
            direction: isLong ? 'LONG' : 'SHORT',
            outcome: isLong ? 'UP' : 'DOWN',
            tokenId: targetTokenId,
            verifyingContract: venueExchange,
            domain,
            order: eip712Order,
            chunkId,
          }));
        }
      } catch (err: any) {
        const errorDetail = err?.response?.data?.message || err?.response?.data?.error || err?.message || String(err);
        console.warn('[EIP-712 ORDER NOTICE]', errorDetail);
        res.statusCode = 500;
        res.end(JSON.stringify({ success: false, error: errorDetail }));
      }
    });
  });

  middlewares.use('/api/limitless/orderbook', async (req: any, res: any) => {
    res.setHeader('Content-Type', 'application/json');
    try {
      const url = new URL(req.url, 'http://localhost');
      const slug = url.searchParams.get('slug') || 'btc-up-or-down-15-min';
      const targetUrl = `https://api.limitless.exchange/markets/${encodeURIComponent(slug)}/orderbook`;
      const response = await fetch(targetUrl);
      if (!response.ok) {
        res.statusCode = response.status;
        return res.end(JSON.stringify({ error: `Limitless API returned status ${response.status}` }));
      }
      const data = await response.json();
      res.end(JSON.stringify(data));
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  middlewares.use('/api/balance', async (_req: any, res: any) => {
    res.setHeader('Content-Type', 'application/json');
    try {
      const data = await fetchLiveWalletAndBalance();
      res.end(JSON.stringify({ success: true, ...data }));
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ success: false, error: String(err) }));
    }
  });

  middlewares.use('/api/credentials', async (_req: any, res: any) => {
    res.setHeader('Content-Type', 'application/json');
    const walletData = await fetchLiveWalletAndBalance();
    res.end(
      JSON.stringify({
        hasLmtsTokenId: Boolean(process.env.LMTS_TOKEN_ID),
        hasLmtsTokenSecret: Boolean(process.env.LMTS_TOKEN_SECRET),
        hasPrivateKey: Boolean(process.env.PRIVATE_KEY),
        hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
        hasApiKey: Boolean(process.env.LIMITLESS_API_KEY),
        limitlessTokenId: process.env.LMTS_TOKEN_ID || '',
        limitlessTokenSecret: process.env.LMTS_TOKEN_SECRET || '',
        limitlessApiKey: process.env.LIMITLESS_API_KEY || '',
        walletAddress: walletData.address,
        liveUsdcBalance: walletData.usdcBalance,
        username: walletData.profile?.username,
      })
    );
  });
}

export default defineConfig(() => {
  const port = Number(process.env.PORT) || 3000;
  return {
    define: {
      'process.env.LMTS_TOKEN_ID': JSON.stringify(process.env.LMTS_TOKEN_ID || ''),
      'process.env.LMTS_TOKEN_SECRET': JSON.stringify(process.env.LMTS_TOKEN_SECRET || ''),
      'process.env.LIMITLESS_API_KEY': JSON.stringify(process.env.LIMITLESS_API_KEY || ''),
      'process.env.PRIVATE_KEY': JSON.stringify(process.env.PRIVATE_KEY || ''),
      'process.env.GEMINI_API_KEY': JSON.stringify(process.env.GEMINI_API_KEY || ''),
    },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'credentials-api',
        configureServer(server) {
          setupApiMiddlewares(server.middlewares);
        },
        configurePreviewServer(server) {
          setupApiMiddlewares(server.middlewares);
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port,
      allowedHosts: true,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/api/binance': {
          target: 'https://api.binance.com',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/binance/, ''),
        },
        '/api/limitless': {
          target: 'https://api.limitless.exchange',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/limitless/, ''),
        },
      },
    },
    preview: {
      host: '0.0.0.0',
      port,
      allowedHosts: true,
    },
  };
});
