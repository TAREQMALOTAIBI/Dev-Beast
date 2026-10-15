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
  lookback: number = 12
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

  // أخذ آخر N شمعة (Lookback Window = 12 شمعة على فريم 5m)
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
 * @param candles مصفوفة شموع البيتكوين (إطار 5 دقائق)
 * @param config إعدادات البوت والبارامترات
 * @returns SignalEvaluation نتيجة تقييم إشارة الـ Z-Score
 */
export function checkMeanReversionSignal(
  candles: Candle[],
  config: BotConfig
): SignalEvaluation {
  const lookbackPeriod = config.zScore?.period || 12; // 12 شمعة على فريم 5 دقائق (ساعة واحدة) لتعظيم الدقة وتصفية الضجيج
  const upperThreshold = config.zScore?.upperThreshold !== undefined ? config.zScore.upperThreshold : 2.00; // التركيز على +2.00
  const lowerThreshold = config.zScore?.lowerThreshold !== undefined ? config.zScore.lowerThreshold : -2.00; // التركيز على -2.00

  // التحقق من كفاية بيانات الشموع (30 شمعة على الأقل)
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
      explanationArabic: `في انتظار تجميع 30 شمعة دقيقة لحساب الـ Z-Score (المتوفر حالياً: ${candles ? candles.length : 0} شمعة).`,
      explanationEnglish: `Waiting for 30 one-minute candles for Z-Score calculation (Available: ${candles?.length || 0}).`,
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
      signal: 'OVERBOUGHT', // إشارة صعود مع الزخم (اختراق المقاومة)
      currentPrice,
      zScore,
      mean,
      stdDev,
      rsi: rsiValue,
      bollingerBands,
      isOverbought: true,
      isOversold: false,
      explanationArabic: `🚨 [إشارة صعود Z-Score]: القيمة الحالية = +${zScore} (تجاوزت سقف +${upperThreshold}). زخم صعودي قوي. الهدف: شراء عقد UP (YES) عبر أمر FAK فوراً بسعر السوق.`,
      explanationEnglish: `Bullish Z-Score Trigger! Z = +${zScore} (>= +${upperThreshold}). Strong upward momentum. Target: YES (UP) contract via immediate market FAK order.`,
      evaluatedAt: Date.now(),
    };
  }

  if (isOversold) {
    return {
      signal: 'OVERSOLD', // إشارة هبوط مع الزخم (كسر الدعم)
      currentPrice,
      zScore,
      mean,
      stdDev,
      rsi: rsiValue,
      bollingerBands,
      isOverbought: false,
      isOversold: true,
      explanationArabic: `🚨 [إشارة هبوط Z-Score]: القيمة الحالية = ${zScore} (كسرت قاع ${lowerThreshold}). زخم هبوطي قوي. الهدف: شراء عقد DOWN (NO) عبر أمر FAK فوراً بسعر السوق.`,
      explanationEnglish: `Bearish Z-Score Trigger! Z = ${zScore} (<= ${lowerThreshold}). Strong downward momentum. Target: NO (DOWN) contract via immediate market FAK order.`,
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
    explanationArabic: `⚖️ [Z-Score محايد]: القيمة = ${zScore > 0 ? '+' : ''}${zScore} (بين ${lowerThreshold} و +${upperThreshold}). متوسط 15 دقيقة = $${mean.toLocaleString()} (الانحراف المعياري = $${stdDev}). الروبوت في وضع مراقبة خطة الـ Z-Score.`,
    explanationEnglish: `Neutral Z-Score: Z = ${zScore} (between ${lowerThreshold} and +${upperThreshold}). 15m Mean = $${mean}, StdDev = $${stdDev}. Monitoring mode.`,
    evaluatedAt: Date.now(),
  };
}
