export interface BotConfig {
  symbol: string;
  timeframe: string;
  periods: number;
  strategyDirection: 'BOTH' | 'LONG_ONLY' | 'SHORT_ONLY'; // Bidirectional or Directional
  zScoreUpper: number; // Upper armed threshold (e.g. +2.0)
  zScoreEntry: number; // Upper entry threshold for Short/Down (e.g. +1.9)
  zScoreLower: number; // Lower armed threshold for Long/Up (e.g. -2.0)
  zScoreLowerEntry: number; // Lower entry threshold for Long/Up (e.g. -1.9)
  maxPriceCents: number;
  maxRiskPercent: number;
  orderType: 'FAK' | 'IOC' | 'GTC' | 'FOK';
  fractionChunks: number;
  chunkDelayMs: number;
  winProbability: number;
  initialBalance: number;
  binanceRestUrl: string;
  binanceWsUrl: string;
  limitlessWsUrl: string; // 'wss://ws.limitless.exchange'
  limitlessMarketSlug: string; // e.g. 'btc-100k-weekly' or 'btc-15m-prediction'
  limitlessApiKey: string;
  limitlessTokenId: string;
  limitlessTokenSecret: string;
  walletAddress?: string;
  privateKey?: string;
  singleTradePerContract?: boolean; // Strictly max 1 trade per 15-minute contract
  cooldownMinutes?: number; // Minimum cooldown period between trades in minutes
}

export interface LimitlessMarketDetails {
  slug: string;
  title: string;
  status: string;
  prices?: [number, number]; // [yesPrice, noPrice]
  tradePrices?: {
    buy?: { market?: [number, number]; limit?: [number, number] };
    sell?: { market?: [number, number]; limit?: [number, number] };
  };
  address?: string;
  expirationTimestamp?: number;
  startAt?: string;
  openPrice?: string | number; // "Price to Beat"
  tokens?: { yes: string; no: string };
  venueExchange?: string;
  volumeFormatted?: string;
  oracleSource?: string;
}

export interface LiveWalletInfo {
  isLive: boolean;
  address: string;
  usdcBalance: number;
  ethBalance: number;
  network: string;
  username?: string;
  points?: number;
  rank?: string;
  lastUpdated: number;
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
  lowerEntryBand: number;
  lowerBand: number;
  upperThreshold: number;
  entryThreshold: number;
  lowerThreshold: number;
  lowerEntryThreshold: number;
  ema20?: number;
  ema50?: number;
  signal?: 'ARMED_UPPER' | 'ARMED_LOWER' | 'ENTRY_SHORT' | 'ENTRY_LONG' | 'ARMED' | 'ENTRY' | null;
  direction?: 'SHORT' | 'LONG' | null;
}

export interface EmaFilterState {
  ema20: number;
  ema50: number;
  trend: 'BULLISH' | 'BEARISH';
  longAllowed: boolean; // 1h EMA(20) > 1h EMA(50)
  shortAllowed: boolean; // 1h EMA(20) < 1h EMA(50)
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
  direction?: 'SHORT' | 'LONG';
  status: 'QUEUED' | 'SENDING' | 'SENT' | 'FILLED' | 'FAILED';
  delayMs: number;
  timestamp: number;
  payload: {
    action: string;
    market: string;
    side: string;
    direction?: 'SHORT' | 'LONG';
    outcome?: string;
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
  direction: 'SHORT' | 'LONG'; // SHORT: overbought pullback / LONG: oversold rebound
  triggerZScore: number;
  contractPrice: number;
  totalContracts: number;
  totalInvestmentUsd: number;
  kellyRiskPct: number;
  chunks: ExecutedChunk[];
  status: 'PENDING_WS' | 'TRANSMITTED' | 'ACTIVE_GTC' | 'EXECUTED_FAK' | 'CONFIRMED_FILLED' | 'REJECTED';
  exchangeOrderId?: string;
  outcome?: string;
}

export interface WsMessageLog {
  id: string;
  direction: 'INCOMING' | 'OUTGOING' | 'SYSTEM';
  channel: 'BINANCE' | 'LIMITLESS';
  timestamp: number;
  data: Record<string, unknown> | string;
}

// Re-export official Limitless Exchange Data Structures from @limitless-exchange/sdk
export type {
  OrderbookUpdate,
  OraclePriceData,
  OrderEvent,
  TransactionEvent,
} from '@limitless-exchange/sdk';

export interface PositionItem {
  tokenId: string;
  marketId: number | string;
  ctfBalance: string;
  marketValue: string;
  averageFillPrice: string;
  costBasis: string;
}
