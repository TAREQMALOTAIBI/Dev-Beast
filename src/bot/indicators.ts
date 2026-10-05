/**
 * @file indicators.ts
 * @description محرك حساب المؤشرات الفنية واستخراج إشارات الارتداد المتوسط (Mean Reversion)
 * باستخدام مكتبة technicalindicators مع تعليقات وشروح وافية باللغة العربية.
 */

import { BollingerBands, RSI } from 'technicalindicators';
import type { BotConfig, Candle, BollingerBandsValues, SignalEvaluation } from './types';

/**
 * وظيفة لفحص وتقييم إشارة الارتداد المتوسط اللامتماثل (Asymmetric Mean Reversion)
 * 
 * القواعد الرياضية:
 * 1. ذروة الشراء (Overbought): سعر البيتكوين الحالي أعلى من النطاق العلوي للبولنجر باند (Upper BB) ومؤشر القوة النسبية RSI يتجاوز 85.
 * 2. ذروة البيع (Oversold): سعر البيتكوين الحالي أدنى من النطاق السفلي للبولنجر باند (Lower BB) ومؤشر القوة النسبية RSI يقل عن 15.
 * 
 * @param candles مصفوفة شموع البيتكوين (إطار 1 دقيقة) مرتبة تصاعدياً حسب الوقت
 * @param config إعدادات البوت والبارامترات الفنية
 * @returns SignalEvaluation نتيجة تقييم الإشارة الفنية ومؤشراتها
 */
export function checkMeanReversionSignal(
  candles: Candle[],
  config: BotConfig
): SignalEvaluation {
  const minCandlesRequired = Math.max(
    config.bollingerBands.period + 1,
    config.rsi.period + 1,
    25
  );

  // التحقق من كفاية بيانات الشموع لحساب المؤشرات بدقة رياضية
  if (!candles || candles.length < minCandlesRequired) {
    const fallbackPrice = candles && candles.length > 0 ? candles[candles.length - 1].close : 0;
    return {
      signal: 'NEUTRAL',
      currentPrice: fallbackPrice,
      rsi: 50,
      bollingerBands: { upper: fallbackPrice, middle: fallbackPrice, lower: fallbackPrice },
      isOverbought: false,
      isOversold: false,
      explanationArabic: `بيانات الشموع غير كافية (المتوفر: ${candles ? candles.length : 0}، المطلوب: ${minCandlesRequired} شمعة على الأقل).`,
      explanationEnglish: `Insufficient candle data for indicator calculation (Available: ${candles?.length || 0}, Required: ${minCandlesRequired}).`,
      evaluatedAt: Date.now(),
    };
  }

  // الخطوة 1: استخراج مصفوفة أسعار الإغلاق (Closing Prices) من الشموع
  const closePrices: number[] = candles.map((c) => c.close);
  const currentCandle = candles[candles.length - 1];
  const currentPrice = currentCandle.close;

  // الخطوة 2: حساب مؤشر البولنجر باند (Bollinger Bands: Period = 20, StdDev = 2)
  // يتم استخدام النطاقات لتحديد انحراف السعر الإحصائي عن المتوسط المتحرك بمقدار 2 انحراف معياري (95.4% من التوزيع الطبيعي)
  const bbResults = BollingerBands.calculate({
    period: config.bollingerBands.period,
    values: closePrices,
    stdDev: config.bollingerBands.stdDev,
  });

  // الخطوة 3: حساب مؤشر القوة النسبية (RSI: Period = 14)
  // لقياس زخم حركة السعر وقوة التشبع الشرائي أو البيعي
  const rsiResults = RSI.calculate({
    period: config.rsi.period,
    values: closePrices,
  });

  // التأكد من استرجاع قيم صحيحة للمؤشرات لآخر شمعة مكتملة
  if (!bbResults.length || !rsiResults.length) {
    return {
      signal: 'NEUTRAL',
      currentPrice,
      rsi: 50,
      bollingerBands: { upper: currentPrice, middle: currentPrice, lower: currentPrice },
      isOverbought: false,
      isOversold: false,
      explanationArabic: 'فشل استخراج نتائج المؤشرات من الحسابات الرياضية.',
      explanationEnglish: 'Failed to extract indicator calculation outputs.',
      evaluatedAt: Date.now(),
    };
  }

  const latestBB = bbResults[bbResults.length - 1];
  const latestRsi = rsiResults[rsiResults.length - 1];

  const bollingerBands: BollingerBandsValues = {
    upper: Number(latestBB.upper.toFixed(2)),
    middle: Number(latestBB.middle.toFixed(2)),
    lower: Number(latestBB.lower.toFixed(2)),
    pb: latestBB.pb,
  };

  const rsiValue = Number(latestRsi.toFixed(2));

  // الخطوة 4: فحص شروط استراتيجية الارتداد المتوسط اللامتماثل (Asymmetric Mean Reversion)
  
  // شرط ذروة الشراء (Overbought Signal):
  // 1) السعر الحالي > النطاق العلوي للبولنجر باند (Upper BB)
  // 2) مؤشر RSI > 85 (تشبع شرائي حاد واستثنائي)
  const isOverbought =
    currentPrice > bollingerBands.upper &&
    rsiValue > config.rsi.overboughtThreshold;

  // شرط ذروة البيع (Oversold Signal):
  // 1) السعر الحالي < النطاق السفلي للبولنجر باند (Lower BB)
  // 2) مؤشر RSI < 15 (تشبع بيعي حاد وهبوط استثنائي)
  const isOversold =
    currentPrice < bollingerBands.lower &&
    rsiValue < config.rsi.oversoldThreshold;

  // الخطوة 5: صياغة التقرير وتحديد نوع الإشارة
  if (isOverbought) {
    return {
      signal: 'OVERBOUGHT',
      currentPrice,
      rsi: rsiValue,
      bollingerBands,
      isOverbought: true,
      isOversold: false,
      explanationArabic: `إشارة ذروة شراء حادة (OVERBOUGHT)! السعر ($${currentPrice.toLocaleString()}) تجاوز الحد العلوي للبولنجر ($${bollingerBands.upper.toLocaleString()}) مع مؤشر RSI بلغ ${rsiValue} (> 85). يتم استهداف عقد يراهن ضد الصعود (NO).`,
      explanationEnglish: `Extreme Overbought Trigger! BTC Price ($${currentPrice.toLocaleString()}) is above Upper BB ($${bollingerBands.upper.toLocaleString()}) and RSI is ${rsiValue} (> 85). Target: Bet against pump (NO contract).`,
      evaluatedAt: Date.now(),
    };
  }

  if (isOversold) {
    return {
      signal: 'OVERSOLD',
      currentPrice,
      rsi: rsiValue,
      bollingerBands,
      isOverbought: false,
      isOversold: true,
      explanationArabic: `إشارة ذروة بيع حادة (OVERSOLD)! السعر ($${currentPrice.toLocaleString()}) انكسر تحت الحد السفلي للبولنجر ($${bollingerBands.lower.toLocaleString()}) مع مؤشر RSI بلغ ${rsiValue} (< 15). يتم استهداف عقد يراهن على الارتداد (YES).`,
      explanationEnglish: `Extreme Oversold Trigger! BTC Price ($${currentPrice.toLocaleString()}) is below Lower BB ($${bollingerBands.lower.toLocaleString()}) and RSI is ${rsiValue} (< 15). Target: Bet on bounce (YES contract).`,
      evaluatedAt: Date.now(),
    };
  }

  return {
    signal: 'NEUTRAL',
    currentPrice,
    rsi: rsiValue,
    bollingerBands,
    isOverbought: false,
    isOversold: false,
    explanationArabic: `السوق في حالة حياد (NEUTRAL). السعر ($${currentPrice.toLocaleString()}) ضمن النطاق الطبيعي [${bollingerBands.lower.toLocaleString()} - ${bollingerBands.upper.toLocaleString()}] وقيمة RSI = ${rsiValue}. الشروط غير متحققة.`,
    explanationEnglish: `Neutral market conditions. BTC ($${currentPrice.toLocaleString()}) within BB band [${bollingerBands.lower.toLocaleString()} - ${bollingerBands.upper.toLocaleString()}] and RSI is ${rsiValue}.`,
    evaluatedAt: Date.now(),
  };
}
