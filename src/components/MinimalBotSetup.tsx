import React, { useState } from 'react';
import {
  Code2,
  Copy,
  Check,
  Key,
  DollarSign,
  Terminal,
  Zap,
  Radio,
  Wifi,
  Globe2,
} from 'lucide-react';
import type { BotConfig } from '../bot/types';

interface MinimalBotSetupProps {
  config: BotConfig;
  onUpdateConfig: (newConfig: BotConfig) => void;
}

export const MinimalBotSetup: React.FC<MinimalBotSetupProps> = ({
  config,
  onUpdateConfig,
}) => {
  const [copied, setCopied] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [binanceEndpoint, setBinanceEndpoint] = useState<'vision' | 'us'>('vision');

  const selectedBinanceWs =
    binanceEndpoint === 'vision'
      ? 'wss://data-stream.binance.vision/ws/btcusdt@kline_1m'
      : 'wss://stream.binance.us:9443/ws/btcusdt@kline_1m';

// كود البوت الكامل والمستقل مع خطة التداول بالـ Z-Score ومسح جميع أسواق BTC وأمر FAK الفوري
  const dualWsBotScript = `import WebSocket from 'ws';
import { ethers } from 'ethers';
import {
  HttpClient,
  WebSocketClient,
  MarketFetcher,
  OrderClient,
  OrderType,
  Side,
  withRetry,
} from '@limitless-exchange/sdk';

// 1. بيانات الاعتماد والمفاتيح
const CREDENTIALS = {
  tokenId: process.env.LMTS_TOKEN_ID || '${config.lmtsTokenId || ''}',
  secret: process.env.LMTS_TOKEN_SECRET || '${config.lmtsTokenSecret || ''}',
  privateKey: process.env.PRIVATE_KEY || '${config.privateKey || '0x...'}',
};

// 2. إعدادات خطة الـ Z-Score المحدثة
const CONFIG = {
  lookback: 20,         // نافذة الحساب: آخر 20 شمعة على فريم الدقيقة (1m)
  upperZScore: 0.50,    // إشارة هبوط: Z-Score >= +0.50
  lowerZScore: -0.50,   // إشارة صعود: Z-Score <= -0.50
  maxEntryPrice: ${config.maxEntryPrice}, // سقف السعر: عقود ≤ 0.80$
  tradeSizeUsdc: ${config.tradeSizeUsdc},  // ميزانية الصفقة بالدولار
  apiBaseUrl: '${config.apiBaseUrl || 'https://api.limitless.exchange'}',
};

const candleCloses: number[] = [];
let isExecuting = false;

// دالة حساب Z-Score بدقة إحصائية
function computeZScore(prices: number[], period: number = 20) {
  const window = prices.slice(-period);
  const current = window[window.length - 1];
  const mean = window.reduce((a, b) => a + b, 0) / period;
  const variance = window.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
  const stdDev = Math.sqrt(variance);
  const zScore = stdDev > 0 ? (current - mean) / stdDev : 0;
  return { zScore, mean, stdDev, current };
}

// 3. إعداد عملاء SDK والمحفظة
const httpClient = new HttpClient({
  baseURL: CONFIG.apiBaseUrl,
  hmacCredentials: CREDENTIALS.tokenId && CREDENTIALS.secret ? { tokenId: CREDENTIALS.tokenId, secret: CREDENTIALS.secret } : undefined,
});
const wallet = new ethers.Wallet(CREDENTIALS.privateKey);
const marketFetcher = new MarketFetcher(httpClient);
let orderClient: OrderClient | null = null;

if (CREDENTIALS.tokenId && CREDENTIALS.secret) {
  orderClient = new OrderClient({ httpClient, wallet, marketFetcher });
}

// 4. دالة استهداف سوق BTC 15 دقيقة النشط واقتناص السعر وتنفيذ الأمر
async function findAndExecuteBestBtcTrade(targetSide: 'YES' | 'NO', zScore: number) {
  if (isExecuting) return;
  isExecuting = true;

  try {
    console.log(\`🔍 [سوق BTC 15 دقيقة] جاري فحص عقد 15m في Limitless لشراء \${targetSide} (Z-Score=\${zScore.toFixed(2)})...\`);

    let btc15mMarket: any = null;
    for (let page = 1; page <= 3; page++) {
      const res = await marketFetcher.getActiveMarkets({ limit: 25, page, sortBy: 'newest' }).catch(() => null);
      if (res && Array.isArray(res.data)) {
        const found = res.data.find(
          (m: any) =>
            !m.closed &&
            !m.expired &&
            (m.slug.includes('btc') || m.title.toLowerCase().includes('btc')) &&
            (m.slug.includes('15-min') || m.title.includes('15 Min') || m.title.includes('15m'))
        );
        if (found) {
          btc15mMarket = found;
          break;
        }
      }
    }

    if (!btc15mMarket) {
      console.log('ℹ️ لا يوجد سوق BTC 15 دقيقة نشط حالياً.');
      return;
    }

    const ob = await marketFetcher.getOrderBook(btc15mMarket.slug).catch(() => null);
    if (!ob) {
      console.log(\`ℹ️ تعذر جلب دفتر الأوامر لسوق (\${btc15mMarket.slug}).\`);
      return;
    }

    let bestAsk: number | null = null;
    if (targetSide === 'YES') {
      bestAsk = ob.asks?.[0]?.price || null;
    } else {
      if (ob.bids?.[0]?.price) {
        bestAsk = Number((1.0 - ob.bids[0].price).toFixed(3));
      } else if (ob.asks?.[0]?.price) {
        bestAsk = Number((1.0 - ob.asks[0].price).toFixed(3));
      }
    }

    console.log(\`   - \${btc15mMarket.title} (\${btc15mMarket.slug}): سعر \${targetSide} = $\${bestAsk !== null ? bestAsk : 'N/A'} (السقف: $\${CONFIG.maxEntryPrice})\`);

    if (!bestAsk || bestAsk <= 0 || bestAsk > CONFIG.maxEntryPrice) {
      console.log(\`⛔ السعر المتاح ($\${bestAsk}) أعلى من سقف الدخول ($\${CONFIG.maxEntryPrice}). تم الانتظار لحماية رأس المال.\`);
      return;
    }

    console.log(\`🎯 [اقتناص فرصة في سوق BTC 15m]: تم اختيار \${btc15mMarket.title} بسعر $\${bestAsk} (أقل من السقف $\${CONFIG.maxEntryPrice})\`);

    const contracts = Number((CONFIG.tradeSizeUsdc / bestAsk).toFixed(2));
    const marketDetails = await marketFetcher.getMarket(btc15mMarket.slug).catch(() => null);
    const tokenId = targetSide === 'YES'
      ? (marketDetails?.tokens?.yes || btc15mMarket.tokens?.yes)
      : (marketDetails?.tokens?.no || btc15mMarket.tokens?.no);
    const venueExchange = marketDetails?.venue?.exchange || btc15mMarket.venue?.exchange || '0x05c748E2f4DcDe0ec9Fa8DDc40DE6b867f923fa5';

    if (orderClient && tokenId) {
      console.log(\`🚀 إرسال أمر FAK عبر OrderClient إلى سوق 15m...\`);
      const res = await withRetry(
        () => orderClient!.createOrder({
          marketSlug: btc15mMarket.slug,
          tokenId,
          side: Side.BUY,
          price: bestAsk!,
          size: contracts,
          orderType: OrderType.FAK,
        }),
        { statusCodes: [429, 500, 502, 503, 504], maxRetries: 3, delays: [1, 2, 4] }
      );
      console.log('✅ تم تنفيذ أمر FAK بنجاح!', res.order?.id);
    } else {
      console.log(\`✍️ توقيع مشفر EIP-712 بالمحفظة (\${wallet.address}) على عقد Venue (\${venueExchange})...\`);
      const domain = { name: 'Limitless OrderBook', version: '1', chainId: 8453, verifyingContract: venueExchange };
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
      const numTokenId = tokenId ? BigInt(tokenId) : (targetSide === 'YES' ? 1n : 2n);
      const orderValue = {
        maker: wallet.address,
        tokenId: numTokenId,
        amount: ethers.parseUnits(String(contracts), 6),
        price: ethers.parseUnits(String(bestAsk), 6),
        side: 0,
        nonce: Date.now(),
        deadline: Math.floor(Date.now() / 1000) + 120,
      };
      const signature = await wallet.signTypedData(domain, types, orderValue);
      const payload = {
        order: { ...orderValue, tokenId: orderValue.tokenId.toString(), amount: orderValue.amount.toString(), price: orderValue.price.toString() },
        signature,
        orderType: 'FAK',
      };
      const submitRes = await fetch(\`\${CONFIG.apiBaseUrl}/orders\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      console.log('✅ تم إرسال أمر FAK إلى Match Engine! الحالة:', submitRes.status);
    }
  } catch (err: any) {
    console.error('❌ خطأ أثناء التنفيذ:', err.message);
  } finally {
    isExecuting = false;
  }
}

// 5. جلب الشموع السابقة فوراً عبر Binance REST API
async function initHistoricalCandles() {
  try {
    const res = await fetch('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=50', { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      const closes = data.map((k: any) => parseFloat(k[4]));
      candleCloses.push(...closes);
      console.log(\`✅ تم جلب \${closes.length} شمعة دقيقة سابقة بنجاح. البوت جاهز فوراً!\`);
    }
  } catch {}
}

// 6. تشغيل بث بينانس الحي وفحص الإشارات فورياً
async function run() {
  await initHistoricalCandles();

  const binanceWs = new WebSocket('${selectedBinanceWs}');
  let lastEval = 0;

  binanceWs.on('open', () => {
    console.log('⚡ متصل ببث بينانس المباشر لأسعار BTC (BTCUSDT 1m)');
  });

  binanceWs.on('message', async (raw: string) => {
    try {
      const data = JSON.parse(raw);
      if (!data.k) return;
      const kline = data.k;
      const closePrice = parseFloat(kline.c);
      const isClosed = kline.x;
      const now = Date.now();

      if (isClosed) {
        candleCloses.push(closePrice);
        if (candleCloses.length > 50) candleCloses.shift();
      }

      if (candleCloses.length >= CONFIG.lookback && (isClosed || now - lastEval >= 2000)) {
        lastEval = now;
        const { zScore, mean, stdDev } = computeZScore(candleCloses, CONFIG.lookback);
        console.log(\`📊 [فحص Z-Score]: السعر=$\${closePrice} | المتوسط=$\${mean.toFixed(2)} | Z-Score=\${zScore > 0 ? '+' : ''}\${zScore.toFixed(3)}\`);

        if (zScore >= CONFIG.upperZScore) {
          console.log(\`🚨 إشارة هبوط! Z = +\${zScore.toFixed(2)} (>= +\${CONFIG.upperZScore})\`);
          await findAndExecuteBestBtcTrade('NO', zScore);
        } else if (zScore <= CONFIG.lowerZScore) {
          console.log(\`🚨 إشارة صعود! Z = \${zScore.toFixed(2)} (<= \${CONFIG.lowerZScore})\`);
          await findAndExecuteBestBtcTrade('YES', zScore);
        }
      }
    } catch (e) {}
  });

  binanceWs.on('close', () => {
    setTimeout(run, 5000);
  });
}

run();`;

  const copyScript = () => {
    navigator.clipboard.writeText(dualWsBotScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* بطاقة الشرح والتوضيح الصريح */}
      <div className="p-4 rounded-2xl bg-cyan-950/40 border border-cyan-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-cyan-500 text-slate-950 font-bold">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>ربط WebSocket ثنائي متزامن (Binance + Limitless)</span>
              <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-500/30">
                بدون حظر جغرافيا
              </span>
            </h2>
            <p className="text-xs text-slate-300">
              يستقبل أسعار شموع البيتكوين مباشرة من بينانس بدون قيود جغرافية، ويصطاد عروض أسعار ليمتلس &le; 0.80$ في اللحظة نفسها.
            </p>
          </div>
        </div>

        <button
          onClick={copyScript}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-all shrink-0 shadow-lg"
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          <span>{copied ? 'تم نسخ كود bot.ts!' : 'نسخ كود bot.ts المحدث'}</span>
        </button>
      </div>

      {/* اختيار رابط بث بينانس */}
      <div className="p-4 bg-slate-900/80 rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <Globe2 className="w-4 h-4 text-cyan-400" />
          <span className="font-bold text-white">اختر سيرفر بث بينانس (Binance Feed):</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setBinanceEndpoint('vision')}
            className={`px-3 py-1.5 rounded-lg font-mono text-[11px] transition-all border ${
              binanceEndpoint === 'vision'
                ? 'bg-cyan-500 text-slate-950 font-bold border-cyan-400'
                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            data-stream.binance.vision (عالمي بدون حظر)
          </button>
          <button
            onClick={() => setBinanceEndpoint('us')}
            className={`px-3 py-1.5 rounded-lg font-mono text-[11px] transition-all border ${
              binanceEndpoint === 'us'
                ? 'bg-cyan-500 text-slate-950 font-bold border-cyan-400'
                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            stream.binance.us (الولايات المتحدة)
          </button>
        </div>
      </div>

      {/* مدخلات الروبوت الأساسية فقط */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* المفاتيح وبيانات الاتصال */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-800 text-slate-200 font-bold text-xs">
            <Key className="w-4 h-4 text-cyan-400" />
            <span>بيانات المحفظة و API (Credentials)</span>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-slate-400 flex items-center justify-between">
              <span>المفتاح الخاص للمحفظة (PRIVATE_KEY)</span>
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="text-[10px] text-cyan-400 hover:underline"
              >
                {showKey ? 'إخفاء' : 'إظهار'}
              </button>
            </label>
            <input
              type={showKey ? 'text' : 'password'}
              value={config.privateKey || ''}
              onChange={(e) => onUpdateConfig({ ...config, privateKey: e.target.value })}
              placeholder="0x..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-500"
            />
            <span className="text-[10px] text-slate-500 block">
              يُستخدم محلياً لتوقيع EIP-712 Order دون أن يغادر جهازك.
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[11px] text-slate-400">LMTS_TOKEN_ID</label>
              <input
                type="text"
                value={config.lmtsTokenId || ''}
                onChange={(e) => onUpdateConfig({ ...config, lmtsTokenId: e.target.value })}
                placeholder="lmts_tok_..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-slate-400">LMTS_TOKEN_SECRET</label>
              <input
                type="password"
                value={config.lmtsTokenSecret || ''}
                onChange={(e) => onUpdateConfig({ ...config, lmtsTokenSecret: e.target.value })}
                placeholder="HMAC Secret"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>
        </div>

        {/* معايير إدارة رأس المال والمخاطرة */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-800 text-slate-200 font-bold text-xs">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <span>معايير المخاطرة والتنفيذ (Risk Rules)</span>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
              <span>أقصى سعر دخول مسموح (Max Entry Price)</span>
              <span className="text-cyan-400 font-mono font-bold">${config.maxEntryPrice.toFixed(2)} USDC</span>
            </label>
            <input
              type="range"
              min="0.05"
              max="0.95"
              step="0.01"
              value={config.maxEntryPrice}
              onChange={(e) => onUpdateConfig({ ...config, maxEntryPrice: parseFloat(e.target.value) })}
              className="w-full accent-cyan-500 cursor-pointer"
            />
            <p className="text-[11px] text-slate-400">
              سقف السعر: الدخول في صفقات بأسعار &le; 0.80$ يقتنص الفرص فوراً. إذا كان السعر أعلى، يُلغى الأمر لحماية رأس المال.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
              <span>ميزانية الصفقة الواحدة (Trade Budget)</span>
              <span className="text-emerald-400 font-mono font-bold">${config.tradeSizeUsdc} USDC</span>
            </label>
            <input
              type="range"
              min="10"
              max="500"
              step="10"
              value={config.tradeSizeUsdc}
              onChange={(e) => onUpdateConfig({ ...config, tradeSizeUsdc: parseInt(e.target.value, 10) })}
              className="w-full accent-emerald-500 cursor-pointer"
            />
            <p className="text-[11px] text-slate-400">
              المبلغ المالي المخصص لشراء العقود عند تحقق شروط الإشارة وسعر الدخول.
            </p>
          </div>
        </div>
      </div>

      {/* عارض الكود الصافي (bot.ts) مع ميزة البث الفوري المزدوج */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold text-white font-mono">bot.ts (Dual WebSocket Production Bot)</h3>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-mono">
            <span className="text-slate-400">
              التشغيل: <code className="text-cyan-300 bg-slate-950 px-2 py-0.5 rounded">npx tsx bot.ts</code>
            </span>
          </div>
        </div>

        <div className="relative" dir="ltr">
          <pre className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-[11px] font-mono text-cyan-200/90 max-h-96 overflow-y-auto leading-relaxed select-all text-left">
            {dualWsBotScript}
          </pre>
        </div>
      </div>
    </div>
  );
};
