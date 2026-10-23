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
