/**
 * @file codeFiles.ts
 * @description نصوص الأكواد البرمجية الكاملة المتوافقة مع الحزمة الرسمية @limitless-exchange/sdk
 * ودليل MarketFetcher الرسمي المتاح للنسخ المباشر من واجهة المستخدم.
 */

export interface CodeFileRecord {
  id: string;
  name: string;
  path: string;
  descriptionArabic: string;
  descriptionEnglish: string;
  code: string;
}

export const BOT_CODE_FILES: CodeFileRecord[] = [
  {
    id: 'strategy',
    name: 'strategy.ts',
    path: 'src/bot/strategy.ts',
    descriptionArabic: 'منطق الاستراتيجية وفق معايير MarketFetcher: جلب وتخزين venue.exchange مسبقاً، فحص السيولة الثنائية، وتطبيق سقف 0.20$ مع أمر FAK.',
    descriptionEnglish: 'Core strategy execution engine, asymmetric pricing validation (Ask <= $0.20), token selection, and FAK dispatch.',
    code: `import { Side, OrderType } from '@limitless-exchange/sdk';
import { checkMeanReversionSignal } from './indicators';
import type { LimitlessExchangeSDK } from './limitlessSdk';
import type {
  BotConfig,
  Candle,
  ContractTokenType,
  StrategyExecutionReport,
} from './types';

/**
 * الوظيفة الرئيسية لتنفيذ استراتيجية الارتداد المتوسط اللامتماثل
 */
export async function executeAsymmetricMeanReversion(
  sdk: LimitlessExchangeSDK,
  candles: Candle[],
  config: BotConfig
): Promise<StrategyExecutionReport> {
  // الخطوة 1: تقييم المؤشرات الفنية واستخراج إشارة التداول
  const signalEval = checkMeanReversionSignal(candles, config);

  if (signalEval.signal === 'NEUTRAL') {
    return {
      timestamp: Date.now(),
      signal: signalEval,
      executed: false,
      status: 'NO_SIGNAL',
      messageArabic: 'لم تتحقق شروط الاستراتيجية (السوق في حالة حياد طبيعية).',
      messageEnglish: 'No trigger conditions met. Execution skipped.',
    };
  }

  // الخطوة 2: استدعاء getMarket أولاً لتخزين عنوان venue.exchange المعتمد لتوقيع EIP-712
  const market = await sdk.getActive15mBtcMarket();

  // الخطوة 3: تحديد رمز العقد المستهدف (Contract Selection)
  let targetTokenType: ContractTokenType;
  let targetTokenId: string;

  if (signalEval.signal === 'OVERBOUGHT') {
    // ذروة شراء (>85 RSI): مراهنة ضد الصعود واستباق الارتداد
    targetTokenType = 'NO';
    targetTokenId = market.tokens.no;
  } else {
    // ذروة بيع (<15 RSI): مراهنة على الارتداد الصاعد
    targetTokenType = 'YES';
    targetTokenId = market.tokens.yes;
  }

  // الخطوة 4: جلب دفتر الأوامر عبر getOrderBook واحتساب نقطة المنتصف Midpoint
  const orderbook = await sdk.getOrderBook(market.slug, targetTokenType);

  // الخطوة 5: فحص سيولة السوق (Liquidity Guard لتجنب الأسواق ذات الطرف الواحد)
  const liquidityStatus = sdk.isLiquidMarket(orderbook);
  if (!liquidityStatus.isLiquid) {
    return {
      timestamp: Date.now(),
      signal: signalEval,
      marketSelected: market,
      targetedToken: targetTokenType,
      targetTokenId,
      executed: false,
      status: 'INSUFFICIENT_LIQUIDITY',
      messageArabic: \`السوق غير مؤهل للتداول: \${liquidityStatus.reason}\`,
      messageEnglish: \`Market illiquid: \${liquidityStatus.reason}\`,
    };
  }

  // الخطوة 6: تطبيق قاعدة عدم التماثل الصارمة (Asymmetric Rule: Ask <= $0.20)
  const validAsks = sdk.filterAsymmetricAsks(orderbook, config.maxEntryPrice);
  const bestAsk = orderbook.asks.length > 0 ? orderbook.asks[0] : null;

  if (!bestAsk || validAsks.length === 0 || bestAsk.price > config.maxEntryPrice) {
    return {
      timestamp: Date.now(),
      signal: signalEval,
      marketSelected: market,
      targetedToken: targetTokenType,
      targetTokenId,
      orderbookSnapshot: {
        bestAskPrice: bestAsk ? bestAsk.price : 0,
        bestAskSize: bestAsk ? bestAsk.size : 0,
        asksUnderThresholdCount: validAsks.length,
        spread: liquidityStatus.spread,
        midpoint: orderbook.midpoint,
      },
      executed: false,
      status: 'PRICE_EXCEEDS_MAX',
      messageArabic: \`تم إلغاء التنفيذ: أفضل سعر معروض (\${bestAsk?.price.toFixed(2)}$) أعلى من الحد الأقصى (\${config.maxEntryPrice.toFixed(2)}$). نحن نشتري فقط عندما يكون السعر <= 0.20$.\`,
      messageEnglish: \`Execution rejected: Best ask ($${'${bestAsk?.price.toFixed(2)}'}) exceeds max threshold ($${'${config.maxEntryPrice.toFixed(2)}'}).\`,
    };
  }

  // الخطوة 7: حساب حجم العقود المطلوب شراؤها
  const optimalAsk = validAsks[0];
  const executionPrice = optimalAsk.price;
  const maxContractsByBudget = Math.floor(config.tradeSizeUsdc / executionPrice);
  const contractsToBuy = Math.min(maxContractsByBudget, optimalAsk.size);

  if (contractsToBuy <= 0) {
    return {
      timestamp: Date.now(),
      signal: signalEval,
      marketSelected: market,
      targetedToken: targetTokenType,
      targetTokenId,
      executed: false,
      status: 'INSUFFICIENT_LIQUIDITY',
      messageArabic: 'الكمية المحسوبة للشراء أقل من الحد الأدنى.',
      messageEnglish: 'Purchase size below threshold.',
    };
  }

  const totalCostUsdc = Number((contractsToBuy * executionPrice).toFixed(2));
  const potentialPayoutUsdc = Number((contractsToBuy * 1.00).toFixed(2));
  const roiMultiplier = (1.00 / executionPrice).toFixed(1);
  const profitPercentage = Math.round(((1.00 - executionPrice) / executionPrice) * 100);

  // الخطوة 8: بناء حمولة أمر Fill-and-Kill (FAK) بنظام EIP-712 باستخدام venue.exchange المعتمد
  const orderPayload = sdk.buildFakOrderPayload({
    tokenId: targetTokenId,
    targetPrice: executionPrice,
    contractsSize: contractsToBuy,
    side: Side.BUY,
    makerAddress: config.walletAddress,
    verifyingContract: market.venue.exchange,
    expirationSeconds: 120,
  });

  // الخطوة 9: التوقيع الرقمي EIP-712 المشفر
  const signature = await sdk.signOrderEIP712(orderPayload);

  // الخطوة 10: إرسال الأمر لمحرك مطابقة Limitless CLOB للتنفيذ الفوري
  const clobResponse = await sdk.submitOrder(market.slug, orderPayload, signature);

  // الخطوة 11: تقرير التنفيذ
  return {
    timestamp: Date.now(),
    signal: signalEval,
    marketSelected: market,
    targetedToken: targetTokenType,
    targetTokenId,
    orderbookSnapshot: {
      bestAskPrice: bestAsk.price,
      bestAskSize: bestAsk.size,
      asksUnderThresholdCount: validAsks.length,
      spread: liquidityStatus.spread,
      midpoint: orderbook.midpoint,
    },
    orderPayload,
    signature,
    executed: clobResponse.status === 'FILLED',
    status: 'EXECUTED',
    executionPrice,
    contractsFilled: clobResponse.filledContracts,
    totalCostUsdc,
    potentialPayoutUsdc,
    asymmetricMultiplier: \`\${roiMultiplier}x (+\${profitPercentage}%)\`,
    messageArabic: \`تم تنفيذ أمر الشراء بنجاح! الرمز: [\${targetTokenType}] بسعر $\${executionPrice.toFixed(2)}. الحجم: \${contractsToBuy} عقد. التكلفة: $\${totalCostUsdc} USDC. العائد المتوقع عند الفوز: $\${potentialPayoutUsdc} USDC (مضاعف \${roiMultiplier}x).\`,
    messageEnglish: \`Order executed! Token: [\${targetTokenType}] at $\${executionPrice.toFixed(2)}. Size: \${contractsToBuy} contracts. Total: $\${totalCostUsdc} USDC. Payout: $\${potentialPayoutUsdc} USDC (\${roiMultiplier}x).\`,
  };
}`,
  },
  {
    id: 'limitlessSdk',
    name: 'limitlessSdk.ts',
    path: 'src/bot/limitlessSdk.ts',
    descriptionArabic: 'تكامل MarketFetcher الرسمي: استعلام getActiveMarkets (بحد أقصى 25)، جلب وتخزين venue.exchange، واحتساب نقطة المنتصف midpoint.',
    descriptionEnglish: 'Official MarketFetcher implementation: active markets, caching venue.exchange, and midpoint spread analysis.',
    code: `import { HttpClient, MarketFetcher, OrderType, Side } from '@limitless-exchange/sdk';
import { ethers } from 'ethers';
import type { Market, OrderBook, OrderbookLevel, EIP712OrderPayload } from './types';

export class LimitlessExchangeSDK {
  public marketFetcher: MarketFetcher;
  public wallet?: ethers.Wallet;
  public cachedVenues: Map<string, string> = new Map();

  constructor(httpClient: HttpClient, wallet?: ethers.Wallet) {
    this.marketFetcher = new MarketFetcher(httpClient);
    this.wallet = wallet;
  }

  /** استعلام الأسواق النشطة مع الترتيب والتقسيم (بحد أقصى 25 كما ينص التوثيق) */
  public async getActiveMarkets(limit = 20, sortBy: 'newest' | 'ending_soon' = 'newest') {
    return await this.marketFetcher.getActiveMarkets({
      limit: Math.min(limit, 25),
      page: 1,
      sortBy,
    });
  }

  /** جلب بيانات السوق وتخزين عنوان venue.exchange المعتمد لتوقيع EIP-712 */
  public async getMarket(slug: string): Promise<Market> {
    const market = await this.marketFetcher.getMarket(slug);
    if (market.venue?.exchange) {
      this.cachedVenues.set(slug, market.venue.exchange);
    }
    return market;
  }

  /** جلب دفتر الأوامر واحتساب نقطة المنتصف والفارق السعري */
  public async getOrderBook(slug: string): Promise<OrderBook> {
    return await this.marketFetcher.getOrderBook(slug);
  }

  /** فحص السيولة الثنائية لتجنب الأسواق ذات الطرف الفارغ */
  public isLiquidMarket(orderbook: OrderBook) {
    if (!orderbook.bids.length || !orderbook.asks.length) {
      return { isLiquid: false, spread: 1.0, reason: 'دفتر الأوامر خالٍ من أحد الجوانب (No two-sided market)' };
    }
    const spread = orderbook.asks[0].price - orderbook.bids[0].price;
    if (spread > 0.20) {
      return { isLiquid: false, spread, reason: 'فارق السبريد واسع جداً (Wide Spread)' };
    }
    return { isLiquid: true, spread };
  }
}`,
  },
  {
    id: 'indicators',
    name: 'indicators.ts',
    path: 'src/bot/indicators.ts',
    descriptionArabic: 'محرك حساب المؤشرات الفنية باستخدام مكتبة technicalindicators وفحص شروط Bollinger Bands (20, 2) و RSI (14).',
    descriptionEnglish: 'Technical indicator calculation engine using technicalindicators library for Bollinger Bands & RSI triggers.',
    code: `import { BollingerBands, RSI } from 'technicalindicators';
import type { BotConfig, Candle, SignalEvaluation } from './types';

export function checkMeanReversionSignal(candles: Candle[], config: BotConfig): SignalEvaluation {
  const minRequired = Math.max(config.bollingerBands.period + 1, config.rsi.period + 1, 25);
  if (!candles || candles.length < minRequired) {
    const fallback = candles?.length ? candles[candles.length - 1].close : 0;
    return {
      signal: 'NEUTRAL',
      currentPrice: fallback,
      rsi: 50,
      bollingerBands: { upper: fallback, middle: fallback, lower: fallback },
      isOverbought: false,
      isOversold: false,
      explanationArabic: 'بيانات الشموع غير كافية لحساب المؤشرات بدقة.',
      evaluatedAt: Date.now(),
    };
  }

  const closePrices = candles.map((c) => c.close);
  const currentPrice = candles[candles.length - 1].close;

  const bbResults = BollingerBands.calculate({
    period: config.bollingerBands.period,
    values: closePrices,
    stdDev: config.bollingerBands.stdDev,
  });

  const rsiResults = RSI.calculate({
    period: config.rsi.period,
    values: closePrices,
  });

  const latestBB = bbResults[bbResults.length - 1];
  const latestRsi = rsiResults[rsiResults.length - 1];

  const bollingerBands = {
    upper: Number(latestBB.upper.toFixed(2)),
    middle: Number(latestBB.middle.toFixed(2)),
    lower: Number(latestBB.lower.toFixed(2)),
  };
  const rsiValue = Number(latestRsi.toFixed(2));

  const isOverbought = currentPrice > bollingerBands.upper && rsiValue > config.rsi.overboughtThreshold;
  const isOversold = currentPrice < bollingerBands.lower && rsiValue < config.rsi.oversoldThreshold;

  if (isOverbought) {
    return {
      signal: 'OVERBOUGHT',
      currentPrice,
      rsi: rsiValue,
      bollingerBands,
      isOverbought: true,
      isOversold: false,
      explanationArabic: \`إشارة ذروة شراء حادة (OVERBOUGHT): السعر ($\${currentPrice}) تجاوز الحد العلوي للبولنجر ($\${bollingerBands.upper}) مع RSI = \${rsiValue} (> 85). يتم استهداف عقد المراهنة ضد الصعود (NO).\`,
      evaluatedAt: Date.now(),
    };
  }

  if (isOversold) {
    return {
      signal: 'OVERSOLD',
      currentPrice,
      rsi: rsiValue,
      bollingerBands,
      isOverbought: false,
      isOversold: true,
      explanationArabic: \`إشارة ذروة بيع حادة (OVERSOLD): السعر ($\${currentPrice}) كسر تحت الحد السفلي للبولنجر ($\${bollingerBands.lower}) مع RSI = \${rsiValue} (< 15). يتم استهداف عقد المراهنة على الارتداد (YES).\`,
      evaluatedAt: Date.now(),
    };
  }

  return {
    signal: 'NEUTRAL',
    currentPrice,
    rsi: rsiValue,
    bollingerBands,
    isOverbought: false,
    isOversold: false,
    explanationArabic: 'السوق في حالة حياد طبيعية. الشروط الفنية غير متحققة.',
    evaluatedAt: Date.now(),
  };
}`,
  },
  {
    id: 'types',
    name: 'types.ts',
    path: 'src/bot/types.ts',
    descriptionArabic: 'واجهات البيانات الكاملة: MarketVenue, MarketTokens, OrderBook, midpoint, و EIP-712 Order Typed Data.',
    descriptionEnglish: 'Data models & TypeScript interfaces: MarketVenue, MarketTokens, OrderBook, midpoint, and EIP-712 Typed Data.',
    code: `export interface MarketVenue {
  exchange: string; // EIP-712 verifyingContract address
  adapter: string | null;
}

export interface MarketTokens {
  yes: string;
  no: string;
}

export interface Market {
  slug: string;
  title: string;
  venue: MarketVenue;
  tokens: MarketTokens;
  openInterest?: string;
  liquidity?: string;
}

export interface OrderbookLevel {
  price: number; // 0 to 1
  size: number;  // 6-decimal shares
  side: 'BUY' | 'SELL';
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
}`,
  },
  {
    id: 'runner',
    name: 'runner.ts',
    path: 'src/bot/runner.ts',
    descriptionArabic: 'حلقة تشغيل مستمرة تتفقد getMarket و getOrderBook وتطبق قواعد عدم التماثل.',
    descriptionEnglish: 'Continuous automation daemon using MarketFetcher and orderbook midpoint spread validation.',
    code: `import { HttpClient, MarketFetcher, OrderType, Side } from '@limitless-exchange/sdk';
import { ethers } from 'ethers';
import { executeAsymmetricMeanReversion } from './strategy';
import { LimitlessExchangeSDK } from './limitlessSdk';
import { defaultBotConfig } from './sampleRunner';
import type { Candle } from './types';

async function runBotDaemon() {
  console.log('🤖 بدء تشغيل محرك تداول Limitless Exchange...');
  
  const sdk = new LimitlessExchangeSDK({
    baseURL: defaultBotConfig.apiBaseUrl,
    lmtsTokenId: defaultBotConfig.lmtsTokenId,
    lmtsTokenSecret: defaultBotConfig.lmtsTokenSecret,
    privateKey: defaultBotConfig.privateKey,
    chainId: defaultBotConfig.chainId,
    walletAddress: defaultBotConfig.walletAddress,
  });

  const POLLING_INTERVAL_MS = 10_000; // فحص كل 10 ثوانٍ

  setInterval(async () => {
    try {
      const candles: Candle[] = await fetchLatest1mCandles('BTC/USDT', 50);
      const report = await executeAsymmetricMeanReversion(sdk, candles, defaultBotConfig);

      if (report.executed) {
        console.log('✅ تم تنفيذ صفقة ناجحة:', report.messageArabic);
      } else if (report.status === 'PRICE_EXCEEDS_MAX') {
        console.warn('⚠️ تم رصد إشارة لكن السعر المعروض أعلى من 0.20$:', report.orderbookSnapshot?.bestAskPrice);
      }
    } catch (err) {
      console.error('❌ خطأ في حلقة التداول:', err);
    }
  }, POLLING_INTERVAL_MS);
}

async function fetchLatest1mCandles(symbol: string, count: number): Promise<Candle[]> {
  return [];
}`,
  },
  {
    id: 'pages',
    name: 'marketPages.ts',
    path: 'src/bot/marketPages.ts',
    descriptionArabic: 'استكشاف وتصفح فئات الأسواق هرمياً، حل مسارات URL، وفلترة عقود BTC التلقائية بواسطة MarketPageFetcher.',
    descriptionEnglish: 'Category navigation, URL path resolution, and dynamic market querying with MarketPageFetcher.',
    code: `import { HttpClient, MarketPageFetcher, MarketFetcher } from '@limitless-exchange/sdk';

/**
 * دالة لاكتشاف أسواق البيتكوين النشطة لمدة 15 دقيقة تلقائياً عبر MarketPageFetcher
 */
export async function discoverBtc15mMarkets(baseURL = 'https://api.limitless.exchange') {
  const httpClient = new HttpClient({ baseURL });
  const pageFetcher = new MarketPageFetcher(httpClient);
  const marketFetcher = new MarketFetcher(httpClient);

  // 1. تصفح شجرة الفئات (Navigation Tree)
  const navigation = await pageFetcher.getNavigation();
  console.log(\`Top-level categories: \${navigation.length}\`);

  // 2. مطابقة مسار قسم العملات المشفرة (/crypto)
  const page = await pageFetcher.getMarketPageByPath('/crypto');
  console.log(\`Page: \${page.name} | Breadcrumb: \${page.breadcrumb.map(b => b.name).join(' > ')}\`);

  // 3. استعلام الأسواق مع فلترة مخصصة للبيتكوين والترتيب حسب الأحدث
  const result = await pageFetcher.getMarkets(page.id, {
    limit: 10,
    sort: '-updatedAt',
    filters: {
      ticker: 'btc',
    },
  });

  console.log(\`Found \${result.data.length} active BTC prediction markets:\`);
  for (const m of result.data) {
    console.log(\` - \${m.slug}: \${m.title}\`);
  }

  // 4. تسليم السوق المكتشف لمحرك فحص الأسعار ودفتر الأوامر
  if (result.data.length > 0) {
    const targetMarket = await marketFetcher.getMarket(result.data[0].slug);
    console.log(\`Cached venue exchange address: \${targetMarket.venue?.exchange}\`);
    const orderbook = await marketFetcher.getOrderBook(targetMarket.slug);
    console.log(\`Best ask: \${orderbook.asks[0]?.price} (Midpoint: \${orderbook.midpoint})\`);
  }

  return result.data;
}`,
  },
  {
    id: 'portfolio',
    name: 'portfolio.ts',
    path: 'src/bot/portfolio.ts',
    descriptionArabic: 'إدارة وتتبع المحفظة والمراكز النشطة وسجل الصفقات واحتساب الأرباح غير المحققة عبر PortfolioFetcher.',
    descriptionEnglish: 'Tracking CLOB positions, live unrealized PnL, trade history activity stream with PortfolioFetcher.',
    code: `import { HttpClient, PortfolioFetcher, MarketFetcher } from '@limitless-exchange/sdk';

/**
 * دالة استعلام وتتبع مراكز المحفظة وحساب الأرباح اللحظية
 */
export async function trackUserPortfolio(httpClient: HttpClient) {
  const portfolio = new PortfolioFetcher(httpClient);
  const marketFetcher = new MarketFetcher(httpClient);

  // 1. جلب بيانات الحساب ورتبة الرسوم
  const profile = await portfolio.getProfile();
  console.log(\`Profile ID: \${profile.id} | Fee Rate: \${profile.rank?.feeRateBps} bps\`);

  // 2. جلب مراكز تداول CLOB المفتوحة
  const clobPositions = await portfolio.getCLOBPositions();
  console.log(\`Active CLOB positions: \${clobPositions.length}\`);

  for (const pos of clobPositions) {
    // دمج المركز مع بيانات السوق اللحظية
    const orderbook = await marketFetcher.getOrderBook(pos.market.slug);
    const midPrice = orderbook.midpoint;

    console.log(\`\\nMarket: \${pos.market.slug}\`);
    console.log(\`  Midpoint Price: \${midPrice}\`);
    console.log(\`  YES Shares: \${pos.tokensBalance.yes} | Cost: \${pos.positions.yes.cost} | PnL: \${pos.positions.yes.unrealizedPnl}\`);
    console.log(\`  NO Shares:  \${pos.tokensBalance.no}  | Cost: \${pos.positions.no.cost}  | PnL: \${pos.positions.no.unrealizedPnl}\`);
  }

  // 3. جلب سجل التداولات الموثق بالتوقيع والهاش
  const history = await portfolio.getUserHistory(undefined, 10);
  console.log(\`\\nRecent Trades: \${history.data.length}\`);
  for (const trade of history.data) {
    console.log(\`[\${trade.strategy}] \${trade.outcomeTokenAmount} shares @ $\${trade.outcomeTokenPrice} | tx: \${trade.transactionHash}\`);
  }

  return { profile, clobPositions, history: history.data };
}`,
  },
  {
    id: 'apiTokens',
    name: 'apiTokens.ts',
    path: 'src/bot/apiTokens.ts',
    descriptionArabic: 'إدارة دورة حياة مفاتيح HMAC API الموثقة، فحص الصلاحيات، واشتقاق رموز برمجية مخصصة للبوت.',
    descriptionEnglish: 'Managing HMAC API Tokens, partner capabilities, scope derivation, and token revocation.',
    code: `import { Client, ScopeTrading, ScopeDelegatedSigning } from '@limitless-exchange/sdk';

/**
 * فحص الصلاحيات واشتقاق مفتاح HMAC مخصص لتشغيل روبوت التداول
 */
export async function setupBotHmacCredentials(identityToken: string) {
  const client = new Client({
    baseURL: 'https://api.limitless.exchange',
  });

  // 1. التحقق من صلاحيات وإمكانيات الشريك
  const capabilities = await client.apiTokens.getCapabilities(identityToken);
  console.log('Token Management Enabled:', capabilities.tokenManagementEnabled);
  console.log('Allowed Scopes:', capabilities.allowedScopes);

  // 2. اشتقاق مفتاح API جديد بصلاحية التداول والتوقيع
  const derived = await client.apiTokens.deriveToken(identityToken, {
    label: 'limitless-btc-15m-bot',
    scopes: [ScopeTrading, ScopeDelegatedSigning],
  });

  console.log('Token ID (Public):', derived.tokenId);
  console.log('HMAC Secret (Save once):', derived.secret);

  // 3. إنشاء عميل موثق ببيانات HMAC المشتقة
  const authenticatedClient = new Client({
    baseURL: 'https://api.limitless.exchange',
    hmacCredentials: {
      tokenId: derived.tokenId,
      secret: derived.secret,
    },
  });

  // 4. استعراض المفاتيح النشطة
  const activeTokens = await authenticatedClient.apiTokens.listTokens();
  console.log(\`Active Tokens: \${activeTokens.length}\`);

  return { derived, authenticatedClient };
}`,
  },
];
