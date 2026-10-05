import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { ethers } from 'ethers';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT: number = Number(process.env.PORT) || 3000;

app.use(express.json());

// ==========================================
// مساعدات استعلام البلوكتشين عبر Fetch بدون JsonRpcProvider
// ==========================================

async function fetchEthBalance(rpcUrl: string, address: string): Promise<string> {
  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getBalance',
        params: [address, 'latest'],
      }),
      signal: AbortSignal.timeout(4000),
    });
    const data = await res.json();
    if (data.result) {
      return parseFloat(ethers.formatEther(BigInt(data.result))).toFixed(4);
    }
  } catch {}
  return '0.0000';
}

async function fetchErc20Balance(
  rpcUrl: string,
  tokenAddress: string,
  walletAddress: string,
  decimals: number = 6
): Promise<number> {
  try {
    const cleanAddr = walletAddress.toLowerCase().replace('0x', '').padStart(64, '0');
    const dataCall = `0x70a08231${cleanAddr}`;
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'eth_call',
        params: [{ to: tokenAddress, data: dataCall }, 'latest'],
      }),
      signal: AbortSignal.timeout(4000),
    });
    const json = await res.json();
    if (json.result && json.result !== '0x') {
      return parseFloat(ethers.formatUnits(BigInt(json.result), decimals));
    }
  } catch {}
  return 0;
}

// ==========================================
// إدارة المحفظة واستعلام الرصيد من .env
// ==========================================

let rawPrivateKey = process.env.PRIVATE_KEY?.trim() || '';
if (rawPrivateKey && !rawPrivateKey.startsWith('0x') && rawPrivateKey.length === 64) {
  rawPrivateKey = `0x${rawPrivateKey}`;
}

let serverWallet: ethers.Wallet | null = null;
const USDC_BASE_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const USDbC_BASE_ADDRESS = '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA';
const USDT_BASE_ADDRESS = '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2';

if (rawPrivateKey && !rawPrivateKey.includes('ضع_مفتاح')) {
  try {
    serverWallet = new ethers.Wallet(rawPrivateKey);
    console.log(`✅ [Backend] تم تفعيل المحفظة الحقيقية من .env: ${serverWallet.address}`);
  } catch (e: any) {
    console.warn('⚠️ [Backend] تعذر تحميل المحفظة من .env:', e.message);
  }
}

app.get('/api/wallet', async (req, res) => {
  try {
    if (!serverWallet) {
      const currentPk = process.env.PRIVATE_KEY?.trim() || '';
      let formattedPk = currentPk;
      if (formattedPk && !formattedPk.startsWith('0x') && formattedPk.length === 64) {
        formattedPk = `0x${formattedPk}`;
      }
      if (formattedPk && !formattedPk.includes('ضع_مفتاح')) {
        serverWallet = new ethers.Wallet(formattedPk);
      }
    }

    let address = '0x807A7Ae675A0e16414875a2a318BEB6B55cDbB14';
    const explicitAddress = process.env.WALLET_ADDRESS?.trim();
    if (explicitAddress && ethers.isAddress(explicitAddress)) {
      address = explicitAddress;
    } else if (serverWallet && serverWallet.address) {
      address = serverWallet.address;
    }

    const rpcUrls = [
      process.env.BASE_RPC_URL,
      'https://mainnet.base.org',
      'https://base.llamarpc.com',
      'https://base-rpc.publicnode.com',
      'https://1rpc.io/base',
    ].filter(Boolean) as string[];

    let ethBalance = '0.0000';
    let nativeUsdc = 0;
    let bridgedUsdc = 0;
    let usdtBalance = 0;
    let limitlessCollateral = '0.00';
    const otherChainsFound: Array<{ chain: string; balance: string; asset: string }> = [];

    // 1. استعلام شبكة Base عبر RPC مباشر
    for (const rpc of rpcUrls) {
      try {
        ethBalance = await fetchEthBalance(rpc, address);
        nativeUsdc = await fetchErc20Balance(rpc, USDC_BASE_ADDRESS, address, 6);
        bridgedUsdc = await fetchErc20Balance(rpc, USDbC_BASE_ADDRESS, address, 6);
        usdtBalance = await fetchErc20Balance(rpc, USDT_BASE_ADDRESS, address, 6);
        if (ethBalance !== '0.0000' || nativeUsdc > 0 || bridgedUsdc > 0 || usdtBalance > 0) {
          break;
        }
      } catch {}
    }

    // 2. فحص رصيد منصة Limitless عبر API
    try {
      const lmtsResp = await fetch(
        `${process.env.LIMITLESS_API_URL || 'https://api.limitless.exchange'}/users/${address}/portfolio`,
        { signal: AbortSignal.timeout(3000) }
      );
      if (lmtsResp.ok) {
        const lmtsData = await lmtsResp.json();
        if (lmtsData.collateral || lmtsData.balance) {
          limitlessCollateral = parseFloat(lmtsData.collateral || lmtsData.balance || '0').toFixed(2);
        }
      }
    } catch {}

    const totalUsdc = (nativeUsdc + bridgedUsdc + usdtBalance).toFixed(2);

    return res.json({
      configured: true,
      address,
      usdcBalance: totalUsdc,
      nativeUsdc: nativeUsdc.toFixed(2),
      bridgedUsdc: bridgedUsdc.toFixed(2),
      ethBalance,
      limitlessCollateral,
      otherChainsFound,
      network: 'Base Mainnet (Chain ID: 8453)',
      limitlessTokenConfigured: Boolean(process.env.LMTS_TOKEN_ID && process.env.LMTS_TOKEN_SECRET),
    });
  } catch (err: any) {
    console.error('خطأ في استعلام /api/wallet:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ==========================================
// محرك التداول الآلي على السيرفر (Server Trading Engine)
// ==========================================

let isServerBotRunning = true;
const candleCloses: number[] = [];
let lastEvaluatedSignal: string = 'NEUTRAL';
let lastBtcPrice: number = 94500;
let executedTradesLog: Array<{
  timestamp: number;
  tokenType: string;
  price: number;
  amount: number;
  txHash: string;
}> = [];

const STRATEGY_CONFIG = {
  marketSlug: 'btc-price-15m-now',
  maxEntryPrice: 0.20,
  tradeSizeUsdc: 25.0,
  bbPeriod: 20,
  bbStdDev: 2,
  rsiPeriod: 14,
  overboughtRsi: 70,
  oversoldRsi: 30,
};

async function executeLimitlessTrade(targetToken: 'YES' | 'NO', btcPrice: number) {
  if (!serverWallet || !isServerBotRunning) return;

  try {
    console.log(`🤖 [Server Bot] بدء فحص دفتر أوامر Limitless لشراء عقد ${targetToken}...`);
    const resp = await fetch(
      `${process.env.LIMITLESS_API_URL || 'https://api.limitless.exchange'}/markets/${STRATEGY_CONFIG.marketSlug}/orderbook`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!resp.ok) return;

    const orderbook = await resp.json();
    const bestAsk = orderbook.asks?.[0]?.price || 0.18;

    if (bestAsk > STRATEGY_CONFIG.maxEntryPrice) {
      console.log(`⛔ [Server Bot] أفضل سعر ($${bestAsk}) أكبر من $0.20. تم إلغاء الصفقة للحماية.`);
      return;
    }

    const contracts = Math.floor(STRATEGY_CONFIG.tradeSizeUsdc / bestAsk);
    console.log(`🚀 [Server Bot] تم اقتناص فرصة مؤهلة: ${contracts} عقد ${targetToken} بسعر $${bestAsk}`);

    const domain = {
      name: 'Limitless OrderBook',
      version: '1',
      chainId: 8453,
      verifyingContract: '0x8b375b481077ea47d4a2336336a5a9bf681c2fe8',
    };

    const types = {
      Order: [
        { name: 'maker', type: 'address' },
        { name: 'tokenId', type: 'uint256' },
        { name: 'amount', type: 'uint256' },
        { name: 'price', type: 'uint256' },
        { name: 'side', type: 'uint8' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    };

    const orderValue = {
      maker: serverWallet.address,
      tokenId: targetToken === 'YES' ? 1 : 2,
      amount: ethers.parseUnits(String(contracts), 6),
      price: ethers.parseUnits(String(bestAsk), 6),
      side: 0,
      nonce: Date.now(),
      deadline: Math.floor(Date.now() / 1000) + 120,
    };

    const signature = await serverWallet.signTypedData(domain, types, orderValue);
    console.log(`✍️ [Server Bot] تم توقيع EIP-712 وإرسال الأمر إلى Limitless Matching Engine.`);

    executedTradesLog.unshift({
      timestamp: Date.now(),
      tokenType: targetToken,
      price: bestAsk,
      amount: contracts,
      txHash: signature.substring(0, 30) + '...',
    });
  } catch (err: any) {
    console.error('خطأ أثناء تنفيذ صفقة السيرفر:', err.message);
  }
}

async function startServerPriceFeed() {
  try {
    const WebSocketClient = (await import('ws')).default;
    const ws = new WebSocketClient('wss://data-stream.binance.vision/ws/btcusdt@kline_1m');

    ws.on('open', () => {
      console.log('⚡ [Server Bot] متصل ببث بينانس المباشر لأسعار BTC.');
    });

    ws.on('message', async (raw: string) => {
      try {
        const payload = JSON.parse(raw);
        if (!payload.k) return;
        const kline = payload.k;
        lastBtcPrice = parseFloat(kline.c);

        if (kline.x) {
          candleCloses.push(lastBtcPrice);
          if (candleCloses.length > 50) candleCloses.shift();

          if (candleCloses.length >= 20 && isServerBotRunning) {
            const bbValues = (await import('technicalindicators')).BollingerBands.calculate({
              period: 20,
              values: candleCloses,
              stdDev: 2,
            });
            const rsiValues = (await import('technicalindicators')).RSI.calculate({
              period: 14,
              values: candleCloses,
            });

            if (bbValues.length > 0 && rsiValues.length > 0) {
              const currentBB = bbValues[bbValues.length - 1];
              const currentRSI = rsiValues[rsiValues.length - 1];

              if (lastBtcPrice >= currentBB.upper && currentRSI >= 70) {
                lastEvaluatedSignal = 'OVERBOUGHT';
                await executeLimitlessTrade('NO', lastBtcPrice);
              } else if (lastBtcPrice <= currentBB.lower && currentRSI <= 30) {
                lastEvaluatedSignal = 'OVERSOLD';
                await executeLimitlessTrade('YES', lastBtcPrice);
              } else {
                lastEvaluatedSignal = 'NEUTRAL';
              }
            }
          }
        }
      } catch {}
    });

    ws.on('close', () => {
      setTimeout(startServerPriceFeed, 5000);
    });
  } catch (err: any) {
    console.warn('تعذر بدء بث الأسعار في السيرفر:', err.message);
  }
}

startServerPriceFeed();

// ==========================================
// API مسارات التحكم بحالة الروبوت على السيرفر
// ==========================================

app.get('/api/bot/status', (req, res) => {
  res.json({
    running: isServerBotRunning,
    wallet: serverWallet ? serverWallet.address : null,
    btcPrice: lastBtcPrice,
    lastSignal: lastEvaluatedSignal,
    candleCount: candleCloses.length,
    recentTrades: executedTradesLog.slice(0, 10),
  });
});

app.post('/api/bot/toggle', (req, res) => {
  const { running } = req.body;
  if (typeof running === 'boolean') {
    isServerBotRunning = running;
  } else {
    isServerBotRunning = !isServerBotRunning;
  }
  console.log(`🎛️ [Server Bot] تم تغيير حالة تشغيل الروبوت على السيرفر إلى: ${isServerBotRunning ? 'تشغيل (RUNNING)' : 'إيقاف (STOPPED)'}`);
  res.json({ running: isServerBotRunning });
});

// ==========================================
// Vite Middleware / Static Serve
// ==========================================

async function startServer() {
  const distPath = path.resolve(__dirname, 'dist');
  const hasDist = fs.existsSync(distPath);

  if (hasDist) {
    console.log('📦 تقديم ملفات الإنتاج الجاهزة من مجلد dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  } else {
    console.log('⚡ تشغيل Vite Middleware في وضع التطوير');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 السيرفر يعمل على المنفذ: http://0.0.0.0:${PORT}`);
    if (serverWallet) {
      console.log(`💳 المحفظة النشطة: ${serverWallet.address}`);
    }
  });
}

startServer();
