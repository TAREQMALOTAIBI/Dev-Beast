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

function setupApiMiddlewares(middlewares: any) {
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
        cachedActiveBtc = {
          slug: btcMarket.slug,
          title: btcMarket.title,
          status: btcMarket.status,
          prices: btcMarket.prices,
          address: btcMarket.address,
        };
        lastBtcFetchTime = now;
        return res.end(JSON.stringify({ success: true, ...cachedActiveBtc }));
      }

      res.end(JSON.stringify({ success: false, message: 'No active BTC prediction market found' }));
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ success: false, error: String(err) }));
    }
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
