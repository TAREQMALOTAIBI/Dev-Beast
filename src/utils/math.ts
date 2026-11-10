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
  roundWindow: {
    currentMinute: number;
    startMin: number;
    endMin: number;
    passed: boolean;
  };
  canEnterShort: boolean;
  canEnterLong: boolean;
  blockReasonShort: string | null;
  blockReasonLong: string | null;
}

/**
 * Volatility Filter (RV_3m):
 * Realized Volatility over last 3 minutes expressed in basis points (bp)
 * Default range: 9 bp - 25 bp (1 bp = 0.01% = 0.0001)
 */
export function calculateRealizedVol3m(closePrices: number[]): number {
  const n = closePrices.length;
  if (n < 4) return 15; // default neutral 15 bp if not enough candles
  let sumSq = 0;
  for (let i = 0; i < 3; i++) {
    const p1 = closePrices[n - 1 - i];
    const p0 = closePrices[n - 2 - i];
    if (p0 > 0 && p1 > 0) {
      const r = Math.log(p1 / p0);
      sumSq += r * r;
    }
  }
  const rv = Math.sqrt(sumSq);
  // Convert to basis points (e.g. 0.0015 = 15 bp)
  return rv * 10000;
}

/**
 * ADX(14, 1m) Trend Filter:
 * Measures trend strength. Strategy stops if ADX >= 20 (Trending market).
 * Passed if ADX < 20.
 */
export function calculateAdx14(candles: import('../types/bot').CandleData[], period = 14): number {
  if (candles.length < period * 2) return 14; // default calm 14 if buffer building
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

  if (trList.length < period) return 14;

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

  if (dxList.length < period) return 14;

  let adx = dxList.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dxList.length; i++) {
    adx = (adx * (period - 1) + dxList[i]) / period;
  }

  return adx;
}

/**
 * Evaluates the active quant filters:
 * 1) Volatility Filter: 9 bp <= RV_3m <= 25 bp
 * 2) Trend Filter: ADX(14, 1m) < 20
 * 3) Round Entry Window: Minute 3 to Minute 10 of the 15-minute round
 */
export function evaluateDocumentFilters(params: {
  closePrices: number[];
  candles?: import('../types/bot').CandleData[];
  rvMinBp?: number;
  rvMaxBp?: number;
  adxThreshold?: number;
  entryWindowStartMin?: number;
  entryWindowEndMin?: number;
  nowMs?: number;
}): AdvancedFiltersStatus {
  const {
    closePrices,
    candles = [],
    rvMinBp = 9,
    rvMaxBp = 25,
    adxThreshold = 20,
    entryWindowStartMin = 3,
    entryWindowEndMin = 10,
    nowMs = Date.now(),
  } = params;

  const rvBp = calculateRealizedVol3m(closePrices);
  const adx = calculateAdx14(candles, 14);

  // Current minute within the 15-minute round (0..14)
  const currentMinute = Math.floor(nowMs / 60000) % 15;
  const passedWindow = currentMinute >= entryWindowStartMin && currentMinute <= entryWindowEndMin;

  const passedRv = rvBp >= rvMinBp && rvBp <= rvMaxBp;
  const passedAdx = adx < adxThreshold;

  const canEnter = passedRv && passedAdx && passedWindow;

  let blockReason: string | null = null;
  if (!passedWindow) {
    blockReason =
      currentMinute < entryWindowStartMin
        ? `خارج نافذة الدخول (الدقيقة ${currentMinute} < الدقيقة ${entryWindowStartMin} بداية النافذة)`
        : `انتهت نافذة الدخول للجولة الحالية (الدقيقة ${currentMinute} > الدقيقة ${entryWindowEndMin})`;
  } else if (!passedRv) {
    blockReason =
      rvBp < rvMinBp
        ? `تقلبات منخفضة جداً (${rvBp.toFixed(1)} bp < ${rvMinBp} bp - سكون)`
        : `تقلبات مفرطة (${rvBp.toFixed(1)} bp > ${rvMaxBp} bp - خارج نطاق ${rvMinBp}-${rvMaxBp} bp)`;
  } else if (!passedAdx) {
    blockReason = `ترند قوي ADX=${adx.toFixed(1)} >= ${adxThreshold} (إيقاف الدخول)`;
  }

  return {
    rv3m: {
      valueBp: rvBp,
      passed: passedRv,
      minBp: rvMinBp,
      maxBp: rvMaxBp,
    },
    adx14: {
      value: adx,
      passed: passedAdx,
      threshold: adxThreshold,
    },
    roundWindow: {
      currentMinute,
      startMin: entryWindowStartMin,
      endMin: entryWindowEndMin,
      passed: passedWindow,
    },
    canEnterShort: canEnter,
    canEnterLong: canEnter,
    blockReasonShort: blockReason,
    blockReasonLong: blockReason,
  };
}

/**
 * Calculates Z-Score measuring price deviation directly from the active 15m Contract Open Price (Price to Beat),
 * normalized by the 12-period statistical standard deviation (σ):
 * Z = (CurrentPrice - ContractOpenPrice) / StdDev
 */
export function calculateZScore(
  closePrices: number[],
  upperThreshold = 2.0,
  entryThreshold = 2.0,
  lowerThreshold = -2.0,
  lowerEntryThreshold = -2.0,
  contractOpenPrice?: number | null
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
  const smaMean = closePrices.reduce((a, b) => a + b, 0) / n;
  const variance = closePrices.reduce((a, b) => a + Math.pow(b - smaMean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);

  // Use the active 15-minute round's Open Price ("Price to Beat") as the baseline anchor if valid,
  // falling back to the rolling SMA only before the market open price is loaded.
  const validOpenPrice =
    contractOpenPrice !== undefined &&
    contractOpenPrice !== null &&
    Number.isFinite(Number(contractOpenPrice)) &&
    Number(contractOpenPrice) > 0
      ? Number(contractOpenPrice)
      : smaMean;

  const zScore = stdDev > 0 ? (currentPrice - validOpenPrice) / stdDev : 0;

  return {
    mean: validOpenPrice,
    variance,
    stdDev,
    zScore,
    currentPrice,
    upperBand: validOpenPrice + upperThreshold * stdDev,
    entryBand: validOpenPrice + entryThreshold * stdDev,
    lowerEntryBand: validOpenPrice + lowerEntryThreshold * stdDev,
    lowerBand: validOpenPrice + lowerThreshold * stdDev,
  };
}

/**
 * Calculates position sizing for 5-Minute Last-Minute Sniper Strategy:
 * Fixed 10% of bankroll (0.10) per 5m contract,
 * with FAK order execution and NO price cap (0.99 ceiling).
 */
export function calculateKellySizing(
  balance: number,
  config: Pick<BotConfig, 'maxPriceCents' | 'winProbability' | 'maxRiskPercent' | 'fractionChunks'>
): KellyMath {
  const { maxPriceCents, winProbability, maxRiskPercent } = config;

  // No Price Cap: defaults to 0.99 ($0.99) or live market price
  const price = Math.max(0.001, Math.min(0.99, maxPriceCents || 0.99));
  const b = (1.00 - price) / price;
  const p = Math.max(0.01, Math.min(0.99, winProbability || 0.90));
  const q = 1 - p;

  const rawKelly = b > 0 ? (b * p - q) / b : 0.10;

  // Fixed 10% of capital per trade (or user-configured percentage)
  const riskToTake = Math.min(1.0, Math.max(0.01, Number(maxRiskPercent) || 0.10));

  // Exact dollar allocation (10% of balance)
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
