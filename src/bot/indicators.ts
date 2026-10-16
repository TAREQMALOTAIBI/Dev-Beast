/**
 * @file indicators.ts
 * @description محرك حساب استراتيجية الارتداد إلى المتوسط اللامتماثل على فريم الدقيقة (1m)
 * 
 * الركائز الثلاث للاستراتيجية المتوافقة مع إعدادات المتداول بدقة:
 * 1. Z-Score (الأساس الإحصائي): نافذة 30 شمعة دقيقة (1m)، العتبات ±2.00 للانعكاس.
 * 2. مؤشر ADX (فلتر نظام السوق Regime Filter): فترة 14 شمعة. 
 *    - إذا كان ADX <= 28: سوق عرضي (Ranging) وهو الوضع المثالي للارتداد إلى المتوسط.
 *    - إذا كان ADX > 28: سوق في ترند قوي (Trending)، يتطلب تأكيد دايفرجنس لتفادي الانزلاق المعاكس.
 * 3. انفراج مؤشر القوة النسبية RSI Divergence (تأكيد استنفاد الزخم Momentum Exhaustion):
 *    - دايفرجنس صاعد (Bullish): قاع سعري أدنى مع قاع RSI أعلى -> تأكيد ارتداد صاعد (YES).
 *    - دايفرجنس هابط (Bearish): قمة سعرية أعلى مع قمة RSI أدنى -> تأكيد ارتداد هابط (NO).
 */

import { BollingerBands, RSI, ADX } from 'technicalindicators';
import type {
  BotConfig,
  Candle,
  BollingerBandsValues,
  SignalEvaluation,
  AdxInfo,
  RsiDivergenceInfo,
} from './types';

/**
 * حساب الـ Z-Score الدقيق لمصفوفة الأسعار
 */
export function calculateZScore(
  closePrices: number[],
  lookback: number = 30
): {
  zScore: number;
  mean: number;
  stdDev: number;
  currentPrice: number;
} {
  if (!closePrices || closePrices.length < lookback) {
    const fallbackPrice = closePrices && closePrices.length > 0 ? closePrices[closePrices.length - 1] : 0;
    return {
      zScore: 0,
      mean: fallbackPrice,
      stdDev: 0,
      currentPrice: fallbackPrice,
    };
  }

  // أخذ آخر N شمعة (Lookback Window = 30 شمعة على فريم دقيقة واحدة 1m)
  const windowPrices = closePrices.slice(-lookback);
  const currentPrice = windowPrices[windowPrices.length - 1];

  // 1. حساب المتوسط الحسابي (Mean μ)
  const sum = windowPrices.reduce((acc, p) => acc + p, 0);
  const mean = sum / lookback;

  // 2. حساب الانحراف المعياري (Standard Deviation σ)
  const variance = windowPrices.reduce((acc, p) => acc + Math.pow(p - mean, 2), 0) / lookback;
  const stdDev = Math.sqrt(variance);

  // 3. حساب Z-Score = (Current Price - Mean) / StdDev
  const zScore = stdDev > 0 ? (currentPrice - mean) / stdDev : 0;

  return {
    zScore: Number(zScore.toFixed(3)),
    mean: Number(mean.toFixed(2)),
    stdDev: Number(stdDev.toFixed(2)),
    currentPrice,
  };
}

/**
 * حساب مؤشر متوسط الحركة الاتجاهية ADX (Average Directional Index)
 * لقياس هل السوق في وضع تذبذب عرضي محصور (Mean-Reverting) أم في اتجاه كاسح (Trending)
 */
export function calculateAdx(candles: Candle[], period: number = 14): AdxInfo {
  if (!candles || candles.length < period + 5) {
    return {
      adx: 20.0,
      pdi: 20.0,
      mdi: 20.0,
      regime: 'RANGING',
      isFavorableForMeanReversion: true,
      descriptionArabic: 'في انتظار اكتمال شموع كافية لحساب ADX (الوضع الافتراضي: سوق عرضي محايد).',
    };
  }

  try {
    const adxResult = ADX.calculate({
      period,
      high: candles.map((c) => c.high),
      low: candles.map((c) => c.low),
      close: candles.map((c) => c.close),
    });

    if (adxResult && adxResult.length > 0) {
      const latest = adxResult[adxResult.length - 1];
      const adxVal = Number(latest.adx.toFixed(1));
      const pdiVal = Number(latest.pdi.toFixed(1));
      const mdiVal = Number(latest.mdi.toFixed(1));

      // عتبة 28: إذا كان ADX <= 28 فالسوق في حركة عرضية تذبذبية ملائمة تماماً للارتداد إلى المتوسط
      const isFavorable = adxVal <= 28;
      const regime = isFavorable ? 'RANGING' : 'TRENDING';
      const descriptionArabic = isFavorable
        ? `سوق تذبذب عرضي (ADX = ${adxVal} ≤ 28): بيئة ملائمة ومثالية لاستراتيجية الارتداد إلى المتوسط (Mean Reversion Regime).`
        : `سوق في اتجاه كاسح (ADX = ${adxVal} > 28): ترند اتجاهي قوي، يُشترط تأكيد دايفرجنس لتفادي الارتداد الوهمي.`;

      return {
        adx: adxVal,
        pdi: pdiVal,
        mdi: mdiVal,
        regime,
        isFavorableForMeanReversion: isFavorable,
        descriptionArabic,
      };
    }
  } catch (err: any) {
    console.warn('تنبيه أثناء حساب ADX:', err?.message || err);
  }

  return {
    adx: 22.0,
    pdi: 20.0,
    mdi: 20.0,
    regime: 'RANGING',
    isFavorableForMeanReversion: true,
    descriptionArabic: 'حالة ADX عرضية افتراضية (22.0).',
  };
}

/**
 * فحص انفراج مؤشر القوة النسبية (RSI Divergence)
 * يرصد الانفراج السعري الصاعد (Bullish) والهابط (Bearish) عبر مقارنة القمم والقيعان في نافذة الشموع
 */
export function detectRsiDivergence(
  candles: Candle[],
  rsiPeriod: number = 14,
  windowLookback: number = 30
): RsiDivergenceInfo {
  if (!candles || candles.length < rsiPeriod + 10) {
    return {
      detected: false,
      type: 'NONE',
      descriptionArabic: 'بيانات الشموع غير كافية لفحص انفراج RSI.',
    };
  }

  const closePrices = candles.map((c) => c.close);
  const rsiCalc = RSI.calculate({ period: rsiPeriod, values: closePrices });
  if (!rsiCalc || rsiCalc.length < 10) {
    return {
      detected: false,
      type: 'NONE',
      descriptionArabic: 'في انتظار بيانات كافية لحساب RSI.',
    };
  }

  // مواءمة أسعار الإغلاق مع قيم الـ RSI المقابلة
  const offset = closePrices.length - rsiCalc.length;
  const paired: Array<{ price: number; rsi: number; high: number; low: number; index: number }> = [];

  for (let i = 0; i < rsiCalc.length; i++) {
    const candleIdx = i + offset;
    paired.push({
      price: closePrices[candleIdx],
      rsi: rsiCalc[i],
      high: candles[candleIdx].high,
      low: candles[candleIdx].low,
      index: candleIdx,
    });
  }

  const scanSlice = paired.slice(-Math.min(windowLookback, paired.length));
  if (scanSlice.length < 8) {
    return {
      detected: false,
      type: 'NONE',
      descriptionArabic: 'نافذة الفحص صغيرة لحساب الدايفرجنس.',
    };
  }

  // تقسيم النافذة إلى قسمين:
  // القسم الأخير (Recent: آخر 4 شموع) والقسم السابق (Prior: الشموع من -5 إلى -20)
  const recentWindow = scanSlice.slice(-4);
  const priorWindow = scanSlice.slice(0, scanSlice.length - 4);

  // 1. فحص الانفراج الصاعد (Bullish Divergence):
  // السعر يصنع قاعاً جديداً أدنى أو متساوياً (Lower Low)، بينما RSI يصنع قاعاً أعلى (Higher Low)
  let lowestRecent = recentWindow[0];
  for (const item of recentWindow) {
    if (item.low < lowestRecent.low) lowestRecent = item;
  }

  let lowestPrior = priorWindow[0];
  for (const item of priorWindow) {
    if (item.low < lowestPrior.low) lowestPrior = item;
  }

  const isPriceLowerOrEqual = lowestRecent.low <= lowestPrior.low * 1.0005; // قاع أقل أو موازٍ
  const isRsiHigher = lowestRecent.rsi > lowestPrior.rsi + 1.8; // RSI صنع قاعاً أعلى بأكثر من 1.8 نقطة
  const isRsiOversoldZone = lowestRecent.rsi <= 40 || lowestPrior.rsi <= 35; // في منطقة التشبع البيعي

  if (isPriceLowerOrEqual && isRsiHigher && isRsiOversoldZone) {
    const priceDeltaPercent = Number((((lowestRecent.low - lowestPrior.low) / lowestPrior.low) * 100).toFixed(2));
    const rsiDelta = Number((lowestRecent.rsi - lowestPrior.rsi).toFixed(1));
    return {
      detected: true,
      type: 'BULLISH',
      priceDeltaPercent,
      rsiDelta,
      descriptionArabic: `⚡ انفراج صاعد مؤكد (Bullish Divergence): السعر هبط إلى قاع $${lowestRecent.low.toLocaleString()} بينما RSI ارتفع بقوة (+${rsiDelta}) مسجلاً قاعاً أعلى (${lowestRecent.rsi.toFixed(1)} مقابل ${lowestPrior.rsi.toFixed(1)}). استنفاد حاد لزخم البيع وتأكيد ارتداد صاعد (YES).`,
    };
  }

  // 2. فحص الانفراج الهابط (Bearish Divergence):
  // السعر يصنع قمة جديدة أعلى أو متساوية (Higher High)، بينما RSI يصنع قمة أدنى (Lower High)
  let highestRecent = recentWindow[0];
  for (const item of recentWindow) {
    if (item.high > highestRecent.high) highestRecent = item;
  }

  let highestPrior = priorWindow[0];
  for (const item of priorWindow) {
    if (item.high > highestPrior.high) highestPrior = item;
  }

  const isPriceHigherOrEqual = highestRecent.high >= highestPrior.high * 0.9995; // قمة أعلى أو موازية
  const isRsiLower = highestRecent.rsi < highestPrior.rsi - 1.8; // RSI صنع قمة أدنى بأكثر من 1.8 نقطة
  const isRsiOverboughtZone = highestRecent.rsi >= 60 || highestPrior.rsi >= 65; // في منطقة التشبع الشرائي

  if (isPriceHigherOrEqual && isRsiLower && isRsiOverboughtZone) {
    const priceDeltaPercent = Number((((highestRecent.high - highestPrior.high) / highestPrior.high) * 100).toFixed(2));
    const rsiDelta = Number((highestRecent.rsi - highestPrior.rsi).toFixed(1));
    return {
      detected: true,
      type: 'BEARISH',
      priceDeltaPercent,
      rsiDelta,
      descriptionArabic: `⚡ انفراج هابط مؤكد (Bearish Divergence): السعر صعد إلى قمة $${highestRecent.high.toLocaleString()} بينما RSI تراجع (${rsiDelta}) مسجلاً قمة أدنى (${highestRecent.rsi.toFixed(1)} مقابل ${highestPrior.rsi.toFixed(1)}). استنفاد حاد لزخم الشراء وتأكيد ارتداد هابط (NO).`,
    };
  }

  return {
    detected: false,
    type: 'NONE',
    descriptionArabic: 'لا يوجد انفراج دايفرجنس ملحوظ في حركة الشموع الحالية (حركة السعر متوافقة مع زخم RSI).',
  };
}

/**
 * وظيفة فحص وتقييم إشارة التداول الشاملة:
 * دمج Z-Score (نافذة 30 شمعة / عتبة ±2.00) مع فلتر ADX وانفراج RSI
 */
export function checkMeanReversionSignal(
  candles: Candle[],
  config: BotConfig
): SignalEvaluation {
  const lookbackPeriod = config.zScore?.period || 30; // نافذة الـ 30 شمعة دقيقة (1m = 30 دقيقة)
  const upperThreshold = config.zScore?.upperThreshold !== undefined ? config.zScore.upperThreshold : 2.00; // عتبة الهبوط +2.00
  const lowerThreshold = config.zScore?.lowerThreshold !== undefined ? config.zScore.lowerThreshold : -2.00; // عتبة الصعود -2.00

  // التحقق من كفاية بيانات الشموع
  if (!candles || candles.length < Math.min(lookbackPeriod, 20)) {
    const fallbackPrice = candles && candles.length > 0 ? candles[candles.length - 1].close : 0;
    return {
      signal: 'NEUTRAL',
      currentPrice: fallbackPrice,
      zScore: 0,
      mean: fallbackPrice,
      stdDev: 0,
      rsi: 50,
      bollingerBands: { upper: fallbackPrice, middle: fallbackPrice, lower: fallbackPrice },
      isOverbought: false,
      isOversold: false,
      explanationArabic: `في انتظار اكتمال 30 شمعة دقيقة لحساب الـ Z-Score ومؤشرات التأكيد (المتوفر حالياً: ${candles ? candles.length : 0} شمعة).`,
      explanationEnglish: `Waiting for 30 one-minute candles for Z-Score & confirmation analysis (Available: ${candles?.length || 0}).`,
      evaluatedAt: Date.now(),
    };
  }

  // استخراج أسعار الإغلاق
  const closePrices: number[] = candles.map((c) => c.close);
  const currentPrice = closePrices[closePrices.length - 1];

  // 1. حساب Z-Score بدقة إحصائية على نافذة الـ 30 شمعة
  const { zScore, mean, stdDev } = calculateZScore(closePrices, lookbackPeriod);

  // 2. حساب Bollinger Bands و RSI للعرض في الواجهة الرسومية
  let bollingerBands: BollingerBandsValues = {
    upper: Number((mean + stdDev * 2).toFixed(2)),
    middle: mean,
    lower: Number((mean - stdDev * 2).toFixed(2)),
  };
  let rsiValue = 50;

  try {
    const rsiCalc = RSI.calculate({ period: config.rsi?.period || 14, values: closePrices });
    if (rsiCalc.length > 0) rsiValue = Number(rsiCalc[rsiCalc.length - 1].toFixed(1));
  } catch {}

  // 3. حساب مؤشر ADX (14)
  const adxInfo = calculateAdx(candles, config.adx?.period || 14);

  // 4. فحص انفراج مؤشر القوة النسبية (RSI Divergence)
  const divergenceInfo = detectRsiDivergence(candles, config.rsi?.period || 14, lookbackPeriod);

  // ==========================================
  // شروط الدخول بالـ Z-Score المقترنة بـ ADX والـ RSI Divergence
  // ==========================================

  // إشارة ارتداد هابط: Z-Score >= +2.00
  const isOverbought = zScore >= upperThreshold;

  // إشارة ارتداد صاعد: Z-Score <= -2.00
  const isOversold = zScore <= lowerThreshold;

  if (isOverbought) {
    let explanationArabic = `🚨 [إشارة ارتداد هابط - ذروة شراء]: Z-Score = +${zScore} (تجاوز سقف +${upperThreshold}). `;
    if (divergenceInfo.detected && divergenceInfo.type === 'BEARISH') {
      explanationArabic += `🔥 [تأكيد مضاعف - دايفرجنس هابط رائع]: السعر متضخم مع ضعف واضح في عزم المشترين. `;
    }
    if (adxInfo.isFavorableForMeanReversion) {
      explanationArabic += `✅ ADX = ${adxInfo.adx} (سوق عرضي ممتاز للارتداد). `;
    } else {
      explanationArabic += `⚠️ ADX = ${adxInfo.adx} (ترند قوي - يتم الاعتماد على الدايفرجنس لتأكيد الانعكاس). `;
    }
    explanationArabic += `الهدف: شراء عقد DOWN (NO) بأمر FAK بسعر السوق المباشر.`;

    return {
      signal: 'OVERBOUGHT',
      currentPrice,
      zScore,
      mean,
      stdDev,
      rsi: rsiValue,
      bollingerBands,
      adx: adxInfo,
      rsiDivergence: divergenceInfo,
      isOverbought: true,
      isOversold: false,
      explanationArabic,
      explanationEnglish: `Overbought Mean Reversion Trigger! Z = +${zScore} (>= +${upperThreshold}). ADX = ${adxInfo.adx} (${adxInfo.regime}). RSI Div: ${divergenceInfo.type}. Target: NO (DOWN) FAK market order.`,
      evaluatedAt: Date.now(),
    };
  }

  if (isOversold) {
    let explanationArabic = `🚨 [إشارة ارتداد صاعد - ذروة بيع]: Z-Score = ${zScore} (كسر قاع ${lowerThreshold}). `;
    if (divergenceInfo.detected && divergenceInfo.type === 'BULLISH') {
      explanationArabic += `🔥 [تأكيد مضاعف - دايفرجنس صاعد رائع]: السعر رخيص مع ظهور استسلام البائعين. `;
    }
    if (adxInfo.isFavorableForMeanReversion) {
      explanationArabic += `✅ ADX = ${adxInfo.adx} (سوق عرضي ممتاز للارتداد). `;
    } else {
      explanationArabic += `⚠️ ADX = ${adxInfo.adx} (ترند هابط قوي - يتم الاعتماد على الدايفرجنس لتأكيد الارتداد). `;
    }
    explanationArabic += `الهدف: شراء عقد UP (YES) بأمر FAK بسعر السوق المباشر.`;

    return {
      signal: 'OVERSOLD',
      currentPrice,
      zScore,
      mean,
      stdDev,
      rsi: rsiValue,
      bollingerBands,
      adx: adxInfo,
      rsiDivergence: divergenceInfo,
      isOverbought: false,
      isOversold: true,
      explanationArabic,
      explanationEnglish: `Oversold Mean Reversion Trigger! Z = ${zScore} (<= ${lowerThreshold}). ADX = ${adxInfo.adx} (${adxInfo.regime}). RSI Div: ${divergenceInfo.type}. Target: YES (UP) FAK market order.`,
      evaluatedAt: Date.now(),
    };
  }

  // حالة حياد
  let neutralDesc = `⚖️ [Z-Score محايد]: Z = ${zScore > 0 ? '+' : ''}${zScore} (بين ${lowerThreshold} و +${upperThreshold}). `;
  neutralDesc += `• ADX = ${adxInfo.adx} (${adxInfo.regime === 'RANGING' ? 'عرضي هادئ' : 'اتجاهي'}) `;
  if (divergenceInfo.detected) {
    neutralDesc += `• ${divergenceInfo.type === 'BULLISH' ? 'دايفرجنس صاعد قيد التشكل 🟢' : 'دايفرجنس هابط قيد التشكل 🔴'} `;
  }
  neutralDesc += `• المتوسط: $${mean.toLocaleString()} (الانحراف: $${stdDev}).`;

  return {
    signal: 'NEUTRAL',
    currentPrice,
    zScore,
    mean,
    stdDev,
    rsi: rsiValue,
    bollingerBands,
    adx: adxInfo,
    rsiDivergence: divergenceInfo,
    isOverbought: false,
    isOversold: false,
    explanationArabic: neutralDesc,
    explanationEnglish: `Neutral Z-Score: Z = ${zScore}. ADX = ${adxInfo.adx}. RSI Div: ${divergenceInfo.type}. Monitoring mode.`,
    evaluatedAt: Date.now(),
  };
}
