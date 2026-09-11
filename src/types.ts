export interface BotConfigState {
  rpcUrl: string;
  walletAddress: string;
  walletBalance?: number;
  privateKey: string;
  isBotRunning: boolean; // Controls automated execution
  riskPerTrade: number; // e.g. 0.005 (0.50%)
  maxEntryPrice: number; // e.g. 0.10 ($0.10)
  maxSlippage: number; // e.g. 0.10 ($0.10)
  dynamicFlipProfit: number; // e.g. 3.00 (300%)
  sigmaThreshold: number; // e.g. 2.5 (2.5σ)
  rollingWindowSize: number; // e.g. 120 ticks/secs
  usdcAddress: string;
  limitlessRouter: string;
  btc5mMarketAddress: string;
  lmtsTokenId?: string;
  lmtsTokenSecret?: string;
  btcMarketSlug?: string;
  proxyUrl: string;
  remoteBotApiUrl: string;
}

export interface TickEvent {
  timestamp: number;
  price: number;
  qty: number;
  isBuyerMaker: boolean;
  delta: number;
  cvd: number;
  zScore: number;
  volumeVelocity: number;
}

export interface MomentumSpike {
  id: string;
  timestamp: number;
  direction: 'BUY_UP' | 'BUY_DOWN';
  zScore: number;
  price: number;
  delta: number;
  cvd: number;
}

export interface LimitlessPosition {
  id: string;
  timestamp: number;
  marketTitle: string;
  outcomeIndex: number;
  outcomeLabel: string;
  entryPrice: number;
  currentPrice: number;
  sizeUsd: number;
  sharesBought: number;
  targetPrice: number;
  targetProfitPercent: number;
  currentProfitPercent: number;
  status: 'OPEN' | 'DYNAMIC_FLIPPED' | 'EXPIRED';
  txHash: string;
  exitTxHash?: string;
  realizedPnlUsd?: number;
}

export interface TerminalLog {
  id: string;
  timestamp: string;
  level: 'INFO' | 'MOMENTUM' | 'WEB3' | 'EXEC' | 'FLIP' | 'WARN';
  message: string;
}

export interface ClobPosition {
  market: {
    title: string;
    slug?: string;
  };
  size: string | number;
  outcomeIndex?: number;
}

export interface AmmPosition {
  market: {
    title: string;
    slug?: string;
  };
  size: string | number;
}

export interface LivePortfolioData {
  profile?: {
    id: number | string;
    account: string;
    rank?: {
      feeRateBps?: number;
    };
  };
  clob: ClobPosition[];
  amm: AmmPosition[];
  accumulativePoints?: Record<string, any>;
}
