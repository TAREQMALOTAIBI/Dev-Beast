import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { ethers } from 'ethers';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT: number = Number(process.env.PORT) || 3000;

app.use(express.json());

// ==========================================
// API لمعرفة بيانات المحفظة والرصيد الحقيقي تلقائياً من .env
// ==========================================

let rawPrivateKey = process.env.PRIVATE_KEY?.trim() || '';
if (rawPrivateKey && !rawPrivateKey.startsWith('0x') && rawPrivateKey.length === 64) {
  rawPrivateKey = `0x${rawPrivateKey}`;
}

let serverWallet: ethers.Wallet | null = null;
const BASE_RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const USDC_BASE_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

if (rawPrivateKey && !rawPrivateKey.includes('ضع_مفتاح')) {
  try {
    const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
    serverWallet = new ethers.Wallet(rawPrivateKey, provider);
    console.log(`✅ [Backend] تم تفعيل المحفظة الحقيقية من .env: ${serverWallet.address}`);
  } catch (e: any) {
    console.warn('⚠️ [Backend] تعذر تحميل المحفظة من .env:', e.message);
  }
}

app.get('/api/wallet', async (req, res) => {
  try {
    if (!serverWallet) {
      // إذا لم يتم العثور على المفتاح الخاص، أعد فحص .env
      const currentPk = process.env.PRIVATE_KEY?.trim() || '';
      let formattedPk = currentPk;
      if (formattedPk && !formattedPk.startsWith('0x') && formattedPk.length === 64) {
        formattedPk = `0x${formattedPk}`;
      }
      if (formattedPk && !formattedPk.includes('ضع_مفتاح')) {
        const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
        serverWallet = new ethers.Wallet(formattedPk, provider);
      }
    }

    if (!serverWallet) {
      return res.json({
        configured: false,
        address: null,
        usdcBalance: '0.00',
        ethBalance: '0.0000',
        network: 'Base Mainnet (8453)',
      });
    }

    const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
    const address = serverWallet.address;

    // استعلام رصيد ETH الحقيقي
    const rawEth = await provider.getBalance(address);
    const ethBalance = parseFloat(ethers.formatEther(rawEth)).toFixed(4);

    // استعلام رصيد USDC الحقيقي على Base
    let usdcBalance = '0.00';
    try {
      const usdcAbi = ['function balanceOf(address account) external view returns (uint256)'];
      const usdcContract = new ethers.Contract(USDC_BASE_ADDRESS, usdcAbi, provider);
      const rawUsdc = await usdcContract.balanceOf(address);
      usdcBalance = parseFloat(ethers.formatUnits(rawUsdc, 6)).toFixed(2);
    } catch (err: any) {
      console.warn('خطأ في جلب رصيد USDC:', err.message);
    }

    return res.json({
      configured: true,
      address,
      usdcBalance,
      ethBalance,
      network: 'Base Mainnet (Chain ID: 8453)',
      limitlessTokenConfigured: Boolean(process.env.LMTS_TOKEN_ID && process.env.LMTS_TOKEN_SECRET),
    });
  } catch (err: any) {
    console.error('خطأ في استعلام /api/wallet:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ==========================================
// Vite Middleware / Static Serve
// ==========================================

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production' || process.env.SERVE_STATIC === 'true';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 السيرفر يعمل على المنفذ: http://0.0.0.0:${PORT}`);
    if (serverWallet) {
      console.log(`💳 المحفظة النشطة: ${serverWallet.address}`);
    }
  });
}

startServer();
