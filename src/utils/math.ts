import { BotConfig, KellyMath, ZScoreMetric } from '../types/bot';

/**
 * Calculates Z-Score and statistical parameters from a window of close prices
 * Matching the exact formula in LimitlessTradingBot:
 * mean = sum(prices) / n
 * variance = sum((p - mean)^2) / n
 * stdDev = sqrt(variance)
 * zScore = (currentPrice - mean) / stdDev
 */


export interface AdvancedFiltersStatus {
  rv3m: {
    valueBp: number;
    passed: boolean;
    minBp: number;
    maxBp: number;
  };
  adx14: {
    value: number;
    passed: boolean;
    threshold: number;
  };
  return3m: number;
  canEnterShort: boolean;
  canEnterLong: boolean;
  blockReasonShort: string | null;
  blockReasonLong: string | null;
}

/**
 * Calculates Return over Signal Horizon K (default K = 3 minutes per Document 6):
 * Return_3m = (Close[-1] - Close[-1 - K]) / Close[-1 - K]
 */
export function calculateReturn3m(closePrices: number[], horizon = 3): number {
  const n = closePrices.length;
  const h = Math.max(1, horizon);
  if (n < h + 1) return 0;
  const closeNow = closePrices[n - 1];
  const closePrev = closePrices[n - 1 - h];
  if (closePrev <= 0) return 0;
  return (closeNow - closePrev) / closePrev;
}

/**
 * Volatility Filter (RV_3m over Signal Horizon K):
 * Realized Volatility over last K minutes (default K = 3) expressed in basis points (bp)
 * 10 bp < RV < 60 bp (1 bp = 0.01% = 0.0001)
 */
export function calculateRealizedVol3m(closePrices: number[], horizon = 3): number {
  const n = closePrices.length;
  const h = Math.max(1, horizon);
  if (n < h + 1) return 25; // default neutral 25 bp if not enough candles
  let sumSq = 0;
  for (let i = 0; i < h; i++) {
    const p1 = closePrices[n - 1 - i];
    const p0 = closePrices[n - 2 - i];
    if (p0 > 0 && p1 > 0) {
      const r = Math.log(p1 / p0);
      sumSq += r * r;
    }
  }
  const rv = Math.sqrt(sumSq);
  // Convert to basis points (e.g. 0.0025 = 25 bp)
  return rv * 10000;
}

/**
 * ADX(14, 1m) Trend Filter:
 * Measures trend strength. Strategy stops if ADX >= 25 (Trending market).
 * Passed if ADX < 25.
 */
export function calculateAdx14(candles: import('../types/bot').CandleData[], period = 14): number {
  if (candles.length < period * 2) return 15; // default calm 15 if buffer building
  const trList: number[] = [];
  const plusDmList: number[] = [];
  const minusDmList: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const cur = candles[i];
    const prev = candles[i - 1];

    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close)
    );
    trList.push(tr);

    const upMove = cur.high - prev.high;
    const downMove = prev.low - cur.low;

    const plusDm = upMove > downMove && upMove > 0 ? upMove : 0;
    const minusDm = downMove > upMove && downMove > 0 ? downMove : 0;

    plusDmList.push(plusDm);
    minusDmList.push(minusDm);
  }

  if (trList.length < period) return 15;

  // Wilder's smoothing
  let trSmooth = trList.slice(0, period).reduce((a, b) => a + b, 0);
  let plusDmSmooth = plusDmList.slice(0, period).reduce((a, b) => a + b, 0);
  let minusDmSmooth = minusDmList.slice(0, period).reduce((a, b) => a + b, 0);

  const dxList: number[] = [];

  for (let i = period; i < trList.length; i++) {
    trSmooth = trSmooth - trSmooth / period + trList[i];
    plusDmSmooth = plusDmSmooth - plusDmSmooth / period + plusDmList[i];
    minusDmSmooth = minusDmSmooth - minusDmSmooth / period + minusDmList[i];

    const plusDi = trSmooth > 0 ? (plusDmSmooth / trSmooth) * 100 : 0;
    const minusDi = trSmooth > 0 ? (minusDmSmooth / trSmooth) * 100 : 0;
    const diSum = plusDi + minusDi;
    const dx = diSum > 0 ? (Math.abs(plusDi - minusDi) / diSum) * 100 : 0;
    dxList.push(dx);
  }

  if (dxList.length < period) return 15;

  let adx = dxList.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dxList.length; i++) {
    adx = (adx * (period - 1) + dxList[i]) / period;
  }

  return adx;
}

/**
 * Evaluates the new document filters:
 * 1) Volatility Filter: 10 bp < RV_3m < 60 bp (measured across Signal Horizon K)
 * 2) Trend Filter: ADX(14, 1m) < 25
 */
export function evaluateDocumentFilters(params: {
  closePrices: number[];
  candles?: import('../types/bot').CandleData[];
  signalHorizonMinutes?: number;
}): AdvancedFiltersStatus {
  const { closePrices, candles = [], signalHorizonMinutes = 3 } = params;
  const return3m = calculateReturn3m(closePrices, signalHorizonMinutes);
  const rvBp = calculateRealizedVol3m(closePrices, signalHorizonMinutes);
  const adx = calculateAdx14(candles, 14);

  const passedRv = rvBp > 10 && rvBp < 60;
  const passedAdx = adx < 25;

  const canEnter = passedRv && passedAdx;

  let blockReason: string | null = null;
  if (!passedRv) {
    blockReason = rvBp <= 10
      ? `تقلبات منخفضة جداً (${rvBp.toFixed(1)} bp <= 10 bp - سكون)`
      : `تقلبات مفرطة (${rvBp.toFixed(1)} bp >= 60 bp - انهيارات/انفجارات)`;
  } else if (!passedAdx) {
    blockReason = `ترند قوي جداً ADX=${adx.toFixed(1)} >= 25 (إيقاف الاستراتيجية)`;
  }

  return {
    rv3m: {
      valueBp: rvBp,
      passed: passedRv,
      minBp: 10,
      maxBp: 60,
    },
    adx14: {
      value: adx,
      passed: passedAdx,
      threshold: 25,
    },
    return3m,
    canEnterShort: canEnter,
    canEnterLong: canEnter,
    blockReasonShort: blockReason,
    blockReasonLong: blockReason,
  };
}

export function calculateZScore(
  closePrices: number[],
  upperThreshold = 2.4,
  entryThreshold = 2.4,
  lowerThreshold = -2.2,
  lowerEntryThreshold = -2.2
): {
  mean: number;
  variance: number;
  stdDev: number;
  zScore: number;
  currentPrice: number;
  upperBand: number;
  entryBand: number;
  lowerEntryBand: number;
  lowerBand: number;
} {
  const n = closePrices.length;
  if (n === 0) {
    return {
      mean: 0,
      variance: 0,
      stdDev: 0,
      zScore: 0,
      currentPrice: 0,
      upperBand: 0,
      entryBand: 0,
      lowerEntryBand: 0,
      lowerBand: 0,
    };
  }

  const currentPrice = closePrices[n - 1];
  const mean = closePrices.reduce((a, b) => a + b, 0) / n;
  const variance = closePrices.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);

  const zScore = stdDev > 0 ? (currentPrice - mean) / stdDev : 0;

  return {
    mean,
    variance,
    stdDev,
    zScore,
    currentPrice,
    upperBand: mean + upperThreshold * stdDev,
    entryBand: mean + entryThreshold * stdDev,
    lowerEntryBand: mean + lowerEntryThreshold * stdDev,
    lowerBand: mean + lowerThreshold * stdDev,
  };
}

/**
 * Calculates position sizing per Document 6:
 * Quarter-Kelly (0.25 * Kelly(Edge)) capped at 3-5% of bankroll per 15m contract,
 * with Hard Cap Max Entry Price 46¢ ($0.46) and FAK order execution.
 */
export function calculateKellySizing(
  balance: number,
  config: Pick<BotConfig, 'maxPriceCents' | 'winProbability' | 'maxRiskPercent' | 'fractionChunks'>
): KellyMath {
  const { maxPriceCents, winProbability, maxRiskPercent } = config;

  // Max Entry Price: $0.46 (46¢) per specification document
  const price = Math.max(0.001, Math.min(0.999, maxPriceCents || 0.46));
  const b = (1.00 - price) / price;
  const p = Math.max(0.01, Math.min(0.99, winProbability || 0.55));
  const q = 1 - p;

  // Specification: 0.25 * Kelly(Edge) where Edge = Model_Prob - 0.525
  const edge = Math.max(0, p - 0.525);
  const rawKelly = b > 0 ? (b * p - q) / b : 0;
  const quarterKelly = Math.max(0, 0.25 * (edge > 0 ? rawKelly : 0));

  // Cap between 3% and 5% of bankroll per trade (default 4%)
  const userCap = Number(maxRiskPercent) || 0.04;
  const cappedRisk = Math.min(0.05, Math.max(0.03, userCap));
  const riskToTake = quarterKelly > 0 ? Math.min(quarterKelly, cappedRisk) : cappedRisk;

  // Exact dollar allocation
  const maxAllowedUsd = balance > 0 ? balance * riskToTake : 0;
  const positionSizeUsd = maxAllowedUsd;

  let numberOfContracts = positionSizeUsd > 0 && price > 0
    ? Math.floor((positionSizeUsd / price) * 100) / 100
    : 0;

  while (numberOfContracts > 0 && (numberOfContracts * price) > maxAllowedUsd) {
    numberOfContracts = Math.round((numberOfContracts - 0.01) * 100) / 100;
  }

  if (numberOfContracts < 0.01 && maxAllowedUsd >= (0.01 * price)) {
    numberOfContracts = 0.01;
  }

  return {
    b,
    p,
    q,
    kellyFraction: rawKelly,
    riskToTake,
    positionSizeUsd,
    numberOfContracts,
    chunkSize: numberOfContracts,
    lastChunkSize: numberOfContracts,
  };
}

/**
 * Format currency with 2 decimals
 */
export function formatUsd(amount: number): string {
  const safeAmount = Number.isFinite(Number(amount)) ? Number(amount) : 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeAmount);
}

/**
 * Format crypto price with adaptive precision
 */
export function formatPrice(price: number): string {
  const safePrice = Number.isFinite(Number(price)) ? Number(price) : 0;
  if (safePrice >= 1000) {
    return safePrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (safePrice >= 1) {
    return safePrice.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  }
  return safePrice.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 });
}
