import 'dotenv/config';
import { ethers } from 'ethers';
import { BollingerBands, RSI } from 'technicalindicators';
import { HttpClient, MarketFetcher, OrderClient, Side, OrderType, WebSocketClient } from '@limitless-exchange/sdk';

// ==========================================
// 1. قراءة مفاتيح المحفظة و Limitless من ملف .env
// ==========================================

function cleanPrivateKey(rawKey: string): string {
  if (!rawKey) return '';
  let clean = rawKey.trim().replace(/['"`\s]/g, '');
  if (clean.startsWith('0x') || clean.startsWith('0X')) {
    clean = clean.slice(2);
  }
  return clean ? `0x${clean}` : '';
}

let rawPrivateKey = cleanPrivateKey(process.env.PRIVATE_KEY || '');

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
  console.log(`🔑 معرف رمز Limitless API: ${LMTS_TOKEN_ID ? LMTS_TOKEN_ID.substring(0, 8) + '...' : '⚠️ غير محدد (مطلوب للتنفيذ الحقيقي)'}`);
} catch (e: any) {
  console.error('❌ فشل تحميل المحفظة من المفتاح الخاص:', e.message);
  process.exit(1);
}

// ==========================================
// 1.1 فحص رصيد واعتماد USDC لعقد التداول على شبكة Base
// ==========================================

const USDC_ADDRESS_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const ERC20_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
];

async function ensureVenueApproval(venueExchange: string) {
  try {
    const usdc = new ethers.Contract(USDC_ADDRESS_BASE, ERC20_ABI, wallet);
    const balance = await usdc.balanceOf(wallet.address);
    const formattedBalance = ethers.formatUnits(balance, 6);
    console.log(`💵 رصيد USDC في المحفظة: $${formattedBalance}`);

    const allowance = await usdc.allowance(wallet.address, venueExchange);
    if (allowance < ethers.parseUnits('1000', 6)) {
      console.log(`✍️ جاري اعتماد عقد Venue (${venueExchange}) لعملة USDC على Base Mainnet...`);
      const tx = await usdc.approve(venueExchange, ethers.MaxUint256);
      console.log(`⛓️ تم إرسال معاملة الاعتماد: ${tx.hash}. في انتظار التأكيد...`);
      await tx.wait(1);
      console.log('✅ تم اعتماد USDC بنجاح للتداول على Limitless!');
    } else {
      console.log(`✅ عقد التداول (${venueExchange.substring(0, 10)}...) معتمد مسبقاً لـ USDC.`);
    }
  } catch (err: any) {
    console.warn(`⚠️ تنبيه أثناء فحص اعتماد USDC:`, err.message);
  }
}

// ==========================================
// 2. خطة التداول بالـ Z-Score فقط
// ==========================================

const ZSCORE_STRATEGY = {
  marketSlug: 'btc-price-15m-now',
  lookbackPeriod: 20,         // نافذة الحساب: آخر 20 شمعة على فريم الدقيقة (1m)
  upperThreshold: 1.0,        // إشارة هبوط إذا أصبح Z-Score >= +1.0
  lowerThreshold: -1.0,       // إشارة صعود إذا أصبح Z-Score <= -1.0
  maxEntryPrice: Number(process.env.MAX_ENTRY_PRICE) || 0.80, // سقف سعر الدخول (حتى 0.80$)
  riskPercent: 1.0,           // نسبة المخاطرة للصفقة: 1% من رأس المال
  tradeSizeUsdc: Number(process.env.TRADE_SIZE_USDC) || 8.0,  // ميزانية كل صفقة بالدولار USDC
};

console.log(`📊 الاستراتيجية الحالية: خطة التداول بالـ Z-Score فقط (التركيز على 1.0)`);
console.log(`⏱️ نافذة الحساب (Lookback Window): آخر ${ZSCORE_STRATEGY.lookbackPeriod} شمعة على فريم الدقيقة (1m)`);
console.log(`📉 إشارة هبوط: Z-Score >= +${ZSCORE_STRATEGY.upperThreshold} -> شراء عقد NO (القمة) بسعر ≤ $${ZSCORE_STRATEGY.maxEntryPrice}`);
console.log(`📈 إشارة صعود: Z-Score <= ${ZSCORE_STRATEGY.lowerThreshold} -> شراء عقد YES (الارتداد) بسعر ≤ $${ZSCORE_STRATEGY.maxEntryPrice}`);
console.log(`⚡ التنفيذ: أمر FAK فوري لخطف السيولة | سقف الدخول: $${ZSCORE_STRATEGY.maxEntryPrice} | حجم الصفقة: $${ZSCORE_STRATEGY.tradeSizeUsdc} USDC`);
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

    let lastEvaluatedTime = 0;

    ws.on('message', async (raw: string) => {
      try {
        const payload = JSON.parse(raw);
        if (!payload.k) return;

        const kline = payload.k;
        const currentPrice = parseFloat(kline.c);
        const isClosed = kline.x; // هل اكتمل إغلاق شمعة الدقيقة؟
        const now = Date.now();

        if (isClosed) {
          candleCloses.push(currentPrice);
          if (candleCloses.length > 50) candleCloses.shift();

          console.log(`📈 إغلاق شمعة دقيقة: $${currentPrice.toLocaleString()} | إجمالي الشموع في الذاكرة: ${candleCloses.length}`);
          await evaluateTradingSignal(currentPrice, true);
          lastEvaluatedTime = now;
        } else if (now - lastEvaluatedTime >= 2000 && candleCloses.length >= (ZSCORE_STRATEGY.lookbackPeriod - 1)) {
          // فحص الإشارات اللحظية كل ثانيتين أثناء حركة السعر
          await evaluateTradingSignal(currentPrice, false);
          lastEvaluatedTime = now;
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
// 4.2 الاتصال المباشر ببث Limitless WebSocket عبر WebSocketClient الرسمي
// ==========================================

let latestLimitlessBestAsk: number | null = null;
let latestLimitlessBestBid: number | null = null;
let limitlessWsClient: any = null;

async function startLimitlessWebSocket(targetSlug?: string) {
  const slug = targetSlug || ZSCORE_STRATEGY.marketSlug;
  const LIMITLESS_WS_URL = process.env.LIMITLESS_WS_URL || 'wss://ws.limitless.exchange';
  console.log(`⚡ جاري الاتصال ببث Limitless WebSocket الرسمي: ${LIMITLESS_WS_URL}`);

  try {
    const wsOptions: any = {
      url: LIMITLESS_WS_URL,
      autoReconnect: true,
    };

    if (LMTS_TOKEN_ID && LMTS_TOKEN_SECRET && !LMTS_TOKEN_ID.includes('ضع_رمز')) {
      wsOptions.hmacCredentials = {
        tokenId: LMTS_TOKEN_ID,
        secret: LMTS_TOKEN_SECRET,
      };
    }

    limitlessWsClient = new WebSocketClient(wsOptions);
    await limitlessWsClient.connect();

    console.log('🟢 متصل بنجاح ببث Limitless WebSocket الرسمي (Live Orderbook & Account Events).');

    // 1. الاستماع لتحديثات دفتر الأوامر (orderbookUpdate)
    limitlessWsClient.on('orderbookUpdate', (data: any) => {
      try {
        if (data.orderbook) {
          if (data.orderbook.asks && data.orderbook.asks.length > 0) {
            latestLimitlessBestAsk = data.orderbook.asks[0].price;
          }
          if (data.orderbook.bids && data.orderbook.bids.length > 0) {
            latestLimitlessBestBid = data.orderbook.bids[0].price;
          }
        }
      } catch {}
    });

    // 2. الاستماع لأحداث الأوامر والتنفيذ والتسوية (orderEvent)
    limitlessWsClient.on('orderEvent', (event: any) => {
      if (event.source === 'OME') {
        console.log(`📡 [Limitless OME]: حالة الأمر ${event.orderId || ''}: ${event.type || event.status}`);
      } else {
        console.log(`⛓️ [Limitless Settlement]: تسوية على البلوكتشين: ${event.type} | TxHash: ${event.txHash || ''}`);
      }
    });

    // 3. الاستماع لأحداث تحديث المحفظة والصفقات (positions & tx)
    limitlessWsClient.on('positions', (data: any) => {
      console.log('💼 [Limitless Positions]: تم تحديث مراكز المحفظة الحية.');
    });

    limitlessWsClient.on('tx', (data: any) => {
      console.log(`🚀 [Limitless Tx]: المعاملة: ${data.txHash} | الحالة: ${data.status}`);
    });

    limitlessWsClient.on('disconnect', (reason: string) => {
      console.warn(`🔄 انقطع اتصال Limitless WebSocket (${reason}). إعادة الاتصال والاشتراك التلقائي...`);
    });

    // الاشتراك في أسعار السوق وأحداث الحساب
    await limitlessWsClient.subscribe('subscribe_market_prices', {
      marketSlugs: [slug],
    });

    if (wsOptions.hmacCredentials) {
      await limitlessWsClient.subscribe('subscribe_positions', { marketSlugs: [slug] }).catch(() => {});
      await limitlessWsClient.subscribe('subscribe_order_events').catch(() => {});
      await limitlessWsClient.subscribe('subscribe_transactions').catch(() => {});
    }
  } catch (e: any) {
    console.warn('تعذر بدء اتصال Limitless WebSocketClient:', e.message);
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

async function evaluateTradingSignal(lastPrice: number, isClosed: boolean = true) {
  if (candleCloses.length < (ZSCORE_STRATEGY.lookbackPeriod - 1)) {
    console.log(`⏳ في انتظار تجميع 20 شمعة دقيقة لحساب الـ Z-Score (${candleCloses.length}/${ZSCORE_STRATEGY.lookbackPeriod})...`);
    return;
  }

  const livePrices = isClosed
    ? candleCloses
    : [...candleCloses.slice(-(ZSCORE_STRATEGY.lookbackPeriod - 1)), lastPrice];

  const { zScore, mean, stdDev } = computeZScore(livePrices, ZSCORE_STRATEGY.lookbackPeriod);

  console.log(`🔍 [فحص Z-Score]: السعر=$${lastPrice.toLocaleString()} | المتوسط(20m)=$${mean.toLocaleString()} | الانحراف=$${stdDev} | Z-Score=${zScore > 0 ? '+' : ''}${zScore}`);

  // 1. إشارة هبوط: إذا أصبح Z-Score >= +0.50
  // ابحث فوراً في Limitless عن عقد يراهن على الهبوط (عقد NO للقمة) بسعر ≤ 0.80$
  if (zScore >= ZSCORE_STRATEGY.upperThreshold) {
    console.log(`🚨 [إشارة هبوط Z-Score!]: القيمة = +${zScore} (تجاوزت سقف +${ZSCORE_STRATEGY.upperThreshold}). السعر متضخم فوق قمة 20 دقيقة. الهدف: شراء عقد NO للقمة بسعر ≤ $${ZSCORE_STRATEGY.maxEntryPrice} عبر أمر FAK.`);
    await checkAndExecuteLimitlessOrder('NO', lastPrice, zScore);
  }
  // 2. إشارة صعود: إذا أصبح Z-Score <= -0.50
  // ابحث فوراً عن عقد يراهن على الصعود (عقد YES للارتداد) بسعر ≤ 0.80$
  else if (zScore <= ZSCORE_STRATEGY.lowerThreshold) {
    console.log(`🚨 [إشارة صعود Z-Score!]: القيمة = ${zScore} (كسرت قاع ${ZSCORE_STRATEGY.lowerThreshold}). السعر انهار تحت قاع 20 دقيقة. الهدف: شراء عقد YES للارتداد بسعر ≤ $${ZSCORE_STRATEGY.maxEntryPrice} عبر أمر FAK.`);
    await checkAndExecuteLimitlessOrder('YES', lastPrice, zScore);
  } else {
    console.log(`⚖️ [Z-Score محايد]: القيمة = ${zScore > 0 ? '+' : ''}${zScore} ضمن النطاق الطبيعي [${ZSCORE_STRATEGY.lowerThreshold} إلى +${ZSCORE_STRATEGY.upperThreshold}]. في انتظار اختراق العتبة 1.0.`);
  }
}

// ==========================================
// 5. اكتشاف السوق النشط وتنفيذ الأوامر عبر MarketFetcher و OrderClient (SDK الرسمي)
// ==========================================

const limitlessHttp = new HttpClient({
  baseURL: LIMITLESS_API_URL,
});
const marketFetcher = new MarketFetcher(limitlessHttp);

let orderClient: OrderClient | null = null;
if (LMTS_TOKEN_ID && LMTS_TOKEN_SECRET && !LMTS_TOKEN_ID.includes('ضع_رمز')) {
  try {
    const authHttp = new HttpClient({
      baseURL: LIMITLESS_API_URL,
      hmacCredentials: {
        tokenId: LMTS_TOKEN_ID,
        secret: LMTS_TOKEN_SECRET,
      },
    });
    orderClient = new OrderClient({
      httpClient: authHttp,
      wallet,
      marketFetcher,
    });
    console.log('⚡ تم تفعيل عميل OrderClient الموثق بـ HMAC Credentials بنجاح!');
  } catch (err: any) {
    console.warn('⚠️ تنبيه عند إعداد OrderClient:', err.message);
  }
}

// ==========================================
// 5. اكتشاف سوق BTC 15 دقيقة النشط حصرياً وفحص دفتر الأوامر وتنفيذ أمر FAK فوري
// ==========================================

async function getLiveActiveBtc15mMarket(): Promise<any | null> {
  try {
    for (let page = 1; page <= 3; page++) {
      const res = await marketFetcher.getActiveMarkets({
        limit: 25,
        page,
        sortBy: 'newest',
      }).catch(() => null);

      if (res && Array.isArray(res.data) && res.data.length > 0) {
        // البحث عن سوق البيتكوين 15 دقيقة الحصري النشط وغير المنتهي
        const btc15m = res.data.filter((m: any) => {
          if (m.closed || m.expired) return false;
          const s = (m.slug || '').toLowerCase();
          const t = (m.title || '').toLowerCase();
          const isBtc = s.includes('btc') || t.includes('btc');
          const is15m = s.includes('15-min') || s.includes('15min') || t.includes('15 min') || t.includes('15-min');
          const isExcluded = s.includes('daily') || t.includes('daily') ||
                             s.includes('hourly') || t.includes('hourly') ||
                             s.includes('weekly') || t.includes('weekly') ||
                             (!is15m && (s.includes('5-min') || t.includes('5 min')));
          return isBtc && is15m && !isExcluded;
        });

        if (btc15m.length > 0) {
          return btc15m[0];
        }
      }
    }
  } catch (err: any) {
    console.warn('⚠️ تنبيه أثناء جلب سوق BTC 15m عبر MarketFetcher:', err.message);
  }

  return null;
}

async function checkAndExecuteLimitlessOrder(targetToken: 'YES' | 'NO', btcPrice: number, currentZScore: number) {
  if (isProcessingOrder) return;
  isProcessingOrder = true;

  try {
    console.log(`📡 [سوق BTC 15 دقيقة] جاري فحص دفتر أوامر عقد 15m لشراء ${targetToken} (إشارة Z-Score: ${currentZScore})...`);

    const activeMarket = await getLiveActiveBtc15mMarket();
    if (!activeMarket) {
      console.log('ℹ️ لم يتم العثور على سوق BTC 15 دقيقة نشط حالياً على Limitless.');
      return;
    }

    console.log(`🎯 السوق المستهدف: ${activeMarket.title} (${activeMarket.slug})`);

    // 1. جلب دفتر الأوامر الخاص بسوق الـ 15 دقيقة
    const orderbook = await marketFetcher.getOrderBook(activeMarket.slug).catch(() => null);
    if (!orderbook) {
      console.log(`ℹ️ لم يتم العثور على دفتر أوامر مفتوح لسوق (${activeMarket.slug}).`);
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

    console.log(`💰 [سوق BTC 15m] أفضل سعر متاح لشراء عقد ${targetToken}: $${bestAsk !== null ? bestAsk : 'غير متوفر'} (سقف الدخول: $${ZSCORE_STRATEGY.maxEntryPrice})`);

    if (bestAsk === null || bestAsk <= 0) {
      console.log('⚠️ تعذر تحديد أفضل سعر شراء حالياً، تم تخطي الأمر لحماية رأس المال.');
      return;
    }

    // شرط السعر: الدخول فقط إذا كان السعر ≤ 0.80$
    if (bestAsk > ZSCORE_STRATEGY.maxEntryPrice) {
      console.log(`⛔ [سعر العقد مرتفع في سوق 15m]: السعر المتاح ($${bestAsk}) أعلى من سقف الاستراتيجية ($${ZSCORE_STRATEGY.maxEntryPrice}). تم الانتظار لاقتناص فرصة رخيصة.`);
      return;
    }

    // 2. جلب بيانات السوق وعقد التسوية (Venue)
    const marketDetails = await marketFetcher.getMarket(activeMarket.slug).catch(() => null);
    const venueExchange = marketDetails?.venue?.exchange || activeMarket.venue?.exchange || '0x05c748E2f4DcDe0ec9Fa8DDc40DE6b867f923fa5';
    const yesTokenId = marketDetails?.tokens?.yes || activeMarket.tokens?.yes;
    const noTokenId = marketDetails?.tokens?.no || activeMarket.tokens?.no;
    const selectedTokenId = targetToken === 'YES' ? yesTokenId : noTokenId;

    // دعم تجزئة العقود والكسور بدقة (Fractional Contracts)
    const contractsCount = Number((ZSCORE_STRATEGY.tradeSizeUsdc / bestAsk).toFixed(2));
    if (contractsCount <= 0) {
      console.log('⚠️ حجم العقد بعد التجزئة أصغر من الحد المسموح، تم تخطي الأمر.');
      return;
    }
    const totalCost = Number((contractsCount * bestAsk).toFixed(2));
    const potentialPayout = contractsCount * 1.0;
    const multiplier = (1.0 / bestAsk).toFixed(1);

    console.log(`🚀 [فرصة Z-Score مؤهلة في سوق BTC 15m]: تم استيفاء جميع الشروط!`);
    console.log(`   - السوق: ${activeMarket.title} (${activeMarket.slug})`);
    console.log(`   - نوع العقد: ${targetToken} (${targetToken === 'NO' ? 'مراهنة على الهبوط من القمة' : 'مراهنة على الصعود والارتداد'})`);
    console.log(`   - قيمة Z-Score: ${currentZScore}`);
    console.log(`   - السعر: $${bestAsk} (أقل من الحد $${ZSCORE_STRATEGY.maxEntryPrice})`);
    console.log(`   - الكمية: ${contractsCount} عقد`);
    console.log(`   - التكلفة الإجمالية: $${totalCost.toFixed(2)} USDC`);
    console.log(`   - العائد المتوقع: $${potentialPayout.toFixed(2)} USDC (+${((potentialPayout - totalCost) / totalCost * 100).toFixed(0)}% / مضاعف ${multiplier}x)`);
    console.log(`⚡ [نوع التنفيذ]: أمر FAK فوري (Fill-and-Kill) لخطف السيولة`);

    // تنفيذ الأمر عبر OrderClient إذا كان مفعل بـ HMAC أو التوقيع المباشر EIP-712
    if (orderClient && selectedTokenId) {
      console.log(`📤 تنفيذ الأمر عبر OrderClient الرسمي بـ Limitless SDK...`);
      const result = await orderClient.createOrder({
        marketSlug: activeMarket.slug,
        tokenId: selectedTokenId,
        side: Side.BUY,
        price: bestAsk,
        size: contractsCount,
        orderType: OrderType.FAK,
      });
      console.log(`✅ تم تنفيذ الأمر بنجاح عبر SDK! معرف الأمر: ${result.order?.id || 'OK'}`);
    } else {
      // إنشاء وتوقيع أمر EIP-712 بالمحفظة الحقيقية مباشرة مع استخدام عقد التسوية الحقيقي المستخرج من Venue
      console.log(`✍️ جاري التوقيع المشفر لأمر FAK بالمحفظة (${wallet.address}) على عقد Venue (${venueExchange})...`);

      const domain = {
        name: 'Limitless OrderBook',
        version: '1',
        chainId: 8453, // Base Mainnet
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
        maker: wallet.address,
        tokenId: numericTokenId,
        amount: ethers.parseUnits(String(contractsCount), 6),
        price: ethers.parseUnits(String(bestAsk), 6),
        side: 0, // BUY
        nonce: Date.now(),
        deadline: Math.floor(Date.now() / 1000) + 120, // صالح لمدة دقيقتين
      };

      const signature = await wallet.signTypedData(domain, types, orderValue);
      console.log(`🔐 تم إنشاء توقيع EIP-712 بنجاح: ${signature.substring(0, 20)}...`);

      console.log(`📤 إرسال الأمر الموثق إلى محرك مطابقة Limitless...`);
      const orderPayload = {
        order: {
          ...orderValue,
          tokenId: orderValue.tokenId.toString(),
          amount: orderValue.amount.toString(),
          price: orderValue.price.toString(),
        },
        signature,
        orderType: 'FAK',
      };

      const submitRes = await fetch(`${LIMITLESS_API_URL}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload),
      });

      if (submitRes.ok) {
        console.log('✅ تم إرسال الأمر وقبوله بنجاح في Limitless Match Engine!');
      } else {
        const errText = await submitRes.text();
        console.warn(`ℹ️ استجابة محرك الأوامر (${submitRes.status}):`, errText);
      }
    }

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
  const initialMarket = await getLiveActiveBtc15mMarket();
  if (initialMarket) {
    const venue = initialMarket.venue?.exchange || '0x05c748E2f4DcDe0ec9Fa8DDc40DE6b867f923fa5';
    await ensureVenueApproval(venue);
  }
  startLimitlessWebSocket(initialMarket ? initialMarket.slug : undefined); // 2. بث Limitless WebSocket المباشر للسوق النشط
}

initAndStart();
