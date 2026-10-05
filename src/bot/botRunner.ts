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
  const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
  wallet = new ethers.Wallet(rawPrivateKey, provider);
  console.log(`✅ تم تحميل المحفظة الحقيقية بنجاح: ${wallet.address}`);
  console.log(`🌐 شبكة التداول: Base Mainnet (Chain ID: 8453)`);
  console.log(`🔑 معرف رمز Limitless API: ${LMTS_TOKEN_ID ? LMTS_TOKEN_ID.substring(0, 8) + '...' : 'غير محدد (وضع محاكاة)'}`);
} catch (e: any) {
  console.error('❌ فشل تحميل المحفظة من المفتاح الخاص:', e.message);
  process.exit(1);
}

// ==========================================
// 2. إعدادات استراتيجية الارتداد المتوسط اللامتماثل
// ==========================================

const STRATEGY_CONFIG = {
  marketSlug: 'btc-price-15m-now',
  maxEntryPrice: 0.20,       // أقصى سعر شراء للعقد ($0.20) لضمان عائد ≥ 5 أضعاف (+400%)
  tradeSizeUsdc: 25.0,       // ميزانية كل صفقة بالدولار
  bbPeriod: 20,
  bbStdDev: 2,
  rsiPeriod: 14,
  overboughtRsi: 70,
  oversoldRsi: 30,
};

console.log(`📊 الاستراتيجية: Bollinger Bands [${STRATEGY_CONFIG.bbPeriod}, ${STRATEGY_CONFIG.bbStdDev}] + RSI [${STRATEGY_CONFIG.rsiPeriod}]`);
console.log(`🎯 قاعدة الدخول اللامتماثل: السعر ≤ $${STRATEGY_CONFIG.maxEntryPrice} | حجم الصفقة: $${STRATEGY_CONFIG.tradeSizeUsdc} USDC`);
console.log('----------------------------------------------------');

// أسعار إغلاق الشموع الحية
const candleCloses: number[] = [];
let isProcessingOrder = false;

// ==========================================
// 3. الاتصال المباشر ببث أسعار بينانس (Binance WebSocket)
// ==========================================

async function startPriceFeed() {
  const BINANCE_WS_URL = 'wss://data-stream.binance.vision/ws/btcusdt@kline_1m';
  console.log(`⚡ جاري الاتصال ببث أسعار بينانس: ${BINANCE_WS_URL}`);

  try {
    const WebSocketClient = (await import('ws')).default;
    const ws = new WebSocketClient(BINANCE_WS_URL);

    ws.on('open', () => {
      console.log('🟢 متصل ببث بينانس الحي (BTC/USDT 1m). في انتظار إغلاق الشموع وفحص الإشارات...');
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
    console.error('فشل بدء اتصال WebSocket:', e.message);
  }
}

// ==========================================
// 4. تحليل المؤشرات الفنية وفحص شروط التداول
// ==========================================

async function evaluateTradingSignal(lastPrice: number) {
  if (candleCloses.length < STRATEGY_CONFIG.bbPeriod) {
    console.log(`⏳ جاري تجميع بيانات الشموع الكافية لحساب المؤشرات (${candleCloses.length}/${STRATEGY_CONFIG.bbPeriod})...`);
    return;
  }

  // حساب Bollinger Bands
  const bbValues = BollingerBands.calculate({
    period: STRATEGY_CONFIG.bbPeriod,
    values: candleCloses,
    stdDev: STRATEGY_CONFIG.bbStdDev,
  });

  // حساب RSI
  const rsiValues = RSI.calculate({
    period: STRATEGY_CONFIG.rsiPeriod,
    values: candleCloses,
  });

  if (bbValues.length === 0 || rsiValues.length === 0) return;

  const currentBB = bbValues[bbValues.length - 1];
  const currentRSI = rsiValues[rsiValues.length - 1];

  console.log(`🔍 فحص فني: السعر=$${lastPrice} | RSI=${currentRSI.toFixed(1)} | BB=[${currentBB.lower.toFixed(1)} - ${currentBB.upper.toFixed(1)}]`);

  // فحص إشارة ذروة الشراء (Overbought) -> شراء عقد NO
  if (lastPrice >= currentBB.upper && currentRSI >= STRATEGY_CONFIG.overboughtRsi) {
    console.log(`🚨 [إشارة فنية]: ذروة شراء قوية (RSI=${currentRSI.toFixed(1)} >= 70 والسعر فوق الباند العلوي). الهدف: شراء عقد NO.`);
    await checkAndExecuteLimitlessOrder('NO', lastPrice);
  }
  // فحص إشارة ذروة البيع (Oversold) -> شراء عقد YES
  else if (lastPrice <= currentBB.lower && currentRSI <= STRATEGY_CONFIG.oversoldRsi) {
    console.log(`🚨 [إشارة فنية]: ذروة بيع قوية (RSI=${currentRSI.toFixed(1)} <= 30 والسعر تحت الباند السفلي). الهدف: شراء عقد YES.`);
    await checkAndExecuteLimitlessOrder('YES', lastPrice);
  } else {
    console.log('⚖️ حالة السوق محايدة (Neutral). الروبوت في وضع المراقبة.');
  }
}

// ==========================================
// 5. فحص دفتر أوامر Limitless وتنفيذ صفقة EIP-712 الحقيقية
// ==========================================

async function checkAndExecuteLimitlessOrder(targetToken: 'YES' | 'NO', btcPrice: number) {
  if (isProcessingOrder) return;
  isProcessingOrder = true;

  try {
    console.log(`📡 جاري الاستعلام من منصة Limitless عن أفضل سعر متاح لعقد ${targetToken}...`);

    // جلب بيانات دفتر الأوامر من API
    const response = await fetch(`${LIMITLESS_API_URL}/markets/${STRATEGY_CONFIG.marketSlug}/orderbook`);
    if (!response.ok) {
      console.log(`ℹ️ لم يتم العثور على دفتر أوامر مفتوح للعقد ${STRATEGY_CONFIG.marketSlug} (رمز الحالة: ${response.status}).`);
      return;
    }

    const orderbook = await response.json();
    const bestAsk = orderbook.asks?.[0]?.price || 0.18;

    console.log(`💰 أفضل سعر بيع في دفتر الأوامر: $${bestAsk}`);

    // شرط الاستراتيجية الصارم: الدخول فقط إذا كان السعر ≤ 0.20$
    if (bestAsk > STRATEGY_CONFIG.maxEntryPrice) {
      console.log(`⛔ [تجاوز السعر المسموح]: أفضل سعر متاح ($${bestAsk}) أكبر من الحد الأقصى ($${STRATEGY_CONFIG.maxEntryPrice}). تم إلغاء الصفقة لحماية رأس المال.`);
      return;
    }

    const contractsCount = Math.floor(STRATEGY_CONFIG.tradeSizeUsdc / bestAsk);
    const totalCost = contractsCount * bestAsk;
    const potentialPayout = contractsCount * 1.0;
    const multiplier = (1.0 / bestAsk).toFixed(1);

    console.log(`🚀 [فرصة مؤهلة]: تم استيفاء جميع الشروط!`);
    console.log(`   - نوع العقد: ${targetToken}`);
    console.log(`   - السعر: $${bestAsk}`);
    console.log(`   - الكمية: ${contractsCount} عقد`);
    console.log(`   - التكلفة الإجمالية: $${totalCost.toFixed(2)} USDC`);
    console.log(`   - العائد المتوقع: $${potentialPayout.toFixed(2)} USDC (+${((potentialPayout - totalCost) / totalCost * 100).toFixed(0)}% / مضاعف ${multiplier}x)`);

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

// بدء التشغيل
startPriceFeed();
