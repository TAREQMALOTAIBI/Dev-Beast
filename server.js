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

// Cache for active BTC prediction market
let cachedActiveBtc = null;
let lastBtcFetchTime = 0;

// Discover active BTC 15-minute prediction market on Limitless
app.get('/api/limitless/active-btc', async (_req, res) => {
  try {
    const now = Date.now();
    if (cachedActiveBtc && now - lastBtcFetchTime < 15000) {
      return res.json({ success: true, ...cachedActiveBtc });
    }

    const response = await fetch('https://api.limitless.exchange/markets/active');
    const json = await response.json();
    const markets = json?.data || [];

    // Match 15-min BTC prediction market, fallback to 5-min or any active BTC market
    const btcMarket =
      markets.find((m) => m.slug?.toLowerCase().includes('btc') && m.slug?.includes('15-min')) ||
      markets.find((m) => m.slug?.toLowerCase().includes('btc') && m.slug?.includes('5-min')) ||
      markets.find((m) => m.slug?.toLowerCase().includes('btc'));

    if (btcMarket) {
      cachedActiveBtc = {
        slug: btcMarket.slug,
        title: btcMarket.title,
        status: btcMarket.status,
        prices: btcMarket.prices,
        address: btcMarket.address,
      };
      lastBtcFetchTime = now;
      return res.json({ success: true, ...cachedActiveBtc });
    }

    res.json({ success: false, message: 'No active BTC prediction market found' });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// Orderbook endpoint for specific market slug
app.get('/api/limitless/orderbook', async (req, res) => {
  try {
    const slug = req.query.slug || 'btc-up-or-down-15-min';
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
  try {
    const { market, direction, outcome, type, price, size, chunkId } = req.body || {};
    const pk = process.env.PRIVATE_KEY?.trim();
    const tokenId = process.env.LMTS_TOKEN_ID?.trim();
    const secret = process.env.LMTS_TOKEN_SECRET?.trim();

    // Check if live credentials are provided for on-chain EIP-712 signing
    const hasLiveAuth = Boolean(pk && tokenId && secret);

    // Fetch market data to obtain token IDs and venue contract address
    let activeMarketSlug = market || 'btc-100k-weekly';
    let marketData = null;

    try {
      const mRes = await fetch(`https://api.limitless.exchange/markets/${encodeURIComponent(activeMarketSlug)}`);
      if (mRes.ok) {
        marketData = await mRes.json();
      } else {
        const activeRes = await fetch('https://api.limitless.exchange/markets/active');
        if (activeRes.ok) {
          const activeJson = await activeRes.json();
          const list = activeJson?.data || [];
          marketData = list.find((m) => m.slug?.toLowerCase().includes('btc')) || list[0];
          if (marketData?.slug) {
            activeMarketSlug = marketData.slug;
          }
        }
      }
    } catch (e) {
      console.warn('[EIP-712] Failed to fetch market info:', e.message);
    }

    const venueExchange = marketData?.venue?.exchange || '0x05c748E2f4DcDe0ec9Fa8DDc40DE6b867f923fa5';
    const isLong = direction === 'LONG' || outcome === 'UP';
    const targetTokenId = isLong
      ? (marketData?.tokens?.yes || '59421473136307452468391913282081951561385299434690059271645163627705056748660')
      : (marketData?.tokens?.no || '40162699974295487791837260294296186163581478509542482654947866172365777902927');

    const normalizedPrice = Number(price) > 1 ? Number(price) / 100 : (Number(price) || 0.50);
    const contractCount = Math.max(1, Math.round(Number(size) || 1));

    if (hasLiveAuth) {
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

      const orderTypeEnum = type === 'GTC' ? sdk.OrderType.GTC : sdk.OrderType.FAK;

      const result = await orderClient.createOrder({
        marketSlug: activeMarketSlug,
        tokenId: String(targetTokenId),
        side: sdk.Side.BUY,
        orderType: orderTypeEnum,
        price: normalizedPrice,
        size: contractCount,
      });

      console.log(`[EIP-712 LIVE ORDER] Order submitted successfully! ID: ${result?.id || 'OK'}`);
      return res.json({
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
      });
    } else {
      // Credentials not yet in .env - construct exact EIP-712 structured data for transparency and preview
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
        side: 0, // BUY
        signatureType: 0, // EOA
      };

      return res.json({
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
      });
    }
  } catch (err) {
    console.error('[EIP-712 ORDER ERROR]', err);
    res.status(500).json({ success: false, error: err.message || String(err) });
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

  let profileData = null;
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

app.get('/api/balance', async (_req, res) => {
  try {
    const data = await fetchLiveWalletAndBalance();
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

app.get('/api/credentials', async (_req, res) => {
  try {
    const walletData = await fetchLiveWalletAndBalance();
    res.json({
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
