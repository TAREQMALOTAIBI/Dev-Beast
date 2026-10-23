export interface BotConfig {
  symbol: string;
  timeframe: string;
  periods: number;
  zScoreUpper: number;
  zScoreEntry: number;
  maxPriceCents: number;
  maxRiskPercent: number;
  orderType: 'GTC' | 'IOC' | 'FOK';
  fractionChunks: number;
  chunkDelayMs: number;
  winProbability: number;
  initialBalance: number;
  binanceRestUrl: string;
  binanceWsUrl: string;
  limitlessWsUrl: string;
  limitlessApiKey: string;
}

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isClosed?: boolean;
}

export interface ZScoreMetric {
  time: number;
  price: number;
  mean: number;
  stdDev: number;
  variance: number;
  zScore: number;
  upperBand: number;
  entryBand: number;
  lowerBand: number;
  upperThreshold: number;
  entryThreshold: number;
  lowerThreshold: number;
  signal?: 'ARMED' | 'ENTRY' | null;
}

export interface KellyMath {
  b: number; // payout odds = (1.00 - maxPrice) / maxPrice
  p: number; // win probability
  q: number; // 1 - p
  kellyFraction: number; // (b*p - q) / b
  riskToTake: number; // min(max(kellyFraction, 0), maxRiskPercent)
  positionSizeUsd: number; // balance * riskToTake
  numberOfContracts: number; // floor(positionSizeUsd / maxPrice)
  chunkSize: number;
  lastChunkSize: number;
}

export interface ExecutedChunk {
  chunkId: number;
  totalChunks: number;
  contracts: number;
  price: number;
  status: 'QUEUED' | 'SENDING' | 'SENT' | 'FILLED' | 'FAILED';
  delayMs: number;
  timestamp: number;
  payload: {
    action: string;
    market: string;
    side: string;
    type: string;
    price: number;
    size: number;
    chunkId: number;
  };
}

export interface TradeOrder {
  id: string;
  timestamp: number;
  symbol: string;
  market: string;
  triggerZScore: number;
  contractPrice: number;
  totalContracts: number;
  totalInvestmentUsd: number;
  kellyRiskPct: number;
  chunks: ExecutedChunk[];
  status: 'PENDING_WS' | 'TRANSMITTED' | 'ACTIVE_GTC' | 'CONFIRMED_FILLED' | 'REJECTED';
  exchangeOrderId?: string;
}

export interface WsMessageLog {
  id: string;
  direction: 'INCOMING' | 'OUTGOING' | 'SYSTEM';
  channel: 'BINANCE' | 'LIMITLESS';
  timestamp: number;
  data: Record<string, unknown> | string;
}
