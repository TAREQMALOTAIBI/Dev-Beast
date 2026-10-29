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
  EmaFilterState,
} from '../types/bot';
import { binanceService } from '../services/binanceService';
import { limitlessService, LimitlessStatus } from '../services/limitlessService';
import { calculateZScore, calculateKellySizing, calculateEMA } from '../utils/math';
import { soundController } from '../utils/audio';

const DEFAULT_CONFIG: BotConfig = {
  symbol: 'BTCUSDT',
  timeframe: '1h',
  periods: 30,
  strategyDirection: 'BOTH', // 'BOTH' | 'LONG_ONLY' | 'SHORT_ONLY'
  zScoreUpper: 2.0, // Upper threshold: Entry condition when exceeding 2.0 in rise
  zScoreEntry: 2.0,
  zScoreLower: -2.0, // Lower threshold: Entry condition when exceeding -2.0 in decline
  zScoreLowerEntry: -2.0,
  maxPriceCents: 0.20, // Ceiling price (20 cents and below)
  maxRiskPercent: 0.10, // Strictly capped at 10% maximum (wallet safety limit)
  orderType: 'GTC', // Good-Til-Cancelled
  fractionChunks: 1, // 1 unified single direct order (chunking eliminated)
  chunkDelayMs: 0,
  winProbability: 0.55,
  initialBalance: 1000,
  binanceRestUrl: 'https://api.binance.com/api/v3/klines',
  binanceWsUrl: 'wss://stream.binance.com/ws/btcusdt@kline_1h',
  limitlessWsUrl: 'wss://ws.limitless.exchange',
  limitlessMarketSlug: 'btc-up-or-down-hourly',
  limitlessApiKey: (typeof process !== 'undefined' && process.env?.LIMITLESS_API_KEY) || '',
  limitlessTokenId: (typeof process !== 'undefined' && process.env?.LMTS_TOKEN_ID) || '',
  limitlessTokenSecret: (typeof process !== 'undefined' && process.env?.LMTS_TOKEN_SECRET) || '',
  singleTradePerContract: true, // Strictly max 1 trade per 1-hour contract
  cooldownMinutes: 60, // 60-minute cooldown guard between trades
};

export function useTradingBot() {
  const [config, setConfig] = useState<BotConfig>(() => {
    // Read persisted config if available
    try {
      const saved = localStorage.getItem('limitless_live_bot_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.binanceWsUrl && (parsed.binanceWsUrl.includes(':9443') || parsed.binanceWsUrl.includes('15m'))) {
          parsed.binanceWsUrl = DEFAULT_CONFIG.binanceWsUrl;
        }
        if (parsed.binanceRestUrl && parsed.binanceRestUrl.includes('binance.vision')) {
          parsed.binanceRestUrl = DEFAULT_CONFIG.binanceRestUrl;
        }
        if (parsed.limitlessWsUrl && parsed.limitlessWsUrl.includes('api.limitless.exchange')) {
          parsed.limitlessWsUrl = DEFAULT_CONFIG.limitlessWsUrl;
        }
        // Force migration away from 5-min, 15-min, weekly markets, or specific expired timestamp slugs to base hourly
        if (
          !parsed.limitlessMarketSlug ||
          /(^|[^0-9])5-min/i.test(parsed.limitlessMarketSlug) ||
          /(^|[^0-9])15-min/i.test(parsed.limitlessMarketSlug) ||
          parsed.limitlessMarketSlug.includes('weekly') ||
          /\d{8,}/.test(parsed.limitlessMarketSlug)
        ) {
          parsed.limitlessMarketSlug = DEFAULT_CONFIG.limitlessMarketSlug;
        }
        if (!parsed.timeframe || parsed.timeframe === '15m') {
          parsed.timeframe = '1h';
        }
        if (!parsed.strategyDirection) {
          parsed.strategyDirection = 'BOTH';
        }
        // Migrate candle periods from 14 to 30
        if (!parsed.periods || parsed.periods === 14) {
          parsed.periods = 30;
        }
        // Enforce threshold 2.0 and direct entry on exceeding threshold 2
        parsed.zScoreUpper = 2.0;
        parsed.zScoreEntry = 2.0;
        parsed.zScoreLower = -2.0;
        parsed.zScoreLowerEntry = -2.0;
        // Set default orderType to GTC
        if (!parsed.orderType || parsed.orderType === 'FAK') {
          parsed.orderType = 'GTC';
        }
        if (parsed.maxPriceCents === undefined || parsed.maxPriceCents > 0.20) {
          parsed.maxPriceCents = 0.20;
        }
        // Strictly eliminate chunking: set to 1 instant single order
        parsed.fractionChunks = 1;
        parsed.chunkDelayMs = 0;
        // Set maxRiskPercent to 10% (0.10) wallet safety limit
        parsed.maxRiskPercent = 0.10;
        // Ensure single trade per 1-hour contract is active
        if (parsed.singleTradePerContract === undefined) {
          parsed.singleTradePerContract = true;
        }
        if (parsed.cooldownMinutes === undefined || parsed.cooldownMinutes < 1 || parsed.cooldownMinutes === 15) {
          parsed.cooldownMinutes = 60;
        }

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
  const [emaFilter, setEmaFilter] = useState<EmaFilterState>({
    ema20: 0,
    ema50: 0,
    trend: 'BULLISH',
    longAllowed: false,
    shortAllowed: false,
  });
  const emaFilterRef = useRef<EmaFilterState>({
    ema20: 0,
    ema50: 0,
    trend: 'BULLISH',
    longAllowed: false,
    shortAllowed: false,
  });
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
    return true; // Default to active and trading automatically
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
  const [soundEnabled, setSoundEnabled] = useState<boolean>(false); // Completely muted by default per user request
  const [lastSignalTime, setLastSignalTime] = useState<number | null>(null);

  // References for live closures and duplicate prevention
  const closePricesRef = useRef<number[]>([]);
  const crossedUpperThresholdRef = useRef<boolean>(false);
  const crossedLowerThresholdRef = useRef<boolean>(false);
  const botActiveRef = useRef<boolean>(botActive);
  const configRef = useRef<BotConfig>(config);
  const currentBalanceRef = useRef<number>(currentBalance);
  const isExecutingRef = useRef<boolean>(false);
  const lastExecutedCandleTimeRef = useRef<number>(0);
  const lastExecutedMarketSlugRef = useRef<string>('');
  const lastExecutedTimestampRef = useRef<number>(0);
  const activeLimitlessMarketRef = useRef<LimitlessMarketDetails | null>(null);
  const metricsRef = useRef<ZScoreMetric[]>([]);

  // Persistent trade lock status
  const [contractLockInfo, setContractLockInfo] = useState<{
    isLocked: boolean;
    reason?: string;
    cooldownRemainingMinutes?: number;
    lastTradedSlug?: string;
  }>({ isLocked: false });

  // Load persistent trade guard on mount (Sync from VM server disk & RAM with 1-hour auto-expiry)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('limitless_last_trade_guard');
      if (saved) {
        const parsed = JSON.parse(saved);
        const age = Date.now() - (Number(parsed?.timestamp) || 0);
        if (age < 60 * 60 * 1000) {
          if (parsed.marketSlug) lastExecutedMarketSlugRef.current = parsed.marketSlug;
          if (parsed.timestamp) lastExecutedTimestampRef.current = Number(parsed.timestamp);
          if (parsed.candleTime) lastExecutedCandleTimeRef.current = Number(parsed.candleTime);
        } else {
          // Stale local guard (> 60 minutes), clean it up!
          localStorage.removeItem('limitless_last_trade_guard');
        }
      }
    } catch {}

    // Fetch authoritative persistent lock from VM server disk & RAM
    limitlessService
      .fetchTradeGuard()
      .then((serverGuard) => {
        if (serverGuard && serverGuard.marketSlug) {
          const age = Date.now() - (Number(serverGuard.timestamp) || 0);
          if (age < 60 * 60 * 1000) {
            lastExecutedMarketSlugRef.current = serverGuard.marketSlug;
            lastExecutedTimestampRef.current = Number(serverGuard.timestamp) || 0;
            lastExecutedCandleTimeRef.current = Number(serverGuard.candleTime) || 0;
            try {
              localStorage.setItem('limitless_last_trade_guard', JSON.stringify(serverGuard));
            } catch {}
          } else {
            // Previous contract already expired on VM, clear it!
            lastExecutedMarketSlugRef.current = '';
            lastExecutedTimestampRef.current = 0;
            lastExecutedCandleTimeRef.current = 0;
            try {
              localStorage.removeItem('limitless_last_trade_guard');
            } catch {}
            limitlessService.clearTradeGuardOnVm().catch(() => {});
          }
        } else {
          // VM has no lock, clear any ghost lock in memory and localStorage immediately
          lastExecutedMarketSlugRef.current = '';
          lastExecutedTimestampRef.current = 0;
          lastExecutedCandleTimeRef.current = 0;
          try {
            localStorage.removeItem('limitless_last_trade_guard');
          } catch {}
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
        next.maxRiskPercent = Math.min(Math.max(Number(next.maxRiskPercent) || 0.10, 0.001), 0.10);
      }
      try {
        localStorage.setItem('limitless_live_bot_config', JSON.stringify(next));
      } catch {
        // Safe localStorage
      }
      return next;
    });
  };

  // Recompute metrics series on candle updates
  const rebuildMetrics = useCallback((candleList: CandleData[], cfg: BotConfig) => {
    const result: ZScoreMetric[] = [];
    const closes = candleList.map((c) => c.close);
    let hadArmedUpper = false;
    let hadArmedLower = false;

    const lowerThresh = cfg.zScoreLower !== undefined ? cfg.zScoreLower : -cfg.zScoreUpper;
    const lowerEntryThresh = cfg.zScoreLowerEntry !== undefined ? cfg.zScoreLowerEntry : -cfg.zScoreEntry;

    // Compute 1h EMA(20) and 1h EMA(50) series across the historical candle series
    const ema20Series = calculateEMA(closes, 20);
    const ema50Series = calculateEMA(closes, 50);

    for (let i = 0; i < candleList.length; i++) {
      const e20 = ema20Series[i] || candleList[i].close;
      const e50 = ema50Series[i] || candleList[i].close;

      if (i < cfg.periods - 1) {
        result.push({
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
          ema20: e20,
          ema50: e50,
          signal: null,
          direction: null,
        });
        continue;
      }

      const windowSlice = closes.slice(i - cfg.periods + 1, i + 1);
      const stats = calculateZScore(windowSlice, cfg.zScoreUpper, cfg.zScoreEntry, lowerThresh, lowerEntryThresh);

      let signal: 'ARMED_UPPER' | 'ARMED_LOWER' | 'ENTRY_SHORT' | 'ENTRY_LONG' | 'ARMED' | 'ENTRY' | null = null;
      let dir: 'SHORT' | 'LONG' | null = null;

      // Condition: Short only if: z > 2.0 AND 1h EMA(20) < 1h EMA(50)
      if (cfg.strategyDirection === 'BOTH' || cfg.strategyDirection === 'SHORT_ONLY') {
        if (stats.zScore >= cfg.zScoreUpper && e20 < e50) {
          if (!hadArmedUpper) {
            hadArmedUpper = true;
            signal = 'ENTRY_SHORT';
            dir = 'SHORT';
          }
        } else {
          hadArmedUpper = false;
        }
      }

      // Condition: Long only if: z < -2.0 AND 1h EMA(20) > 1h EMA(50)
      if (cfg.strategyDirection === 'BOTH' || cfg.strategyDirection === 'LONG_ONLY') {
        if (stats.zScore <= lowerThresh && e20 > e50) {
          if (!hadArmedLower) {
            hadArmedLower = true;
            signal = 'ENTRY_LONG';
            dir = 'LONG';
          }
        } else {
          hadArmedLower = false;
        }
      }

      result.push({
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
        ema20: e20,
        ema50: e50,
        signal,
        direction: dir,
      });
    }

    setMetrics(result);
    if (result.length > 0) {
      const latest = result[result.length - 1];
      setCurrentZScore(latest.zScore);

      const latestEma20 = latest.ema20 || 0;
      const latestEma50 = latest.ema50 || 0;
      const currentEmaState: EmaFilterState = {
        ema20: latestEma20,
        ema50: latestEma50,
        trend: latestEma20 > latestEma50 ? 'BULLISH' : 'BEARISH',
        longAllowed: latestEma20 > latestEma50,
        shortAllowed: latestEma20 < latestEma50,
      };
      setEmaFilter(currentEmaState);
      emaFilterRef.current = currentEmaState;

      // Synchronize armed states with recent candles
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

  // Contract Lock removed per user request: trading is unrestricted on valid signals
  const checkTradeLock = useCallback((_targetSlug?: string, _cTime?: number): { locked: boolean; reason?: string } => {
    return { locked: false };
  }, []);

  // Execute LIVE Trade strictly across Limitless
  const executeLiveTrade = useCallback(async (
    triggerZ: number,
    direction: 'SHORT' | 'LONG' = 'SHORT',
    candleTime?: number
  ) => {
    // 1. Concurrency In-Flight Check: Prevent duplicate sends while order is being signed/sent
    if (isExecutingRef.current) {
      console.warn('[CONCURRENCY BLOCKED] An order is already in-flight.');
      return;
    }

    const cfg = configRef.current;
    let balance = currentBalanceRef.current;

    // Determine target 1-hour market slug using latest live ref first
    let currentMarket = activeLimitlessMarketRef.current;
    const isHourlyMarket = (s?: string) => Boolean(s && (/hourly/i.test(s) || s.includes('1-hour') || s.includes('1h')));

    if (!currentMarket?.slug || !isHourlyMarket(currentMarket.slug)) {
      try {
        const mRes = await fetch('/api/limitless/active-btc');
        if (mRes.ok) {
          const mData = await mRes.json();
          if (mData && mData.slug && isHourlyMarket(mData.slug)) {
            currentMarket = mData;
            activeLimitlessMarketRef.current = mData;
            setActiveLimitlessMarket(mData);
          }
        }
      } catch {}
    }

    const resolvedMarketSlug =
      currentMarket?.slug && isHourlyMarket(currentMarket.slug)
        ? currentMarket.slug
        : cfg.limitlessMarketSlug && isHourlyMarket(cfg.limitlessMarketSlug)
        ? cfg.limitlessMarketSlug
        : 'btc-up-or-down-hourly';

    // 2. Strict Anti-Duplicate Guard
    const lock = checkTradeLock(resolvedMarketSlug, candleTime);
    if (lock.locked) {
      console.warn(`[SAFETY GUARD BLOCKED] Trade rejected: ${lock.reason}`);
      setExecutionNotice({
        type: 'WARNING',
        message: lock.reason || 'الصفقة مقفلة لمنع التكرار',
        timestamp: Date.now(),
      });
      return;
    }

    // Strict Safety Guard: NEVER trade 5-minute or 15-minute contracts
    if (/(^|[^0-9])5-min/i.test(resolvedMarketSlug) || /(^|[^0-9])15-min/i.test(resolvedMarketSlug)) {
      console.error(
        `[SAFETY SHIELD] Contract '${resolvedMarketSlug}' blocked! Trading bot is locked strictly to 1-hour contracts (BTC Up or Down Hourly).`
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

    // Live contract pricing based on chosen outcome (UP or DOWN), prioritizing market ask
    const currentMarketData = activeLimitlessMarketRef.current;
    const yesPrice = currentMarketData?.tradePrices?.buy?.market?.[0]
      ?? currentMarketData?.prices?.[0]
      ?? 0.50;
    const noPrice = currentMarketData?.tradePrices?.buy?.market?.[1]
      ?? currentMarketData?.prices?.[1]
      ?? (1 - yesPrice);
    const liveContractPrice = isLong ? yesPrice : noPrice;
    // Enforce entry ceiling: 20 cents and below (≤ $0.20)
    const priceCeiling = cfg.maxPriceCents !== undefined ? cfg.maxPriceCents : 0.20;
    // Align to 3 decimals as strictly required by Limitless SDK (multiple of 0.001)
    const effectiveContractPrice = parseFloat(Math.max(0.001, Math.min(priceCeiling, liveContractPrice)).toFixed(3));

    // Hard Risk Guard: Total dollar commitment CANNOT exceed 10.0% of balance under any circumstances
    const maxRiskCap = Math.min(cfg.maxRiskPercent || 0.10, 0.10);
    const maxBudgetUsd = balance * maxRiskCap;

    const kelly = calculateKellySizing(balance, {
      maxPriceCents: effectiveContractPrice,
      winProbability: cfg.winProbability,
      maxRiskPercent: maxRiskCap,
      fractionChunks: 1,
    });

    // Support fractional contract sizes natively on Limitless CLOB without rounding up
    let effectiveContracts = kelly.numberOfContracts;

    // Minimum precision threshold: If budget allows at least 0.01 contracts (half a cent), permit 0.01
    if (effectiveContracts < 0.01 && maxBudgetUsd >= (0.01 * effectiveContractPrice)) {
      effectiveContracts = 0.01;
    }

    // Ensure dollar cost strictly never exceeds 10% of balance
    if (effectiveContracts * effectiveContractPrice > maxBudgetUsd) {
      effectiveContracts = Math.floor((maxBudgetUsd / effectiveContractPrice) * 100) / 100;
    }

    // Safety decrement guard to guarantee strict compliance with 10% risk limit
    while (effectiveContracts > 0.01 && (effectiveContracts * effectiveContractPrice) > maxBudgetUsd) {
      effectiveContracts = Math.round((effectiveContracts - 0.01) * 100) / 100;
    }

    if (effectiveContracts <= 0) {
      // If budget permits, set to 0.01 contracts
      if (maxBudgetUsd >= (0.01 * effectiveContractPrice)) {
        effectiveContracts = 0.01;
      } else {
        const minWarning = `⚠️ رصيد المحفظة الحالي ($${balance.toFixed(2)} USDC) وسقف أمان المخاطرة 10% ($${maxBudgetUsd.toFixed(2)}) لا يكفي لشراء عقد بسعر $${effectiveContractPrice}. تم حظر الصفقة لحماية رأس المال.`;
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
      kellyRiskPct: kelly.riskToTake,
      chunks: [],
      status: 'PENDING_WS',
    };

    setActiveTrade(initialTrade);

    try {
      console.log(
        `[LIVE DIRECT EXECUTION - ${direction}] Sending unified order of ${effectiveContracts} contracts to Limitless (${resolvedMarketSlug} - ${outcome} / ${
          direction === 'LONG' ? 'BUY UP/YES' : 'BUY DOWN/NO'
        }) @ $${effectiveContractPrice} [10% Max Risk - No Chunking]...`
      );

      limitlessService.logDirect(
        'OUTGOING',
        `🚀 [تنفيذ صفقة مباشرة] إرسال أمر موحد لعدد ${effectiveContracts} عقود ${outcome} (${direction}) بسعر $${effectiveContractPrice} إلى سوق ${resolvedMarketSlug} (سقف مخاطرة 10% كحد أقصى دون تجزئة)...`
      );

      const executed = await limitlessService.executeChunkedOrder(
        effectiveContracts,
        effectiveContractPrice,
        1,
        cfg.orderType,
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
        status: cfg.orderType === 'FAK' ? 'EXECUTED_FAK' : 'ACTIVE_GTC',
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

      // Deduct invested funds
      const invested = completedTrade.totalInvestmentUsd;
      setCurrentBalance((prev) => Math.max(0, prev - invested));
      currentBalanceRef.current = Math.max(0, currentBalanceRef.current - invested);

      const successNotice = `✅ تم إرسال الصفقة بنجاح: أمر موحد لشراء ${outcome} (${direction}) لعدد ${effectiveContracts} عقد بقيمة $${invested.toFixed(2)} (سقف مخاطرة 10% دون تجزئة) على سوق ${resolvedMarketSlug}`;
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
      // Do NOT keep lock on failure - let bot retry when ready
      lastExecutedTimestampRef.current = 0;
      lastExecutedCandleTimeRef.current = 0;
      try {
        localStorage.removeItem('limitless_last_trade_guard');
      } catch {}
      limitlessService.clearTradeGuardOnVm().catch(() => {});
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
    // Clear authoritative lock from VM server disk & RAM
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

  // Contract lock is permanently removed per user request
  useEffect(() => {
    // Clear any remnant lock on boot
    try {
      localStorage.removeItem('limitless_last_trade_guard');
    } catch {}
    limitlessService.clearTradeGuardOnVm().catch(() => {});
    setContractLockInfo({
      isLocked: false,
      reason: undefined,
      cooldownRemainingMinutes: 0,
    });
  }, []);

  // Real Market Strategy Evaluation (Evaluates on every tick for immediate same-candle entry)
  const evaluateLiveStrategy = useCallback(
    (allPrices: number[], candleTime?: number) => {
      const cfg = configRef.current;
      if (allPrices.length < cfg.periods) return;

      const windowSlice = allPrices.slice(-cfg.periods);
      const lowerThresh = cfg.zScoreLower !== undefined ? cfg.zScoreLower : -cfg.zScoreUpper;
      const lowerEntryThresh = cfg.zScoreLowerEntry !== undefined ? cfg.zScoreLowerEntry : -cfg.zScoreEntry;

      const { zScore } = calculateZScore(windowSlice, cfg.zScoreUpper, cfg.zScoreEntry, lowerThresh, lowerEntryThresh);
      setCurrentZScore(zScore);

      // Compute 1h EMA(20) and 1h EMA(50) across available price history
      const ema20Arr = calculateEMA(allPrices, 20);
      const ema50Arr = calculateEMA(allPrices, 50);
      const currentEma20 = ema20Arr[ema20Arr.length - 1] || 0;
      const currentEma50 = ema50Arr[ema50Arr.length - 1] || 0;

      const isEmaBullish = currentEma20 > currentEma50;
      const isEmaBearish = currentEma20 < currentEma50;

      const currentEmaState: EmaFilterState = {
        ema20: currentEma20,
        ema50: currentEma50,
        trend: isEmaBullish ? 'BULLISH' : 'BEARISH',
        longAllowed: isEmaBullish,
        shortAllowed: isEmaBearish,
      };
      setEmaFilter(currentEmaState);
      emaFilterRef.current = currentEmaState;

      // ================= DIRECTION 1: Short only if: z > 2.0 AND 1h EMA(20) < 1h EMA(50) =================
      if (cfg.strategyDirection === 'BOTH' || cfg.strategyDirection === 'SHORT_ONLY') {
        if (zScore >= cfg.zScoreUpper) {
          if (!crossedUpperThresholdRef.current) {
            crossedUpperThresholdRef.current = true;
            setCrossedUpperThreshold(true);
          }

          if (!botActiveRef.current) {
            // Bot is stopped: warn user why trade was not executed
            const pauseWarn = `⚠️ تم تجاوز العتبة 2 في الصعود (Z=+${zScore.toFixed(2)}σ) ولكن الروبوت متوقف حالياً! اضغط "تشغيل الروبوت" لتفعيل الصفقات التلقائية.`;
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

          // Strict Filter Check: 1h EMA(20) < 1h EMA(50)
          if (!isEmaBearish) {
            const filterWarn = `⚠️ [فلتر EMA محجوب] Z=+${zScore.toFixed(2)}σ > +2.0، ولكن 1h EMA(20) [${currentEma20.toFixed(1)}] ليس أصغر من 1h EMA(50) [${currentEma50.toFixed(1)}]. يتطلب الهبوط (EMA20 < EMA50).`;
            console.log(filterWarn);
            limitlessService.logDirect('SYSTEM', filterWarn);
            setExecutionNotice({
              type: 'WARNING',
              message: `إشارة هبوط محجوبة بفلتر EMA: يتطلب الهبوط EMA(20) < EMA(50). الحالي: EMA20=$${currentEma20.toFixed(1)} > EMA50=$${currentEma50.toFixed(1)}.`,
              timestamp: Date.now(),
            });
            return;
          }

          if (!isExecutingRef.current) {
            console.log(`🎯 تنفيذ فوري لصفقة هبوط! تحقق الشرطان: Z=+${zScore.toFixed(2)}σ > 2.0 و 1h EMA(20) [$${currentEma20.toFixed(1)}] < 1h EMA(50) [$${currentEma50.toFixed(1)}]. جاري إرسال أمر DOWN!`);
            limitlessService.logDirect(
              'SYSTEM',
              `🎯 [شرطا الهبوط متحققان] Z=+${zScore.toFixed(2)}σ > +2.0σ مع اتجاه هابط 1h EMA(20) [$${currentEma20.toFixed(1)}] < 1h EMA(50) [$${currentEma50.toFixed(1)}]. جاري إرسال أمر DOWN فوراً!`
            );
            executeLiveTrade(zScore, 'SHORT', candleTime);
          }
        } else {
          if (crossedUpperThresholdRef.current) {
            crossedUpperThresholdRef.current = false;
            setCrossedUpperThreshold(false);
          }
        }
      }

      // ================= DIRECTION 2: Long only if: z < -2.0 AND 1h EMA(20) > 1h EMA(50) =================
      if (cfg.strategyDirection === 'BOTH' || cfg.strategyDirection === 'LONG_ONLY') {
        if (zScore <= lowerThresh) {
          if (!crossedLowerThresholdRef.current) {
            crossedLowerThresholdRef.current = true;
            setCrossedLowerThreshold(true);
          }

          if (!botActiveRef.current) {
            // Bot is stopped: warn user why trade was not executed
            const pauseWarn = `⚠️ تم تجاوز العتبة 2 في الهبوط (Z=${zScore.toFixed(2)}σ) ولكن الروبوت متوقف حالياً! اضغط "تشغيل الروبوت" لتفعيل الصفقات التلقائية.`;
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

          // Strict Filter Check: 1h EMA(20) > 1h EMA(50)
          if (!isEmaBullish) {
            const filterWarn = `⚠️ [فلتر EMA محجوب] Z=${zScore.toFixed(2)}σ < -2.0، ولكن 1h EMA(20) [${currentEma20.toFixed(1)}] ليس أكبر من 1h EMA(50) [${currentEma50.toFixed(1)}]. يتطلب الصعود (EMA20 > EMA50).`;
            console.log(filterWarn);
            limitlessService.logDirect('SYSTEM', filterWarn);
            setExecutionNotice({
              type: 'WARNING',
              message: `إشارة صعود محجوبة بفلتر EMA: يتطلب الصعود EMA(20) > EMA(50). الحالي: EMA20=$${currentEma20.toFixed(1)} < EMA50=$${currentEma50.toFixed(1)}.`,
              timestamp: Date.now(),
            });
            return;
          }

          if (!isExecutingRef.current) {
            console.log(`🎯 تنفيذ فوري لصفقة صعود! تحقق الشرطان: Z=${zScore.toFixed(2)}σ < -2.0 و 1h EMA(20) [$${currentEma20.toFixed(1)}] > 1h EMA(50) [$${currentEma50.toFixed(1)}]. جاري إرسال أمر UP!`);
            limitlessService.logDirect(
              'SYSTEM',
              `🎯 [شرطا الصعود متحققان] Z=${zScore.toFixed(2)}σ < -2.0σ مع اتجاه صاعد 1h EMA(20) [$${currentEma20.toFixed(1)}] > 1h EMA(50) [$${currentEma50.toFixed(1)}]. جاري إرسال أمر UP فوراً!`
            );
            executeLiveTrade(zScore, 'LONG', candleTime);
          }
        } else {
          if (crossedLowerThresholdRef.current) {
            crossedLowerThresholdRef.current = false;
            setCrossedLowerThreshold(false);
          }
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
              slug: data.marketSlug || 'btc-up-or-down-hourly',
              title: 'BTC Up or Down Hourly',
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
        (/hourly/i.test(newMarket.slug) || /hourly/i.test(newMarket.title || '') || /(^|[^0-9])1-hour/i.test(newMarket.slug) || /1\s*hour/i.test(newMarket.title || '') || /(^|[^0-9])1h/i.test(newMarket.slug)) &&
        !/(^|[^0-9])5-min/i.test(newMarket.slug) &&
        !/(^|[^0-9])15-min/i.test(newMarket.slug)
      ) {
        setActiveLimitlessMarket(newMarket);
        activeLimitlessMarketRef.current = newMarket;
      }
    });
    const unsubOracle = limitlessService.subscribeOracle((orc) => setOracle(orc));
    const unsubPositions = limitlessService.subscribePositions((pos) => setPositions(pos));
    const unsubTradeGuard = limitlessService.subscribeTradeGuard((serverGuard) => {
      if (serverGuard && serverGuard.marketSlug) {
        lastExecutedMarketSlugRef.current = serverGuard.marketSlug;
        lastExecutedTimestampRef.current = Number(serverGuard.timestamp) || 0;
        lastExecutedCandleTimeRef.current = Number(serverGuard.candleTime) || 0;
        try {
          localStorage.setItem('limitless_last_trade_guard', JSON.stringify(serverGuard));
        } catch {}
      } else if (serverGuard === null) {
        lastExecutedMarketSlugRef.current = '';
        lastExecutedTimestampRef.current = 0;
        lastExecutedCandleTimeRef.current = 0;
        try {
          localStorage.removeItem('limitless_last_trade_guard');
        } catch {}
      }
    });

    limitlessService.connect(config.limitlessWsUrl, 'btc-up-or-down-hourly', {
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

  // Load real Binance Historical Data & Live WebSocket with permanent connection
  useEffect(() => {
    let isCancelled = false;

    async function initMarketData() {
      const realCandles = await binanceService.fetchHistoricalCandles(
        config.symbol,
        config.timeframe,
        Math.max(120, config.periods + 70),
        config.binanceRestUrl
      );

      if (isCancelled) return;

      if (realCandles.length > 0) {
        setCandles(realCandles);
        const closes = realCandles.map((c) => c.close);
        closePricesRef.current = closes.slice(-config.periods);
        rebuildMetricsRef.current(realCandles, configRef.current);

        // Immediate evaluation of the current in-progress candle on initial data load
        if (realCandles.length >= config.periods) {
          const latestCandle = realCandles[realCandles.length - 1];
          evaluateLiveStrategyRef.current(closes, latestCandle.time);
        }
      }

      // Connect real Binance WebSocket with stable listeners (no 12s reconnect loop)
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
              updatedCandles = [...prev, tickCandle];
            }
            return updatedCandles;
          });

          // Immediate real-time execution in the SAME candle on every price tick
          if (updatedCandles.length >= configRef.current.periods) {
            const allCloses = updatedCandles.map((c) => c.close);
            evaluateLiveStrategyRef.current(allCloses, tickCandle.time);

            if (isClosed) {
              closePricesRef.current = allCloses.slice(-configRef.current.periods);
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
          (/hourly/i.test(data.slug) || /hourly/i.test(data.title || '') || /(^|[^0-9])1-hour/i.test(data.slug) || /1\s*hour/i.test(data.title || '') || /(^|[^0-9])1h/i.test(data.slug)) &&
          !/(^|[^0-9])5-min/i.test(data.slug) &&
          !/(^|[^0-9])15-min/i.test(data.slug)
        ) {
          setActiveLimitlessMarket(data);
          activeLimitlessMarketRef.current = data;
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
      const defaultZ = direction === 'SHORT' ? 1.95 : -1.95;
      executeLiveTrade(currentZScore || defaultZ, direction);
    },
    [executeLiveTrade, currentZScore]
  );

  const kelly = calculateKellySizing(currentBalance, {
    maxPriceCents: config.maxPriceCents,
    winProbability: config.winProbability,
    maxRiskPercent: config.maxRiskPercent,
    fractionChunks: config.fractionChunks,
  });

  return {
    config,
    updateConfig,
    candles,
    metrics,
    latestMetric: metrics.length > 0 ? metrics[metrics.length - 1] : null,
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
    emaFilter,
  };
}
