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
  evaluateDocumentFilters,
  AdvancedFiltersStatus,
} from '../utils/math';
import { soundController } from '../utils/audio';

const DEFAULT_CONFIG: BotConfig = {
  symbol: 'BTCUSDT',
  timeframe: '1m',
  periods: 180, // 180 Historical Candles (3 Hours)
  strategyDirection: 'BOTH', // Asymmetric: Long (-2.2σ) / Short (+2.4σ)
  zScoreUpper: 2.4, // Asymmetric Short Entry Threshold: +2.4σ
  zScoreEntry: 2.4, // Asymmetric Short Entry Threshold: +2.4σ
  zScoreLower: -2.2, // Asymmetric Long Entry Threshold: -2.2σ
  zScoreLowerEntry: -2.2, // Asymmetric Long Entry Threshold: -2.2σ
  maxPriceCents: 0.46, // Max Entry Price (Hard Cap): 46¢ ($0.46)
  maxRiskPercent: 0.04, // 0.25 * Kelly(Edge) capped at 3-5% (default 4%)
  orderType: 'FAK', // Order Type: FAK (Fill-And-Kill)
  fractionChunks: 1, // 1 unified direct order
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
  singleTradePerContract: true, // Single-Entry Lock per 15m Market
  cooldownMinutes: 15, // 15-minute contract cycle guard
  calculateOnCandleClose: true, // Calculate & execute strictly upon 1m candle close
  signalHorizonMinutes: 3, // Signal Horizon (K): Lookback window in minutes (3m)
};

export function useTradingBot() {
  const [config, setConfig] = useState<BotConfig>(() => {
    // Read persisted config if available and migrate to latest strategy settings
    try {
      const saved = localStorage.getItem('limitless_live_bot_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        parsed.timeframe = '1m';
        parsed.periods = 180;
        parsed.signalHorizonMinutes = Number(parsed.signalHorizonMinutes) || 3;
        parsed.calculateOnCandleClose = parsed.calculateOnCandleClose !== undefined ? parsed.calculateOnCandleClose : true;
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
        // Migrate to document specification parameters
        parsed.periods = 180;
        parsed.zScoreUpper = 2.4;
        parsed.zScoreEntry = 2.4;
        parsed.zScoreLower = -2.2;
        parsed.zScoreLowerEntry = -2.2;
        parsed.orderType = 'FAK';
        parsed.maxPriceCents = 0.46;
        parsed.fractionChunks = 1;
        parsed.chunkDelayMs = 0;
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
  const [advancedFiltersStatus, setAdvancedFiltersStatus] = useState<AdvancedFiltersStatus | null>(null);
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
      // Remove legacy auto-true key so neither AI Studio preview nor existing tabs silently auto-trade
      localStorage.removeItem('limitless_bot_active_state');
      // Never auto-enable trading inside AI Studio preview iframe (*.run.app)
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
    return false; // Default to STOPPED until user explicitly turns it ON
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
            market: String(item?.market || 'btc-up-or-down-15-min'),
            direction: item?.direction === 'LONG' ? 'LONG' : 'SHORT',
            triggerZScore: Number.isFinite(Number(item?.triggerZScore)) ? Number(item.triggerZScore) : 0,
            totalContracts: Number.isFinite(Number(item?.totalContracts)) ? Number(item.totalContracts) : 0,
            contractPrice: Number.isFinite(Number(item?.contractPrice)) ? Number(item.contractPrice) : 0.46,
            totalInvestmentUsd: Number.isFinite(Number(item?.totalInvestmentUsd)) ? Number(item.totalInvestmentUsd) : 0,
            chunks: Array.isArray(item?.chunks) ? item.chunks : [],
            status: item?.status || 'COMPLETED',
          }));
        }
      }
    } catch {}
    return [];
  });
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(false);
  const [lastSignalTime, setLastSignalTime] = useState<number | null>(null);
  const [recentChartSignal, setRecentChartSignal] = useState<{
    direction: 'SHORT' | 'LONG';
    candleTime: number;
    zScore: number;
    ageMinutes: number;
  } | null>(null);

  // References for live closures and duplicate prevention
  const candlesRef = useRef<CandleData[]>([]);
  const orderbookRef = useRef<import('../types/bot').OrderbookUpdate | null>(null);
  const closePricesRef = useRef<number[]>([]);
  const crossedUpperThresholdRef = useRef<boolean>(false);
  const crossedLowerThresholdRef = useRef<boolean>(false);
  const armedUpperCandleTimeRef = useRef<number>(0);
  const armedLowerCandleTimeRef = useRef<number>(0);
  const armedUpperCandlesRef = useRef<Set<number>>(new Set());
  const armedLowerCandlesRef = useRef<Set<number>>(new Set());
  const entryShortCandlesRef = useRef<Set<number>>(new Set());
  const entryLongCandlesRef = useRef<Set<number>>(new Set());
  const lastEvaluatedClosedCandleTimeRef = useRef<number>(0);
  const lastEvaluatedEntrySignalTimeRef = useRef<number>(0);
  const lastFilterBlockLogTimeRef = useRef<number>(0);
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
  metricsRef.current = metrics;
  binanceStatusRef.current = binanceStatus;

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

  // Recompute metrics series: live UI ticker updates continuously, while signal evaluation & trade execution trigger strictly upon candle close when calculateOnCandleClose is true
  const rebuildMetrics = useCallback((
    candleList: CandleData[],
    cfg: BotConfig,
    isInitialLoad = false,
    isCandleCloseEvent = false
  ) => {
    const result: ZScoreMetric[] = [];
    const closes = candleList.map((c) => c.close);
    let hadArmedUpper = false;
    let hadArmedLower = false;

    const lowerThresh = cfg.zScoreLower !== undefined ? cfg.zScoreLower : -cfg.zScoreUpper;
    const lowerEntryThresh = cfg.zScoreLowerEntry !== undefined ? cfg.zScoreLowerEntry : -cfg.zScoreEntry;

    for (let i = 0; i < candleList.length; i++) {
      const hasFullWindow = i >= cfg.periods - 1;
      const isLatestLiveCandle = i === candleList.length - 1;

      if (i === 0) {
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
        continue;
      }

      const windowStart = Math.max(0, i - cfg.periods + 1);
      const windowSlice = closes.slice(windowStart, i + 1);
      const stats = calculateZScore(windowSlice, cfg.zScoreUpper, cfg.zScoreEntry, lowerThresh, lowerEntryThresh);

      let signal: 'ARMED_UPPER' | 'ARMED_LOWER' | 'ENTRY_SHORT' | 'ENTRY_LONG' | 'ARMED' | 'ENTRY' | null = null;
      let dir: 'SHORT' | 'LONG' | null = null;

      // Evaluate on every candle with full SMA window
      if (hasFullWindow) {
        const candleTime = candleList[i].time;
        const wasCandleEntryShort = entryShortCandlesRef.current.has(candleTime);
        const wasCandleEntryLong = entryLongCandlesRef.current.has(candleTime);

        // Upper Direction (Short / DOWN): Asymmetric Entry >= +2.40σ
        if (cfg.strategyDirection === 'BOTH' || cfg.strategyDirection === 'SHORT_ONLY') {
          if (wasCandleEntryShort) {
            hadArmedUpper = false;
            signal = 'ENTRY_SHORT';
            dir = 'SHORT';
          } else if (stats.zScore >= cfg.zScoreUpper) {
            hadArmedUpper = true;
            signal = 'ENTRY_SHORT';
            dir = 'SHORT';
          } else if (stats.zScore <= 0) {
            hadArmedUpper = false;
          }
        }

        // Lower Direction (Long / UP): Asymmetric Entry <= -2.20σ
        if (cfg.strategyDirection === 'BOTH' || cfg.strategyDirection === 'LONG_ONLY') {
          if (wasCandleEntryLong) {
            hadArmedLower = false;
            signal = 'ENTRY_LONG';
            dir = 'LONG';
          } else if (stats.zScore <= lowerThresh) {
            hadArmedLower = true;
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
    }

    setMetrics(result);
    if (result.length > 0) {
      // 1) Continuous UI Heartbeat: update live ticker with the latest live candle metric
      const liveMetric = result[result.length - 1];
      setCurrentZScore(liveMetric.zScore);

      // 2) Determine calculation target metric:
      // When calculateOnCandleClose is enabled (default), evaluate signal strictly on the newly closed candle
      const evalOnClose = cfg.calculateOnCandleClose !== false;

      let evalMetric = liveMetric;
      let evalCandles = candleList;
      let evalCloses = closes;

      if (evalOnClose) {
        // Find the most recent confirmed closed candle in the list
        let closedIdx = -1;
        for (let j = candleList.length - 1; j >= 0; j--) {
          if (candleList[j]?.isClosed) {
            closedIdx = j;
            break;
          }
        }
        if (closedIdx === -1 && candleList.length >= 2) {
          closedIdx = candleList.length - 2;
        }

        if (closedIdx >= 0 && closedIdx < result.length) {
          evalMetric = result[closedIdx];
          evalCandles = candleList.slice(0, closedIdx + 1);
          evalCloses = closes.slice(0, closedIdx + 1);
        }
      }

      const docFilters = evaluateDocumentFilters({
        closePrices: evalCloses,
        candles: evalCandles,
        signalHorizonMinutes: cfg.signalHorizonMinutes || 3,
      });
      setAdvancedFiltersStatus(docFilters);

      crossedUpperThresholdRef.current = hadArmedUpper;
      setCrossedUpperThreshold(hadArmedUpper);
      crossedLowerThresholdRef.current = hadArmedLower;
      setCrossedLowerThreshold(hadArmedLower);

      setRecentChartSignal(null);

      // 3) Only evaluate entry signals and execute orders upon candle close (or every tick if evalOnClose is false)
      const shouldEvaluateSignals =
        !isInitialLoad &&
        (!evalOnClose || (isCandleCloseEvent && lastEvaluatedClosedCandleTimeRef.current !== evalMetric.time));

      if (shouldEvaluateSignals) {
        if (evalOnClose) {
          lastEvaluatedClosedCandleTimeRef.current = evalMetric.time;
        }

        // Log if RV or ADX filter blocked an extreme Z-Score
        if (!docFilters.canEnterShort && evalMetric.zScore >= cfg.zScoreUpper) {
          const now = Date.now();
          if (now - lastFilterBlockLogTimeRef.current > 15000) {
            lastFilterBlockLogTimeRef.current = now;
            const msg = `🛡️ [فلتر التقلبات والاتجاه] تم منع إشارة Short عند إغلاق الشمعة (Z=+${evalMetric.zScore.toFixed(2)}σ): ${docFilters.blockReasonShort}`;
            console.log(msg);
            limitlessService.logDirect('SYSTEM', msg);
          }
        } else if (!docFilters.canEnterLong && evalMetric.zScore <= lowerThresh) {
          const now = Date.now();
          if (now - lastFilterBlockLogTimeRef.current > 15000) {
            lastFilterBlockLogTimeRef.current = now;
            const msg = `🛡️ [فلتر التقلبات والاتجاه] تم منع إشارة Long عند إغلاق الشمعة (Z=${evalMetric.zScore.toFixed(2)}σ): ${docFilters.blockReasonLong}`;
            console.log(msg);
            limitlessService.logDirect('SYSTEM', msg);
          }
        }

        // Evaluate Asymmetric Z-Score Entry Signals with Volatility & Trend Filters
        const isLiveShortNow =
          (cfg.strategyDirection === 'BOTH' || cfg.strategyDirection === 'SHORT_ONLY') &&
          evalMetric.zScore >= cfg.zScoreUpper &&
          docFilters.canEnterShort;
        const isLiveLongNow =
          (cfg.strategyDirection === 'BOTH' || cfg.strategyDirection === 'LONG_ONLY') &&
          evalMetric.zScore <= lowerThresh &&
          docFilters.canEnterLong;

        if (isLiveShortNow || isLiveLongNow) {
          const now = Date.now();
          const activeSlugNow = activeLimitlessMarketRef.current?.slug;
          const alreadyLockedThisContract =
            Boolean(activeSlugNow) &&
            activeSlugNow !== 'btc-up-or-down-15-min' &&
            lastExecutedMarketSlugRef.current === activeSlugNow &&
            now - lastExecutedTimestampRef.current < 15 * 60 * 1000;

          // Enforce Single-Entry Lock per 15m Market
          if (!alreadyLockedThisContract && now - lastEvaluatedEntrySignalTimeRef.current >= 4000) {
            if (!botActiveRef.current) {
              lastEvaluatedEntrySignalTimeRef.current = now;
              const pauseWarn = isLiveShortNow
                ? `⚠️ تحقق شرط دخول Short عند إغلاق الشمعة (+${evalMetric.zScore.toFixed(2)}σ ≥ +${cfg.zScoreUpper.toFixed(2)}σ) مع فلاتر RV و ADX، ولكن الروبوت متوقف حالياً! اضغط "تشغيل الروبوت" لتفعيل الصفقات التلقائية.`
                : `⚠️ تحقق شرط دخول Long عند إغلاق الشمعة (${evalMetric.zScore.toFixed(2)}σ ≤ ${lowerThresh.toFixed(2)}σ) مع فلاتر RV و ADX، ولكن الروبوت متوقف حالياً! اضغط "تشغيل الروبوت" لتفعيل الصفقات التلقائية.`;
              console.warn(pauseWarn);
              limitlessService.logDirect('SYSTEM', pauseWarn);
              setExecutionNotice({
                type: 'WARNING',
                message: pauseWarn,
                timestamp: now,
                action: 'START_BOT',
              });
            } else if (!isExecutingRef.current) {
              lastEvaluatedEntrySignalTimeRef.current = now;
              if (isLiveShortNow) {
                crossedUpperThresholdRef.current = false;
                setCrossedUpperThreshold(false);
                entryShortCandlesRef.current.add(evalMetric.time);
                const trigMsg = `🎯 [تحقق شرط Short غير المتماثل عند إغلاق الشمعة Z=+${evalMetric.zScore.toFixed(2)}σ ≥ +${cfg.zScoreUpper.toFixed(2)}σ · RV=${docFilters.rv3m.valueBp.toFixed(1)}bp · ADX=${docFilters.adx14.value.toFixed(1)}] جاري إرسال أمر FAK فوري لشراء DOWN بسعر ≤ 46¢ وحجم ربع-كيلي (3-5%).`;
                console.log(trigMsg);
                limitlessService.logDirect('SYSTEM', trigMsg);
                executeLiveTradeRef.current(evalMetric.zScore, 'SHORT', evalMetric.time, false);
              } else if (isLiveLongNow) {
                crossedLowerThresholdRef.current = false;
                setCrossedLowerThreshold(false);
                entryLongCandlesRef.current.add(evalMetric.time);
                const trigMsg = `🎯 [تحقق شرط Long غير المتماثل عند إغلاق الشمعة Z=${evalMetric.zScore.toFixed(2)}σ ≤ ${lowerThresh.toFixed(2)}σ · RV=${docFilters.rv3m.valueBp.toFixed(1)}bp · ADX=${docFilters.adx14.value.toFixed(1)}] جاري إرسال أمر FAK فوري لشراء UP بسعر ≤ 46¢ وحجم ربع-كيلي (3-5%).`;
                console.log(trigMsg);
                limitlessService.logDirect('SYSTEM', trigMsg);
                executeLiveTradeRef.current(evalMetric.zScore, 'LONG', evalMetric.time, false);
              }
            }
          }
        }
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

  // Execute LIVE Trade strictly across Limitless (15m Contract, Quarter-Kelly 3-5% Bankroll, FAK at 46¢ limit)
  const executeLiveTrade = useCallback(async (
    triggerZ: number,
    direction: 'SHORT' | 'LONG' = 'SHORT',
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
      if (!isManual) {
        // Already executed on this 15m market (e.g. by server engine): silently disarm without showing a warning banner
        if (direction === 'SHORT') {
          crossedUpperThresholdRef.current = false;
          setCrossedUpperThreshold(false);
        } else {
          crossedLowerThresholdRef.current = false;
          setCrossedLowerThreshold(false);
        }
        return;
      }
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

    // Direct FAK Limit Price at 46 cents ($0.46 or 46%) Hard Cap as per Document 6
    const maxEntryCap = Math.min(cfg.maxPriceCents && cfg.maxPriceCents > 0 ? cfg.maxPriceCents : 0.46, 0.46);
    const effectiveContractPrice = parseFloat(Math.max(0.001, maxEntryCap).toFixed(3));

    // Document 6 Sizing: 0.25 * Kelly(Edge), capped at 3-5% of bankroll per 15m contract
    const maxRiskCap = Math.min(cfg.maxRiskPercent || 0.04, 0.05);
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

    // Ensure dollar cost strictly never exceeds 3-5% of bankroll
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
        const minWarning = `⚠️ رصيد المحفظة الحالي ($${balance.toFixed(2)} USDC) والميزانية المخصصة ($${maxBudgetUsd.toFixed(2)}) لا تكفي لشراء عقد بسعر $${effectiveContractPrice}.`;
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
        `[LIVE DIRECT EXECUTION - ${direction}] Sending unified FAK order of ${effectiveContracts} contracts to Limitless (${resolvedMarketSlug} - ${outcome}) @ $${effectiveContractPrice} [Quarter-Kelly 3-5% Bankroll - Max Share Price ≤ $0.46 (46¢)]...`
      );

      limitlessService.logDirect(
        'OUTGOING',
        `🚀 [تنفيذ صفقة FAK بسقف دخول ≤ 46¢] إرسال أمر FAK لعدد ${effectiveContracts} عقود ${outcome} (${direction}) بسعر $${effectiveContractPrice} (≤ 46 سنت) إلى عقد 15m (${resolvedMarketSlug}) بحجم ربع-كيلي (3-5% من الرصيد)...`
      );

      const executed = await limitlessService.executeChunkedOrder(
        effectiveContracts,
        effectiveContractPrice,
        1,
        cfg.orderType || 'FAK',
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
      const completedTrade: TradeOrder = {
        ...initialTrade,
        market: serverConfirmedSlug,
        chunks: executed,
        status: (cfg.orderType === 'FAK' ? 'EXECUTED' : 'ACTIVE_GTC') as any,
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
      lastExecutedMarketSlugRef.current = serverConfirmedSlug;
      lastExecutedTimestampRef.current = now;
      setContractLockInfo({
        isLocked: true,
        reason: `تم تنفيذ صفقة ربع-كيلي (3-5%) على عقد ${serverConfirmedSlug}`,
        cooldownRemainingMinutes: 15,
        lastTradedSlug: serverConfirmedSlug,
      });

      const invested = completedTrade.totalInvestmentUsd;
      setCurrentBalance((prev) => Math.max(0, prev - invested));
      currentBalanceRef.current = Math.max(0, currentBalanceRef.current - invested);

      const successNotice = `✅ تم إرسال صفقة بنجاح: أمر FAK لشراء ${outcome} (${direction}) لعدد ${effectiveContracts} عقد بسعر $${effectiveContractPrice} (≤ 46¢) وبقيمة $${invested.toFixed(2)} (ربع-كيلي 3-5% من الرصيد) على عقد الـ 15 دقيقة ${resolvedMarketSlug}`;
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
      // Restore First Confirmation arming state if automated order failed due to a transient error
      if (!isManual) {
        if (direction === 'SHORT') {
          crossedUpperThresholdRef.current = true;
          setCrossedUpperThreshold(true);
          if (candleTime) entryShortCandlesRef.current.delete(candleTime);
        } else {
          crossedLowerThresholdRef.current = true;
          setCrossedLowerThreshold(true);
          if (candleTime) entryLongCandlesRef.current.delete(candleTime);
        }
      }
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
                slug: data.marketSlug || 'btc-up-or-down-15-min',
                title: 'BTC 15-Minute Prediction Market',
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
        (/(^|[^0-9])15-min/i.test(newMarket.slug) || /15\s*min/i.test(newMarket.title || '') || /(^|[^0-9])15m/i.test(newMarket.slug)) &&
        !/(^|[^0-9])5-min/i.test(newMarket.slug) &&
        !/hourly/i.test(newMarket.slug)
      ) {
        setActiveLimitlessMarket(newMarket);
        activeLimitlessMarketRef.current = newMarket;
        if (lastExecutedMarketSlugRef.current && lastExecutedMarketSlugRef.current !== newMarket.slug) {
          lastExecutedMarketSlugRef.current = '';
          lastExecutedTimestampRef.current = 0;
          setContractLockInfo({ isLocked: false });
          try {
            localStorage.removeItem('limitless_last_trade_guard');
          } catch {}
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
        // Disarm active confirmation in browser since server already executed for this 15m contract
        if (serverGuard.direction === 'SHORT') {
          crossedUpperThresholdRef.current = false;
          setCrossedUpperThreshold(false);
        } else if (serverGuard.direction === 'LONG') {
          crossedLowerThresholdRef.current = false;
          setCrossedLowerThreshold(false);
        }
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

  const rebuildMetricsRef = useRef(rebuildMetrics);
  rebuildMetricsRef.current = rebuildMetrics;

  // Load real Binance Historical Data (100 candles lookback so all 45 displayed 1m candles have a full 45-period rolling window) & Live WebSocket (1m)
  useEffect(() => {
    let isCancelled = false;

    async function initMarketData() {
      const lookbackBufferSize = Math.max(config.periods * 2 + 10, 200);
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
        const closedCloses = closedCandles.map((c) => c.close);
        closePricesRef.current = closedCloses.slice(-config.periods);
        rebuildMetricsRef.current(realCandles, configRef.current, true);
      }

      binanceService.connectWebSocket(
        config.symbol,
        config.timeframe,
        (tickCandle, isTickClosed) => {
          const prev = candlesRef.current;
          const maxBufferSize = Math.max(configRef.current.periods * 2 + 10, 200);
          const last = prev[prev.length - 1];
          let updatedCandles: CandleData[] = [];
          let isCandleCloseEvent = Boolean(isTickClosed);

          if (last && last.time === tickCandle.time) {
            updatedCandles = [...prev.slice(0, -1), { ...tickCandle, isClosed: isTickClosed }];
          } else {
            // Mark previous candle as closed when a new candle begins
            isCandleCloseEvent = true;
            const prevWithClosed = prev.map((c, idx) =>
              idx === prev.length - 1 ? { ...c, isClosed: true } : c
            );
            updatedCandles = [...prevWithClosed.slice(-maxBufferSize), { ...tickCandle, isClosed: false }];
          }

          candlesRef.current = updatedCandles;
          setCandles(updatedCandles);

          if (updatedCandles.length >= configRef.current.periods) {
            const confirmedClosedCandles = updatedCandles.filter((c) => c.isClosed !== false);
            const closedCloses = confirmedClosedCandles.map((c) => c.close);
            if (closedCloses.length >= configRef.current.periods) {
              closePricesRef.current = closedCloses.slice(-configRef.current.periods);
            }
            rebuildMetricsRef.current(updatedCandles, configRef.current, false, isCandleCloseEvent);
          }
        },
        (status) => setBinanceStatus(status),
        (recentOfficialCandles) => {
          // Reconcile official closed candles from Binance REST API every 4s
          // Never overwrite the currently forming live unclosed candle when WebSocket is connected
          const prev = candlesRef.current;
          if (prev.length === 0) return;
          const wsConnected = binanceStatusRef.current === 'CONNECTED';
          const latestLiveCandleTime = prev[prev.length - 1]?.time || 0;
          const maxBufferSize = Math.max(configRef.current.periods * 2 + 10, 200);
          const candleMap = new Map<number, CandleData>();
          for (const c of prev) {
            candleMap.set(c.time, c);
          }
          for (const rc of recentOfficialCandles) {
            if (wsConnected && rc.time >= latestLiveCandleTime && rc.isClosed === false) {
              // Preserve the live WebSocket unclosed candle price; do not overwrite with lagging REST snapshot
              continue;
            }
            const existing = candleMap.get(rc.time);
            if (!existing || rc.isClosed !== false) {
              candleMap.set(rc.time, rc);
            }
          }
          const merged = Array.from(candleMap.values())
            .sort((a, b) => a.time - b.time)
            .slice(-maxBufferSize);

          candlesRef.current = merged;
          setCandles(merged);

          if (merged.length >= configRef.current.periods) {
            const confirmedClosedCandles = merged.filter((c) => c.isClosed !== false);
            const closedCloses = confirmedClosedCandles.map((c) => c.close);
            if (closedCloses.length >= configRef.current.periods) {
              closePricesRef.current = closedCloses.slice(-configRef.current.periods);
            }
            // If WebSocket is actively connected, only refresh chart metrics (isInitialLoad = true) so REST sync never interferes with live WS tick evaluation
            rebuildMetricsRef.current(merged, configRef.current, wsConnected);
          }
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
          (/(^|[^0-9])15-min/i.test(data.slug) || /15\s*min/i.test(data.title || '') || /(^|[^0-9])15m/i.test(data.slug)) &&
          !/(^|[^0-9])5-min/i.test(data.slug) &&
          !/hourly/i.test(data.slug)
        ) {
          setActiveLimitlessMarket(data);
          activeLimitlessMarketRef.current = data;
          if (lastExecutedMarketSlugRef.current && lastExecutedMarketSlugRef.current !== data.slug) {
            lastExecutedMarketSlugRef.current = '';
            lastExecutedTimestampRef.current = 0;
            setContractLockInfo({ isLocked: false });
            try {
              localStorage.removeItem('limitless_last_trade_guard');
            } catch {}
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

    // Synchronize bot active/stopped state with backend server (/api/bot-state)
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
      } catch {
        // Safe localStorage
      }
      // Immediately synchronize with backend server (stops/starts autonomous server loop & order gate)
      fetch('/api/bot-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: next }),
      }).catch(() => {});

      if (next) {
        // Immediate balance update when bot is turned on
        refreshLiveBalance();
      }
      return next;
    });
  };

  const triggerManualTrade = useCallback(
    (direction: 'SHORT' | 'LONG' = 'SHORT') => {
      const defaultZ = direction === 'SHORT' ? 2.2 : -2.2;
      executeLiveTrade(currentZScore || defaultZ, direction, undefined, true);
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

  // Always use the latest live unclosed candle metric so live WebSocket ticks are reflected in real time
  const latestConfirmedMetric = metrics.length > 0 ? metrics[metrics.length - 1] : null;

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
    threeFiltersStatus: advancedFiltersStatus,
    advancedFiltersStatus,
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
    recentChartSignal,
  };
}
