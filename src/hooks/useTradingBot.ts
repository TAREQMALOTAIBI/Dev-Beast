import { useState, useEffect, useRef, useCallback } from 'react';
import {
  BotConfig,
  CandleData,
  ZScoreMetric,
  ExecutedChunk,
  TradeOrder,
  WsMessageLog,
  LiveWalletInfo,
  LimitlessMarketDetails,
} from '../types/bot';
import { binanceService } from '../services/binanceService';
import { limitlessService, LimitlessStatus } from '../services/limitlessService';
import {
  calculateZScore,
  calculateKellySizing,
  AdvancedFiltersStatus,
} from '../utils/math';
import { soundController } from '../utils/audio';

const DEFAULT_CONFIG: BotConfig = {
  symbol: 'BTCUSDT',
  timeframe: '1m',
  periods: 45,
  strategyDirection: 'BOTH',
  zScoreUpper: 0,
  zScoreEntry: 0,
  zScoreLower: 0,
  zScoreLowerEntry: 0,
  maxPriceCents: 0.20, // GTC Limit Price: 20% ($0.20)
  maxRiskPercent: 0.10, // 10% Capital
  orderType: 'GTC', // GTC (Good-Til-Cancelled) Limit Order at 20%
  fractionChunks: 1,
  chunkDelayMs: 0,
  winProbability: 0.80,
  initialBalance: 1000,
  binanceRestUrl: 'https://api.binance.com/api/v3/klines',
  binanceWsUrl: 'wss://stream.binance.com/ws/btcusdt@kline_1m',
  limitlessWsUrl: 'wss://ws.limitless.exchange',
  limitlessMarketSlug: 'btc-up-or-down-5-min',
  limitlessApiKey: (typeof process !== 'undefined' && process.env?.LIMITLESS_API_KEY) || '',
  limitlessTokenId: (typeof process !== 'undefined' && process.env?.LMTS_TOKEN_ID) || '',
  limitlessTokenSecret: (typeof process !== 'undefined' && process.env?.LMTS_TOKEN_SECRET) || '',
  singleTradePerContract: true,
  cooldownMinutes: 5,
  calculateOnCandleClose: false,
  adxThreshold: 100,
  rvMinBp: 0,
  rvMaxBp: 10000,
  entryWindowStartMin: 0,
  entryWindowEndMin: 4, // Active until 1 minute before expiry (<= 60s -> cancel)
};

export interface PendingGtcOrderState {
  orderId: string;
  marketSlug: string;
  placedAt: number;
  direction: 'LONG' | 'SHORT';
  outcome: 'UP' | 'DOWN';
  price: number;
  contracts: number;
  status: 'PENDING_FILL' | 'CANCELLED' | 'FILLED';
}

export function useTradingBot() {
  const [config, setConfig] = useState<BotConfig>(() => {
    try {
      const saved = localStorage.getItem('limitless_live_bot_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        parsed.timeframe = '1m';
        parsed.binanceWsUrl = 'wss://stream.binance.com/ws/btcusdt@kline_1m';
        if (parsed.binanceRestUrl && parsed.binanceRestUrl.includes('binance.vision')) {
          parsed.binanceRestUrl = DEFAULT_CONFIG.binanceRestUrl;
        }
        if (parsed.limitlessWsUrl && parsed.limitlessWsUrl.includes('api.limitless.exchange')) {
          parsed.limitlessWsUrl = DEFAULT_CONFIG.limitlessWsUrl;
        }
        if (
          !parsed.limitlessMarketSlug ||
          /(^|[^0-9])15-min/i.test(parsed.limitlessMarketSlug) ||
          /15m/i.test(parsed.limitlessMarketSlug) ||
          /hourly/i.test(parsed.limitlessMarketSlug) ||
          /(^|[^0-9])1-hour/i.test(parsed.limitlessMarketSlug) ||
          parsed.limitlessMarketSlug.includes('weekly') ||
          /\d{8,}/.test(parsed.limitlessMarketSlug)
        ) {
          parsed.limitlessMarketSlug = DEFAULT_CONFIG.limitlessMarketSlug;
        }
        parsed.strategyDirection = 'BOTH';
        parsed.orderType = 'GTC';
        parsed.maxPriceCents = 0.20; // 20% ($0.20)
        parsed.fractionChunks = 1;
        parsed.chunkDelayMs = 0;
        parsed.maxRiskPercent = 0.10; // 10% Capital
        parsed.singleTradePerContract = true;
        parsed.cooldownMinutes = 5;

        if (!parsed.limitlessTokenId && DEFAULT_CONFIG.limitlessTokenId) {
          parsed.limitlessTokenId = DEFAULT_CONFIG.limitlessTokenId;
        }
        if (!parsed.limitlessTokenSecret && DEFAULT_CONFIG.limitlessTokenSecret) {
          parsed.limitlessTokenSecret = DEFAULT_CONFIG.limitlessTokenSecret;
        }
        if (!parsed.limitlessApiKey && DEFAULT_CONFIG.limitlessApiKey) {
          parsed.limitlessApiKey = DEFAULT_CONFIG.limitlessApiKey;
        }
        return { ...DEFAULT_CONFIG, ...parsed };
      }
    } catch {
      // Fallback
    }
    return DEFAULT_CONFIG;
  });

  const [candles, setCandles] = useState<CandleData[]>([]);
  const [metrics, setMetrics] = useState<ZScoreMetric[]>([]);
  const [currentZScore, setCurrentZScore] = useState<number>(0);
  const [priceDeviation, setPriceDeviation] = useState<{ delta: number; absDelta: number; openPrice: number | null }>({
    delta: 0,
    absDelta: 0,
    openPrice: null,
  });
  const [crossedUpperThreshold, setCrossedUpperThreshold] = useState<boolean>(false);
  const [crossedLowerThreshold, setCrossedLowerThreshold] = useState<boolean>(false);
  const [lastTradeDirection, setLastTradeDirection] = useState<'SHORT' | 'LONG' | null>(null);
  const [activeSignal, setActiveSignal] = useState<'ENTRY_SHORT' | 'ENTRY_LONG' | null>(null);
  const [isEntrySignal, setIsEntrySignal] = useState<boolean>(false);
  const [currentBalance, setCurrentBalance] = useState<number>(0);
  const [liveUsdcBalance, setLiveUsdcBalance] = useState<number>(0);
  const [advancedFiltersStatus] = useState<AdvancedFiltersStatus | null>(null);
  const [executionNotice, setExecutionNotice] = useState<{
    type: 'SUCCESS' | 'WARNING' | 'ERROR';
    message: string;
    timestamp: number;
    action?: 'START_BOT' | 'TRIGGER_TRADE';
  } | null>(null);

  const [pendingGtcOrder, setPendingGtcOrder] = useState<PendingGtcOrderState | null>(null);
  const pendingGtcOrderRef = useRef<PendingGtcOrderState | null>(null);

  const [orderbook, setOrderbook] = useState<import('../types/bot').OrderbookUpdate | null>(null);
  const [oracle, setOracle] = useState<import('../types/bot').OraclePriceData | null>(null);
  const [positions, setPositions] = useState<import('../types/bot').PositionItem[]>([]);
  const [botActive, setBotActive] = useState<boolean>(() => {
    try {
      localStorage.removeItem('limitless_bot_active_state');
      if (typeof window !== 'undefined' && window.location.hostname.includes('.run.app')) {
        localStorage.setItem('limitless_bot_active_v2', 'false');
        return false;
      }
      const saved = localStorage.getItem('limitless_bot_active_v2');
      if (saved !== null) {
        return saved === 'true';
      }
    } catch {
      // Safe fallback
    }
    return false;
  });
  const [binanceStatus, setBinanceStatus] = useState<'CONNECTING' | 'CONNECTED' | 'DISCONNECTED'>('CONNECTING');
  const [limitlessStatus, setLimitlessStatus] = useState<LimitlessStatus>('DISCONNECTED');
  const [wsLogs, setWsLogs] = useState<WsMessageLog[]>([]);
  const [currentChunks, setCurrentChunks] = useState<ExecutedChunk[]>([]);
  const [activeTrade, setActiveTrade] = useState<TradeOrder | null>(null);
  const [tradeHistory, setTradeHistory] = useState<TradeOrder[]>(() => {
    try {
      const saved = localStorage.getItem('limitless_bot_trade_history');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.map((item, idx) => ({
            ...item,
            id: item?.id || `trade-${idx}`,
            timestamp: Number(item?.timestamp) || Date.now(),
            market: String(item?.market || 'btc-up-or-down-5-min'),
            direction: item?.direction === 'LONG' ? 'LONG' : 'SHORT',
            triggerZScore: Number.isFinite(Number(item?.triggerZScore)) ? Number(item.triggerZScore) : 0,
            totalContracts: Number.isFinite(Number(item?.totalContracts)) ? Number(item.totalContracts) : 0,
            contractPrice: Number.isFinite(Number(item?.contractPrice)) ? Number(item.contractPrice) : 0.20,
            totalInvestmentUsd: Number.isFinite(Number(item?.totalInvestmentUsd)) ? Number(item.totalInvestmentUsd) : 0,
            chunks: Array.isArray(item?.chunks) ? item.chunks : [],
            status: item?.status || 'ACTIVE_GTC',
          }));
        }
      }
    } catch {}
    return [];
  });
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(false);
  const [lastSignalTime, setLastSignalTime] = useState<number | null>(null);
  const [recentChartSignal] = useState<{
    direction: 'SHORT' | 'LONG';
    candleTime: number;
    zScore: number;
    ageMinutes: number;
  } | null>(null);

  // References for live closures and duplicate prevention
  const candlesRef = useRef<CandleData[]>([]);
  const orderbookRef = useRef<import('../types/bot').OrderbookUpdate | null>(null);
  const oracleRef = useRef<import('../types/bot').OraclePriceData | null>(null);
  const closePricesRef = useRef<number[]>([]);
  const crossedUpperThresholdRef = useRef<boolean>(false);
  const crossedLowerThresholdRef = useRef<boolean>(false);
  const entryShortCandlesRef = useRef<Set<number>>(new Set());
  const entryLongCandlesRef = useRef<Set<number>>(new Set());
  const lastEvaluatedEntrySignalTimeRef = useRef<number>(0);
  const binanceStatusRef = useRef<'CONNECTING' | 'CONNECTED' | 'DISCONNECTED'>(binanceStatus);
  const botActiveRef = useRef<boolean>(botActive);
  const configRef = useRef<BotConfig>(config);
  const currentBalanceRef = useRef<number>(currentBalance);
  const isExecutingRef = useRef<boolean>(false);
  const lastExecutedCandleTimeRef = useRef<number>(0);
  const lastExecutedMarketSlugRef = useRef<string>('');
  const lastExecutedTimestampRef = useRef<number>(0);
  const activeLimitlessMarketRef = useRef<LimitlessMarketDetails | null>(null);
  const metricsRef = useRef<ZScoreMetric[]>([]);
  const executeLiveTradeRef = useRef<
    (triggerZ: number, direction?: 'SHORT' | 'LONG', candleTime?: number, isManual?: boolean) => Promise<void>
  >(async () => {});

  // Persistent trade lock status (1 bet per 5m contract)
  const [contractLockInfo, setContractLockInfo] = useState<{
    isLocked: boolean;
    reason?: string;
    cooldownRemainingMinutes?: number;
    lastTradedSlug?: string;
  }>({ isLocked: false });

  // Load persistent trade guard on mount (Sync from VM server disk & RAM with 5-minute auto-expiry)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('limitless_last_trade_guard');
      if (saved) {
        const parsed = JSON.parse(saved);
        const age = Date.now() - (Number(parsed?.timestamp) || 0);
        if (age < 5 * 60 * 1000) {
          if (parsed.marketSlug) lastExecutedMarketSlugRef.current = parsed.marketSlug;
          if (parsed.timestamp) lastExecutedTimestampRef.current = Number(parsed.timestamp);
          if (parsed.candleTime) lastExecutedCandleTimeRef.current = Number(parsed.candleTime);
        } else {
          localStorage.removeItem('limitless_last_trade_guard');
        }
      }
    } catch {}

    limitlessService
      .fetchTradeGuard()
      .then((serverGuard) => {
        if (serverGuard && serverGuard.marketSlug) {
          const age = Date.now() - (Number(serverGuard.timestamp) || 0);
          if (age < 5 * 60 * 1000) {
            lastExecutedMarketSlugRef.current = serverGuard.marketSlug;
            lastExecutedTimestampRef.current = Number(serverGuard.timestamp) || 0;
            lastExecutedCandleTimeRef.current = Number(serverGuard.candleTime) || 0;
            try {
              localStorage.setItem('limitless_last_trade_guard', JSON.stringify(serverGuard));
            } catch {}
          } else {
            lastExecutedMarketSlugRef.current = '';
            lastExecutedTimestampRef.current = 0;
            lastExecutedCandleTimeRef.current = 0;
            try {
              localStorage.removeItem('limitless_last_trade_guard');
            } catch {}
            limitlessService.clearTradeGuardOnVm().catch(() => {});
          }
        }
      })
      .catch(() => {});
  }, []);

  configRef.current = config;
  botActiveRef.current = botActive;
  currentBalanceRef.current = currentBalance;
  metricsRef.current = metrics;
  binanceStatusRef.current = binanceStatus;
  oracleRef.current = oracle;
  pendingGtcOrderRef.current = pendingGtcOrder;

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundController.enabled = next;
  };

  const updateConfig = (partial: Partial<BotConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...partial };
      if (next.maxRiskPercent !== undefined) {
        next.maxRiskPercent = Math.min(Math.max(Number(next.maxRiskPercent) || 0.10, 0.01), 1.0);
      }
      if (next.maxPriceCents !== undefined) {
        next.maxPriceCents = Math.min(Math.max(Number(next.maxPriceCents) || 0.20, 0.01), 0.99);
      }
      try {
        localStorage.setItem('limitless_live_bot_config', JSON.stringify(next));
      } catch {
        // Safe localStorage
      }
      return next;
    });
  };

  const lastRoundStartMsRef = useRef<number>(0);

  // Build clean chart series anchored to each 5-minute contract's opening price
  const rebuildMetrics = useCallback((
    candleList: CandleData[],
    cfg: BotConfig
  ) => {
    const result: ZScoreMetric[] = [];
    const closes = candleList.map((c) => c.close);

    const latestCandle = candleList[candleList.length - 1];
    const latestTimeMs = latestCandle
      ? latestCandle.time > 1e11
        ? latestCandle.time
        : latestCandle.time * 1000
      : Date.now();
    const currentRoundStartMs = Math.floor(latestTimeMs / 300000) * 300000;

    if (lastRoundStartMsRef.current > 0 && lastRoundStartMsRef.current !== currentRoundStartMs) {
      entryShortCandlesRef.current.clear();
      entryLongCandlesRef.current.clear();
      crossedUpperThresholdRef.current = false;
      setCrossedUpperThreshold(false);
      crossedLowerThresholdRef.current = false;
      setCrossedLowerThreshold(false);
      setIsEntrySignal(false);
      setActiveSignal(null);
    }
    lastRoundStartMsRef.current = currentRoundStartMs;

    const roundOpenBySlot = new Map<number, number>();
    for (let k = 0; k < candleList.length; k++) {
      const cTimeMs = candleList[k].time > 1e11 ? candleList[k].time : candleList[k].time * 1000;
      const slotMs = Math.floor(cTimeMs / 300000) * 300000;
      if (!roundOpenBySlot.has(slotMs) && Number.isFinite(candleList[k].open) && candleList[k].open > 0) {
        roundOpenBySlot.set(slotMs, candleList[k].open);
      }
    }

    for (let i = 0; i < candleList.length; i++) {
      const cTimeMs = candleList[i].time > 1e11 ? candleList[i].time : candleList[i].time * 1000;
      const slotMs = Math.floor(cTimeMs / 300000) * 300000;
      const roundOpenPriceForCandle = roundOpenBySlot.get(slotMs) ?? candleList[i].open;

      const windowStart = Math.max(0, i - cfg.periods + 1);
      const windowSlice = closes.slice(windowStart, i + 1);
      const stats = calculateZScore(
        windowSlice,
        2.0,
        2.0,
        -2.0,
        -2.0,
        roundOpenPriceForCandle
      );

      const candleTime = candleList[i].time;
      let signal: 'ENTRY_SHORT' | 'ENTRY_LONG' | null = null;
      let dir: 'SHORT' | 'LONG' | null = null;

      if (entryShortCandlesRef.current.has(candleTime)) {
        signal = 'ENTRY_SHORT';
        dir = 'SHORT';
      } else if (entryLongCandlesRef.current.has(candleTime)) {
        signal = 'ENTRY_LONG';
        dir = 'LONG';
      }

      result.push({
        time: candleList[i].time,
        price: candleList[i].close,
        mean: roundOpenPriceForCandle,
        stdDev: stats.stdDev,
        variance: stats.variance,
        zScore: stats.zScore,
        upperBand: roundOpenPriceForCandle,
        entryBand: roundOpenPriceForCandle,
        lowerEntryBand: roundOpenPriceForCandle,
        lowerBand: roundOpenPriceForCandle,
        upperThreshold: 0,
        entryThreshold: 0,
        lowerThreshold: 0,
        lowerEntryThreshold: 0,
        signal,
        direction: dir,
      });
    }

    setMetrics(result);
    if (result.length > 0) {
      setCurrentZScore(result[result.length - 1].zScore);
    }
  }, []);

  const checkTradeLock = useCallback((targetSlug?: string, _cTime?: number): { locked: boolean; reason?: string } => {
    const cfg = configRef.current;
    if (!cfg.singleTradePerContract) return { locked: false };

    const lastSlug = lastExecutedMarketSlugRef.current;
    const lastTime = lastExecutedTimestampRef.current;
    if (
      targetSlug &&
      lastSlug &&
      targetSlug === lastSlug &&
      targetSlug !== 'btc-up-or-down-5-min' &&
      Date.now() - lastTime < 5 * 60 * 1000
    ) {
      return {
        locked: true,
        reason: `🔒 تم بالفعل إرسال أمر صفقة على عقد الـ 5 دقائق الحالي (${targetSlug}). سينتقل الروبوت تلقائياً للعقد القادم.`,
      };
    }
    return { locked: false };
  }, []);

  // Cancel an active pending GTC order
  const cancelPendingGtcOrder = useCallback(async (orderId?: string) => {
    const targetId = orderId || pendingGtcOrderRef.current?.orderId;
    if (!targetId) return;

    try {
      const cfg = configRef.current;
      console.log(`[Auto-Cancel GTC] Cancelling order ${targetId}...`);
      await limitlessService.cancelOrder(targetId, {
        privateKey: cfg.privateKey,
        tokenId: cfg.limitlessTokenId,
        secret: cfg.limitlessTokenSecret,
      });

      setPendingGtcOrder((prev) => (prev ? { ...prev, status: 'CANCELLED' } : null));
      setActiveTrade((prev) => (prev && prev.exchangeOrderId === targetId ? { ...prev, status: 'REJECTED' } : prev));
      setExecutionNotice({
        type: 'WARNING',
        message: `⏰ [إلغاء تلقائي عند الدقيقة الأخيرة] تم إلغاء أمر GTC (المعلق عند 20%) لعدم التنفيذ وبقاء ≤ 1 دقيقة على نهاية العقد.`,
        timestamp: Date.now(),
      });
    } catch (err: any) {
      console.warn(`[Auto-Cancel GTC Error]`, err?.message || err);
    }
  }, []);

  // Execute LIVE Trade across Limitless (5m Contract, GTC Limit Order @ $0.20 / 20%, 10% Capital)
  const executeLiveTrade = useCallback(async (
    triggerZ: number,
    direction: 'SHORT' | 'LONG' = 'LONG',
    candleTime?: number,
    isManual: boolean = false
  ) => {
    if (!isManual && !botActiveRef.current) {
      console.warn('[BOT STOPPED] Automated order blocked because botActive is false.');
      return;
    }

    if (isExecutingRef.current) {
      console.warn('[CONCURRENCY BLOCKED] An order is already in-flight.');
      return;
    }

    const cfg = configRef.current;
    let balance = currentBalanceRef.current;

    let currentMarket = activeLimitlessMarketRef.current;
    const is5mMarket = (s?: string) => Boolean(s && (/(^|[^0-9])5-min/i.test(s) || /(^|[^0-9])5m/i.test(s)));

    if (!currentMarket?.slug || !is5mMarket(currentMarket.slug)) {
      try {
        const mRes = await fetch('/api/limitless/active-btc');
        if (mRes.ok) {
          const mData = await mRes.json();
          if (mData && mData.slug && is5mMarket(mData.slug)) {
            currentMarket = mData;
            activeLimitlessMarketRef.current = mData;
            setActiveLimitlessMarket(mData);
          }
        }
      } catch {}
    }

    const resolvedMarketSlug =
      currentMarket?.slug && is5mMarket(currentMarket.slug)
        ? currentMarket.slug
        : cfg.limitlessMarketSlug && is5mMarket(cfg.limitlessMarketSlug)
        ? cfg.limitlessMarketSlug
        : 'btc-up-or-down-5-min';

    const lock = checkTradeLock(resolvedMarketSlug, candleTime);
    if (lock.locked) {
      if (!isManual) return;
      console.warn(`[SAFETY GUARD BLOCKED] Trade rejected: ${lock.reason}`);
      setExecutionNotice({
        type: 'WARNING',
        message: lock.reason || 'الصفقة مقفلة لمنع التكرار على نفس عقد الـ 5 دقائق',
        timestamp: Date.now(),
      });
      return;
    }

    if (/(^|[^0-9])15-min/i.test(resolvedMarketSlug) || /hourly/i.test(resolvedMarketSlug) || /(^|[^0-9])1-hour/i.test(resolvedMarketSlug)) {
      console.error(
        `[SAFETY SHIELD] Contract '${resolvedMarketSlug}' blocked! Trading bot is locked strictly to 5-minute contracts.`
      );
      return;
    }

    if (balance <= 0 && liveUsdcBalance > 0) {
      balance = liveUsdcBalance;
      currentBalanceRef.current = liveUsdcBalance;
      setCurrentBalance(liveUsdcBalance);
    }

    if (balance <= 0) {
      try {
        const bRes = await fetch('/api/balance');
        if (bRes.ok) {
          const bData = await bRes.json();
          if (bData && bData.usdcBalance > 0) {
            balance = bData.usdcBalance;
            currentBalanceRef.current = bData.usdcBalance;
            setLiveUsdcBalance(bData.usdcBalance);
            setCurrentBalance(bData.usdcBalance);
          }
        }
      } catch {}
    }

    if (balance <= 0) {
      const warnMsg = `⚠️ تعذر إرسال الصفقة: رصيد المحفظة الحالي هو ($0.00 USDC). يرجى التأكد من شحن المحفظة بعملة USDC على شبكة Base.`;
      console.warn(warnMsg);
      limitlessService.logDirect('SYSTEM', warnMsg);
      setExecutionNotice({
        type: 'WARNING',
        message: warnMsg,
        timestamp: Date.now(),
      });
      return;
    }

    const isLong = direction === 'LONG';
    const outcome = isLong ? 'UP' : 'DOWN';

    // Order Type GTC @ 20% ($0.20) as explicitly requested:
    // "إذا تحرك السعر الى 150 دولار صعودا أو هبوطا من سعر الأساس نضع أمر GTC عند 20% ونلغيه في حال عدم التنفيذ إذا وصل 1 دقيقة على نهاية العقد"
    const effectiveContractPrice = 0.20; // 20% limit price

    const maxRiskCap = Math.min(Math.max(cfg.maxRiskPercent || 0.10, 0.01), 1.0);
    const maxBudgetUsd = balance * maxRiskCap;

    const kelly = calculateKellySizing(balance, {
      maxPriceCents: effectiveContractPrice,
      winProbability: cfg.winProbability,
      maxRiskPercent: maxRiskCap,
      fractionChunks: 1,
    });

    let effectiveContracts = kelly.numberOfContracts;

    if (effectiveContracts < 0.01 && maxBudgetUsd >= (0.01 * effectiveContractPrice)) {
      effectiveContracts = 0.01;
    }

    if (effectiveContracts * effectiveContractPrice > maxBudgetUsd) {
      effectiveContracts = Math.floor((maxBudgetUsd / effectiveContractPrice) * 100) / 100;
    }

    while (effectiveContracts > 0.01 && (effectiveContracts * effectiveContractPrice) > maxBudgetUsd) {
      effectiveContracts = Math.round((effectiveContracts - 0.01) * 100) / 100;
    }

    if (effectiveContracts <= 0) {
      if (maxBudgetUsd >= (0.01 * effectiveContractPrice)) {
        effectiveContracts = 0.01;
      } else {
        const minWarning = `⚠️ رصيد المحفظة الحالي ($${balance.toFixed(2)} USDC) والميزانية المخصصة 10% ($${maxBudgetUsd.toFixed(2)}) لا تكفي لشراء عقد بسعر $${effectiveContractPrice}.`;
        console.warn(minWarning);
        limitlessService.logDirect('SYSTEM', minWarning);
        setExecutionNotice({
          type: 'WARNING',
          message: minWarning,
          timestamp: Date.now(),
        });
        return;
      }
    }

    isExecutingRef.current = true;
    setIsExecuting(true);
    setIsEntrySignal(true);
    setActiveSignal(direction === 'LONG' ? 'ENTRY_LONG' : 'ENTRY_SHORT');
    setLastTradeDirection(direction);
    setLastSignalTime(Date.now());

    const tradeId = `live_trd_${Date.now()}`;
    const initialTrade: TradeOrder = {
      id: tradeId,
      timestamp: Date.now(),
      symbol: cfg.symbol,
      market: resolvedMarketSlug,
      direction,
      outcome,
      triggerZScore: triggerZ,
      contractPrice: effectiveContractPrice,
      totalContracts: effectiveContracts,
      totalInvestmentUsd: effectiveContracts * effectiveContractPrice,
      kellyRiskPct: maxRiskCap,
      chunks: [],
      status: 'ACTIVE_GTC',
    };

    setActiveTrade(initialTrade);

    try {
      console.log(
        `[LIVE GTC EXECUTION - ${direction}] Sending GTC Limit order of ${effectiveContracts} contracts @ $0.20 (20%) on Limitless (${resolvedMarketSlug} - ${outcome})...`
      );

      limitlessService.logDirect(
        'OUTGOING',
        `🚀 [تنفيذ أمر GTC عند 20%] إرسال أمر شراء معلق (GTC Limit) لعدد ${effectiveContracts} عقود ${outcome} (${direction}) بسعر $0.20 (20%) إلى عقد 5 دقائق (${resolvedMarketSlug})...`
      );

      const executed = await limitlessService.executeChunkedOrder(
        effectiveContracts,
        effectiveContractPrice,
        1,
        'GTC', // GTC order type
        0,
        (updatedChunk) => {
          setCurrentChunks((prev) => {
            const filtered = prev.filter((c) => c.chunkId !== updatedChunk.chunkId);
            return [...filtered, updatedChunk].sort((a, b) => a.chunkId - b.chunkId);
          });
        },
        direction,
        resolvedMarketSlug,
        {
          privateKey: cfg.privateKey,
          tokenId: cfg.limitlessTokenId,
          secret: cfg.limitlessTokenSecret,
          apiKey: cfg.limitlessApiKey,
          isManual,
        }
      );

      const serverConfirmedSlug = (executed[0] as any)?.marketSlug || resolvedMarketSlug;
      const orderIdResolved = (executed[0] as any)?.orderId || `ord_${Date.now()}`;

      const completedTrade: TradeOrder = {
        ...initialTrade,
        market: serverConfirmedSlug,
        exchangeOrderId: orderIdResolved,
        chunks: executed,
        status: 'ACTIVE_GTC' as any,
      };

      setActiveTrade(completedTrade);
      setTradeHistory((prev) => {
        const next = [completedTrade, ...prev];
        try {
          localStorage.setItem('limitless_bot_trade_history', JSON.stringify(next.slice(0, 100)));
        } catch {}
        return next;
      });

      const orderState: PendingGtcOrderState = {
        orderId: orderIdResolved,
        marketSlug: serverConfirmedSlug,
        placedAt: Date.now(),
        direction,
        outcome,
        price: effectiveContractPrice,
        contracts: effectiveContracts,
        status: 'PENDING_FILL',
      };
      setPendingGtcOrder(orderState);
      pendingGtcOrderRef.current = orderState;

      const now = Date.now();
      lastExecutedCandleTimeRef.current = candleTime || now;
      lastExecutedMarketSlugRef.current = serverConfirmedSlug;
      lastExecutedTimestampRef.current = now;
      setContractLockInfo({
        isLocked: true,
        reason: `تم وضع أمر GTC عند 20% على عقد الـ 5 دقائق ${serverConfirmedSlug}`,
        cooldownRemainingMinutes: 5,
        lastTradedSlug: serverConfirmedSlug,
      });

      const invested = completedTrade.totalInvestmentUsd;
      const successNotice = `✅ تم وضع أمر GTC معلق بنجاح: شراء عقد ${outcome} (${direction}) بسعر 20% ($0.20) لعدد ${effectiveContracts} عقد بقيمة $${invested.toFixed(2)} على عقد الـ 5 دقائق ${serverConfirmedSlug} (سيتم إلغاؤه تلقائياً في حال عدم التنفيذ عند بقاء 1 دقيقة)`;
      limitlessService.logDirect('SYSTEM', successNotice);
      setExecutionNotice({
        type: 'SUCCESS',
        message: successNotice,
        timestamp: Date.now(),
      });
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      console.warn('[LIVE ORDER NOTICE] Direct order execution report:', errMsg);
      limitlessService.logDirect('SYSTEM', `❌ تنبيه تنفيذ الصفقة: ${errMsg}`);
      setActiveTrade((prev) => (prev ? { ...prev, status: 'REJECTED' } : null));
      setExecutionNotice({
        type: 'ERROR',
        message: `تعذر إرسال الصفقة: ${errMsg}`,
        timestamp: Date.now(),
      });
      lastExecutedTimestampRef.current = 0;
      lastExecutedCandleTimeRef.current = 0;
    } finally {
      isExecutingRef.current = false;
      setIsExecuting(false);
      setTimeout(() => {
        setIsEntrySignal(false);
        setActiveSignal(null);
      }, 4000);
    }
  }, [liveUsdcBalance, checkTradeLock]);

  executeLiveTradeRef.current = executeLiveTrade;

  // Real-Time 1-Second Strategy Monitor:
  // 1. Monitors BTC spot price vs 5-minute contract Open Price (Price to Beat).
  // 2. When price moves $150 or more (|Spot - OpenPrice| >= $150) -> places GTC BUY order @ 20% ($0.20).
  // 3. If unexecuted by 1 minute before expiry (<= 60s remaining) -> cancels order automatically.
  useEffect(() => {
    const strategyTimer = setInterval(() => {
      const mkt = activeLimitlessMarketRef.current;
      const now = Date.now();
      const expMs = mkt?.expirationTimestamp
        ? Number(mkt.expirationTimestamp)
        : Math.ceil(now / 300000) * 300000;
      const remainingSec = Math.floor((expMs - now) / 1000);

      const latestCandle = candlesRef.current[candlesRef.current.length - 1];
      const spotPrice = Number(oracleRef.current?.value || latestCandle?.close || 0);
      const rawOpen = mkt?.openPrice !== undefined && mkt?.openPrice !== null
        ? Number(String(mkt.openPrice).replace(/[^0-9.-]/g, ''))
        : NaN;
      const openPrice = Number.isFinite(rawOpen) && rawOpen > 0 ? rawOpen : (latestCandle?.open || null);

      if (openPrice && spotPrice > 0) {
        const delta = spotPrice - openPrice;
        const absDelta = Math.abs(delta);
        setPriceDeviation({ delta, absDelta, openPrice });

        // Visual threshold triggers
        if (delta >= 150) {
          crossedLowerThresholdRef.current = true;
          setCrossedLowerThreshold(true);
          crossedUpperThresholdRef.current = false;
          setCrossedUpperThreshold(false);
        } else if (delta <= -150) {
          crossedUpperThresholdRef.current = true;
          setCrossedUpperThreshold(true);
          crossedLowerThresholdRef.current = false;
          setCrossedLowerThreshold(false);
        } else {
          crossedUpperThresholdRef.current = false;
          setCrossedUpperThreshold(false);
          crossedLowerThresholdRef.current = false;
          setCrossedLowerThreshold(false);
        }

        // Rule 1: Auto-cancel GTC order if remaining time reaches 1 minute (<= 60 seconds)
        const pending = pendingGtcOrderRef.current;
        if (pending && pending.status === 'PENDING_FILL') {
          if (remainingSec <= 60 || (mkt?.slug && pending.marketSlug !== mkt.slug)) {
            cancelPendingGtcOrder(pending.orderId);
          }
        }

        // Rule 2: Trigger GTC order at 20% if price moves >= $150 and more than 60s remaining
        if (absDelta >= 150 && remainingSec > 60) {
          const isUp = delta >= 150;
          const targetDirection: 'LONG' | 'SHORT' = isUp ? 'LONG' : 'SHORT';
          const targetOutcome = isUp ? 'UP (صعود)' : 'DOWN (هبوط)';

          const activeSlug = mkt?.slug;
          const alreadyLocked =
            Boolean(activeSlug) &&
            activeSlug !== 'btc-up-or-down-5-min' &&
            lastExecutedMarketSlugRef.current === activeSlug &&
            now - lastExecutedTimestampRef.current < 5 * 60 * 1000;

          if (!alreadyLocked && now - lastEvaluatedEntrySignalTimeRef.current >= 4000) {
            if (!botActiveRef.current) {
              lastEvaluatedEntrySignalTimeRef.current = now;
              const pauseWarn = `⚠️ تحرك السعر $${absDelta.toFixed(1)} من سعر الأساس (≥ $150)! إشارة دخول ${targetOutcome} بأمر GTC عند 20%، ولكن الروبوت متوقف حالياً! اضغط "تشغيل الروبوت" لتفعيل الصفقات التلقائية.`;
              limitlessService.logDirect('SYSTEM', pauseWarn);
              setExecutionNotice({
                type: 'WARNING',
                message: pauseWarn,
                timestamp: now,
                action: 'START_BOT',
              });
            } else if (!isExecutingRef.current) {
              lastEvaluatedEntrySignalTimeRef.current = now;
              const cTime = latestCandle?.time || now;
              if (targetDirection === 'LONG') {
                entryLongCandlesRef.current.add(cTime);
              } else {
                entryShortCandlesRef.current.add(cTime);
              }
              const trigMsg = `🎯 [تحرك السعر ${delta > 0 ? '+' : ''}$${delta.toFixed(1)} ≥ 150$] جاري وضع أمر GTC عند 20% ($0.20) لعقد ${targetOutcome} (سيتم إلغاؤه تلقائياً في حال عدم التنفيذ عند بقاء 1 دقيقة).`;
              console.log(trigMsg);
              limitlessService.logDirect('SYSTEM', trigMsg);
              executeLiveTradeRef.current(0, targetDirection, cTime, false);
            }
          }
        }
      }
    }, 1000);

    return () => clearInterval(strategyTimer);
  }, [cancelPendingGtcOrder]);

  const clearTradeLock = useCallback(() => {
    lastExecutedMarketSlugRef.current = '';
    lastExecutedTimestampRef.current = 0;
    lastExecutedCandleTimeRef.current = 0;
    try {
      localStorage.removeItem('limitless_last_trade_guard');
    } catch {}
    limitlessService.clearTradeGuardOnVm().catch(() => {});
    setContractLockInfo({ isLocked: false });
    const unMsg = '🔓 تم إلغاء قفل العقد يدوياً. الروبوت مستعد لفتح صفقة جديدة.';
    console.log(unMsg);
    limitlessService.logDirect('SYSTEM', unMsg);
    setExecutionNotice({
      type: 'SUCCESS',
      message: unMsg,
      timestamp: Date.now(),
    });
  }, []);

  // Subscribe to Limitless WebSocket Gateway using official SDK
  useEffect(() => {
    const unsubStatus = limitlessService.subscribeStatus((st) => setLimitlessStatus(st));
    const unsubLogs = limitlessService.subscribeLogs((log) => {
      setWsLogs((prev) => [...prev.slice(-80), log]);
    });
    const unsubBalance = limitlessService.subscribeBalance((bal) => {
      console.log(`[EXCHANGE NOTICE] WebSocket balance notice: $${bal}`);
    });
    const unsubOrderbook = limitlessService.subscribeOrderbook((ob) => {
      orderbookRef.current = ob;
      setOrderbook(ob);
    });
    const unsubPrices = limitlessService.subscribePriceUpdate((data) => {
      if (data && data.prices && data.prices.length >= 2) {
        setActiveLimitlessMarket((prev) => {
          const updated = !prev
            ? ({
                slug: data.marketSlug || 'btc-up-or-down-5-min',
                title: 'BTC 5-Minute Prediction Market',
                status: 'FUNDED',
                prices: [data.prices[0], data.prices[1]],
              } as any)
            : {
                ...prev,
                prices: [data.prices[0], data.prices[1]],
              };
          activeLimitlessMarketRef.current = updated;
          return updated;
        });
      }
    });
    const unsubMarketChange = limitlessService.subscribeMarketChange((newMarket) => {
      if (
        newMarket &&
        newMarket.slug &&
        (/(^|[^0-9])5-min/i.test(newMarket.slug) || /5\s*min/i.test(newMarket.title || '') || /(^|[^0-9])5m/i.test(newMarket.slug)) &&
        !/(^|[^0-9])15-min/i.test(newMarket.slug) &&
        !/hourly/i.test(newMarket.slug)
      ) {
        const prevSlug = activeLimitlessMarketRef.current?.slug;
        const isNewRoundSlug = Boolean(prevSlug && prevSlug !== newMarket.slug);

        setActiveLimitlessMarket(newMarket);
        activeLimitlessMarketRef.current = newMarket;

        if (isNewRoundSlug) {
          entryShortCandlesRef.current.clear();
          entryLongCandlesRef.current.clear();
          crossedUpperThresholdRef.current = false;
          setCrossedUpperThreshold(false);
          crossedLowerThresholdRef.current = false;
          setCrossedLowerThreshold(false);
          setIsEntrySignal(false);
          setActiveSignal(null);
          setPendingGtcOrder(null);
          pendingGtcOrderRef.current = null;
        }

        if (lastExecutedMarketSlugRef.current && lastExecutedMarketSlugRef.current !== newMarket.slug) {
          lastExecutedMarketSlugRef.current = '';
          lastExecutedTimestampRef.current = 0;
          setContractLockInfo({ isLocked: false });
          try {
            localStorage.removeItem('limitless_last_trade_guard');
          } catch {}
        }

        if (candlesRef.current.length > 0) {
          rebuildMetricsRef.current(candlesRef.current, configRef.current);
        }
      }
    });
    const unsubOracle = limitlessService.subscribeOracle((orc) => setOracle(orc));
    const unsubPositions = limitlessService.subscribePositions((pos) => setPositions(pos));
    const unsubTradeGuard = limitlessService.subscribeTradeGuard((serverGuard) => {
      if (serverGuard && serverGuard.marketSlug) {
        lastExecutedMarketSlugRef.current = serverGuard.marketSlug;
        lastExecutedTimestampRef.current = Number(serverGuard.timestamp) || 0;
        lastExecutedCandleTimeRef.current = Number(serverGuard.candleTime) || 0;
        setContractLockInfo({
          isLocked: true,
          reason: `تم تنفيذ أمر على عقد ${serverGuard.marketSlug}`,
          cooldownRemainingMinutes: 5,
          lastTradedSlug: serverGuard.marketSlug,
        });
        try {
          localStorage.setItem('limitless_last_trade_guard', JSON.stringify(serverGuard));
        } catch {}
      } else if (serverGuard === null) {
        lastExecutedMarketSlugRef.current = '';
        lastExecutedTimestampRef.current = 0;
        lastExecutedCandleTimeRef.current = 0;
        setContractLockInfo({ isLocked: false });
        try {
          localStorage.removeItem('limitless_last_trade_guard');
        } catch {}
      }
    });

    limitlessService.connect(config.limitlessWsUrl, 'btc-up-or-down-5-min', {
      apiKey: config.limitlessApiKey,
      tokenId: config.limitlessTokenId,
      secret: config.limitlessTokenSecret,
    });

    return () => {
      unsubStatus();
      unsubLogs();
      unsubBalance();
      unsubOrderbook();
      unsubPrices();
      unsubMarketChange();
      unsubOracle();
      unsubPositions();
      unsubTradeGuard();
      limitlessService.disconnect();
    };
  }, [
    config.limitlessWsUrl,
    config.limitlessApiKey,
    config.limitlessTokenId,
    config.limitlessTokenSecret,
  ]);

  useEffect(() => {
    if (config.limitlessMarketSlug) {
      limitlessService.subscribeMarket(config.limitlessMarketSlug);
    }
  }, [config.limitlessMarketSlug]);

  const rebuildMetricsRef = useRef(rebuildMetrics);
  rebuildMetricsRef.current = rebuildMetrics;

  useEffect(() => {
    let isCancelled = false;

    async function initMarketData() {
      const lookbackBufferSize = 100;
      const realCandles = await binanceService.fetchHistoricalCandles(
        config.symbol,
        config.timeframe,
        lookbackBufferSize,
        config.binanceRestUrl
      );

      if (isCancelled) return;

      if (realCandles.length > 0) {
        candlesRef.current = realCandles;
        setCandles(realCandles);
        const closedCandles = realCandles.filter((c) => c.isClosed !== false);
        closePricesRef.current = closedCandles.map((c) => c.close).slice(-config.periods);
        rebuildMetricsRef.current(realCandles, configRef.current);
      }

      binanceService.connectWebSocket(
        config.symbol,
        config.timeframe,
        (tickCandle, isTickClosed) => {
          const prev = candlesRef.current;
          const maxBufferSize = 100;
          const last = prev[prev.length - 1];
          let updatedCandles: CandleData[] = [];

          if (last && last.time === tickCandle.time) {
            updatedCandles = [...prev.slice(0, -1), { ...tickCandle, isClosed: isTickClosed }];
          } else {
            const prevWithClosed = prev.map((c, idx) =>
              idx === prev.length - 1 ? { ...c, isClosed: true } : c
            );
            updatedCandles = [...prevWithClosed.slice(-maxBufferSize), { ...tickCandle, isClosed: false }];
          }

          candlesRef.current = updatedCandles;
          setCandles(updatedCandles);
          rebuildMetricsRef.current(updatedCandles, configRef.current);
        },
        (status) => setBinanceStatus(status),
        (recentOfficialCandles) => {
          const prev = candlesRef.current;
          if (prev.length === 0) return;
          const wsConnected = binanceStatusRef.current === 'CONNECTED';
          const latestLiveCandleTime = prev[prev.length - 1]?.time || 0;
          const candleMap = new Map<number, CandleData>();
          for (const c of prev) {
            candleMap.set(c.time, c);
          }
          for (const rc of recentOfficialCandles) {
            if (wsConnected && rc.time >= latestLiveCandleTime && rc.isClosed === false) {
              continue;
            }
            const existing = candleMap.get(rc.time);
            if (!existing || rc.isClosed !== false) {
              candleMap.set(rc.time, rc);
            }
          }
          const merged = Array.from(candleMap.values())
            .sort((a, b) => a.time - b.time)
            .slice(-100);

          candlesRef.current = merged;
          setCandles(merged);
          rebuildMetricsRef.current(merged, configRef.current);
        }
      );
    }

    initMarketData();

    return () => {
      isCancelled = true;
      binanceService.disconnect();
    };
  }, [config.symbol, config.timeframe, config.periods, config.binanceRestUrl]);

  const [hasEnvCredentials, setHasEnvCredentials] = useState<boolean>(() => {
    return Boolean(config.limitlessTokenId && config.limitlessTokenSecret);
  });
  const [liveWallet, setLiveWallet] = useState<LiveWalletInfo | null>(null);
  const [isLiveBalance, setIsLiveBalance] = useState<boolean>(false);
  const [isFetchingBalance, setIsFetchingBalance] = useState<boolean>(false);
  const [activeLimitlessMarket, setActiveLimitlessMarket] = useState<LimitlessMarketDetails | null>(null);
  const [isRefreshingMarket, setIsRefreshingMarket] = useState<boolean>(false);

  const refreshActiveMarket = useCallback(async () => {
    setIsRefreshingMarket(true);
    try {
      const res = await fetch('/api/limitless/active-btc');
      if (res.ok) {
        const data = await res.json();
        if (
          data &&
          data.success &&
          data.slug &&
          (/(^|[^0-9])5-min/i.test(data.slug) || /5\s*min/i.test(data.title || '') || /(^|[^0-9])5m/i.test(data.slug)) &&
          !/(^|[^0-9])15-min/i.test(data.slug) &&
          !/hourly/i.test(data.slug)
        ) {
          const prevSlug = activeLimitlessMarketRef.current?.slug;
          const isNewRoundSlug = Boolean(prevSlug && prevSlug !== data.slug);

          setActiveLimitlessMarket(data);
          activeLimitlessMarketRef.current = data;

          if (isNewRoundSlug) {
            entryShortCandlesRef.current.clear();
            entryLongCandlesRef.current.clear();
            crossedUpperThresholdRef.current = false;
            setCrossedUpperThreshold(false);
            crossedLowerThresholdRef.current = false;
            setCrossedLowerThreshold(false);
            setIsEntrySignal(false);
            setActiveSignal(null);
            setPendingGtcOrder(null);
            pendingGtcOrderRef.current = null;
          }

          if (lastExecutedMarketSlugRef.current && lastExecutedMarketSlugRef.current !== data.slug) {
            lastExecutedMarketSlugRef.current = '';
            lastExecutedTimestampRef.current = 0;
            setContractLockInfo({ isLocked: false });
            try {
              localStorage.removeItem('limitless_last_trade_guard');
            } catch {}
          }

          if (candlesRef.current.length > 0) {
            rebuildMetricsRef.current(candlesRef.current, configRef.current);
          }
        }
      }
    } catch {
      // safe continuation
    } finally {
      setIsRefreshingMarket(false);
    }
  }, []);

  const refreshLiveBalance = useCallback(async () => {
    setIsFetchingBalance(true);
    try {
      const cfg = configRef.current;
      const addrQuery = cfg.walletAddress ? `?address=${encodeURIComponent(cfg.walletAddress)}` : '';
      const res = await fetch(`/api/balance${addrQuery}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.success && data.isLive) {
        setIsLiveBalance(true);
        setLiveUsdcBalance(data.usdcBalance);
        setCurrentBalance(data.usdcBalance);
        currentBalanceRef.current = data.usdcBalance;
        setLiveWallet({
          isLive: true,
          address: data.address,
          usdcBalance: data.usdcBalance,
          ethBalance: data.ethBalance,
          network: data.network,
          username: data.profile?.username,
          points: data.profile?.points,
          rank: data.profile?.rank,
          lastUpdated: Date.now(),
        });
      }
    } catch {
      // Ignore
    } finally {
      setIsFetchingBalance(false);
    }
  }, []);

  useEffect(() => {
    fetch('/api/credentials')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.hasLmtsTokenId && data.hasLmtsTokenSecret) {
          setHasEnvCredentials(true);
          setConfig((prev) => {
            if (!prev.limitlessTokenId || !prev.limitlessTokenSecret) {
              const updated = {
                ...prev,
                limitlessTokenId: data.limitlessTokenId,
                limitlessTokenSecret: data.limitlessTokenSecret,
                limitlessApiKey: data.limitlessApiKey || prev.limitlessApiKey,
                walletAddress: data.walletAddress || prev.walletAddress,
              };
              try {
                localStorage.setItem('limitless_live_bot_config', JSON.stringify(updated));
              } catch {
                // Ignore
              }
              return updated;
            }
            return prev;
          });
        }
      })
      .catch(() => {});

    refreshActiveMarket();
    const marketInterval = setInterval(() => {
      refreshActiveMarket();
    }, 2000);

    refreshLiveBalance();
    const balanceInterval = setInterval(() => {
      refreshLiveBalance();
    }, 12000);

    const isPreviewHost = typeof window !== 'undefined' && window.location.hostname.includes('.run.app');
    if (isPreviewHost) {
      fetch('/api/bot-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: false }),
      }).catch(() => {});
    } else {
      fetch('/api/bot-state')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d && typeof d.active === 'boolean') {
            setBotActive(d.active);
            botActiveRef.current = d.active;
            try {
              localStorage.setItem('limitless_bot_active_v2', String(d.active));
            } catch {}
          }
        })
        .catch(() => {});
    }

    return () => {
      clearInterval(marketInterval);
      clearInterval(balanceInterval);
    };
  }, [refreshLiveBalance, refreshActiveMarket]);

  const toggleBot = () => {
    setBotActive((prev) => {
      const next = !prev;
      botActiveRef.current = next;
      try {
        localStorage.setItem('limitless_bot_active_v2', String(next));
      } catch {}
      fetch('/api/bot-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: next }),
      }).catch(() => {});

      if (next) {
        refreshLiveBalance();
      }
      return next;
    });
  };

  const triggerManualTrade = useCallback(
    (direction: 'SHORT' | 'LONG' = 'LONG') => {
      executeLiveTrade(0, direction, undefined, true);
    },
    [executeLiveTrade]
  );

  const kelly = calculateKellySizing(currentBalance, {
    maxPriceCents: 0.20,
    winProbability: config.winProbability,
    maxRiskPercent: config.maxRiskPercent || 0.10,
    fractionChunks: 1,
  });

  const latestConfirmedMetric = metrics.length > 0 ? metrics[metrics.length - 1] : null;

  return {
    config,
    updateConfig,
    candles,
    metrics,
    latestMetric: latestConfirmedMetric,
    currentZScore,
    priceDeviation,
    crossedUpperThreshold,
    crossedLowerThreshold,
    lastTradeDirection,
    activeSignal,
    isEntrySignal,
    currentBalance,
    liveUsdcBalance,
    threeFiltersStatus: advancedFiltersStatus,
    advancedFiltersStatus,
    executionNotice,
    setExecutionNotice,
    pendingGtcOrder,
    cancelPendingGtcOrder,
    isLiveBalance,
    liveWallet,
    isFetchingBalance,
    refreshLiveBalance,
    botActive,
    toggleBot,
    triggerManualTrade,
    binanceStatus,
    limitlessStatus,
    wsLogs,
    currentChunks,
    activeTrade,
    tradeHistory,
    isExecuting,
    lastSignalTime,
    kelly,
    soundEnabled,
    toggleSound,
    orderbook,
    oracle,
    positions,
    hasEnvCredentials,
    activeLimitlessMarket,
    isRefreshingMarket,
    refreshActiveMarket,
    contractLockInfo,
    clearTradeLock,
    recentChartSignal,
  };
}
