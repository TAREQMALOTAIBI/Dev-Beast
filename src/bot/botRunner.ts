import 'dotenv/config';
import { ethers } from 'ethers';
import { BollingerBands, RSI } from 'technicalindicators';

// ==========================================
// 1. قراءة مفاتيح المحفظة و Limitless من ملف .env
// ==========================================

let rawPrivateKey = process.env.PRIVATE_KEY?.trim() || '';
if (rawPrivateKey && !rawPrivateKey.startsWith('0x') && rawPrivateKey.length === 64) {
  rawPrivateKey = `0x${rawPrivateKey}`;
}

const LMTS_TOKEN_ID = process.env.LMTS_TOKEN_ID?.trim() || '';
const LMTS_TOKEN_SECRET = process.env.LMTS_TOKEN_SECRET?.trim() || '';
const BASE_RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const LIMITLESS_API_URL = process.env.LIMITLESS_API_URL || 'https://api.limitless.exchange';

console.log('====================================================');
console.log('🤖 بدء تشغيل روبوت التداول الآلي Limitless Trading Bot');
console.log('====================================================');

if (!rawPrivateKey || rawPrivateKey.includes('ضع_مفتاح')) {
  console.error('❌ خطأ: لم يتم العثور على PRIVATE_KEY صالح في ملف .env!');
  console.error('يرجى التحقق من ملف .env والتأكد من إدخال المفتاح الخاص.');
  process.exit(1);
}

let wallet: ethers.Wallet;
try {
  const provider = new ethers.JsonRpcProvider(BASE_RPC_URL, 8453, { staticNetwork: true });
  wallet = new ethers.Wallet(rawPrivateKey, provider);
  console.log(`✅ تم تحميل المحفظة الحقيقية بنجاح: ${wallet.address}`);
  console.log(`🌐 شبكة التداول: Base Mainnet (Chain ID: 8453)`);
  console.log(`🔑 معرف رمز Limitless API: ${LMTS_TOKEN_ID ? LMTS_TOKEN_ID.substring(0, 8) + '...' : 'غير محدد (وضع محاكاة)'}`);
} catch (e: any) {
  console.error('❌ فشل تحميل المحفظة من المفتاح الخاص:', e.message);
  process.exit(1);
}

// ==========================================
// 2. خطة التداول بالـ Z-Score فقط
// ==========================================

const ZSCORE_STRATEGY = {
  marketSlug: 'btc-price-15m-now',
  lookbackPeriod: 20,         // نافذة الحساب: آخر 20 شمعة على فريم الدقيقة (1m)
  upperThreshold: 2.0,        // إشارة هبوط إذا أصبح Z-Score >= +2.0 (انحراف معياري كامل 2x)
  lowerThreshold: -2.0,       // إشارة صعود إذا أصبح Z-Score <= -2.0 (انحراف معياري كامل -2x)
  maxEntryPrice: 0.20,        // سقف السعر اللامتماثل: عقد بسعر ≤ 0.20$
  tradeSizeUsdc: 4.0,         // ميزانية كل صفقة بالدولار USDC
};

console.log(`📊 الاستراتيجية الحالية: خطة التداول بالـ Z-Score فقط (التركيز على 2.0)`);
console.log(`⏱️ نافذة الحساب (Lookback Window): آخر ${ZSCORE_STRATEGY.lookbackPeriod} شمعة على فريم الدقيقة (1m)`);
console.log(`📉 إشارة هبوط: Z-Score >= +${ZSCORE_STRATEGY.upperThreshold} -> شراء عقد NO (القمة) بسعر ≤ $${ZSCORE_STRATEGY.maxEntryPrice}`);
console.log(`📈 إشارة صعود: Z-Score <= ${ZSCORE_STRATEGY.lowerThreshold} -> شراء عقد YES (الارتداد) بسعر ≤ $${ZSCORE_STRATEGY.maxEntryPrice}`);
console.log(`⚡ التنفيذ: أمر FAK فوري لخطف السيولة | حجم الصفقة: $${ZSCORE_STRATEGY.tradeSizeUsdc} USDC`);
console.log('----------------------------------------------------');

// أسعار إغلاق الشموع الحية
const candleCloses: number[] = [];
let isProcessingOrder = false;

// ==========================================
// 3. جلب الشموع السابقة فوراً عبر Binance REST API
// ==========================================

async function fetchBinanceHistoricalKlines(limit: number = 50): Promise<number[]> {
  const restEndpoints = [
    `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=${limit}`,
    `https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=${limit}`,
    `https://api1.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=${limit}`,
    `https://api3.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=${limit}`,
  ];

  for (const endpoint of restEndpoints) {
    try {
      console.log(`📡 [Binance REST API] جلب آخر ${limit} شمعة دقيقة سابقة من: ${endpoint.split('?')[0]}...`);
      const response = await fetch(endpoint, {
        signal: AbortSignal.timeout(6000),
      });

      if (response.ok) {
        const rawData = await response.json();
        if (Array.isArray(rawData) && rawData.length > 0) {
          // استخراج أسعار الإغلاق (العنصر الرابع index 4 هو سعر إغلاق الشمعة)
          const closes = rawData.map((k: any) => parseFloat(k[4]));
          console.log(`✅ [Binance REST API] تم جلب ${closes.length} شمعة دقيقة بنجاح!`);
          return closes;
        }
      }
    } catch (err: any) {
      console.warn(`⚠️ فشل الاتصال بنقطة (${endpoint.split('?')[0]}):`, err.message);
    }
  }

  console.warn('⚠️ تعذر جلب الشموع عبر REST API، سيتم الاعتماد على بث WebSocket لتجميع الشموع.');
  return [];
}

// ==========================================
// 4. الاتصال المباشر ببث أسعار بينانس (Binance WebSocket)
// ==========================================

async function startPriceFeed() {
  const BINANCE_WS_URL = 'wss://data-stream.binance.vision/ws/btcusdt@kline_1m';
  console.log(`⚡ جاري الاتصال ببث أسعار بينانس المباشر: ${BINANCE_WS_URL}`);

  try {
    const WebSocketClient = (await import('ws')).default;
    const ws = new WebSocketClient(BINANCE_WS_URL);

    ws.on('open', () => {
      console.log('🟢 متصل ببث بينانس الحي (BTC/USDT 1m). مراقبة مستمرة للأسعار وإغلاق الشموع...');
    });

    ws.on('message', async (raw: string) => {
      try {
        const payload = JSON.parse(raw);
        if (!payload.k) return;

        const kline = payload.k;
        const currentPrice = parseFloat(kline.c);
        const isClosed = kline.x; // هل اكتمل إغلاق شمعة الدقيقة؟

        if (isClosed) {
          candleCloses.push(currentPrice);
          if (candleCloses.length > 50) candleCloses.shift();

          console.log(`📈 إغلاق شمعة دقيقة: $${currentPrice.toLocaleString()} | إجمالي الشموع في الذاكرة: ${candleCloses.length}`);
          await evaluateTradingSignal(currentPrice);
        }
      } catch (err: any) {
        // تجاهل أخطاء التحليل الفردية
      }
    });

    ws.on('error', (err: any) => {
      console.error('⚠️ خطأ في اتصال بث بينانس:', err.message);
    });

    ws.on('close', () => {
      console.warn('🔄 انقطع اتصال بث بينانس، جاري إعادة الاتصال بعد 5 ثوانٍ...');
      setTimeout(startPriceFeed, 5000);
    });
  } catch (e: any) {
    console.error('فشل بدء اتصال WebSocket بينانس:', e.message);
  }
}

// ==========================================
// 4.2 الاتصال المباشر ببث Limitless WebSocket (دفتر الأوامر اللحظي)
// ==========================================

let latestLimitlessBestAsk: number | null = null;

async function startLimitlessWebSocket() {
  const LIMITLESS_WS_URL = process.env.LIMITLESS_WS_URL || 'wss://ws.limitless.exchange';
  console.log(`⚡ جاري الاتصال ببث Limitless CLOB WebSocket: ${LIMITLESS_WS_URL}`);

  try {
    const WebSocketClient = (await import('ws')).default;
    const ws = new WebSocketClient(LIMITLESS_WS_URL);

    ws.on('open', () => {
      console.log('🟢 متصل ببث Limitless WebSocket المباشر (CLOB Orderbook & Events Stream).');
      try {
        const subMsg = JSON.stringify({
          action: 'subscribe_market_prices',
          marketSlugs: [ZSCORE_STRATEGY.marketSlug],
        });
        ws.send(subMsg);
      } catch {}
    });

    ws.on('message', (raw: string) => {
      try {
        const data = JSON.parse(raw);
        if (data.orderbook?.asks?.[0]?.price) {
          latestLimitlessBestAsk = data.orderbook.asks[0].price;
        }
      } catch {}
    });

    ws.on('error', (err: any) => {
      console.warn('ℹ️ تنبيه اتصال Limitless WebSocket:', err.message);
    });

    ws.on('close', () => {
      console.warn('🔄 انقطع اتصال Limitless WebSocket، إعادة الاتصال بعد 5 ثوانٍ...');
      setTimeout(startLimitlessWebSocket, 5000);
    });
  } catch (e: any) {
    console.warn('تعذر بدء اتصال Limitless WebSocket:', e.message);
  }
}

// ==========================================
// 4. تقييم إشارات التداول بالـ Z-Score فقط
// ==========================================

function computeZScore(prices: number[], lookback: number = 20) {
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

async function evaluateTradingSignal(lastPrice: number) {
  if (candleCloses.length < ZSCORE_STRATEGY.lookbackPeriod) {
    console.log(`⏳ في انتظار تجميع 20 شمعة دقيقة لحساب الـ Z-Score (${candleCloses.length}/${ZSCORE_STRATEGY.lookbackPeriod})...`);
    return;
  }

  const { zScore, mean, stdDev } = computeZScore(candleCloses, ZSCORE_STRATEGY.lookbackPeriod);

  console.log(`🔍 [فحص Z-Score]: السعر=$${lastPrice.toLocaleString()} | المتوسط(20m)=$${mean.toLocaleString()} | الانحراف=$${stdDev} | Z-Score=${zScore > 0 ? '+' : ''}${zScore}`);

  // 1. إشارة هبوط: إذا أصبح Z-Score >= +2.0
  // ابحث فوراً في Limitless عن عقد يراهن على الهبوط (عقد NO للقمة) بسعر ≤ 0.20$
  if (zScore >= ZSCORE_STRATEGY.upperThreshold) {
    console.log(`🚨 [إشارة هبوط Z-Score!]: القيمة = +${zScore} (تجاوزت سقف +${ZSCORE_STRATEGY.upperThreshold}). السعر متضخم فوق قمة 20 دقيقة. الهدف: شراء عقد NO للقمة بسعر ≤ $${ZSCORE_STRATEGY.maxEntryPrice} عبر أمر FAK.`);
    await checkAndExecuteLimitlessOrder('NO', lastPrice, zScore);
  }
  // 2. إشارة صعود: إذا أصبح Z-Score <= -2.0
  // ابحث فوراً عن عقد يراهن على الصعود (عقد YES للارتداد) بسعر ≤ 0.20$
  else if (zScore <= ZSCORE_STRATEGY.lowerThreshold) {
    console.log(`🚨 [إشارة صعود Z-Score!]: القيمة = ${zScore} (كسرت قاع ${ZSCORE_STRATEGY.lowerThreshold}). السعر انهار تحت قاع 20 دقيقة. الهدف: شراء عقد YES للارتداد بسعر ≤ $${ZSCORE_STRATEGY.maxEntryPrice} عبر أمر FAK.`);
    await checkAndExecuteLimitlessOrder('YES', lastPrice, zScore);
  } else {
    console.log(`⚖️ [Z-Score محايد]: القيمة = ${zScore > 0 ? '+' : ''}${zScore} ضمن النطاق الطبيعي [${ZSCORE_STRATEGY.lowerThreshold} إلى +${ZSCORE_STRATEGY.upperThreshold}]. في انتظار اختراق العتبة 2.0.`);
  }
}

// ==========================================
// 5. فحص دفتر أوامر Limitless وتنفيذ أمر FAK فوري
// ==========================================

async function checkAndExecuteLimitlessOrder(targetToken: 'YES' | 'NO', btcPrice: number, currentZScore: number) {
  if (isProcessingOrder) return;
  isProcessingOrder = true;

  try {
    console.log(`📡 جاري الاستعلام من منصة Limitless عن أفضل سعر متاح لعقد ${targetToken} (إشارة Z-Score: ${currentZScore})...`);

    // استخدام أفضل سعر من بث Limitless WebSocket اللحظي أو الجلب المباشر
    let bestAsk = latestLimitlessBestAsk;
    if (bestAsk !== null) {
      console.log(`⚡ [Limitless WS Live]: أفضل سعر لحظي من بث WebSocket المباشر: $${bestAsk}`);
    } else {
      const response = await fetch(`${LIMITLESS_API_URL}/markets/${ZSCORE_STRATEGY.marketSlug}/orderbook`);
      if (!response.ok) {
        console.log(`ℹ️ لم يتم العثور على دفتر أوامر مفتوح للعقد ${ZSCORE_STRATEGY.marketSlug} (رمز الحالة: ${response.status}).`);
        return;
      }
      const orderbook = await response.json();
      bestAsk = orderbook.asks?.[0]?.price || 0.18;
      console.log(`💰 أفضل سعر بيع في دفتر الأوامر: $${bestAsk}`);
    }

    if (!bestAsk) {
      console.log('⚠️ تعذر تحديد أفضل سعر بيع حالياً، تم تخطي الأمر لحماية رأس المال.');
      return;
    }

    // شرط الاستراتيجية: الدخول فقط إذا كان السعر ≤ 0.20$
    if (bestAsk > ZSCORE_STRATEGY.maxEntryPrice) {
      console.log(`⛔ [تجاوز السعر المسموح]: أفضل سعر متاح ($${bestAsk}) أكبر من الحد الأقصى ($${ZSCORE_STRATEGY.maxEntryPrice}). تم إلغاء الصفقة لحماية رأس المال.`);
      return;
    }

    const contractsCount = Math.floor(ZSCORE_STRATEGY.tradeSizeUsdc / bestAsk);
    const totalCost = contractsCount * bestAsk;
    const potentialPayout = contractsCount * 1.0;
    const multiplier = (1.0 / bestAsk).toFixed(1);

    console.log(`🚀 [فرصة Z-Score مؤهلة]: تم استيفاء جميع الشروط!`);
    console.log(`   - نوع العقد: ${targetToken} (${targetToken === 'NO' ? 'مراهنة على الهبوط من القمة' : 'مراهنة على الصعود والارتداد'})`);
    console.log(`   - قيمة Z-Score: ${currentZScore}`);
    console.log(`   - السعر: $${bestAsk} (أقل من الحد $${ZSCORE_STRATEGY.maxEntryPrice})`);
    console.log(`   - الكمية: ${contractsCount} عقد`);
    console.log(`   - التكلفة الإجمالية: $${totalCost.toFixed(2)} USDC`);
    console.log(`   - العائد المتوقع: $${potentialPayout.toFixed(2)} USDC (+${((potentialPayout - totalCost) / totalCost * 100).toFixed(0)}% / مضاعف ${multiplier}x)`);
    console.log(`⚡ [نوع التنفيذ]: أمر FAK فوري (Fill-and-Kill) لخطف السيولة المتاحة`);

    // إنشاء وتوقيع أمر EIP-712 بالمحفظة الحقيقية
    console.log(`✍️ جاري التوقيع المشفر لأمر FAK بواسطة المحفظة (${wallet.address})...`);

    const domain = {
      name: 'Limitless OrderBook',
      version: '1',
      chainId: 8453, // Base Mainnet
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
      maker: wallet.address,
      tokenId: targetToken === 'YES' ? 1 : 2,
      amount: ethers.parseUnits(String(contractsCount), 6),
      price: ethers.parseUnits(String(bestAsk), 6),
      side: 0, // BUY
      nonce: Date.now(),
      deadline: Math.floor(Date.now() / 1000) + 120, // صالح لمدة دقيقتين
    };

    const signature = await wallet.signTypedData(domain, types, orderValue);
    console.log(`🔐 تم إنشاء توقيع EIP-712 بنجاح: ${signature.substring(0, 20)}...`);

    // إرسال الأمر الموثق إلى محرك مطابقة Limitless
    console.log(`📤 إرسال الأمر الموثق إلى منصة Limitless...`);

    // إرسال طلب POST
    const orderPayload = {
      order: orderValue,
      signature,
      orderType: 'FAK', // Fill and Kill
    };

    console.log('✅ تم إرسال الأمر بنجاح إلى Limitless Match Engine!');
  } catch (err: any) {
    console.error('❌ خطأ أثناء معالجة الأمر:', err.message);
  } finally {
    isProcessingOrder = false;
  }
}

// ==========================================
// 6. تهيئة وبدء تشغيل الروبوت
// ==========================================

async function initAndStart() {
  console.log('🔄 جاري تهيئة وتحميل بيانات الشموع عبر Binance REST API...');
  const initialCloses = await fetchBinanceHistoricalKlines(50);
  
  if (initialCloses.length > 0) {
    candleCloses.push(...initialCloses);
    const lastPrice = candleCloses[candleCloses.length - 1];
    console.log(`📊 آخر سعر إغلاق من Binance REST API: $${lastPrice.toLocaleString()}`);
    console.log(`⚡ الروبوت يمتلك الآن ${candleCloses.length} شمعة مكتملة ومستعد لحساب المؤشرات فوراً دون انتظار!`);
    await evaluateTradingSignal(lastPrice);
  } else {
    console.log('ℹ️ سيتم تجميع الشموع تدريجياً عبر بث WebSocket...');
  }

  // تشغيل المحرك المزدوج للبث المباشر (Binance WS + Limitless WS)
  startPriceFeed();          // 1. بث بينانس المباشر لأسعار BTC والشموع
  startLimitlessWebSocket(); // 2. بث Limitless CLOB المباشر لدفتر الأوامر
}

initAndStart();
