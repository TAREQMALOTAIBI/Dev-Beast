/**
 * @file indicators.ts
 * @description محرك حساب استراتيجية الـ Z-Score فقط على فريم الدقيقة (1m)
 * 
 * القواعد الرياضية:
 * 1. نافذة الحساب (Lookback Window): آخر 20 شمعة على فريم الدقيقة (1m).
 * 2. المتوسط الحسابي (Mean): متوسط أسعار الإغلاق لآخر 20 شمعة.
 * 3. الانحراف المعياري (StdDev): الانحراف المعياري لآخر 20 شمعة.
 * 4. قيمة Z-Score: (السعر الحالي - المتوسط) / الانحراف المعياري.
 * 
 * شروط الدخول:
 * - إشارة هبوط: Z-Score >= +1.0 -> استهداف عقد يراهن على الهبوط (عقد NO للقمة) بسعر ≤ 0.80$.
 * - إشارة صعود: Z-Score <= -1.0 -> استهداف عقد يراهن على الصعود (عقد YES للقاع) بسعر ≤ 0.80$.
 */

import { BollingerBands, RSI } from 'technicalindicators';
import type { BotConfig, Candle, BollingerBandsValues, SignalEvaluation } from './types';

/**
 * حساب الـ Z-Score الدقيق لمصفوفة الأسعار
 */
export function calculateZScore(
  closePrices: number[],
  lookback: number = 20
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

  // أخذ آخر N شمعة (Lookback Window = 20 شمعة)
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
 * وظيفة فحص وتقييم إشارة التداول بالـ Z-Score فقط
 * 
 * @param candles مصفوفة شموع البيتكوين (إطار 1 دقيقة)
 * @param config إعدادات البوت والبارامترات
 * @returns SignalEvaluation نتيجة تقييم إشارة الـ Z-Score
 */
export function checkMeanReversionSignal(
  candles: Candle[],
  config: BotConfig
): SignalEvaluation {
  const lookbackPeriod = config.zScore?.period || 20; // 20 شمعة على فريم الدقيقة
  const upperThreshold = config.zScore?.upperThreshold !== undefined ? config.zScore.upperThreshold : 2.0; // التركيز على +2.0
  const lowerThreshold = config.zScore?.lowerThreshold !== undefined ? config.zScore.lowerThreshold : -2.0; // التركيز على -2.0

  // التحقق من كفاية بيانات الشموع (20 شمعة على الأقل)
  if (!candles || candles.length < lookbackPeriod) {
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
      explanationArabic: `في انتظار تجميع 20 شمعة دقيقة لحساب الـ Z-Score (المتوفر حالياً: ${candles ? candles.length : 0} شمعة).`,
      explanationEnglish: `Waiting for 20 one-minute candles for Z-Score calculation (Available: ${candles?.length || 0}).`,
      evaluatedAt: Date.now(),
    };
  }

  // استخراج أسعار الإغلاق
  const closePrices: number[] = candles.map((c) => c.close);
  const currentPrice = closePrices[closePrices.length - 1];

  // حساب Z-Score بدقة إحصائية
  const { zScore, mean, stdDev } = calculateZScore(closePrices, lookbackPeriod);

  // حساب مساعد للـ Bollinger Bands و RSI للعرض في الواجهة الرسومية
  let bollingerBands: BollingerBandsValues = {
    upper: Number((mean + stdDev * 2).toFixed(2)),
    middle: mean,
    lower: Number((mean - stdDev * 2).toFixed(2)),
  };
  let rsiValue = 50;

  try {
    const rsiCalc = RSI.calculate({ period: 14, values: closePrices });
    if (rsiCalc.length > 0) rsiValue = Number(rsiCalc[rsiCalc.length - 1].toFixed(1));
  } catch {}

  // ==========================================
  // شروط الدخول بالـ Z-Score فقط
  // ==========================================

  // 1. إشارة هبوط: إذا أصبح Z-Score >= +0.50
  // السعر تضخم إحصائياً بأكثر من 0.50 انحراف معياري فوق المتوسط -> استهداف عقد NO للقمة (مراهنة على الهبوط)
  const isOverbought = zScore >= upperThreshold;

  // 2. إشارة صعود: إذا أصبح Z-Score <= -0.50
  // السعر انهار إحصائياً بأكثر من 0.50 انحراف معياري تحت المتوسط -> استهداف عقد YES للقاع (مراهنة على الصعود والارتداد)
  const isOversold = zScore <= lowerThreshold;

  if (isOverbought) {
    return {
      signal: 'OVERBOUGHT', // إشارة هبوط للمؤشر
      currentPrice,
      zScore,
      mean,
      stdDev,
      rsi: rsiValue,
      bollingerBands,
      isOverbought: true,
      isOversold: false,
      explanationArabic: `🚨 [إشارة هبوط Z-Score]: القيمة الحالية = +${zScore} (تجاوزت سقف +${upperThreshold}). السعر ($${currentPrice.toLocaleString()}) أعلى من متوسط 20 دقيقة ($${mean.toLocaleString()}). الهدف: شراء عقد NO للقمة عبر أمر FAK فوراً بسعر السوق.`,
      explanationEnglish: `Bearish Z-Score Trigger! Z = +${zScore} (>= +${upperThreshold}). Price is ${zScore} standard deviations above 20m mean ($${mean}). Target: NO contract via immediate market FAK order.`,
      evaluatedAt: Date.now(),
    };
  }

  if (isOversold) {
    return {
      signal: 'OVERSOLD', // إشارة صعود للمؤشر
      currentPrice,
      zScore,
      mean,
      stdDev,
      rsi: rsiValue,
      bollingerBands,
      isOverbought: false,
      isOversold: true,
      explanationArabic: `🚨 [إشارة صعود Z-Score]: القيمة الحالية = ${zScore} (كسرت قاع ${lowerThreshold}). السعر ($${currentPrice.toLocaleString()}) أدنى من متوسط 20 دقيقة ($${mean.toLocaleString()}). الهدف: شراء عقد YES للارتداد عبر أمر FAK فوراً بسعر السوق.`,
      explanationEnglish: `Bullish Z-Score Trigger! Z = ${zScore} (<= ${lowerThreshold}). Price is ${Math.abs(zScore)} standard deviations below 20m mean ($${mean}). Target: YES contract via immediate market FAK order.`,
      evaluatedAt: Date.now(),
    };
  }

  return {
    signal: 'NEUTRAL',
    currentPrice,
    zScore,
    mean,
    stdDev,
    rsi: rsiValue,
    bollingerBands,
    isOverbought: false,
    isOversold: false,
    explanationArabic: `⚖️ [Z-Score محايد]: القيمة = ${zScore > 0 ? '+' : ''}${zScore} (بين ${lowerThreshold} و +${upperThreshold}). متوسط 20 دقيقة = $${mean.toLocaleString()} (الانحراف المعياري = $${stdDev}). الروبوت في وضع مراقبة خطة الـ Z-Score.`,
    explanationEnglish: `Neutral Z-Score: Z = ${zScore} (between ${lowerThreshold} and +${upperThreshold}). 20m Mean = $${mean}, StdDev = $${stdDev}. Monitoring mode.`,
    evaluatedAt: Date.now(),
  };
}
