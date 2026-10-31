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
import { calculateZScore, calculateKellySizing } from '../utils/math';
import { soundController } from '../utils/audio';

const DEFAULT_CONFIG: BotConfig = {
  symbol: 'BTCUSDT',
  timeframe: '1m',
  periods: 45,
  strategyDirection: 'BOTH', // 'BOTH' | 'LONG_ONLY' | 'SHORT_ONLY'
  zScoreUpper: 2.5, // First confirmation: +2.5
  zScoreEntry: 2.3, // Second confirmation: +2.3
  zScoreLower: -2.5, // First confirmation: -2.5
  zScoreLowerEntry: -2.3, // Second confirmation: -2.3
  maxPriceCents: 0.99, // GTC Order without max Entry price
  maxRiskPercent: 0.04, // Fixed 4% of bankroll per 15m contract
  orderType: 'GTC', // Good-Til-Cancelled
  fractionChunks: 1, // 1 unified single direct order
  chunkDelayMs: 0,
  winProbability: 0.55,
  initialBalance: 1000,
  binanceRestUrl: 'https://api.binance.com/api/v3/klines',
  binanceWsUrl: 'wss://stream.binance.com/ws/btcusdt@kline_1m',
  limitlessWsUrl: 'wss://ws.limitless.exchange',
  limitlessMarketSlug: 'btc-up-or-down-15-min',
  limitlessApiKey: (typeof process !== 'undefined' && process.env?.LIMITLESS_API_KEY) || '',
  limitlessTokenId: (typeof process !== 'undefined' && process.env?.LMTS_TOKEN_ID) || '',
  limitlessTokenSecret: (typeof process !== 'undefined' && process.env?.LMTS_TOKEN_SECRET) || '',
  singleTradePerContract: true, // Max 1 bet per 15m contract
  cooldownMinutes: 15, // 15-minute contract cycle guard
};

export function useTradingBot() {
  const [config, setConfig] = useState<BotConfig>(() => {
    // Read persisted config if available and migrate to latest strategy settings
    try {
      const saved = localStorage.getItem('limitless_live_bot_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        parsed.timeframe = '1m';
        parsed.periods = 45;
        parsed.binanceWsUrl = 'wss://stream.binance.com/ws/btcusdt@kline_1m';
        if (parsed.binanceRestUrl && parsed.binanceRestUrl.includes('binance.vision')) {
          parsed.binanceRestUrl = DEFAULT_CONFIG.binanceRestUrl;
        }
        if (parsed.limitlessWsUrl && parsed.limitlessWsUrl.includes('api.limitless.exchange')) {
          parsed.limitlessWsUrl = DEFAULT_CONFIG.limitlessWsUrl;
        }
        // Migrate to 15-minute BTC market slug
        if (
          !parsed.limitlessMarketSlug ||
          /(^|[^0-9])5-min/i.test(parsed.limitlessMarketSlug) ||
          /hourly/i.test(parsed.limitlessMarketSlug) ||
          /(^|[^0-9])1-hour/i.test(parsed.limitlessMarketSlug) ||
          parsed.limitlessMarketSlug.includes('weekly') ||
          /\d{8,}/.test(parsed.limitlessMarketSlug)
        ) {
          parsed.limitlessMarketSlug = DEFAULT_CONFIG.limitlessMarketSlug;
        }
        if (!parsed.strategyDirection) {
          parsed.strategyDirection = 'BOTH';
        }
        // Enforce Z-Score First confirmation 2.5 and Second confirmation 2.3
        parsed.zScoreUpper = 2.5;
        parsed.zScoreEntry = 2.3;
        parsed.zScoreLower = -2.5;
        parsed.zScoreLowerEntry = -2.3;
        // Enforce GTC Order without max Entry price
        parsed.orderType = 'GTC';
        parsed.maxPriceCents = 0.99;
        parsed.fractionChunks = 1;
        parsed.chunkDelayMs = 0;
        // Enforce max Fixed 4% of bankroll per 15m contract
        parsed.maxRiskPercent = 0.04;
        parsed.singleTradePerContract = true;
        parsed.cooldownMinutes = 15;

        // Auto-inject env secrets if persisted config has empty credentials
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
  const [crossedUpperThreshold, setCrossedUpperThreshold] = useState<boolean>(false);
  const [crossedLowerThreshold, setCrossedLowerThreshold] = useState<boolean>(false);
  const [lastTradeDirection, setLastTradeDirection] = useState<'SHORT' | 'LONG' | null>(null);
  const [activeSignal, setActiveSignal] = useState<'ENTRY_SHORT' | 'ENTRY_LONG' | null>(null);
  const [isEntrySignal, setIsEntrySignal] = useState<boolean>(false);
  const [currentBalance, setCurrentBalance] = useState<number>(0);
  const [liveUsdcBalance, setLiveUsdcBalance] = useState<number>(0);
  const [executionNotice, setExecutionNotice] = useState<{
    type: 'SUCCESS' | 'WARNING' | 'ERROR';
    message: string;
    timestamp: number;
    action?: 'START_BOT' | 'TRIGGER_TRADE';
  } | null>(null);

  const [orderbook, setOrderbook] = useState<import('../types/bot').OrderbookUpdate | null>(null);
  const [oracle, setOracle] = useState<import('../types/bot').OraclePriceData | null>(null);
  const [positions, setPositions] = useState<import('../types/bot').PositionItem[]>([]);
  const [botActive, setBotActive] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('limitless_bot_active_state');
      if (saved !== null) {
        return saved === 'true';
      }
    } catch {
      // Safe fallback
    }
    return true;
  });
  const [binanceStatus, setBinanceStatus] = useState<'CONNECTING' | 'CONNECTED' | 'DISCONNECTED'>('CONNECTING');
  const [limitlessStatus, setLimitlessStatus] = useState<LimitlessStatus>('DISCONNECTED');
  const [wsLogs, setWsLogs] = useState<WsMessageLog[]>([]);
  const [currentChunks, setCurrentChunks] = useState<ExecutedChunk[]>([]);
  const [activeTrade, setActiveTrade] = useState<TradeOrder | null>(null);
  const [tradeHistory, setTradeHistory] = useState<TradeOrder[]>(() => {
    try {
      const saved = localStorage.getItem('limitless_bot_trade_history');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(false);
  const [lastSignalTime, setLastSignalTime] = useState<number | null>(null);

  // References for live closures and duplicate prevention
  const closePricesRef = useRef<number[]>([]);
  const crossedUpperThresholdRef = useRef<boolean>(false);
  const crossedLowerThresholdRef = useRef<boolean>(false);
  const armedUpperCandleTimeRef = useRef<number>(0);
  const armedLowerCandleTimeRef = useRef<number>(0);
  const lastEvaluatedClosedCandleTimeRef = useRef<number>(0);
  const botActiveRef = useRef<boolean>(botActive);
  const configRef = useRef<BotConfig>(config);
  const currentBalanceRef = useRef<number>(currentBalance);
  const isExecutingRef = useRef<boolean>(false);
  const lastExecutedCandleTimeRef = useRef<number>(0);
  const lastExecutedMarketSlugRef = useRef<string>('');
  const lastExecutedTimestampRef = useRef<number>(0);
  const activeLimitlessMarketRef = useRef<LimitlessMarketDetails | null>(null);
  const metricsRef = useRef<ZScoreMetric[]>([]);

  // Persistent trade lock status (1 bet per 15m contract)
  const [contractLockInfo, setContractLockInfo] = useState<{
    isLocked: boolean;
    reason?: string;
    cooldownRemainingMinutes?: number;
    lastTradedSlug?: string;
  }>({ isLocked: false });

  // Load persistent trade guard on mount (Sync from VM server disk & RAM with 15-minute auto-expiry)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('limitless_last_trade_guard');
      if (saved) {
        const parsed = JSON.parse(saved);
        const age = Date.now() - (Number(parsed?.timestamp) || 0);
        if (age < 15 * 60 * 1000) {
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
          if (age < 15 * 60 * 1000) {
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
  crossedUpperThresholdRef.current = crossedUpperThreshold;
  crossedLowerThresholdRef.current = crossedLowerThreshold;
  metricsRef.current = metrics;

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundController.enabled = next;
  };

  // Save config
  const updateConfig = (partial: Partial<BotConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...partial };
      if (next.maxRiskPercent !== undefined) {
        next.maxRiskPercent = Math.min(Math.max(Number(next.maxRiskPercent) || 0.04, 0.001), 0.04);
      }
      try {
        localStorage.setItem('limitless_live_bot_config', JSON.stringify(next));
      } catch {
        // Safe localStorage
      }
      return next;
    });
  };

  // Recompute metrics series on candle updates (State machine strictly evaluates on Closed Candles Only)
  const rebuildMetrics = useCallback((candleList: CandleData[], cfg: BotConfig) => {
    const result: ZScoreMetric[] = [];
    const closes = candleList.map((c) => c.close);
    let hadArmedUpper = false;
    let hadArmedLower = false;
    let lastClosedMetric: ZScoreMetric | null = null;

    const lowerThresh = cfg.zScoreLower !== undefined ? cfg.zScoreLower : -cfg.zScoreUpper;
    const lowerEntryThresh = cfg.zScoreLowerEntry !== undefined ? cfg.zScoreLowerEntry : -cfg.zScoreEntry;

    for (let i = 0; i < candleList.length; i++) {
      const isClosedCandle = candleList[i].isClosed !== false;

      if (i < cfg.periods - 1) {
        const emptyMetric: ZScoreMetric = {
          time: candleList[i].time,
          price: candleList[i].close,
          mean: candleList[i].close,
          stdDev: 0,
          variance: 0,
          zScore: 0,
          upperBand: candleList[i].close,
          entryBand: candleList[i].close,
          lowerEntryBand: candleList[i].close,
          lowerBand: candleList[i].close,
          upperThreshold: cfg.zScoreUpper,
          entryThreshold: cfg.zScoreEntry,
          lowerThreshold: lowerThresh,
          lowerEntryThreshold: lowerEntryThresh,
          signal: null,
          direction: null,
        };
        result.push(emptyMetric);
        if (isClosedCandle) lastClosedMetric = emptyMetric;
        continue;
      }

      const windowSlice = closes.slice(i - cfg.periods + 1, i + 1);
      const stats = calculateZScore(windowSlice, cfg.zScoreUpper, cfg.zScoreEntry, lowerThresh, lowerEntryThresh);

      let signal: 'ARMED_UPPER' | 'ARMED_LOWER' | 'ENTRY_SHORT' | 'ENTRY_LONG' | 'ARMED' | 'ENTRY' | null = null;
      let dir: 'SHORT' | 'LONG' | null = null;

      // Strictly advance confirmation state machine ONLY on confirmed closed candles
      if (isClosedCandle) {
        // Upper Direction (Short / DOWN): First confirmation >= 2.5, Second confirmation <= 2.3
        if (cfg.strategyDirection === 'BOTH' || cfg.strategyDirection === 'SHORT_ONLY') {
          if (stats.zScore >= cfg.zScoreUpper) {
            hadArmedUpper = true;
            signal = 'ARMED_UPPER';
            dir = 'SHORT';
          } else if (hadArmedUpper && stats.zScore <= cfg.zScoreEntry && stats.zScore > 0) {
            hadArmedUpper = false;
            signal = 'ENTRY_SHORT';
            dir = 'SHORT';
          } else if (stats.zScore <= 0) {
            hadArmedUpper = false;
          }
        }

        // Lower Direction (Long / UP): First confirmation <= -2.5, Second confirmation >= -2.3
        if (cfg.strategyDirection === 'BOTH' || cfg.strategyDirection === 'LONG_ONLY') {
          if (stats.zScore <= lowerThresh) {
            hadArmedLower = true;
            signal = 'ARMED_LOWER';
            dir = 'LONG';
          } else if (hadArmedLower && stats.zScore >= lowerEntryThresh && stats.zScore < 0) {
            hadArmedLower = false;
            signal = 'ENTRY_LONG';
            dir = 'LONG';
          } else if (stats.zScore >= 0) {
            hadArmedLower = false;
          }
        }
      }

      const metricItem: ZScoreMetric = {
        time: candleList[i].time,
        price: stats.currentPrice,
        mean: stats.mean,
        stdDev: stats.stdDev,
        variance: stats.variance,
        zScore: stats.zScore,
        upperBand: stats.upperBand,
        entryBand: stats.entryBand,
        lowerEntryBand: stats.lowerEntryBand,
        lowerBand: stats.lowerBand,
        upperThreshold: cfg.zScoreUpper,
        entryThreshold: cfg.zScoreEntry,
        lowerThreshold: lowerThresh,
        lowerEntryThreshold: lowerEntryThresh,
        signal,
        direction: dir,
      };

      result.push(metricItem);
      if (isClosedCandle) {
        lastClosedMetric = metricItem;
      }
    }

    setMetrics(result);
    if (result.length > 0) {
      const confirmedMetric = lastClosedMetric || result[result.length - 1];
      setCurrentZScore(confirmedMetric.zScore);

      if (hadArmedUpper) {
        crossedUpperThresholdRef.current = true;
        setCrossedUpperThreshold(true);
      }
      if (hadArmedLower) {
        crossedLowerThresholdRef.current = true;
        setCrossedLowerThreshold(true);
      }
    }
  }, []);

  // Enforce 1 bet per 15m contract
  const checkTradeLock = useCallback((targetSlug?: string, _cTime?: number): { locked: boolean; reason?: string } => {
    const cfg = configRef.current;
    if (!cfg.singleTradePerContract) return { locked: false };

    const lastSlug = lastExecutedMarketSlugRef.current;
    const lastTime = lastExecutedTimestampRef.current;
    if (
      targetSlug &&
      lastSlug &&
      targetSlug === lastSlug &&
      targetSlug !== 'btc-up-or-down-15-min' &&
      Date.now() - lastTime < 15 * 60 * 1000
    ) {
      return {
        locked: true,
        reason: `🔒 تم بالفعل فتح صفقة (4% من الرصيد) على عقد الـ 15 دقيقة الحالي (${targetSlug}). سينتقل الروبوت تلقائياً للعقد القادم.`,
      };
    }
    return { locked: false };
  }, []);

  // Execute LIVE Trade strictly across Limitless (15m Contract, Fixed 4% Bankroll, GTC without Max Entry Price)
  const executeLiveTrade = useCallback(async (
    triggerZ: number,
    direction: 'SHORT' | 'LONG' = 'SHORT',
    candleTime?: number
  ) => {
    if (isExecutingRef.current) {
      console.warn('[CONCURRENCY BLOCKED] An order is already in-flight.');
      return;
    }

    const cfg = configRef.current;
    let balance = currentBalanceRef.current;

    // Determine target 15-minute market slug using latest live ref first
    let currentMarket = activeLimitlessMarketRef.current;
    const is15mMarket = (s?: string) => Boolean(s && (/(^|[^0-9])15-min/i.test(s) || s.includes('15m')));

    if (!currentMarket?.slug || !is15mMarket(currentMarket.slug)) {
      try {
        const mRes = await fetch('/api/limitless/active-btc');
        if (mRes.ok) {
          const mData = await mRes.json();
          if (mData && mData.slug && is15mMarket(mData.slug)) {
            currentMarket = mData;
            activeLimitlessMarketRef.current = mData;
            setActiveLimitlessMarket(mData);
          }
        }
      } catch {}
    }

    const resolvedMarketSlug =
      currentMarket?.slug && is15mMarket(currentMarket.slug)
        ? currentMarket.slug
        : cfg.limitlessMarketSlug && is15mMarket(cfg.limitlessMarketSlug)
        ? cfg.limitlessMarketSlug
        : 'btc-up-or-down-15-min';

    // Strict Anti-Duplicate Guard (1 trade per 15m contract)
    const lock = checkTradeLock(resolvedMarketSlug, candleTime);
    if (lock.locked) {
      console.warn(`[SAFETY GUARD BLOCKED] Trade rejected: ${lock.reason}`);
      setExecutionNotice({
        type: 'WARNING',
        message: lock.reason || 'الصفقة مقفلة لمنع التكرار على نفس عقد الـ 15 دقيقة',
        timestamp: Date.now(),
      });
      return;
    }

    // Strict Safety Guard: Only trade 15-minute contracts
    if (/(^|[^0-9])5-min/i.test(resolvedMarketSlug) || /hourly/i.test(resolvedMarketSlug) || /(^|[^0-9])1-hour/i.test(resolvedMarketSlug)) {
      console.error(
        `[SAFETY SHIELD] Contract '${resolvedMarketSlug}' blocked! Trading bot is locked strictly to 15-minute contracts.`
      );
      return;
    }

    // Balance check with on-the-fly live API fetch if balance in memory is 0
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

    // Live contract pricing based on chosen outcome (UP or DOWN) — GTC without max Entry price
    const currentMarketData = activeLimitlessMarketRef.current;
    const yesPrice = currentMarketData?.tradePrices?.buy?.market?.[0]
      ?? currentMarketData?.prices?.[0]
      ?? 0.50;
    const noPrice = currentMarketData?.tradePrices?.buy?.market?.[1]
      ?? currentMarketData?.prices?.[1]
      ?? (1 - yesPrice);
    const liveContractPrice = isLong ? yesPrice : noPrice;
    // Align to 3 decimals as strictly required by Limitless SDK (multiple of 0.001) — NO max entry price ceiling
    const effectiveContractPrice = parseFloat(Math.max(0.001, Math.min(0.999, liveContractPrice)).toFixed(3));

    // Hard Risk Guard: Fixed 4% of bankroll per 15m contract
    const maxRiskCap = Math.min(cfg.maxRiskPercent || 0.04, 0.04);
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

    // Ensure dollar cost strictly never exceeds Fixed 4% of bankroll
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
        const minWarning = `⚠️ رصيد المحفظة الحالي ($${balance.toFixed(2)} USDC) ونسبة 4% ($${maxBudgetUsd.toFixed(2)}) لا يكفي لشراء عقد بسعر $${effectiveContractPrice}.`;
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
      status: 'PENDING_WS',
    };

    setActiveTrade(initialTrade);

    try {
      console.log(
        `[LIVE DIRECT EXECUTION - ${direction}] Sending unified GTC order of ${effectiveContracts} contracts to Limitless (${resolvedMarketSlug} - ${outcome}) @ $${effectiveContractPrice} [Fixed 4% Bankroll - No Max Entry Price]...`
      );

      limitlessService.logDirect(
        'OUTGOING',
        `🚀 [تنفيذ صفقة GTC مباشرة] إرسال أمر موحد لعدد ${effectiveContracts} عقود ${outcome} (${direction}) بسعر السوق $${effectiveContractPrice} إلى عقد 15m (${resolvedMarketSlug}) بحجم ثابت 4% من الرصيد...`
      );

      const executed = await limitlessService.executeChunkedOrder(
        effectiveContracts,
        effectiveContractPrice,
        1,
        'GTC',
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
        }
      );

      const completedTrade: TradeOrder = {
        ...initialTrade,
        chunks: executed,
        status: 'ACTIVE_GTC',
      };

      setActiveTrade(completedTrade);
      setTradeHistory((prev) => {
        const next = [completedTrade, ...prev];
        try {
          localStorage.setItem('limitless_bot_trade_history', JSON.stringify(next.slice(0, 100)));
        } catch {}
        return next;
      });

      const now = Date.now();
      lastExecutedCandleTimeRef.current = candleTime || now;
      lastExecutedMarketSlugRef.current = resolvedMarketSlug;
      lastExecutedTimestampRef.current = now;
      setContractLockInfo({
        isLocked: true,
        reason: `تم تنفيذ صفقة 4% على عقد ${resolvedMarketSlug}`,
        cooldownRemainingMinutes: 15,
        lastTradedSlug: resolvedMarketSlug,
      });

      const invested = completedTrade.totalInvestmentUsd;
      setCurrentBalance((prev) => Math.max(0, prev - invested));
      currentBalanceRef.current = Math.max(0, currentBalanceRef.current - invested);

      const successNotice = `✅ تم إرسال صفقة GTC بنجاح: شراء ${outcome} (${direction}) لعدد ${effectiveContracts} عقد بقيمة $${invested.toFixed(2)} (4% ثابتة من الرصيد بدون سقف سعر دخول) على عقد الـ 15 دقيقة ${resolvedMarketSlug}`;
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

  const clearTradeLock = useCallback(() => {
    lastExecutedMarketSlugRef.current = '';
    lastExecutedTimestampRef.current = 0;
    lastExecutedCandleTimeRef.current = 0;
    try {
      localStorage.removeItem('limitless_last_trade_guard');
    } catch {}
    limitlessService.clearTradeGuardOnVm().catch(() => {});
    setContractLockInfo({ isLocked: false });
    const unMsg = '🔓 تم إلغاء قفل عقد الـ 15 دقيقة يدوياً. الروبوت مستعد لفتح صفقة جديدة.';
    console.log(unMsg);
    limitlessService.logDirect('SYSTEM', unMsg);
    setExecutionNotice({
      type: 'SUCCESS',
      message: unMsg,
      timestamp: Date.now(),
    });
  }, []);

  // Real Market Strategy Evaluation (STRICTLY CLOSED CANDLES ONLY):
  // 1m closed candles (45 periods), First confirmation 2.5 -> Second confirmation 2.3
  const evaluateLiveStrategy = useCallback(
    (closedPrices: number[], closedCandleTime?: number) => {
      const cfg = configRef.current;
      if (closedPrices.length < cfg.periods) return;

      // Prevent duplicate evaluation of the exact same closed candle
      if (closedCandleTime && lastEvaluatedClosedCandleTimeRef.current === closedCandleTime) {
        return;
      }
      if (closedCandleTime) {
        lastEvaluatedClosedCandleTimeRef.current = closedCandleTime;
      }

      const windowSlice = closedPrices.slice(-cfg.periods);
      const lowerThresh = cfg.zScoreLower !== undefined ? cfg.zScoreLower : -cfg.zScoreUpper;
      const lowerEntryThresh = cfg.zScoreLowerEntry !== undefined ? cfg.zScoreLowerEntry : -cfg.zScoreEntry;

      const { zScore } = calculateZScore(windowSlice, cfg.zScoreUpper, cfg.zScoreEntry, lowerThresh, lowerEntryThresh);
      setCurrentZScore(zScore);

      // ================= DIRECTION 1: Short (DOWN) — First Confirmation >= +2.5, Second Confirmation <= +2.3 (Closed Candles Only) =================
      if (cfg.strategyDirection === 'BOTH' || cfg.strategyDirection === 'SHORT_ONLY') {
        if (zScore >= cfg.zScoreUpper) {
          armedUpperCandleTimeRef.current = closedCandleTime || Date.now();
          if (!crossedUpperThresholdRef.current) {
            crossedUpperThresholdRef.current = true;
            setCrossedUpperThreshold(true);
            const armMsg = `⚡ [التأكيد الأول +${cfg.zScoreUpper}σ · شمعة مغلقة] أغلقت شمعة 1m عند Z-Score = +${zScore.toFixed(2)}σ. في انتظار إغلاق شمعة التأكيد الثاني (≤ +${cfg.zScoreEntry}σ) لتنفيذ صفقة SHORT (DOWN).`;
            console.log(armMsg);
            limitlessService.logDirect('SYSTEM', armMsg);
          }
        } else if (
          crossedUpperThresholdRef.current &&
          zScore <= cfg.zScoreEntry &&
          zScore > 0 &&
          (!closedCandleTime || closedCandleTime > armedUpperCandleTimeRef.current)
        ) {
          crossedUpperThresholdRef.current = false;
          setCrossedUpperThreshold(false);

          if (!botActiveRef.current) {
            const pauseWarn = `⚠️ تحقق التأكيد الثاني بعد إغلاق الشمعة (Z=+${zScore.toFixed(2)}σ ≤ +${cfg.zScoreEntry}σ) ولكن الروبوت متوقف حالياً! اضغط "تشغيل الروبوت" لتفعيل الصفقات التلقائية.`;
            console.warn(pauseWarn);
            limitlessService.logDirect('SYSTEM', pauseWarn);
            setExecutionNotice({
              type: 'WARNING',
              message: pauseWarn,
              timestamp: Date.now(),
              action: 'START_BOT',
            });
            return;
          }

          if (!isExecutingRef.current) {
            const trigMsg = `🎯 [تحقق التأكيد الثاني ≤ +${cfg.zScoreEntry}σ · شمعة مغلقة] أغلقت شمعة 1m بارتداد Z-Score من فوق +${cfg.zScoreUpper}σ إلى +${zScore.toFixed(2)}σ! جاري إرسال أمر GTC لشراء عقد DOWN (4% من الرصيد).`;
            console.log(trigMsg);
            limitlessService.logDirect('SYSTEM', trigMsg);
            executeLiveTrade(zScore, 'SHORT', closedCandleTime);
          }
        } else if (zScore <= 0 && crossedUpperThresholdRef.current) {
          crossedUpperThresholdRef.current = false;
          setCrossedUpperThreshold(false);
        }
      }

      // ================= DIRECTION 2: Long (UP) — First Confirmation <= -2.5, Second Confirmation >= -2.3 (Closed Candles Only) =================
      if (cfg.strategyDirection === 'BOTH' || cfg.strategyDirection === 'LONG_ONLY') {
        if (zScore <= lowerThresh) {
          armedLowerCandleTimeRef.current = closedCandleTime || Date.now();
          if (!crossedLowerThresholdRef.current) {
            crossedLowerThresholdRef.current = true;
            setCrossedLowerThreshold(true);
            const armMsg = `⚡ [التأكيد الأول ${lowerThresh}σ · شمعة مغلقة] أغلقت شمعة 1m عند Z-Score = ${zScore.toFixed(2)}σ. في انتظار إغلاق شمعة التأكيد الثاني (≥ ${lowerEntryThresh}σ) لتنفيذ صفقة LONG (UP).`;
            console.log(armMsg);
            limitlessService.logDirect('SYSTEM', armMsg);
          }
        } else if (
          crossedLowerThresholdRef.current &&
          zScore >= lowerEntryThresh &&
          zScore < 0 &&
          (!closedCandleTime || closedCandleTime > armedLowerCandleTimeRef.current)
        ) {
          crossedLowerThresholdRef.current = false;
          setCrossedLowerThreshold(false);

          if (!botActiveRef.current) {
            const pauseWarn = `⚠️ تحقق التأكيد الثاني بعد إغلاق الشمعة (Z=${zScore.toFixed(2)}σ ≥ ${lowerEntryThresh}σ) ولكن الروبوت متوقف حالياً! اضغط "تشغيل الروبوت" لتفعيل الصفقات التلقائية.`;
            console.warn(pauseWarn);
            limitlessService.logDirect('SYSTEM', pauseWarn);
            setExecutionNotice({
              type: 'WARNING',
              message: pauseWarn,
              timestamp: Date.now(),
              action: 'START_BOT',
            });
            return;
          }

          if (!isExecutingRef.current) {
            const trigMsg = `🎯 [تحقق التأكيد الثاني ≥ ${lowerEntryThresh}σ · شمعة مغلقة] أغلقت شمعة 1m بارتداد Z-Score من تحت ${lowerThresh}σ إلى ${zScore.toFixed(2)}σ! جاري إرسال أمر GTC لشراء عقد UP (4% من الرصيد).`;
            console.log(trigMsg);
            limitlessService.logDirect('SYSTEM', trigMsg);
            executeLiveTrade(zScore, 'LONG', closedCandleTime);
          }
        } else if (zScore >= 0 && crossedLowerThresholdRef.current) {
          crossedLowerThresholdRef.current = false;
          setCrossedLowerThreshold(false);
        }
      }
    },
    [executeLiveTrade]
  );

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
      setOrderbook(ob);
    });
    const unsubPrices = limitlessService.subscribePriceUpdate((data) => {
      if (data && data.prices && data.prices.length >= 2) {
        setActiveLimitlessMarket((prev) => {
          if (!prev) {
            return {
              slug: data.marketSlug || 'btc-up-or-down-15-min',
              title: 'BTC 15-Minute Prediction Market',
              status: 'FUNDED',
              prices: [data.prices[0], data.prices[1]],
            } as any;
          }
          return {
            ...prev,
            prices: [data.prices[0], data.prices[1]],
          };
        });
      }
    });
    const unsubMarketChange = limitlessService.subscribeMarketChange((newMarket) => {
      if (
        newMarket &&
        newMarket.slug &&
        (/(^|[^0-9])15-min/i.test(newMarket.slug) || /15\s*min/i.test(newMarket.title || '') || /(^|[^0-9])15m/i.test(newMarket.slug)) &&
        !/(^|[^0-9])5-min/i.test(newMarket.slug) &&
        !/hourly/i.test(newMarket.slug)
      ) {
        setActiveLimitlessMarket(newMarket);
        activeLimitlessMarketRef.current = newMarket;
        if (lastExecutedMarketSlugRef.current && lastExecutedMarketSlugRef.current !== newMarket.slug) {
          setContractLockInfo({ isLocked: false });
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
          reason: `تم تنفيذ صفقة 4% على عقد ${serverGuard.marketSlug}`,
          cooldownRemainingMinutes: 15,
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

    limitlessService.connect(config.limitlessWsUrl, 'btc-up-or-down-15-min', {
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

  // When active market slug changes, smoothly subscribe without disconnecting
  useEffect(() => {
    if (config.limitlessMarketSlug) {
      limitlessService.subscribeMarket(config.limitlessMarketSlug);
    }
  }, [config.limitlessMarketSlug]);

  const evaluateLiveStrategyRef = useRef(evaluateLiveStrategy);
  evaluateLiveStrategyRef.current = evaluateLiveStrategy;
  const rebuildMetricsRef = useRef(rebuildMetrics);
  rebuildMetricsRef.current = rebuildMetrics;

  // Load real Binance Historical Data (45 candles of 1m) & Live WebSocket (1m)
  useEffect(() => {
    let isCancelled = false;

    async function initMarketData() {
      const realCandles = await binanceService.fetchHistoricalCandles(
        config.symbol,
        config.timeframe,
        config.periods,
        config.binanceRestUrl
      );

      if (isCancelled) return;

      if (realCandles.length > 0) {
        setCandles(realCandles);
        const closedCandles = realCandles.filter((c) => c.isClosed !== false);
        const closedCloses = closedCandles.map((c) => c.close);
        closePricesRef.current = closedCloses.slice(-config.periods);
        rebuildMetricsRef.current(realCandles, configRef.current);

        // Initialize armed state from historical closed candles without firing stale historical entries
        if (closedCandles.length >= config.periods) {
          const latestClosed = closedCandles[closedCandles.length - 1];
          lastEvaluatedClosedCandleTimeRef.current = latestClosed.time;
        }
      }

      binanceService.connectWebSocket(
        config.symbol,
        config.timeframe,
        (tickCandle, isClosed) => {
          let updatedCandles: CandleData[] = [];
          setCandles((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.time === tickCandle.time) {
              updatedCandles = [...prev.slice(0, -1), tickCandle];
            } else {
              // Mark previous candle as closed when a new candle begins, keep 45 closed + 1 forming
              const prevWithClosed = prev.map((c, idx) =>
                idx === prev.length - 1 ? { ...c, isClosed: true } : c
              );
              updatedCandles = [...prevWithClosed.slice(-configRef.current.periods), tickCandle];
            }
            return updatedCandles;
          });

          if (updatedCandles.length >= configRef.current.periods) {
            // Strictly evaluate Z-Score strategy and confirmations ONLY when the 1m candle closes
            if (isClosed) {
              const confirmedClosedCandles = updatedCandles.filter((c) => c.isClosed !== false);
              const closedCloses = confirmedClosedCandles.map((c) => c.close);
              if (closedCloses.length >= configRef.current.periods) {
                closePricesRef.current = closedCloses.slice(-configRef.current.periods);
                evaluateLiveStrategyRef.current(closedCloses, tickCandle.time);
              }
            }

            rebuildMetricsRef.current(updatedCandles, configRef.current);
          }
        },
        (status) => setBinanceStatus(status)
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
          (/(^|[^0-9])15-min/i.test(data.slug) || /15\s*min/i.test(data.title || '') || /(^|[^0-9])15m/i.test(data.slug)) &&
          !/(^|[^0-9])5-min/i.test(data.slug) &&
          !/hourly/i.test(data.slug)
        ) {
          setActiveLimitlessMarket(data);
          activeLimitlessMarketRef.current = data;
          if (lastExecutedMarketSlugRef.current && lastExecutedMarketSlugRef.current !== data.slug) {
            setContractLockInfo({ isLocked: false });
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
      .catch(() => {
        // Fallback to define
      });

    // Keep active Limitless BTC prediction market synchronized continuously
    refreshActiveMarket();
    const marketInterval = setInterval(() => {
      refreshActiveMarket();
    }, 2500);

    // Fetch initial balance and poll periodically so live wallet balance is continuously updated
    refreshLiveBalance();
    const balanceInterval = setInterval(() => {
      refreshLiveBalance();
    }, 12000);

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
        localStorage.setItem('limitless_bot_active_state', String(next));
      } catch {
        // Safe localStorage
      }
      if (next) {
        // Immediate balance update when bot is turned on
        refreshLiveBalance();
      }
      return next;
    });
  };

  const triggerManualTrade = useCallback(
    (direction: 'SHORT' | 'LONG' = 'SHORT') => {
      const defaultZ = direction === 'SHORT' ? 2.3 : -2.3;
      executeLiveTrade(currentZScore || defaultZ, direction);
    },
    [executeLiveTrade, currentZScore]
  );

  const livePreviewPrice =
    config.maxPriceCents >= 0.99
      ? activeLimitlessMarket?.prices?.[0] && activeLimitlessMarket.prices[0] > 0 && activeLimitlessMarket.prices[0] < 1
        ? activeLimitlessMarket.prices[0]
        : 0.50
      : config.maxPriceCents;

  const kelly = calculateKellySizing(currentBalance, {
    maxPriceCents: livePreviewPrice,
    winProbability: config.winProbability,
    maxRiskPercent: config.maxRiskPercent,
    fractionChunks: config.fractionChunks,
  });

  const latestConfirmedMetric =
    metrics.length > 1 && candles[candles.length - 1]?.isClosed === false
      ? metrics[metrics.length - 2]
      : metrics.length > 0
      ? metrics[metrics.length - 1]
      : null;

  return {
    config,
    updateConfig,
    candles,
    metrics,
    latestMetric: latestConfirmedMetric,
    currentZScore,
    crossedUpperThreshold,
    crossedLowerThreshold,
    lastTradeDirection,
    activeSignal,
    isEntrySignal,
    currentBalance,
    liveUsdcBalance,
    executionNotice,
    setExecutionNotice,
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
  };
}
