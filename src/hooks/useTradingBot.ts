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
  zScoreUpper: 2.0,
  zScoreEntry: 1.9,
  zScoreLower: -2.0,
  zScoreLowerEntry: -1.9,
  maxPriceCents: 0.2, // 20 cents and below
  maxRiskPercent: 0.05,
  orderType: 'FAK', // Fill-And-Kill
  fractionChunks: 1, // 1 instant single order for FAK execution
  chunkDelayMs: 500,
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
        if (parsed.zScoreLower === undefined) {
          parsed.zScoreLower = -2.0;
        }
        if (parsed.zScoreLowerEntry === undefined) {
          parsed.zScoreLowerEntry = -1.9;
        }
        // Migrate orderType to FAK and fractionChunks to 1
        if (!parsed.orderType || parsed.orderType === 'GTC') {
          parsed.orderType = 'FAK';
        }
        if (parsed.maxPriceCents === undefined || parsed.maxPriceCents > 0.2) {
          parsed.maxPriceCents = 0.2;
        }
        if (parsed.fractionChunks === 4 || !parsed.fractionChunks) {
          parsed.fractionChunks = 1;
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
  const [crossedUpperThreshold, setCrossedUpperThreshold] = useState<boolean>(false);
  const [crossedLowerThreshold, setCrossedLowerThreshold] = useState<boolean>(false);
  const [lastTradeDirection, setLastTradeDirection] = useState<'SHORT' | 'LONG' | null>(null);
  const [activeSignal, setActiveSignal] = useState<'ENTRY_SHORT' | 'ENTRY_LONG' | null>(null);
  const [isEntrySignal, setIsEntrySignal] = useState<boolean>(false);
  const [currentBalance, setCurrentBalance] = useState<number>(config.initialBalance);
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
    return false; // Default to stopped for maximum safety until the user starts it
  });
  const [binanceStatus, setBinanceStatus] = useState<'CONNECTING' | 'CONNECTED' | 'DISCONNECTED'>('CONNECTING');
  const [limitlessStatus, setLimitlessStatus] = useState<LimitlessStatus>('DISCONNECTED');
  const [wsLogs, setWsLogs] = useState<WsMessageLog[]>([]);
  const [currentChunks, setCurrentChunks] = useState<ExecutedChunk[]>([]);
  const [activeTrade, setActiveTrade] = useState<TradeOrder | null>(null);
  const [tradeHistory, setTradeHistory] = useState<TradeOrder[]>([]);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
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

  configRef.current = config;
  botActiveRef.current = botActive;
  currentBalanceRef.current = currentBalance;
  crossedUpperThresholdRef.current = crossedUpperThreshold;
  crossedLowerThresholdRef.current = crossedLowerThreshold;

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

      // Direction 1: Upper (Short / Down)
      if (cfg.strategyDirection === 'BOTH' || cfg.strategyDirection === 'SHORT_ONLY') {
        if (stats.zScore > cfg.zScoreUpper) {
          hadArmedUpper = true;
          signal = 'ARMED_UPPER';
          dir = 'SHORT';
        } else if (hadArmedUpper && stats.zScore <= cfg.zScoreEntry) {
          hadArmedUpper = false;
          signal = 'ENTRY_SHORT';
          dir = 'SHORT';
        }
      }

      // Direction 2: Lower (Long / Up)
      if (cfg.strategyDirection === 'BOTH' || cfg.strategyDirection === 'LONG_ONLY') {
        if (stats.zScore < lowerThresh) {
          hadArmedLower = true;
          signal = 'ARMED_LOWER';
          dir = 'LONG';
        } else if (hadArmedLower && stats.zScore >= lowerEntryThresh) {
          hadArmedLower = false;
          signal = 'ENTRY_LONG';
          dir = 'LONG';
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
    }
  }, []);

  // Execute LIVE Trade strictly across Limitless WebSocket
  const executeLiveTrade = useCallback(async (triggerZ: number, direction: 'SHORT' | 'LONG' = 'SHORT') => {
    const cfg = configRef.current;
    const balance = currentBalanceRef.current;

    const kelly = calculateKellySizing(balance, {
      maxPriceCents: cfg.maxPriceCents,
      winProbability: cfg.winProbability,
      maxRiskPercent: cfg.maxRiskPercent,
      fractionChunks: cfg.fractionChunks,
    });

    if (kelly.numberOfContracts <= 0) {
      console.warn('Live trade aborted: Calculated contract size is 0.');
      return;
    }

    isExecutingRef.current = true;
    setIsExecuting(true);
    setIsEntrySignal(true);
    setActiveSignal(direction === 'LONG' ? 'ENTRY_LONG' : 'ENTRY_SHORT');
    setLastTradeDirection(direction);
    setLastSignalTime(Date.now());
    soundController.playEntrySignal();

    // Determine target 15-minute market slug
    const resolvedMarketSlug =
      activeLimitlessMarket?.slug && activeLimitlessMarket.slug.includes('15-min')
        ? activeLimitlessMarket.slug
        : config.limitlessMarketSlug && config.limitlessMarketSlug.includes('15-min')
        ? config.limitlessMarketSlug
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

    const outcome = direction === 'LONG' ? 'UP' : 'DOWN';
    const tradeId = `live_trd_${Date.now()}`;
    const initialTrade: TradeOrder = {
      id: tradeId,
      timestamp: Date.now(),
      symbol: cfg.symbol,
      market: resolvedMarketSlug,
      direction,
      outcome,
      triggerZScore: triggerZ,
      contractPrice: cfg.maxPriceCents,
      totalContracts: kelly.numberOfContracts,
      totalInvestmentUsd: kelly.numberOfContracts * cfg.maxPriceCents,
      kellyRiskPct: kelly.riskToTake,
      chunks: [],
      status: 'PENDING_WS',
    };

    setActiveTrade(initialTrade);

    try {
      console.log(
        `[LIVE EXECUTION - ${direction}] Sending ${kelly.numberOfContracts} contracts in ${cfg.fractionChunks} chunks to Limitless (${resolvedMarketSlug} - ${outcome} / ${
          direction === 'LONG' ? 'BUY UP/YES' : 'BUY DOWN/NO'
        })...`
      );

      const executed = await limitlessService.executeChunkedOrder(
        kelly.numberOfContracts,
        cfg.maxPriceCents,
        cfg.fractionChunks,
        cfg.orderType,
        cfg.chunkDelayMs,
        (updatedChunk) => {
          setCurrentChunks((prev) => {
            const filtered = prev.filter((c) => c.chunkId !== updatedChunk.chunkId);
            return [...filtered, updatedChunk].sort((a, b) => a.chunkId - b.chunkId);
          });
        },
        direction,
        resolvedMarketSlug
      );

      const completedTrade: TradeOrder = {
        ...initialTrade,
        chunks: executed,
        status: cfg.orderType === 'FAK' ? 'EXECUTED_FAK' : 'ACTIVE_GTC',
      };

      setActiveTrade(completedTrade);
      setTradeHistory((prev) => [completedTrade, ...prev]);

      // Deduct invested funds pending exchange settlement
      setCurrentBalance((prev) => Math.max(0, prev - completedTrade.totalInvestmentUsd));
    } catch (err) {
      console.error('[LIVE ORDER ERROR] Failed to transmit chunks:', err);
      setActiveTrade((prev) => (prev ? { ...prev, status: 'REJECTED' } : null));
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
      if (!botActiveRef.current || prices.length < cfg.periods) return;

      const lowerThresh = cfg.zScoreLower !== undefined ? cfg.zScoreLower : -cfg.zScoreUpper;
      const lowerEntryThresh = cfg.zScoreLowerEntry !== undefined ? cfg.zScoreLowerEntry : -cfg.zScoreEntry;

      const { zScore } = calculateZScore(prices, cfg.zScoreUpper, cfg.zScoreEntry, lowerThresh, lowerEntryThresh);
      setCurrentZScore(zScore);

      // ================= DIRECTION 1: OVERBOUGHT (Short / Down) =================
      if (cfg.strategyDirection === 'BOTH' || cfg.strategyDirection === 'SHORT_ONLY') {
        // Arm Upper: Price diverges above upper threshold
        if (zScore > cfg.zScoreUpper) {
          if (!crossedUpperThresholdRef.current) {
            crossedUpperThresholdRef.current = true;
            setCrossedUpperThreshold(true);
            soundController.playAlert();
            console.log(`⚠️ Live Z-Score crossed above +${cfg.zScoreUpper}σ (${zScore.toFixed(2)}σ). Bot is ARMED for BEARISH REVERSION (SHORT/DOWN).`);
          }
        }

        // Trigger Short: Reversion back below or equal to entry threshold in the same candle
        if (crossedUpperThresholdRef.current && zScore <= cfg.zScoreEntry) {
          if (!isExecutingRef.current && (!candleTime || lastExecutedCandleTimeRef.current !== candleTime)) {
            console.log(`🎯 INSTANT LIVE SHORT ENTRY! Z-Score reverted below +${cfg.zScoreEntry}σ (${zScore.toFixed(2)}σ) in the SAME candle. Executing BEARISH REVERSION order!`);
            crossedUpperThresholdRef.current = false;
            setCrossedUpperThreshold(false);
            if (candleTime) {
              lastExecutedCandleTimeRef.current = candleTime;
            }
            executeLiveTrade(zScore, 'SHORT');
          }
        }
      }

      // ================= DIRECTION 2: OVERSOLD (Long / Up) =================
      if (cfg.strategyDirection === 'BOTH' || cfg.strategyDirection === 'LONG_ONLY') {
        // Arm Lower: Price plunges below lower threshold
        if (zScore < lowerThresh) {
          if (!crossedLowerThresholdRef.current) {
            crossedLowerThresholdRef.current = true;
            setCrossedLowerThreshold(true);
            soundController.playAlert();
            console.log(`⚠️ Live Z-Score dropped below ${lowerThresh}σ (${zScore.toFixed(2)}σ). Bot is ARMED for BULLISH REVERSION (LONG/UP).`);
          }
        }

        // Trigger Long: Rebound back above or equal to lower entry threshold in the same candle
        if (crossedLowerThresholdRef.current && zScore >= lowerEntryThresh) {
          if (!isExecutingRef.current && (!candleTime || lastExecutedCandleTimeRef.current !== candleTime)) {
            console.log(`🎯 INSTANT LIVE LONG ENTRY! Z-Score bounced above ${lowerEntryThresh}σ (${zScore.toFixed(2)}σ) in the SAME candle. Executing BULLISH REVERSION order!`);
            crossedLowerThresholdRef.current = false;
            setCrossedLowerThreshold(false);
            if (candleTime) {
              lastExecutedCandleTimeRef.current = candleTime;
            }
            executeLiveTrade(zScore, 'LONG');
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
    const unsubOrderbook = limitlessService.subscribeOrderbook((ob) => setOrderbook(ob));
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
      unsubOracle();
      unsubPositions();
      limitlessService.disconnect();
    };
  }, [
    config.limitlessWsUrl,
    config.limitlessMarketSlug,
    config.limitlessApiKey,
    config.limitlessTokenId,
    config.limitlessTokenSecret,
  ]);

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
      const res = await fetch('/api/balance');
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.success && data.isLive) {
        setIsLiveBalance(true);
        setCurrentBalance(data.usdcBalance);
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

    // Auto-discover active Limitless BTC prediction market
    refreshActiveMarket();
    const marketInterval = setInterval(() => {
      refreshActiveMarket();
    }, 15000);

    // Fetch initial balance once on load; subsequent updates only happen when the user clicks refresh
    refreshLiveBalance();

    return () => {
      clearInterval(marketInterval);
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
        soundController.playAlert();
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
