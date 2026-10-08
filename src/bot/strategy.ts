/**
 * @file strategy.ts
 * @description محرك تنفيذ استراتيجية الارتداد المتوسط اللامتماثل (Asymmetric Mean Reversion)
 * متوافق بالكامل مع توثيق Trading & Orders:
 * - التحقق من سلامة السعر (0 < price < 1) والحجم
 * - فحص اعتماد عملة USDC لعقد venue.exchange
 * - تنفيذ أمر FAK الفوري واحتساب مطابقات makerMatches وحالة التسوية CONFIRMED.
 */

import { Side } from './types';
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
  // الخطوة 1: تقييم المؤشرات الفنية للشموع الحالية
  const signalEval = checkMeanReversionSignal(candles, config);

  if (signalEval.signal === 'NEUTRAL') {
    return {
      timestamp: Date.now(),
      signal: signalEval,
      executed: false,
      status: 'NO_SIGNAL',
      messageArabic: 'لم يتم رصد أي ذروة متطرفة (السوق في حالة حياد طبيعية). تم تخطي التنفيذ لحماية رأس المال.',
      messageEnglish: 'No trigger conditions met. Market within normal thresholds. Execution skipped.',
    };
  }

  // الخطوة 2: استدعاء getMarket أولاً لتخزين عنوان venue.exchange المعتمد لتوقيع EIP-712
  const market = await sdk.getActive15mBtcMarket();

  // الخطوة 3: التحقق من اعتماد USDC لعقد السوق (Venue Token Approval)
  const approval = sdk.checkUsdcApproval(market.venue.exchange);
  if (!approval.isApproved) {
    return {
      timestamp: Date.now(),
      signal: signalEval,
      marketSelected: market,
      executed: false,
      status: 'ERROR',
      messageArabic: `عقد السوق (${market.venue.exchange.slice(0, 10)}...) يتطلب اعتماد مسبق لعملة USDC قبل التداول.`,
      messageEnglish: `USDC approval required for venue ${market.venue.exchange}.`,
    };
  }

  // الخطوة 4: تحديد رمز العقد المستهدف (Contract Selection بناءً على Z-Score)
  // - إشارة هبوط (Z-Score >= +1.0): السعر تضخم فوق قمة 20 دقيقة؛ نشتري عقد "NO" للمراهنة على الهبوط.
  // - إشارة صعود (Z-Score <= -1.0): السعر انهار تحت قاع 20 دقيقة؛ نشتري عقد "YES" للمراهنة على الصعود والارتداد.
  let targetTokenType: ContractTokenType;
  let targetTokenId: string;

  if (signalEval.signal === 'OVERBOUGHT') {
    targetTokenType = 'NO';
    targetTokenId = market.tokens.no;
  } else {
    targetTokenType = 'YES';
    targetTokenId = market.tokens.yes;
  }

  // الخطوة 5: جلب دفتر الأوامر (Orderbook) عبر getOrderBook واحتساب Midpoint و Spread
  const orderbook = await sdk.getOrderBook(market.slug, targetTokenType);

  // الخطوة 6: التحقق من كفاءة وسيولة السوق (Handling Illiquid Markets حسب التوثيق)
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
      messageArabic: `السوق غير مؤهل للتداول: ${liquidityStatus.reason}`,
      messageEnglish: `Market illiquid: ${liquidityStatus.reason}`,
    };
  }

  // الخطوة 7: تطبيق سقف سعر الدخول (Max Entry Price <= $0.20 - 20 سنت وتحت)
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
      messageArabic: `تم إلغاء التنفيذ لحماية نسبة العائد: أفضل سعر معروض (${bestAsk?.price.toFixed(2)}$) أعلى من الحد الأقصى (${config.maxEntryPrice.toFixed(2)}$). نحن نشتري فقط عندما يكون السعر <= 0.20$ لضمان عائد 5 أضعاف (+400%).`,
      messageEnglish: `Execution rejected: Best ask price ($${bestAsk?.price.toFixed(2)}) exceeds max entry threshold ($${config.maxEntryPrice.toFixed(2)}).`,
    };
  }

  // الخطوة 8: حساب عدد العقود وتكلفة الشراء
  const optimalAsk = validAsks[0];
  const executionPrice = optimalAsk.price;
  const maxContractsByBudget = Math.floor(config.tradeSizeUsdc / executionPrice);
  const contractsToBuy = Math.min(maxContractsByBudget, optimalAsk.size);

  // قواعد التحقق من السعر والحجم (Validation Rules)
  const validation = sdk.validateOrderParams(executionPrice, contractsToBuy);
  if (!validation.valid) {
    return {
      timestamp: Date.now(),
      signal: signalEval,
      marketSelected: market,
      targetedToken: targetTokenType,
      targetTokenId,
      executed: false,
      status: 'ERROR',
      messageArabic: `فشل التحقق من معايير الأمر: ${validation.error}`,
      messageEnglish: `Order validation failed: ${validation.error}`,
    };
  }

  const totalCostUsdc = Number((contractsToBuy * executionPrice).toFixed(2));
  const potentialPayoutUsdc = Number((contractsToBuy * 1.00).toFixed(2));
  const roiMultiplier = (1.00 / executionPrice).toFixed(1);
  const profitPercentage = Math.round(((1.00 - executionPrice) / executionPrice) * 100);

  // الخطوة 9: بناء حمولة أمر Fill and Kill (FAK) بنظام التوقيع EIP-712
  const orderPayload = sdk.buildFakOrderPayload({
    tokenId: targetTokenId,
    targetPrice: executionPrice,
    contractsSize: contractsToBuy,
    side: Side.BUY,
    makerAddress: config.walletAddress,
    verifyingContract: market.venue.exchange,
    expirationSeconds: 120,
  });

  // الخطوة 10: التوقيع الرقمي بنظام EIP-712 عبر ethers
  const signature = await sdk.signOrderEIP712(orderPayload);

  // الخطوة 11: إرسال الأمر الموقّع إلى محرك Limitless CLOB
  const clobResponse = await sdk.submitOrder(market.slug, orderPayload, signature);
  const summary = clobResponse.executionSummary;

  // تسجيل الصفقة في PortfolioFetcher تلقائياً عند نجاح التنفيذ
  if (summary.terminalStatus === 'FILLED') {
    sdk.recordExecutedTrade({
      marketSlug: market.slug,
      marketTitle: market.title,
      tokenType: targetTokenType,
      contractsSize: contractsToBuy,
      price: executionPrice,
      totalCostUsdc,
      txHash: clobResponse.txHash,
      orderId: clobResponse.orderId,
    });
  }

  // الخطوة 12: تقرير التنفيذ النهائي
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
    executionResult: summary,
    executed: summary.terminalStatus === 'FILLED',
    status: 'EXECUTED',
    executionPrice,
    contractsFilled: summary.filledContracts,
    totalCostUsdc,
    potentialPayoutUsdc,
    asymmetricMultiplier: `${roiMultiplier}x (+${profitPercentage}%)`,
    messageArabic: `تم تنفيذ أمر الشراء بنجاح! نوع العقد: [${targetTokenType}] بسعر $${executionPrice.toFixed(2)}. الحجم: ${contractsToBuy} عقد. تم مطابقة ${summary.makerMatches.length} عروض مستقرة (Fills) بحالة تسوية [${summary.settlementStatus}]. التكلفة: $${totalCostUsdc} USDC. العائد المتوقع عند الفوز: $${potentialPayoutUsdc} USDC (مضاعف ${roiMultiplier}x / +${profitPercentage}%).`,
    messageEnglish: `Order executed successfully via FAK! Token: [${targetTokenType}] at $${executionPrice.toFixed(2)}. Filled ${summary.filledContracts} contracts across ${summary.makerMatches.length} fills. Settlement: ${summary.settlementStatus}.`,
  };
}
