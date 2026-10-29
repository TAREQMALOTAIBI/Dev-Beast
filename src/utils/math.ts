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
  upperThreshold = 2.0,
  entryThreshold = 2.0,
  lowerThreshold = -2.0,
  lowerEntryThreshold = -2.0
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
 * Calculates Kelly Criterion position sizing with the 10% max risk cap
 * and contract fractionalization.
 * 
 * b: payout odds = (1.00 - MAX_PRICE_CENTS) / MAX_PRICE_CENTS (at $0.20, b = 4.0)
 * p: win probability (e.g. 0.55)
 * q: 1 - p (0.45)
 * kellyFraction: (b * p - q) / b
 * riskToTake: clamp between 0 and 10% max risk (0.10 maximum limit)
 * Unified single order execution (chunking eliminated)
 */
export function calculateKellySizing(
  balance: number,
  config: Pick<BotConfig, 'maxPriceCents' | 'winProbability' | 'maxRiskPercent' | 'fractionChunks'>
): KellyMath {
  const { maxPriceCents, winProbability, maxRiskPercent } = config;

  // Safe bounds
  const price = Math.max(0.001, Math.min(0.999, maxPriceCents));
  const b = (1.00 - price) / price;
  const p = Math.max(0.01, Math.min(0.99, winProbability));
  const q = 1 - p;

  const kellyFraction = (b * p - q) / b;
  // Strict 10% maximum limit cap as demanded by user (NEVER exceed 0.10)
  const effectiveMaxRisk = Math.min(Math.max(Number(maxRiskPercent) || 0.10, 0.001), 0.10);
  // In prediction markets with Z >= 2.0σ statistical trigger, always allocate within the user's 10% safety cap
  const riskToTake = kellyFraction > 0
    ? Math.min(kellyFraction, effectiveMaxRisk)
    : effectiveMaxRisk;

  // Exact maximum dollar allocation permitted by the 10% cap
  const maxAllowedUsd = balance > 0 ? balance * effectiveMaxRisk : 0;
  const positionSizeUsd = Math.min(balance * riskToTake, maxAllowedUsd);

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
