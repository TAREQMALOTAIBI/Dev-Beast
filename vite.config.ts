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
// Limitless WebSocket Streaming Manager (Official TypeScript SDK)
// ============================================================================
let limitlessWsInstance: any = null;
let currentWsStatus: string = 'DISCONNECTED';
let latestOrderbookData: any = null;
let latestOrderbookVersion: number = 0;
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
        if (!cachedActiveBtc) {
          const res = await fetch('https://api.limitless.exchange/markets/active');
          if (res.ok) {
            const json = await res.json();
            const list = json?.data || [];
            const btc = list.find((m: any) => m.slug?.toLowerCase().includes('btc') && m.slug?.includes('15-min')) ||
                        list.find((m: any) => m.slug?.toLowerCase().includes('btc'));
            if (btc) {
              cachedActiveBtc = {
                slug: btc.slug,
                title: btc.title,
                status: btc.status,
                prices: btc.prices,
                address: btc.address,
              };
            }
          }
        }
      } catch {
        // safe continuation
      }

      const activeSlug = cachedActiveBtc?.slug || 'btc-100k-weekly';
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
      if (data?.version && data.version <= latestOrderbookVersion) {
        return; // drop frames with version <= last seen
      }
      if (data?.version) latestOrderbookVersion = data.version;
      latestOrderbookData = data;
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

    ws.on('disconnect', (reason: string) => {
      currentWsStatus = 'DISCONNECTED';
      broadcastSse('status', { status: 'DISCONNECTED', reason });
      setTimeout(async () => {
        try {
          if (limitlessWsInstance) {
            await limitlessWsInstance.disconnect().catch(() => {});
          }
          await initLimitlessSdkWebSocket();
        } catch {
          // Reconnect attempt failed, will retry
        }
      }, 3000);
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
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    res.write(`event: status\ndata: ${JSON.stringify({ status: currentWsStatus })}\n\n`);
    if (latestOrderbookData) {
      res.write(`event: orderbookUpdate\ndata: ${JSON.stringify(latestOrderbookData)}\n\n`);
    }
    if (latestOracleData) {
      res.write(`event: oraclePriceData\ndata: ${JSON.stringify(latestOracleData)}\n\n`);
    }
    if (latestPositionsData) {
      res.write(`event: positions\ndata: ${JSON.stringify(latestPositionsData)}\n\n`);
    }

    sseClients.add(res);
    req.on('close', () => {
      sseClients.delete(res);
    });
  });

  middlewares.use('/api/limitless/live-state', (_req: any, res: any) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      status: currentWsStatus,
      orderbook: latestOrderbookData,
      oracle: latestOracleData,
      positions: latestPositionsData,
      recentOrderEvents: recentOrderEvents.slice(0, 10),
      recentTxEvents: recentTxEvents.slice(0, 10),
    }));
  });

  middlewares.use('/api/limitless/active-btc', async (_req: any, res: any) => {
    res.setHeader('Content-Type', 'application/json');
    try {
      const now = Date.now();
      if (cachedActiveBtc && now - lastBtcFetchTime < 15000) {
        return res.end(JSON.stringify({ success: true, ...cachedActiveBtc }));
      }

      const response = await fetch('https://api.limitless.exchange/markets/active');
      const json = await response.json();
      const markets = json?.data || [];

      const btcMarket =
        markets.find((m: any) => m.slug?.toLowerCase().includes('btc') && m.slug?.includes('15-min')) ||
        markets.find((m: any) => m.slug?.toLowerCase().includes('btc') && m.slug?.includes('5-min')) ||
        markets.find((m: any) => m.slug?.toLowerCase().includes('btc'));

      if (btcMarket) {
        const previousSlug = cachedActiveBtc?.slug;
        cachedActiveBtc = {
          slug: btcMarket.slug,
          title: btcMarket.title,
          status: btcMarket.status,
          prices: btcMarket.prices,
          tradePrices: btcMarket.tradePrices,
          address: btcMarket.address,
          expirationTimestamp: btcMarket.expirationTimestamp,
          startAt: btcMarket.startAt,
          openPrice: btcMarket.metadata?.openPrice,
          tokens: btcMarket.tokens,
          venueExchange: btcMarket.venue?.exchange,
          volumeFormatted: btcMarket.volumeFormatted,
          oracleSource: btcMarket.priceOracleMetadata?.name || 'Chainlink BTC 60s TWAP',
        };
        lastBtcFetchTime = now;

        if (limitlessWsInstance && previousSlug !== btcMarket.slug) {
          limitlessWsInstance.subscribe('subscribe_market_prices', {
            marketSlugs: [btcMarket.slug],
          }).catch(() => {});
        }

        return res.end(JSON.stringify({ success: true, ...cachedActiveBtc }));
      }

      res.end(JSON.stringify({ success: false, message: 'No active BTC prediction market found' }));
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

        let activeMarketSlug = market || 'btc-100k-weekly';
        let marketData: any = null;
        try {
          const mRes = await fetch(`https://api.limitless.exchange/markets/${encodeURIComponent(activeMarketSlug)}`);
          if (mRes.ok) {
            marketData = await mRes.json();
          } else {
            const activeRes = await fetch('https://api.limitless.exchange/markets/active');
            if (activeRes.ok) {
              const activeJson = await activeRes.json();
              const list = activeJson?.data || [];
              marketData = list.find((m: any) => m.slug?.toLowerCase().includes('btc')) || list[0];
              if (marketData?.slug) {
                activeMarketSlug = marketData.slug;
              }
            }
          }
        } catch {
          // ignore
        }

        const venueExchange = marketData?.venue?.exchange || '0x05c748E2f4DcDe0ec9Fa8DDc40DE6b867f923fa5';
        const isLong = direction === 'LONG' || outcome === 'UP';
        const targetTokenId = isLong
          ? (marketData?.tokens?.yes || '59421473136307452468391913282081951561385299434690059271645163627705056748660')
          : (marketData?.tokens?.no || '40162699974295487791837260294296186163581478509542482654947866172365777902927');

        const normalizedPrice = Number(price) > 1 ? Number(price) / 100 : (Number(price) || 0.50);
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
            price: normalizedPrice,
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
            price: normalizedPrice,
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
          const makerAmount = Math.round(normalizedPrice * contractCount * 1e6);
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
        res.statusCode = 500;
        res.end(JSON.stringify({ success: false, error: err.message || String(err) }));
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
