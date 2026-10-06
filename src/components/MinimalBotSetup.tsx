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

// كود البوت الكامل والمستقل مع خطة التداول بالـ Z-Score فقط وأمر FAK الفوري
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
  APIError,
} from '@limitless-exchange/sdk';

// 1. بيانات الاعتماد والمفاتيح
const CREDENTIALS = {
  tokenId: process.env.LMTS_TOKEN_ID || '${config.lmtsTokenId || 'your-token-id'}',
  secret: process.env.LMTS_TOKEN_SECRET || 'your-token-secret',
  privateKey: process.env.PRIVATE_KEY || '${config.privateKey || '0x...'}',
};

// 2. إعدادات خطة الـ Z-Score فقط
const CONFIG = {
  marketSlug: 'btc-price-15m-now',
  lookback: 20,         // نافذة الحساب: آخر 20 شمعة على فريم الدقيقة (1m)
  upperZScore: 2.0,     // إشارة هبوط: Z-Score >= +2.0 (تركيز كامل على 2.0)
  lowerZScore: -2.0,    // إشارة صعود: Z-Score <= -2.0 (تركيز كامل على -2.0)
  maxEntryPrice: ${config.maxEntryPrice}, // سقف السعر: عقود ≤ 0.20$
  tradeSizeUsdc: ${config.tradeSizeUsdc},  // ميزانية الصفقة بالدولار
};

// 3. ذاكرة أسعار إغلاق الشموع في الوقت الفعلي
const candleCloses: number[] = [];

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

// 4. الاتصال بـ Binance WebSocket للشموع اللحظية
const binanceWs = new WebSocket('${selectedBinanceWs}');

binanceWs.on('open', () => {
  console.log('⚡ متصل ببث بينانس المباشر لأسعار BTC');
});

binanceWs.on('message', (raw: string) => {
  try {
    const data = JSON.parse(raw);
    const kline = data.k; // شمعة الدقيقة
    const closePrice = parseFloat(kline.c);

    // إضافة السعر لقائمة الشموع عند اكتمال إغلاق الشمعة
    if (kline.x) {
      candleCloses.push(closePrice);
      if (candleCloses.length > 50) candleCloses.shift();
      console.log(\`📊 إغلاق شمعة دقيقة: \${closePrice}\`);
    }
  } catch (e) {}
});

// 5. إعداد اتصال Limitless WebSocket ومحرك الأوامر
const httpClient = new HttpClient({
  baseURL: '${config.apiBaseUrl}',
  hmacCredentials: { tokenId: CREDENTIALS.tokenId, secret: CREDENTIALS.secret },
});
const wallet = new ethers.Wallet(CREDENTIALS.privateKey);
const marketFetcher = new MarketFetcher(httpClient);
const orderClient = new OrderClient({ httpClient, wallet, marketFetcher });

const limitlessWs = new WebSocketClient({
  url: 'wss://ws.limitless.exchange',
  hmacCredentials: { tokenId: CREDENTIALS.tokenId, secret: CREDENTIALS.secret },
  autoReconnect: true,
});

async function run() {
  await limitlessWs.connect();
  console.log('⚡ متصل بـ Limitless CLOB WebSocket');

  await limitlessWs.subscribe('subscribe_market_prices', { marketSlugs: [CONFIG.marketSlug] });
  await limitlessWs.subscribe('subscribe_order_events');

  // استماع فوري لأي تحديث في دفتر الأوامر وفحص شروط Z-Score
  limitlessWs.on('orderbookUpdate', async (data) => {
    if (data.marketSlug !== CONFIG.marketSlug) return;
    if (candleCloses.length < CONFIG.lookback) return; // انتظار اكتمال 20 شمعة

    const bestAsk = data.orderbook.asks[0]?.price;
    // شرط السعر: الدخول فقط إذا كان السعر ≤ 0.20$
    if (!bestAsk || bestAsk > CONFIG.maxEntryPrice) return;

    // حساب الـ Z-Score اللحظي
    const { zScore } = computeZScore(candleCloses, CONFIG.lookback);

    let targetSide: 'YES' | 'NO' | null = null;
    // إشارة هبوط: Z-Score >= +2.0 -> شراء عقد NO (القمة)
    if (zScore >= CONFIG.upperZScore) targetSide = 'NO';
    // إشارة صعود: Z-Score <= -2.0 -> شراء عقد YES (الارتداد)
    if (zScore <= CONFIG.lowerZScore) targetSide = 'YES';

    if (!targetSide) return;

    // تنفيذ أمر FAK فوري لخطف السيولة
    try {
      const market = await marketFetcher.getMarket(CONFIG.marketSlug);
      const tokenId = targetSide === 'YES' ? market.tokens.yes : market.tokens.no;
      const contracts = Math.floor(CONFIG.tradeSizeUsdc / bestAsk);

      console.log(\`🎯 [اقتناص فرصة Z-Score]: Z=\${zScore.toFixed(2)} | السعر: $\${bestAsk} | العقد: \${targetSide}\`);

      // إرسال أمر FAK فوري
      const result = await withRetry(
        () => orderClient.createOrder({
          marketSlug: market.slug,
          tokenId,
          side: Side.BUY,
          price: bestAsk,
          size: contracts,
          orderType: OrderType.FAK, // أمر FAK فوري
        }),
        {
          statusCodes: [429, 500, 502, 503, 504],
          maxRetries: 3,
          delays: [1, 2, 4],
        }
      );

      console.log('✅ تم تنفيذ أمر FAK بنجاح:', result.order?.id);
    } catch (error) {
      console.error('❌ خطأ في تنفيذ أمر FAK:', error);
    }
  });

  limitlessWs.on('orderEvent', (event) => {
    if (event.source === 'OME' && event.type === 'EXECUTION') {
      console.log(\`✅ حالة التنفيذ: \${event.status} | المعرف: \${event.orderId}\`);
    }
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
              يستقبل أسعار شموع البيتكوين مباشرة من بينانس بدون قيود جغرافية، ويصطاد عروض أسعار ليمتلس &le; 0.20$ في اللحظة نفسها.
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
              max="0.30"
              step="0.01"
              value={config.maxEntryPrice}
              onChange={(e) => onUpdateConfig({ ...config, maxEntryPrice: parseFloat(e.target.value) })}
              className="w-full accent-cyan-500 cursor-pointer"
            />
            <p className="text-[11px] text-slate-400">
              قاعدة عدم التماثل: الشراء بسعر &le; 0.20$ يضمن عائداً 5.0x (+400%). إذا كان السعر أعلى، يُلغى الأمر فورياً.
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
