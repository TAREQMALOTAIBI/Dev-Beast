import { BotConfig, KellyMath, ZScoreMetric } from '../types/bot';

/**
 * Calculates Z-Score and statistical parameters from a window of close prices
 * Matching the exact formula in LimitlessTradingBot:
 * mean = sum(prices) / n
 * variance = sum((p - mean)^2) / n
 * stdDev = sqrt(variance)
 * zScore = (currentPrice - mean) / stdDev
 */
export function calculateZScore(
  closePrices: number[],
  upperThreshold = 2.5,
  entryThreshold = 2.3,
  lowerThreshold = -2.5,
  lowerEntryThreshold = -2.3
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
 * Calculates position sizing with Fixed 4% of bankroll per 15m contract
 * and GTC order without max Entry price.
 */
export function calculateKellySizing(
  balance: number,
  config: Pick<BotConfig, 'maxPriceCents' | 'winProbability' | 'maxRiskPercent' | 'fractionChunks'>
): KellyMath {
  const { maxPriceCents, winProbability, maxRiskPercent } = config;

  // Safe bounds for live contract price (no artificial max entry price ceiling)
  const price = Math.max(0.001, Math.min(0.999, maxPriceCents >= 0.99 ? 0.50 : maxPriceCents));
  const b = (1.00 - price) / price;
  const p = Math.max(0.01, Math.min(0.99, winProbability));
  const q = 1 - p;

  const kellyFraction = (b * p - q) / b;
  // Strict Fixed 4% maximum limit of bankroll per 15m contract (0.04)
  const effectiveMaxRisk = Math.min(Math.max(Number(maxRiskPercent) || 0.04, 0.001), 0.04);
  const riskToTake = effectiveMaxRisk;

  // Exact dollar allocation permitted by Fixed 4% of bankroll
  const maxAllowedUsd = balance > 0 ? balance * effectiveMaxRisk : 0;
  const positionSizeUsd = maxAllowedUsd;

  // Contract calculation: Strict floor down to 2 decimals so (contracts * price) NEVER exceeds maxAllowedUsd
  let numberOfContracts = positionSizeUsd > 0 && price > 0
    ? Math.floor((positionSizeUsd / price) * 100) / 100
    : 0;

  // Hard safety check: ensure contract cost never exceeds maxAllowedUsd by even 1 cent
  while (numberOfContracts > 0 && (numberOfContracts * price) > maxAllowedUsd) {
    numberOfContracts = Math.round((numberOfContracts - 0.01) * 100) / 100;
  }

  // Minimum fractional contract threshold if budget permits at least 0.01 contracts
  if (numberOfContracts < 0.01 && maxAllowedUsd >= (0.01 * price)) {
    numberOfContracts = 0.01;
  }

  // Single unified order execution (chunking completely eliminated)
  const chunkSize = numberOfContracts;
  const lastChunkSize = numberOfContracts;

  return {
    b,
    p,
    q,
    kellyFraction,
    riskToTake,
    positionSizeUsd,
    numberOfContracts,
    chunkSize,
    lastChunkSize,
  };
}

/**
 * Format currency with 2 decimals
 */
export function formatUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format crypto price with adaptive precision
 */
export function formatPrice(price: number): string {
  if (price >= 1000) {
    return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (price >= 1) {
    return price.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  }
  return price.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 });
}

/**
 * Calculates Exponential Moving Average (EMA) series for an array of prices
 * k = 2 / (period + 1)
 * EMA_t = (Price_t * k) + (EMA_{t-1} * (1 - k))
 */
export function calculateEMA(prices: number[], period: number): number[] {
  if (!prices || prices.length === 0 || period <= 0) return [];
  const k = 2 / (period + 1);
  const emaArr: number[] = new Array(prices.length);

  if (prices.length < period) {
    let runningSum = 0;
    for (let i = 0; i < prices.length; i++) {
      runningSum += prices[i];
      emaArr[i] = runningSum / (i + 1);
    }
    return emaArr;
  }

  // Calculate initial SMA for first `period` prices
  let initialSum = 0;
  for (let i = 0; i < period; i++) {
    initialSum += prices[i];
    emaArr[i] = initialSum / (i + 1);
  }
  let prevEma = initialSum / period;
  emaArr[period - 1] = prevEma;

  // Calculate EMA for all subsequent prices
  for (let i = period; i < prices.length; i++) {
    prevEma = prices[i] * k + prevEma * (1 - k);
    emaArr[i] = prevEma;
  }

  return emaArr;
}
