/**
 * @file types.ts
 * @description نماذج البيانات المحدثة بناءً على توثيق API Tokens & Scopes
 * يشمل ثوابت الصلاحيات Scope Constants، وإدارة مفاتيح HMAC Tokens، والمحفظة ودفتر الأوامر.
 */

export enum OrderType {
  FOK = 'FOK',
  FAK = 'FAK',
  GTC = 'GTC',
}

export enum Side {
  BUY = 0,
  SELL = 1,
}

// ==========================================
// 1. ثوابت الصلاحيات ونماذج رموز API (API Tokens & Scopes)
// ==========================================

export const ScopeTrading = 'trading';
export const ScopeAccountCreation = 'account_creation';
export const ScopeDelegatedSigning = 'delegated_signing';
export const ScopeWithdrawal = 'withdrawal';

export type LimitlessScope = 'trading' | 'account_creation' | 'delegated_signing' | 'withdrawal';

export interface ApiTokenRecord {
  tokenId: string;
  label: string;
  scopes: LimitlessScope[];
  createdAt?: string;
  lastUsedAt?: string;
  revoked?: boolean;
}

export interface DerivedTokenResult {
  tokenId: string;
  secret: string; // Base64 HMAC secret
  scopes: LimitlessScope[];
  profile: {
    id: number;
    account: string;
  };
}

export interface PartnerCapabilities {
  tokenManagementEnabled: boolean;
  allowedScopes: LimitlessScope[];
}

// ==========================================
// 2. هياكل المحفظة والمراكز (Portfolio & Positions)
// ==========================================

export interface UserProfile {
  id: number;
  account: string;
  rank?: {
    feeRateBps: number;
    title?: string;
  };
  accumulativePoints?: number;
}

export interface PositionSide {
  cost: string;
  fillPrice: string;
  marketValue: string;
  realisedPnl: string;
  unrealizedPnl: string;
}

export interface ClobPosition {
  market: {
    id: number | string;
    slug: string;
    title: string;
    closed: boolean;
    deadline: string;
  };
  makerAddress: string;
  positions: {
    yes: PositionSide;
    no: PositionSide;
  };
  tokensBalance: {
    yes: string;
    no: string;
  };
  latestTrade: {
    latestYesPrice: number;
    latestNoPrice: number;
    outcomeTokenPrice: number;
  };
  orders?: {
    liveOrders: unknown[];
    totalCollateralLocked: string;
  };
}

export interface TradeHistoryEntry {
  blockTimestamp: number;
  market: {
    id: number | string;
    slug: string;
    title: string;
    deadline: string;
  };
  outcomeIndex: 0 | 1;
  outcomeTokenAmount: string;
  outcomeTokenAmounts?: string[];
  outcomeTokenPrice: number;
  collateralAmount: string;
  strategy: string;
  transactionHash: string;
  orderId?: string;
  tradeEventId?: string;
}

// ==========================================
// 3. هياكل التداول والأوامر (Trading & OrderClient)
// ==========================================

export interface OrderMakerMatch {
  makerOrderId: string;
  matchedPrice: number;
  matchedSize: number;
  feeAmountUsdc?: number;
}

export interface OrderExecutionSummary {
  settlementStatus: 'UNMATCHED' | 'MATCHED' | 'MINED' | 'CONFIRMED' | 'RETRYING' | 'FAILED' | 'DELAYED' | 'CANCELED';
  terminalStatus: 'FILLED' | 'PARTIALLY_FILLED' | 'KILLED';
  makerMatches: OrderMakerMatch[];
  filledContracts: number;
  averageExecutionPrice: number;
  totalCostUsdc: number;
  reason?: string;
}

export interface VenueApprovalInfo {
  tokenAddress: string;
  venueExchange: string;
  isApproved: boolean;
  allowance: string;
}

// ==========================================
// 4. هياكل استكشاف الصفحات والأسواق (Market Navigation & Pages)
// ==========================================

export interface NavigationNode {
  id: string;
  name: string;
  slug: string;
  path: string;
  icon?: string;
  children: NavigationNode[];
}

export interface BreadcrumbItem {
  name: string;
  path: string;
}

export interface FilterGroupOption {
  label: string;
  value: string | number;
  count?: number;
}

export interface FilterGroup {
  id: string;
  name: string;
  slug: string;
  type: 'select' | 'multi-select';
  options: FilterGroupOption[];
}

export interface MarketPage {
  id: string;
  name: string;
  slug: string;
  fullPath: string;
  description?: string;
  baseFilter: Record<string, unknown>;
  filterGroups: FilterGroup[];
  metadata: Record<string, unknown>;
  breadcrumb: BreadcrumbItem[];
}

export interface MarketPageQueryOptions {
  page?: number;
  limit?: number;
  sort?: 'createdAt' | '-createdAt' | 'updatedAt' | '-updatedAt' | 'deadline' | '-deadline' | 'id' | '-id';
  cursor?: string;
  filters?: Record<string, string | number | boolean | Array<string | number>>;
}

export interface MarketPageResult {
  data: Market[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  cursor?: {
    nextCursor?: string;
  };
}

// ==========================================
// 5. هياكل بيانات الأسواق الرسمية (Official Market Structures)
// ==========================================

export interface MarketVenue {
  exchange: string;
  adapter: string | null;
}

export interface MarketTokens {
  yes: string;
  no: string;
}

export interface Market {
  id?: string | number;
  slug: string;
  title: string;
  description?: string;
  category?: string;
  venue: MarketVenue;
  tokens: MarketTokens;
  openInterest?: string;
  liquidity?: string;
  imageUrl?: string | null;
  automationType?: 'manual' | 'lumy' | 'sports';
  closed?: boolean;
  deadline?: string;
  updatedAt?: string;
  createdAt?: string;
}

export interface OrderbookLevel {
  price: number;
  size: number;
  side: 'BUY' | 'SELL';
  totalCost?: number;
}

export interface OrderBook {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  tokenId: string;
  adjustedMidpoint: number;
  midpoint: number;
  maxSpread: string;
  minSize: string;
  lastTradePrice: number | null;
  timestamp?: number;
}

// ==========================================
// 6. إعدادات البوت والبارامترات
// ==========================================

export interface BollingerBandsConfig {
  period: number;
  stdDev: number;
}

export interface RsiConfig {
  period: number;
  overboughtThreshold: number;
  oversoldThreshold: number;
}

export interface BotConfig {
  symbol: string;
  candleTimeframe: '1m';
  marketDurationMinutes: 15;
  maxEntryPrice: number;
  bollingerBands: BollingerBandsConfig;
  rsi: RsiConfig;
  tradeSizeUsdc: number;
  maxSlippagePercent: number;
  apiBaseUrl: string;
  lmtsTokenId?: string;
  lmtsTokenSecret?: string;
  privateKey?: string;
  walletAddress: string;
  chainId: number;
  limitlessExchangeAddress: string;
}

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BollingerBandsValues {
  upper: number;
  middle: number;
  lower: number;
  pb?: number;
}

export type SignalType = 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL';
export type ContractTokenType = 'YES' | 'NO';

export interface SignalEvaluation {
  signal: SignalType;
  currentPrice: number;
  rsi: number;
  bollingerBands: BollingerBandsValues;
  isOverbought: boolean;
  isOversold: boolean;
  explanationArabic: string;
  explanationEnglish?: string;
  evaluatedAt: number;
}

// ==========================================
// 7. هياكل EIP-712 Order & Reports
// ==========================================

export interface EIP712Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: string;
}

export interface LimitlessOrderMessage {
  salt: string;
  maker: string;
  taker: string;
  tokenId: string;
  makerAmount: string;
  takerAmount: string;
  price: string;
  side: 0 | 1;
  orderType: 1;
  expiration: string;
  nonce: string;
}

export interface EIP712OrderPayload {
  domain: EIP712Domain;
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: 'Order';
  message: LimitlessOrderMessage;
}

export interface StrategyExecutionReport {
  timestamp: number;
  signal: SignalEvaluation;
  marketSelected?: Market;
  targetedToken?: ContractTokenType;
  targetTokenId?: string;
  orderbookSnapshot?: {
    bestAskPrice: number;
    bestAskSize: number;
    asksUnderThresholdCount: number;
    spread: number;
    midpoint: number;
  };
  orderPayload?: EIP712OrderPayload;
  signature?: string;
  executionResult?: OrderExecutionSummary;
  executed: boolean;
  status: 'EXECUTED' | 'NO_SIGNAL' | 'PRICE_EXCEEDS_MAX' | 'INSUFFICIENT_LIQUIDITY' | 'ERROR';
  executionPrice?: number;
  contractsFilled?: number;
  totalCostUsdc?: number;
  potentialPayoutUsdc?: number;
  asymmetricMultiplier?: string;
  messageArabic: string;
  messageEnglish: string;
}
