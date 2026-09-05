/**
 * Institutional Quant Trading Bot Types
 * Specifically designed for 15-minute BTC Prediction Contracts on Limitless Exchange (Base Mainnet)
 */

export interface Candle {
  time: number;       // Open timestamp (ms)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isFinal: boolean;   // True when candle has closed
}

export interface OpenInterestPoint {
  timestamp: number;
  openInterest: number;
  symbol: string;
}

export interface QuantMetrics {
  currentPrice: number;
  openPrice15m: number;
  zScore: number;
  zScoreThreshold: number;          // 1.5 to 1.8 sigma
  isZScoreTriggered: boolean;
  momentumDelta: number;            // Math.abs(currentPrice - openPrice15m)
  momentumThreshold: number;        // Default 25.0 USD
  isMomentumTriggered: boolean;
  openInterest: number;
  prevOpenInterest: number;
  oiDropPct: number;                // Percentage drop in last 1m
  oiDropThreshold: number;          // 0.5%
  isOiDropTriggered: boolean;
  isAllTriggered: boolean;          // Z-Score AND Momentum AND OI Drop ALL TRUE
  signalDirection: 'YES' | 'NO' | 'NONE';
  lastEvaluatedAt: number;
}

export interface ContractWindow {
  cycleMinutes: number;             // 15
  elapsedSeconds: number;           // Seconds into current 15m cycle (0 - 900)
  minuteFormatted: string;          // e.g. "Min 05:20 / 15:00"
  isGoldenWindow: boolean;          // True strictly between 03:30 (210s) and 08:30 (510s)
  goldenWindowLabel: 'GOLDEN WINDOW ACTIVE [03:30-08:30]' | 'PAUSED (WINDOW LOCKED)';
  secondsToWindowStart: number;
  secondsToWindowEnd: number;
}

export interface LimitlessContract {
  id: string;
  title: string;
  targetStrikePrice: number;
  yesPrice: number;                 // $0.01 - $0.99
  noPrice: number;                  // $0.01 - $0.99
  bestYesBid?: number;
  bestYesAsk?: number;
  bestNoBid?: number;
  bestNoAsk?: number;
  expiryTimestamp: number;
  cycleStartTimestamp: number;
  isPriceInRangeYes: boolean;       // $0.01 <= price <= $0.25
  isPriceInRangeNo: boolean;        // $0.01 <= price <= $0.25
  network: string;                  // 'Base Mainnet'
}

export interface Position {
  id: string;
  timestamp: number;
  contractId: string;
  contractTitle: string;
  side: 'YES' | 'NO';
  orderType: 'FAK';                 // Strict Fill-And-Kill
  entryPrice: number;               // $0.01 - $0.25
  shares: number;
  totalCost: number;                // 10% of wallet balance
  walletBalanceAtEntry: number;
  targetStrike: number;
  openBtcPrice: number;
  status: 'HOLD_TO_EXPIRATION' | 'EXPIRED_WON' | 'EXPIRED_LOST' | 'FAILED';
  expiryTimestamp: number;
  settlementPrice?: number;
  pnl?: number;
  txHash?: string;
}

export interface BotConfig {
  active: boolean;
  liveMode: boolean;                // Live Limitless Execution vs Dry-Run Simulation
  zScoreThreshold: number;          // Default 1.5 (range 1.5 - 1.8)
  momentumThreshold: number;        // Default 25.0 USD
  oiDropThreshold: number;          // Default 0.5%
  riskPercentage: number;           // Strict 10%
  priceFloor: number;               // $0.01
  priceCap: number;                 // $0.25
  goldenWindowStartSec: number;     // 210 (03:30)
  goldenWindowEndSec: number;       // 510 (08:30)
  limitlessTokenId: string;
  limitlessTokenSecret: string;
  limitlessWalletAddress: string;
}

export interface SystemHealth {
  binanceWsConnected: boolean;
  binanceLastMessageAt: number;
  limitlessApiConnected: boolean;
  limitlessLatencyMs: number;
  rssMemoryMB: number;
  heapUsedMB: number;
  candleCount: number;              // Exactly capped at 100
  uptimeSeconds: number;
  isWalletConnected?: boolean;
}

export interface ExecutionLog {
  id: string;
  timestamp: number;
  level: 'INFO' | 'WARN' | 'TRIGGER' | 'EXECUTION' | 'SETTLEMENT';
  message: string;
  data?: Record<string, unknown>;
}

export interface FullBotState {
  config: BotConfig;
  health: SystemHealth;
  metrics: QuantMetrics;
  window: ContractWindow;
  contract: LimitlessContract;
  walletBalance: number;
  isWalletConnected: boolean;
  walletAddress: string;
  ethGasBalance?: number;
  positions: Position[];
  logs: ExecutionLog[];
  candles: Candle[];
}
