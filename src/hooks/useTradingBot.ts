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
  timeframe: '15m',
  periods: 14,
  strategyDirection: 'BOTH', // 'BOTH' | 'LONG_ONLY' | 'SHORT_ONLY'
  zScoreUpper: 2.0, // Upper threshold: Entry condition when exceeding 2.0 in rise
  zScoreEntry: 2.0,
  zScoreLower: -2.0, // Lower threshold: Entry condition when exceeding -2.0 in decline
  zScoreLowerEntry: -2.0,
  maxPriceCents: 0.85, // Ceiling price
  maxRiskPercent: 0.05, // Strictly capped at 5% maximum
  orderType: 'FAK', // Fill-And-Kill
  fractionChunks: 1, // 1 unified single direct order (chunking eliminated)
  chunkDelayMs: 0,
  winProbability: 0.55,
  initialBalance: 1000,
  binanceRestUrl: 'https://api.binance.com/api/v3/klines',
  binanceWsUrl: 'wss://stream.binance.com/ws/btcusdt@kline_15m',
  limitlessWsUrl: 'wss://ws.limitless.exchange',
  limitlessMarketSlug: 'btc-up-or-down-15-min',
  limitlessApiKey: (typeof process !== 'undefined' && process.env?.LIMITLESS_API_KEY) || '',
  limitlessTokenId: (typeof process !== 'undefined' && process.env?.LMTS_TOKEN_ID) || '',
  limitlessTokenSecret: (typeof process !== 'undefined' && process.env?.LMTS_TOKEN_SECRET) || '',
};

export function useTradingBot() {
  const [config, setConfig] = useState<BotConfig>(() => {
    // Read persisted config if available
    try {
      const saved = localStorage.getItem('limitless_live_bot_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.binanceWsUrl && parsed.binanceWsUrl.includes(':9443')) {
          parsed.binanceWsUrl = DEFAULT_CONFIG.binanceWsUrl;
        }
        if (parsed.binanceRestUrl && parsed.binanceRestUrl.includes('binance.vision')) {
          parsed.binanceRestUrl = DEFAULT_CONFIG.binanceRestUrl;
        }
        if (parsed.limitlessWsUrl && parsed.limitlessWsUrl.includes('api.limitless.exchange')) {
          parsed.limitlessWsUrl = DEFAULT_CONFIG.limitlessWsUrl;
        }
        // Force migration away from 5-min or weekly markets to 15-min
        if (
          !parsed.limitlessMarketSlug ||
          /(^|[^0-9])5-min/i.test(parsed.limitlessMarketSlug) ||
          parsed.limitlessMarketSlug.includes('weekly')
        ) {
          parsed.limitlessMarketSlug = DEFAULT_CONFIG.limitlessMarketSlug;
        }
        if (!parsed.strategyDirection) {
          parsed.strategyDirection = 'BOTH';
        }
        // Enforce threshold 2.0 and direct entry on exceeding threshold 2
        parsed.zScoreUpper = 2.0;
        parsed.zScoreEntry = 2.0;
        parsed.zScoreLower = -2.0;
        parsed.zScoreLowerEntry = -2.0;
        // Force orderType to FAK
        if (!parsed.orderType || parsed.orderType === 'GTC') {
          parsed.orderType = 'FAK';
        }
        if (parsed.maxPriceCents === undefined || parsed.maxPriceCents < 0.3) {
          parsed.maxPriceCents = 0.85;
        }
        // Strictly eliminate chunking: set to 1 instant single order
        parsed.fractionChunks = 1;
        parsed.chunkDelayMs = 0;
        // Strictly cap maxRiskPercent at 5% (0.05)
        parsed.maxRiskPercent = 0.05;

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

  // References for live closures
  const closePricesRef = useRef<number[]>([]);
  const crossedUpperThresholdRef = useRef<boolean>(false);
  const crossedLowerThresholdRef = useRef<boolean>(false);
  const botActiveRef = useRef<boolean>(botActive);
  const configRef = useRef<BotConfig>(config);
  const currentBalanceRef = useRef<number>(currentBalance);
  const isExecutingRef = useRef<boolean>(false);
  const lastExecutedCandleTimeRef = useRef<number>(0);
  const activeLimitlessMarketRef = useRef<LimitlessMarketDetails | null>(null);
  const metricsRef = useRef<ZScoreMetric[]>([]);

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

    for (let i = 0; i < candleList.length; i++) {
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
          signal: null,
          direction: null,
        });
        continue;
      }

      const windowSlice = closes.slice(i - cfg.periods + 1, i + 1);
      const stats = calculateZScore(windowSlice, cfg.zScoreUpper, cfg.zScoreEntry, lowerThresh, lowerEntryThresh);

      let signal: 'ARMED_UPPER' | 'ARMED_LOWER' | 'ENTRY_SHORT' | 'ENTRY_LONG' | 'ARMED' | 'ENTRY' | null = null;
      let dir: 'SHORT' | 'LONG' | null = null;

      // Direction 1: Upper / Rise (Short / Down) - Entry ONLY when exceeding threshold 2 (>= 2.0σ)
      if (cfg.strategyDirection === 'BOTH' || cfg.strategyDirection === 'SHORT_ONLY') {
        if (stats.zScore >= cfg.zScoreUpper) {
          if (!hadArmedUpper) {
            hadArmedUpper = true;
            signal = 'ENTRY_SHORT';
            dir = 'SHORT';
          }
        } else {
          hadArmedUpper = false;
        }
      }

      // Direction 2: Lower / Decline (Long / Up) - Entry ONLY when exceeding threshold -2 (<= -2.0σ)
      if (cfg.strategyDirection === 'BOTH' || cfg.strategyDirection === 'LONG_ONLY') {
        if (stats.zScore <= lowerThresh) {
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
        signal,
        direction: dir,
      });
    }

    setMetrics(result);
    if (result.length > 0) {
      const latest = result[result.length - 1];
      setCurrentZScore(latest.zScore);

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

  // Execute LIVE Trade strictly across Limitless
  const executeLiveTrade = useCallback(async (
    triggerZ: number,
    direction: 'SHORT' | 'LONG' = 'SHORT',
    candleTime?: number
  ) => {
    const cfg = configRef.current;
    let balance = currentBalanceRef.current;

    // If memory balance is zero but liveUsdcBalance has a real value, synchronize immediately
    if (balance <= 0 && liveUsdcBalance > 0) {
      balance = liveUsdcBalance;
      currentBalanceRef.current = liveUsdcBalance;
      setCurrentBalance(liveUsdcBalance);
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
    // Align to 3 decimals as strictly required by Limitless SDK (multiple of 0.001)
    const effectiveContractPrice = parseFloat(Math.max(0.001, Math.min(0.999, liveContractPrice)).toFixed(3));

    const kelly = calculateKellySizing(balance, {
      maxPriceCents: effectiveContractPrice,
      winProbability: cfg.winProbability,
      maxRiskPercent: cfg.maxRiskPercent,
      fractionChunks: cfg.fractionChunks,
    });

    // Enforce at least 1 contract for Limitless CLOB order execution
    const effectiveContracts = Math.max(1, Math.round(kelly.numberOfContracts || 1));

    if (balance <= 0) {
      if (liveUsdcBalance > 0) {
        balance = liveUsdcBalance;
        currentBalanceRef.current = liveUsdcBalance;
        setCurrentBalance(liveUsdcBalance);
      } else {
        const warnMsg = `⚠️ تعذر إرسال الصفقة: رصيد المحفظة الحالي هو ($0.00 USDC). جاري فحص الرصيد من شبكة Base...`;
        console.warn(warnMsg);
        limitlessService.logDirect('SYSTEM', warnMsg);
        setExecutionNotice({
          type: 'WARNING',
          message: warnMsg,
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

    // Determine target 15-minute market slug using latest live ref
    const currentMarket = activeLimitlessMarketRef.current;
    const resolvedMarketSlug =
      currentMarket?.slug && currentMarket.slug.includes('15-min')
        ? currentMarket.slug
        : cfg.limitlessMarketSlug && cfg.limitlessMarketSlug.includes('15-min')
        ? cfg.limitlessMarketSlug
        : 'btc-up-or-down-15-min';

    // Strict Safety Guard: NEVER trade 5-minute contracts
    if (/(^|[^0-9])5-min/i.test(resolvedMarketSlug)) {
      console.error(
        `[SAFETY SHIELD] 5-Minute contract '${resolvedMarketSlug}' blocked! Trading bot is locked strictly to 15-minute contracts.`
      );
      isExecutingRef.current = false;
      setIsExecuting(false);
      return;
    }

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
        }) @ $${effectiveContractPrice} [5% Max Risk - No Chunking]...`
      );

      limitlessService.logDirect(
        'OUTGOING',
        `🚀 [تنفيذ صفقة مباشرة] إرسال أمر موحد لعدد ${effectiveContracts} عقود ${outcome} (${direction}) بسعر $${effectiveContractPrice} إلى سوق ${resolvedMarketSlug} (سقف مخاطرة 5% كحد أقصى دون تجزئة)...`
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

      if (candleTime) {
        lastExecutedCandleTimeRef.current = candleTime;
      }

      // Deduct invested funds
      const invested = completedTrade.totalInvestmentUsd;
      setCurrentBalance((prev) => Math.max(0, prev - invested));
      currentBalanceRef.current = Math.max(0, currentBalanceRef.current - invested);

      const successNotice = `✅ تم إرسال الصفقة بنجاح: أمر موحد لشراء ${outcome} (${direction}) لعدد ${effectiveContracts} عقد بقيمة $${invested.toFixed(2)} (سقف مخاطرة 5% دون تجزئة) على سوق ${resolvedMarketSlug}`;
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
    } finally {
      isExecutingRef.current = false;
      setIsExecuting(false);
      setTimeout(() => {
        setIsEntrySignal(false);
        setActiveSignal(null);
      }, 4000);
    }
  }, []);

  // Real Market Strategy Evaluation (Evaluates on every tick for immediate same-candle entry)
  const evaluateLiveStrategy = useCallback(
    (prices: number[], candleTime?: number) => {
      const cfg = configRef.current;
      if (prices.length < cfg.periods) return;

      const lowerThresh = cfg.zScoreLower !== undefined ? cfg.zScoreLower : -cfg.zScoreUpper;
      const lowerEntryThresh = cfg.zScoreLowerEntry !== undefined ? cfg.zScoreLowerEntry : -cfg.zScoreEntry;

      const { zScore } = calculateZScore(prices, cfg.zScoreUpper, cfg.zScoreEntry, lowerThresh, lowerEntryThresh);
      setCurrentZScore(zScore);

      // Determine arming: either triggered in live session or within the recent 3 candles
      const recentOverbought = metricsRef.current.slice(-3).some((m) => m.zScore >= cfg.zScoreUpper);
      const recentOversold = metricsRef.current.slice(-3).some((m) => m.zScore <= lowerThresh);

      // ================= DIRECTION 1: UPPER / RISE (Short / Down) =================
      // شرط الدخول: فقط عند تجاوز العتبة 2 في الصعود (Z >= +2.0σ)
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

          if (!isExecutingRef.current && (!candleTime || lastExecutedCandleTimeRef.current !== candleTime)) {
            if (candleTime) lastExecutedCandleTimeRef.current = candleTime;
            console.log(`🎯 تنفيذ فوري لصفقة هبوط! تجاوز Z-Score عتبة +${cfg.zScoreUpper}σ (${zScore.toFixed(2)}σ). جاري إرسال أمر DOWN!`);
            limitlessService.logDirect(
              'SYSTEM',
              `🎯 [شرط الدخول متحقق] تجاوزت قيمة Z-Score عتبة +${cfg.zScoreUpper}σ (${zScore.toFixed(2)}σ) في الصعود. تنفيذ فوري لصفقة DOWN!`
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

      // ================= DIRECTION 2: LOWER / DECLINE (Long / Up) =================
      // شرط الدخول: فقط عند تجاوز العتبة 2 في الهبوط (Z <= -2.0σ)
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

          if (!isExecutingRef.current && (!candleTime || lastExecutedCandleTimeRef.current !== candleTime)) {
            if (candleTime) lastExecutedCandleTimeRef.current = candleTime;
            console.log(`🎯 تنفيذ فوري لصفقة صعود! تجاوز Z-Score عتبة ${lowerThresh}σ (${zScore.toFixed(2)}σ). جاري إرسال أمر UP!`);
            limitlessService.logDirect(
              'SYSTEM',
              `🎯 [شرط الدخول متحقق] تجاوزت قيمة Z-Score عتبة ${lowerThresh}σ (${zScore.toFixed(2)}σ) في الهبوط. تنفيذ فوري لصفقة UP!`
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
              slug: data.marketSlug || 'btc-up-or-down-15-min',
              title: 'BTC Up or Down - 15 Min',
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
        (/(^|[^0-9])15-min/i.test(newMarket.slug) || /15\s*min/i.test(newMarket.title || '')) &&
        !/(^|[^0-9])5-min/i.test(newMarket.slug)
      ) {
        setActiveLimitlessMarket(newMarket);
        activeLimitlessMarketRef.current = newMarket;
        setConfig((prev) => {
          if (prev.limitlessMarketSlug !== newMarket.slug) {
            const updated = { ...prev, limitlessMarketSlug: newMarket.slug };
            try {
              localStorage.setItem('limitless_live_bot_config', JSON.stringify(updated));
            } catch {}
            return updated;
          }
          return prev;
        });
      }
    });
    const unsubOracle = limitlessService.subscribeOracle((orc) => setOracle(orc));
    const unsubPositions = limitlessService.subscribePositions((pos) => setPositions(pos));

    limitlessService.connect(config.limitlessWsUrl, config.limitlessMarketSlug, {
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

  // Load real Binance Historical Data & Live WebSocket
  useEffect(() => {
    let isCancelled = false;

    async function initMarketData() {
      const realCandles = await binanceService.fetchHistoricalCandles(
        config.symbol,
        config.timeframe,
        config.periods + 35,
        config.binanceRestUrl
      );

      if (isCancelled) return;

      if (realCandles.length > 0) {
        setCandles(realCandles);
        const closes = realCandles.map((c) => c.close);
        closePricesRef.current = closes.slice(-config.periods);
        rebuildMetrics(realCandles, config);
      }

      // Connect real Binance WebSocket
      binanceService.connectWebSocket(
        config.symbol,
        config.timeframe,
        (tickCandle, isClosed) => {
          setCandles((prev) => {
            const last = prev[prev.length - 1];
            let next: CandleData[];
            if (last && last.time === tickCandle.time) {
              next = [...prev.slice(0, -1), tickCandle];
            } else {
              next = [...prev, tickCandle];
            }

            // Immediate real-time execution in the SAME candle on every price tick
            const liveCloses = [...closePricesRef.current.slice(1), tickCandle.close];
            evaluateLiveStrategy(liveCloses, tickCandle.time);

            // Finalize candle close in history buffer
            if (isClosed) {
              closePricesRef.current = liveCloses;
            }

            rebuildMetrics(next, configRef.current);
            return next;
          });
        },
        (status) => setBinanceStatus(status)
      );
    }

    initMarketData();

    return () => {
      isCancelled = true;
      binanceService.disconnect();
    };
  }, [config.symbol, config.timeframe, config.periods, config.binanceRestUrl, rebuildMetrics, evaluateLiveStrategy]);

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
          (/(^|[^0-9])15-min/i.test(data.slug) || /15\s*min/i.test(data.title || '')) &&
          !/(^|[^0-9])5-min/i.test(data.slug)
        ) {
          setActiveLimitlessMarket(data);
          activeLimitlessMarketRef.current = data;
          setConfig((prev) => {
            if (prev.limitlessMarketSlug !== data.slug) {
              const updated = { ...prev, limitlessMarketSlug: data.slug };
              try {
                localStorage.setItem('limitless_live_bot_config', JSON.stringify(updated));
              } catch {}
              return updated;
            }
            return prev;
          });
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
  };
}
