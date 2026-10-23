import { useState, useEffect, useRef, useCallback } from 'react';
import {
  BotConfig,
  CandleData,
  ZScoreMetric,
  ExecutedChunk,
  TradeOrder,
  WsMessageLog,
} from '../types/bot';
import { binanceService } from '../services/binanceService';
import { limitlessService, LimitlessStatus } from '../services/limitlessService';
import { calculateZScore, calculateKellySizing } from '../utils/math';
import { soundController } from '../utils/audio';

const DEFAULT_CONFIG: BotConfig = {
  symbol: 'BTCUSDT',
  timeframe: '15m',
  periods: 14,
  zScoreUpper: 2.0,
  zScoreEntry: 1.9,
  maxPriceCents: 0.2,
  maxRiskPercent: 0.05,
  orderType: 'GTC',
  fractionChunks: 4,
  chunkDelayMs: 500,
  winProbability: 0.55,
  initialBalance: 1000,
  binanceRestUrl: 'https://api.binance.vision/api/v3/klines',
  binanceWsUrl: 'wss://stream.binance.com:9443/ws/btcusdt@kline_15m',
  limitlessWsUrl: 'wss://api.limitless.exchange/v1/ws',
  limitlessApiKey: '',
};

export function useTradingBot() {
  const [config, setConfig] = useState<BotConfig>(() => {
    // Read persisted config if available
    try {
      const saved = localStorage.getItem('limitless_live_bot_config');
      if (saved) return JSON.parse(saved);
    } catch {
      // Fallback
    }
    return DEFAULT_CONFIG;
  });

  const [candles, setCandles] = useState<CandleData[]>([]);
  const [metrics, setMetrics] = useState<ZScoreMetric[]>([]);
  const [currentZScore, setCurrentZScore] = useState<number>(0);
  const [crossedUpperThreshold, setCrossedUpperThreshold] = useState<boolean>(false);
  const [isEntrySignal, setIsEntrySignal] = useState<boolean>(false);
  const [currentBalance, setCurrentBalance] = useState<number>(config.initialBalance);
  const [botActive, setBotActive] = useState<boolean>(true);
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
  const botActiveRef = useRef<boolean>(true);
  const configRef = useRef<BotConfig>(config);
  const currentBalanceRef = useRef<number>(currentBalance);

  configRef.current = config;
  botActiveRef.current = botActive;
  currentBalanceRef.current = currentBalance;
  crossedUpperThresholdRef.current = crossedUpperThreshold;

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
    let hadArmed = false;

    for (let i = 0; i < candleList.length; i++) {
      if (i < cfg.periods) {
        result.push({
          time: candleList[i].time,
          price: candleList[i].close,
          mean: candleList[i].close,
          stdDev: 0,
          variance: 0,
          zScore: 0,
          upperBand: candleList[i].close,
          entryBand: candleList[i].close,
          lowerBand: candleList[i].close,
          upperThreshold: cfg.zScoreUpper,
          entryThreshold: cfg.zScoreEntry,
          lowerThreshold: -cfg.zScoreUpper,
          signal: null,
        });
        continue;
      }

      const windowSlice = closes.slice(i - cfg.periods, i);
      const stats = calculateZScore(windowSlice, cfg.zScoreUpper, cfg.zScoreEntry);

      let signal: 'ARMED' | 'ENTRY' | null = null;
      if (stats.zScore > cfg.zScoreUpper) {
        hadArmed = true;
        signal = 'ARMED';
      } else if (hadArmed && stats.zScore < cfg.zScoreEntry) {
        hadArmed = false;
        signal = 'ENTRY';
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
        lowerBand: stats.lowerBand,
        upperThreshold: cfg.zScoreUpper,
        entryThreshold: cfg.zScoreEntry,
        lowerThreshold: -cfg.zScoreUpper,
        signal,
      });
    }

    setMetrics(result);
    if (result.length > 0) {
      const latest = result[result.length - 1];
      setCurrentZScore(latest.zScore);
    }
  }, []);

  // Execute LIVE Trade strictly across Limitless WebSocket
  const executeLiveTrade = useCallback(async (triggerZ: number) => {
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

    setIsExecuting(true);
    setIsEntrySignal(true);
    setLastSignalTime(Date.now());
    soundController.playEntrySignal();

    const tradeId = `live_trd_${Date.now()}`;
    const initialTrade: TradeOrder = {
      id: tradeId,
      timestamp: Date.now(),
      symbol: cfg.symbol,
      market: `${cfg.symbol.replace('USDT', '')}_${cfg.timeframe.toUpperCase()}_PREDICTION`,
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
      console.log(`[LIVE EXECUTION] Sending ${kelly.numberOfContracts} contracts in ${cfg.fractionChunks} chunks to Limitless...`);
      
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
        }
      );

      const completedTrade: TradeOrder = {
        ...initialTrade,
        chunks: executed,
        status: 'ACTIVE_GTC',
      };

      setActiveTrade(completedTrade);
      setTradeHistory((prev) => [completedTrade, ...prev]);

      // Deduct invested funds pending exchange settlement
      setCurrentBalance((prev) => Math.max(0, prev - completedTrade.totalInvestmentUsd));
    } catch (err) {
      console.error('[LIVE ORDER ERROR] Failed to transmit chunks:', err);
      setActiveTrade((prev) => (prev ? { ...prev, status: 'REJECTED' } : null));
    } finally {
      setIsExecuting(false);
      setTimeout(() => setIsEntrySignal(false), 4000);
    }
  }, []);

  // Real Market Strategy Evaluation
  const evaluateLiveStrategy = useCallback(
    (prices: number[]) => {
      const cfg = configRef.current;
      if (!botActiveRef.current || prices.length < cfg.periods) return;

      const { zScore } = calculateZScore(prices, cfg.zScoreUpper, cfg.zScoreEntry);
      setCurrentZScore(zScore);

      // Condition 1: Crossed above upper threshold
      if (zScore > cfg.zScoreUpper) {
        if (!crossedUpperThresholdRef.current) {
          crossedUpperThresholdRef.current = true;
          setCrossedUpperThreshold(true);
          soundController.playAlert();
          console.log(`⚠️ Live Z-Score crossed above ${cfg.zScoreUpper} (${zScore.toFixed(2)}σ). Bot is ARMED.`);
        }
      }

      // Condition 2: Mean reversion - price pulls back below entry threshold
      if (crossedUpperThresholdRef.current && zScore < cfg.zScoreEntry) {
        console.log(`🎯 LIVE ENTRY SIGNAL! Z-Score reverted below ${cfg.zScoreEntry} (${zScore.toFixed(2)}σ).`);
        crossedUpperThresholdRef.current = false;
        setCrossedUpperThreshold(false);
        executeLiveTrade(zScore);
      }
    },
    [executeLiveTrade]
  );

  // Subscribe to Limitless WebSocket Gateway
  useEffect(() => {
    const unsubStatus = limitlessService.subscribeStatus((st) => setLimitlessStatus(st));
    const unsubLogs = limitlessService.subscribeLogs((log) => {
      setWsLogs((prev) => [...prev.slice(-80), log]);
    });
    const unsubBalance = limitlessService.subscribeBalance((bal) => {
      console.log(`[LIVE BALANCE UPDATE] Exchange reported new balance: $${bal}`);
      setCurrentBalance(bal);
    });

    limitlessService.connect(config.limitlessWsUrl, config.limitlessApiKey);

    return () => {
      unsubStatus();
      unsubLogs();
      unsubBalance();
      limitlessService.disconnect();
    };
  }, [config.limitlessWsUrl, config.limitlessApiKey]);

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

            // In accordance with the bot script: update and evaluate strictly on candle close
            if (isClosed) {
              const updatedCloses = [...closePricesRef.current.slice(1), tickCandle.close];
              closePricesRef.current = updatedCloses;
              evaluateLiveStrategy(updatedCloses);
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

  const toggleBot = () => {
    setBotActive((prev) => !prev);
  };

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
    currentZScore,
    crossedUpperThreshold,
    isEntrySignal,
    currentBalance,
    botActive,
    toggleBot,
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
  };
}
