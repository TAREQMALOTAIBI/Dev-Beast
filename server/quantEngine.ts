import { Candle, QuantMetrics, ContractWindow } from '../src/types';

export class QuantEngine {
  private zScoreThreshold = 1.5; // Default 1.5 (range 1.5 - 1.8)
  private momentumThreshold = 25.0; // Math.abs(currentPrice - openPrice) >= $25.0 USD
  private oiDropThreshold = 0.5; // 0.5% drop in last 1m

  constructor() {}

  public setConfig(config: {
    zScoreThreshold?: number;
    momentumThreshold?: number;
    oiDropThreshold?: number;
  }): void {
    if (config.zScoreThreshold !== undefined) this.zScoreThreshold = config.zScoreThreshold;
    if (config.momentumThreshold !== undefined) this.momentumThreshold = config.momentumThreshold;
    if (config.oiDropThreshold !== undefined) this.oiDropThreshold = config.oiDropThreshold;
  }

  public getConfig() {
    return {
      zScoreThreshold: this.zScoreThreshold,
      momentumThreshold: this.momentumThreshold,
      oiDropThreshold: this.oiDropThreshold,
    };
  }

  /**
   * Calculate 15-minute Contract Window state
   * 15-minute cycles: 00:00, 15:00, 30:00, 45:00 of every hour
   * Golden Window: strictly between Minute 03:30 (210s) and Minute 08:30 (510s)
   */
  public getContractWindowState(nowMs: number = Date.now()): ContractWindow {
    const cycleMs = 15 * 60 * 1000;
    const cycleStartMs = Math.floor(nowMs / cycleMs) * cycleMs;
    const elapsedSeconds = Math.floor((nowMs - cycleStartMs) / 1000); // 0 to 899

    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;
    const minuteFormatted = `Min ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')} / 15:00`;

    // Golden Window: 03:30 (210s) to 08:30 (510s)
    const goldenStart = 210;
    const goldenEnd = 510;
    const isGoldenWindow = elapsedSeconds >= goldenStart && elapsedSeconds <= goldenEnd;

    let secondsToWindowStart = 0;
    let secondsToWindowEnd = 0;

    if (elapsedSeconds < goldenStart) {
      secondsToWindowStart = goldenStart - elapsedSeconds;
      secondsToWindowEnd = goldenEnd - elapsedSeconds;
    } else if (elapsedSeconds <= goldenEnd) {
      secondsToWindowStart = 0;
      secondsToWindowEnd = goldenEnd - elapsedSeconds;
    } else {
      secondsToWindowStart = 900 - elapsedSeconds + goldenStart;
      secondsToWindowEnd = 900 - elapsedSeconds + goldenEnd;
    }

    return {
      cycleMinutes: 15,
      elapsedSeconds,
      minuteFormatted,
      isGoldenWindow,
      goldenWindowLabel: isGoldenWindow
        ? 'GOLDEN WINDOW ACTIVE [03:30-08:30]'
        : 'PAUSED (WINDOW LOCKED)',
      secondsToWindowStart,
      secondsToWindowEnd,
    };
  }

  /**
   * Determine the open price of the current 15m contract cycle
   */
  public get15mCycleOpenPrice(candles: Candle[], nowMs: number = Date.now()): number {
    if (candles.length === 0) return 89500;

    const cycleMs = 15 * 60 * 1000;
    const cycleStartMs = Math.floor(nowMs / cycleMs) * cycleMs;

    // Find the candle starting at or immediately following cycleStartMs
    const cycleStartCandle = candles.find((c) => c.time >= cycleStartMs);
    if (cycleStartCandle) {
      return cycleStartCandle.open;
    }

    // Fallback: look back at 15 candles ago
    const idx = Math.max(0, candles.length - 15);
    return candles[idx].open;
  }

  /**
   * 1. Z-Score (Price Anomaly): Calculate rolling Z-Score of the close price over 20 periods.
   * Trigger condition: |Z-Score| >= 1.5σ to 1.8σ.
   */
  public calculateRollingZScore(candles: Candle[]): { zScore: number; mean: number; stdDev: number } {
    if (candles.length < 2) {
      return { zScore: 0, mean: 0, stdDev: 0 };
    }

    // Use up to the last 20 periods
    const period = Math.min(20, candles.length);
    const slice = candles.slice(-period);
    const closes = slice.map((c) => c.close);
    const currentClose = closes[closes.length - 1];

    const sum = closes.reduce((acc, val) => acc + val, 0);
    const mean = sum / period;

    const variance = closes.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    const zScore = stdDev > 0 ? (currentClose - mean) / stdDev : 0;

    return {
      zScore: parseFloat(zScore.toFixed(3)),
      mean: parseFloat(mean.toFixed(2)),
      stdDev: parseFloat(stdDev.toFixed(2)),
    };
  }

  /**
   * Evaluate all quantitative triggers:
   * 1. |Z-Score| >= threshold (1.5σ to 1.8σ)
   * 2. Momentum Delta: Math.abs(currentPrice - openPrice) >= $25.0 USD
   * 3. OI Drop: Open Interest dropped by >= 0.5% in last 1m
   * Master Rule: Trigger fires ONLY when (1 AND 2 AND 3) are ALL TRUE simultaneously!
   */
  public evaluateSignal(
    candles: Candle[],
    oiData: { latest: number; previous: number; dropPct: number },
    nowMs: number = Date.now()
  ): QuantMetrics {
    const currentPrice = candles.length > 0 ? candles[candles.length - 1].close : 89500;
    const openPrice15m = this.get15mCycleOpenPrice(candles, nowMs);

    const { zScore } = this.calculateRollingZScore(candles);
    const isZScoreTriggered = Math.abs(zScore) >= this.zScoreThreshold;

    const momentumDelta = Math.abs(currentPrice - openPrice15m);
    const isMomentumTriggered = momentumDelta >= this.momentumThreshold;

    const oiDropPct = oiData.dropPct;
    const isOiDropTriggered = oiDropPct >= this.oiDropThreshold;

    const isAllTriggered = isZScoreTriggered && isMomentumTriggered && isOiDropTriggered;

    let signalDirection: 'YES' | 'NO' | 'NONE' = 'NONE';
    if (isAllTriggered) {
      // If price surged upward above openPrice15m with positive Z-score: Bullish squeeze
      if (currentPrice > openPrice15m && zScore > 0) {
        signalDirection = 'YES';
      } else if (currentPrice < openPrice15m && zScore < 0) {
        // Price collapsed downward below openPrice15m with negative Z-score: Bearish liquidation flush
        signalDirection = 'NO';
      } else {
        // Direction based on momentum delta sign
        signalDirection = currentPrice >= openPrice15m ? 'YES' : 'NO';
      }
    }

    return {
      currentPrice,
      openPrice15m,
      zScore,
      zScoreThreshold: this.zScoreThreshold,
      isZScoreTriggered,
      momentumDelta: parseFloat(momentumDelta.toFixed(2)),
      momentumThreshold: this.momentumThreshold,
      isMomentumTriggered,
      openInterest: oiData.latest,
      prevOpenInterest: oiData.previous,
      oiDropPct: parseFloat(oiDropPct.toFixed(3)),
      oiDropThreshold: this.oiDropThreshold,
      isOiDropTriggered,
      isAllTriggered,
      signalDirection,
      lastEvaluatedAt: nowMs,
    };
  }
}
