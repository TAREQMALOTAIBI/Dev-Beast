import { BotConfig, KellyMath, ZScoreMetric } from '../types/bot';

/**
 * Calculates Z-Score and statistical parameters from a window of close prices
 * Matching the exact formula in LimitlessTradingBot:
 * mean = sum(prices) / n
 * variance = sum((p - mean)^2) / n
 * stdDev = sqrt(variance)
 * zScore = (currentPrice - mean) / stdDev
 */
export interface ThreeFiltersStatus {
  openPriceFilter: {
    passedShort: boolean;
    passedLong: boolean;
    openPrice: number | null;
    sma30: number;
    diffFromOpen: number | null;
  };
  ema60Filter: {
    passedShort: boolean;
    passedLong: boolean;
    ema60: number;
    ema60SlopeSigma: number;
    trendState: 'NEUTRAL' | 'STRONG_UP' | 'STRONG_DOWN';
  };
  timeFilter: {
    passed: boolean;
    remainingMinutes: number | null;
    minRequiredMinutes: number;
  };
  canEnterShort: boolean;
  canEnterLong: boolean;
  blockReasonShort: string | null;
  blockReasonLong: string | null;
}

export function computeEmaSeries(prices: number[], period = 60): number[] {
  if (!prices.length) return [];
  const k = 2 / (period + 1);
  const ema: number[] = [prices[0]];
  for (let i = 1; i < prices.length; i++) {
    ema.push(prices[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

export function evaluateThreeFilters(params: {
  closes: number[];
  mean: number;
  stdDev: number;
  openPriceRaw?: string | number | null;
  expirationTimestamp?: number | null;
  minRemainingMinutes?: number;
}): ThreeFiltersStatus {
  const {
    closes,
    mean,
    stdDev,
    openPriceRaw,
    expirationTimestamp,
    minRemainingMinutes = 6,
  } = params;

  // 1) Filter 1: SMA-30 vs Contract Open Price ("Price to Beat")
  const parsedOpen = openPriceRaw !== undefined && openPriceRaw !== null
    ? Number(String(openPriceRaw).replace(/[^0-9.-]/g, ''))
    : NaN;
  const validOpenPrice = !isNaN(parsedOpen) && parsedOpen > 0 ? parsedOpen : null;
  const openPriceTolerance = 15; // $15 tolerance buffer
  const passedOpenShort = validOpenPrice === null ? true : mean <= validOpenPrice + openPriceTolerance;
  const passedOpenLong = validOpenPrice === null ? true : mean >= validOpenPrice - openPriceTolerance;
  const diffFromOpen = validOpenPrice !== null ? mean - validOpenPrice : null;

  // 2) Filter 2: Higher Timeframe EMA-60 Trend Slope Filter
  const emaSeries = computeEmaSeries(closes, 60);
  const emaNow = emaSeries.length > 0 ? emaSeries[emaSeries.length - 1] : mean;
  const lookbackIdx = Math.max(0, emaSeries.length - 6); // 5 minutes ago
  const ema5mAgo = emaSeries.length > 0 ? emaSeries[lookbackIdx] : emaNow;
  const ema60SlopeSigma = stdDev > 0 ? (emaNow - ema5mAgo) / stdDev : 0;

  const isStrongUpBreakout = ema60SlopeSigma > 0.35 && mean > emaNow;
  const isStrongDownBreakout = ema60SlopeSigma < -0.35 && mean < emaNow;
  const trendState: 'NEUTRAL' | 'STRONG_UP' | 'STRONG_DOWN' = isStrongUpBreakout
    ? 'STRONG_UP'
    : isStrongDownBreakout
    ? 'STRONG_DOWN'
    : 'NEUTRAL';

  const passedEmaShort = !isStrongUpBreakout;
  const passedEmaLong = !isStrongDownBreakout;

  // 3) Filter 3: Minimum Time Remaining in 15m Contract (>= 6 minutes)
  const now = Date.now();
  const expMs = Number(expirationTimestamp) || 0;
  const remainingMinutes = expMs > now ? (expMs - now) / 60000 : expMs > 0 ? 0 : null;
  const passedTime = remainingMinutes === null ? true : remainingMinutes >= minRemainingMinutes;

  const canEnterShort = passedOpenShort && passedEmaShort && passedTime;
  const canEnterLong = passedOpenLong && passedEmaLong && passedTime;

  let blockReasonShort: string | null = null;
  if (!passedTime) {
    blockReasonShort = `الوقت المتبقي في العقد (${(remainingMinutes ?? 0).toFixed(1)} د) أقل من ${minRemainingMinutes} دقائق`;
  } else if (!passedOpenShort && validOpenPrice !== null) {
    blockReasonShort = `متوسط SMA-30 ($${mean.toFixed(1)}) أعلى من سعر افتتاح العقد ($${validOpenPrice.toFixed(1)})`;
  } else if (!passedEmaShort) {
    blockReasonShort = `ترند صاعد حاد على EMA-60 (+${ema60SlopeSigma.toFixed(2)}σ)`;
  }

  let blockReasonLong: string | null = null;
  if (!passedTime) {
    blockReasonLong = `الوقت المتبقي في العقد (${(remainingMinutes ?? 0).toFixed(1)} د) أقل من ${minRemainingMinutes} دقائق`;
  } else if (!passedOpenLong && validOpenPrice !== null) {
    blockReasonLong = `متوسط SMA-30 ($${mean.toFixed(1)}) أقل من سعر افتتاح العقد ($${validOpenPrice.toFixed(1)})`;
  } else if (!passedEmaLong) {
    blockReasonLong = `ترند هابط حاد على EMA-60 (${ema60SlopeSigma.toFixed(2)}σ)`;
  }

  return {
    openPriceFilter: {
      passedShort: passedOpenShort,
      passedLong: passedOpenLong,
      openPrice: validOpenPrice,
      sma30: mean,
      diffFromOpen,
    },
    ema60Filter: {
      passedShort: passedEmaShort,
      passedLong: passedEmaLong,
      ema60: emaNow,
      ema60SlopeSigma,
      trendState,
    },
    timeFilter: {
      passed: passedTime,
      remainingMinutes,
      minRequiredMinutes: minRemainingMinutes,
    },
    canEnterShort,
    canEnterLong,
    blockReasonShort,
    blockReasonLong,
  };
}

export function calculateZScore(
  closePrices: number[],
  upperThreshold = 2.2,
  entryThreshold = 2.2,
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
 * Calculates position sizing with Fixed 4% of bankroll per 15m contract
 * and FAK order without max Entry price.
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
