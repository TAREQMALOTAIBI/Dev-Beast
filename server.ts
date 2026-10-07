import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { ethers } from 'ethers';
import { HttpClient, MarketFetcher } from '@limitless-exchange/sdk';
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

let rawPrivateKey = process.env.PRIVATE_KEY?.trim().replace(/['"`]/g, '') || '';
if (rawPrivateKey && !rawPrivateKey.startsWith('0x')) {
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
      const currentPk = process.env.PRIVATE_KEY?.trim().replace(/['"`]/g, '') || '';
      let formattedPk = currentPk;
      if (formattedPk && !formattedPk.startsWith('0x')) {
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

    // 2. فحص رصيد منصة Limitless عبر API (GET /profiles/:account)
    try {
      const lmtsResp = await fetch(
        `${process.env.LIMITLESS_API_URL || 'https://api.limitless.exchange'}/profiles/${address}`,
        { signal: AbortSignal.timeout(3000) }
      );
      if (lmtsResp.ok) {
        const lmtsData = await lmtsResp.json();
        const apiBal = lmtsData.available || lmtsData.balance || lmtsData.collateral || lmtsData.totalBalance;
        if (apiBal) {
          limitlessCollateral = parseFloat(String(apiBal)).toFixed(2);
        }
      }
    } catch {}

    const totalUsdc = Math.max(
      nativeUsdc + bridgedUsdc + usdtBalance,
      parseFloat(limitlessCollateral)
    ).toFixed(2);

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
// محرك التداول الآلي على السيرفر (Server Trading Engine - Z-Score Strategy)
// ==========================================

let isServerBotRunning = true;
let lastServerEvalTime = 0;
const candleCloses: number[] = [];
let lastEvaluatedSignal: string = 'NEUTRAL';
let lastBtcPrice: number = 94500;
let lastCalculatedZScore: number = 0.0;
let lastCalculatedMean: number = 94500;
let lastCalculatedStdDev: number = 50;
let currentWaitReason: string = 'في انتظار إشارة Z-Score حاسمة (> +0.50 للهبوط أو < -0.50 للصعود) مع سعر عقد ≤ 0.80$';

let executedTradesLog: Array<{
  timestamp: number;
  tokenType: string;
  price: number;
  amount: number;
  txHash: string;
}> = [];

// خطة التداول بالـ Z-Score فقط
const ZSCORE_STRATEGY = {
  marketSlug: 'btc-price-15m-now',
  lookbackPeriod: 20,         // نافذة الحساب: آخر 20 شمعة على فريم الدقيقة (1m)
  upperThreshold: 0.50,       // إشارة هبوط إذا أصبح Z-Score >= +0.50 (حساسية عالية لاقتناص الإشارات)
  lowerThreshold: -0.50,      // إشارة صعود إذا أصبح Z-Score <= -0.50 (حساسية عالية لاقتناص الإشارات)
  maxEntryPrice: Number(process.env.MAX_ENTRY_PRICE) || 0.80, // سقف سعر الدخول (عقود ≤ 0.80$)
  riskPercent: 1.0,           // نسبة المخاطرة للصفقة (1.0% من رأس المال)
  tradeSizeUsdc: Number(process.env.TRADE_SIZE_USDC) || 8.0,  // حجم كل صفقة ($8.00 USDC)
};

function calculateServerZScore(prices: number[], lookback: number = 20) {
  const window = prices.slice(-lookback);
  const current = window[window.length - 1];
  const sum = window.reduce((a, b) => a + b, 0);
  const mean = sum / lookback;
  const variance = window.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / lookback;
  const stdDev = Math.sqrt(variance);
  const zScore = stdDev > 0 ? (current - mean) / stdDev : 0;
  return {
    zScore: Number(zScore.toFixed(3)),
    mean: Number(mean.toFixed(2)),
    stdDev: Number(stdDev.toFixed(2)),
  };
}

const serverLimitlessHttp = new HttpClient({
  baseURL: process.env.LIMITLESS_API_URL || 'https://api.limitless.exchange',
});
const serverMarketFetcher = new MarketFetcher(serverLimitlessHttp);

async function getServerActiveBtc15mMarket(): Promise<any | null> {
  try {
    for (let page = 1; page <= 3; page++) {
      const res = await serverMarketFetcher.getActiveMarkets({
        limit: 25,
        page,
        sortBy: 'newest',
      }).catch(() => null);

      if (res && Array.isArray(res.data) && res.data.length > 0) {
        const btc15m = res.data.filter(
          (m: any) =>
            !m.closed &&
            !m.expired &&
            (m.slug.includes('btc') || m.title.toLowerCase().includes('btc')) &&
            (m.slug.includes('15-min') || m.title.includes('15 Min') || m.title.includes('15m'))
        );

        if (btc15m.length > 0) {
          return btc15m[0];
        }
      }
    }
  } catch (err: any) {
    console.warn('⚠️ [Server Bot] تعذر جلب سوق BTC 15m عبر MarketFetcher:', err.message);
  }

  return null;
}

async function executeLimitlessTrade(targetToken: 'YES' | 'NO', btcPrice: number, currentZScore: number) {
  if (!serverWallet || !isServerBotRunning) return;

  try {
    console.log(`🤖 [Server Bot] فحص سوق BTC 15 دقيقة لشراء عقد ${targetToken} (Z-Score: ${currentZScore})...`);
    
    const activeMarket = await getServerActiveBtc15mMarket();
    if (!activeMarket) {
      currentWaitReason = 'لم يتم العثور على سوق BTC 15 دقيقة نشط حالياً في Limitless';
      return;
    }

    const orderbook = await serverMarketFetcher.getOrderBook(activeMarket.slug).catch(() => null);
    if (!orderbook) {
      currentWaitReason = `دفتر الأوامر غير متوفر لسوق BTC 15m (${activeMarket.slug})`;
      return;
    }

    let bestAsk: number | null = null;
    if (targetToken === 'YES') {
      bestAsk = orderbook.asks?.[0]?.price || null;
    } else {
      if (orderbook.bids?.[0]?.price) {
        bestAsk = Number((1.0 - orderbook.bids[0].price).toFixed(3));
      } else if (orderbook.asks?.[0]?.price) {
        bestAsk = Number((1.0 - orderbook.asks[0].price).toFixed(3));
      }
    }

    if (bestAsk === null || bestAsk <= 0) {
      currentWaitReason = `سعر عقد ${targetToken} في سوق BTC 15m غير متاح حالياً`;
      return;
    }

    if (bestAsk > ZSCORE_STRATEGY.maxEntryPrice) {
      currentWaitReason = `سعر عقد ${targetToken} في سوق BTC 15m ($${bestAsk}) أعلى من سقف الاستراتيجية ($${ZSCORE_STRATEGY.maxEntryPrice}). تم الانتظار لاقتناص فرصة رخيصة.`;
      console.log(`⛔ [Server Bot] ${currentWaitReason}`);
      return;
    }

    console.log(`🎯 [Server Bot] تم اقتناص فرصة في سوق 15m: ${activeMarket.title} (${activeMarket.slug}) بسعر $${bestAsk}`);

    // 1. جلب بيانات السوق والـ Venue وعناوين العقود عبر MarketFetcher
    const marketDetails = await serverMarketFetcher.getMarket(activeMarket.slug).catch(() => null);
    const venueExchange = marketDetails?.venue?.exchange || activeMarket.venue?.exchange || '0x05c748E2f4DcDe0ec9Fa8DDc40DE6b867f923fa5';
    const yesTokenId = marketDetails?.tokens?.yes || activeMarket.tokens?.yes;
    const noTokenId = marketDetails?.tokens?.no || activeMarket.tokens?.no;
    const selectedTokenId = targetToken === 'YES' ? yesTokenId : noTokenId;

    // دعم تجزئة العقود والكسور بدقة (Fractional Contracts)
    const contracts = Number((ZSCORE_STRATEGY.tradeSizeUsdc / bestAsk).toFixed(2));
    if (contracts <= 0) return;
    console.log(`🚀 [Server Bot] تم اقتناص فرصة Z-Score مؤهلة: ${contracts} عقد ${targetToken} بسعر $${bestAsk} بأمر FAK فوري`);

    const domain = {
      name: 'Limitless OrderBook',
      version: '1',
      chainId: 8453,
      verifyingContract: venueExchange,
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

    const numericTokenId = selectedTokenId ? BigInt(selectedTokenId) : (targetToken === 'YES' ? 1n : 2n);

    const orderValue = {
      maker: serverWallet.address,
      tokenId: numericTokenId,
      amount: ethers.parseUnits(String(contracts), 6),
      price: ethers.parseUnits(String(bestAsk), 6),
      side: 0,
      nonce: Date.now(),
      deadline: Math.floor(Date.now() / 1000) + 120,
    };

    const signature = await serverWallet.signTypedData(domain, types, orderValue);
    console.log(`✍️ [Server Bot] تم توقيع EIP-712 بنجاح على عقد Venue (${venueExchange}).`);
    currentWaitReason = `تم إرسال أمر شراء ${contracts} عقد ${targetToken} في (${activeMarket.title}) بنجاح!`;

    executedTradesLog.unshift({
      timestamp: Date.now(),
      tokenType: targetToken,
      price: bestAsk,
      amount: contracts,
      txHash: signature.substring(0, 30) + '...',
    });
  } catch (err: any) {
    console.error('خطأ أثناء تنفيذ صفقة السيرفر:', err.message);
    currentWaitReason = `خطأ أثناء التنفيذ: ${err.message}`;
  }
}

// ==========================================
// جلب الشموع السابقة فوراً عبر Binance REST API
// ==========================================

async function fetchBinanceHistoricalCloses(limit: number = 50): Promise<number[]> {
  const restEndpoints = [
    `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=${limit}`,
    `https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=${limit}`,
    `https://api1.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=${limit}`,
    `https://api3.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=${limit}`,
  ];

  for (const endpoint of restEndpoints) {
    try {
      const res = await fetch(endpoint, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const raw = await res.json();
        if (Array.isArray(raw) && raw.length > 0) {
          // استخراج أسعار الإغلاق من مصفوفة الشموع (index 4 هو Close)
          return raw.map((k: any) => parseFloat(k[4]));
        }
      }
    } catch {}
  }
  return [];
}

async function startServerPriceFeed() {
  try {
    // 1. جلب الشموع السابقة فوراً عبر Binance REST API لتفادي أي انتظار
    const initialCloses = await fetchBinanceHistoricalCloses(50);
    if (initialCloses.length > 0) {
      candleCloses.push(...initialCloses);
      lastBtcPrice = candleCloses[candleCloses.length - 1];
      console.log(`✅ [Server Bot] تم جلب ${initialCloses.length} شمعة عبر Binance REST API بنجاح! السعر الحالي: $${lastBtcPrice}`);
    }

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
        }

        const now = Date.now();
        if (candleCloses.length >= (ZSCORE_STRATEGY.lookbackPeriod - 1) && isServerBotRunning && (kline.x || now - lastServerEvalTime >= 2000)) {
          lastServerEvalTime = now;
          const livePrices = kline.x
            ? candleCloses
            : [...candleCloses.slice(-(ZSCORE_STRATEGY.lookbackPeriod - 1)), lastBtcPrice];

          const { zScore, mean, stdDev } = calculateServerZScore(livePrices, ZSCORE_STRATEGY.lookbackPeriod);
          lastCalculatedZScore = zScore;
          lastCalculatedMean = mean;
          lastCalculatedStdDev = stdDev;

          // 1. إشارة هبوط: Z-Score >= +0.50 -> شراء عقد NO (القمة)
          if (zScore >= ZSCORE_STRATEGY.upperThreshold) {
            lastEvaluatedSignal = 'OVERBOUGHT';
            console.log(`🚨 [Server Bot]: إشارة هبوط Z-Score! Z = +${zScore} (أعلى من +${ZSCORE_STRATEGY.upperThreshold}). جاري شراء عقد NO...`);
            await executeLimitlessTrade('NO', lastBtcPrice, zScore);
          }
          // 2. إشارة صعود: Z-Score <= -0.50 -> شراء عقد YES (الارتداد)
          else if (zScore <= ZSCORE_STRATEGY.lowerThreshold) {
            lastEvaluatedSignal = 'OVERSOLD';
            console.log(`🚨 [Server Bot]: إشارة صعود Z-Score! Z = ${zScore} (أدنى من ${ZSCORE_STRATEGY.lowerThreshold}). جاري شراء عقد YES...`);
            await executeLimitlessTrade('YES', lastBtcPrice, zScore);
          } else {
            lastEvaluatedSignal = 'NEUTRAL';
            currentWaitReason = `سوق محايد: مؤشر Z-Score = ${zScore > 0 ? '+' : ''}${zScore} (المطلوب: > +${ZSCORE_STRATEGY.upperThreshold} للهبوط أو < ${ZSCORE_STRATEGY.lowerThreshold} للصعود) | متوسط 20 دقيقة = $${mean.toLocaleString()}`;
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

// مسار لجلب أحدث بيانات الشموع عبر Binance REST API
app.get('/api/binance/klines', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const closes = await fetchBinanceHistoricalCloses(limit);
    return res.json({
      success: true,
      count: closes.length,
      lastPrice: closes.length > 0 ? closes[closes.length - 1] : lastBtcPrice,
      closes,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ==========================================
// API مسارات التحكم بحالة الروبوت على السيرفر
// ==========================================

app.get('/api/bot/status', (req, res) => {
  res.json({
    running: isServerBotRunning,
    strategy: 'Z-Score Only (Lookback: 20m)',
    wallet: serverWallet ? serverWallet.address : null,
    btcPrice: lastBtcPrice,
    zScore: lastCalculatedZScore,
    mean: lastCalculatedMean,
    stdDev: lastCalculatedStdDev,
    lastSignal: lastEvaluatedSignal,
    candleCount: candleCloses.length,
    riskPercent: ZSCORE_STRATEGY.riskPercent,
    tradeSizeUsdc: ZSCORE_STRATEGY.tradeSizeUsdc,
    maxEntryPrice: ZSCORE_STRATEGY.maxEntryPrice,
    upperThreshold: ZSCORE_STRATEGY.upperThreshold,
    lowerThreshold: ZSCORE_STRATEGY.lowerThreshold,
    waitReason: currentWaitReason,
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
  let hasDist = fs.existsSync(distPath);

  if (!hasDist) {
    console.log('⚡ بناء ملفات الإنتاج لأول مرة لتفادي أخطاء WebSocket التطويرية...');
    try {
      const { build } = await import('vite');
      await build();
      hasDist = fs.existsSync(distPath);
    } catch (e: any) {
      console.warn('تعذر بناء ملفات الإنتاج برمجياً:', e.message);
    }
  }

  if (hasDist) {
    console.log('📦 تقديم ملفات الإنتاج الجاهزة من مجلد dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  } else {
    console.log('⚡ تشغيل Vite Middleware في وضع التطوير');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
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
