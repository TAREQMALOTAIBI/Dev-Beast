import { BinanceStreamEngine } from './binanceStream';
import { QuantEngine } from './quantEngine';
import { LimitlessClient } from './limitlessClient';
import {
  Candle,
  BotConfig,
  FullBotState,
  ExecutionLog,
  Position,
  LimitlessContract,
  QuantMetrics,
  ContractWindow,
  SystemHealth,
} from '../src/types';
import { Response } from 'express';

export class BotService {
  private binanceStream: BinanceStreamEngine;
  private quantEngine: QuantEngine;
  private limitlessClient: LimitlessClient;

  private config: BotConfig = {
    active: true,
    liveMode: false, // Default dry-run for safety until user explicitly toggles Live
    zScoreThreshold: 1.5,
    momentumThreshold: 25.0,
    oiDropThreshold: 0.5,
    riskPercentage: 0.10,
    priceFloor: 0.01,
    priceCap: 0.25,
    goldenWindowStartSec: 210, // 03:30
    goldenWindowEndSec: 510,   // 08:30
    limitlessTokenId: process.env.LIMITLESS_API_TOKEN_ID || '',
    limitlessTokenSecret: process.env.LIMITLESS_API_TOKEN_SECRET || '',
    limitlessWalletAddress: process.env.LIMITLESS_EMBEDDED_WALLET_ADDRESS || '',
  };

  private positions: Position[] = [];
  private logs: ExecutionLog[] = [];
  private sseClients: Response[] = [];
  private startTime = Date.now();
  private contractSyncInterval: NodeJS.Timeout | null = null;
  private settlementInterval: NodeJS.Timeout | null = null;
  private sseBroadcastInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.binanceStream = new BinanceStreamEngine();
    this.quantEngine = new QuantEngine();
    this.limitlessClient = new LimitlessClient(this.config);

    this.setupListeners();
  }

  public async initialize(): Promise<void> {
    this.addLog('INFO', 'Limitless Quant Trading Bot starting up (Target: 15M BTC Contracts on Base Mainnet)...');
    await this.binanceStream.start();

    // Initial contract sync
    const currentPrice = this.binanceStream.getLatestPrice();
    const cycleOpenPrice = this.quantEngine.get15mCycleOpenPrice(this.binanceStream.getCandles());
    await this.limitlessClient.syncContract(currentPrice, cycleOpenPrice);

    // Periodic sync of Limitless Contract every 5 seconds
    this.contractSyncInterval = setInterval(async () => {
      try {
        const btcPrice = this.binanceStream.getLatestPrice();
        const openPrice = this.quantEngine.get15mCycleOpenPrice(this.binanceStream.getCandles());
        await this.limitlessClient.syncContract(btcPrice, openPrice);
      } catch (err) {
        // silent catch
      }
    }, 5000);

    // Settlement checker every 3 seconds for expired positions
    this.settlementInterval = setInterval(() => {
      this.checkSettlements();
    }, 3000);

    // Broadcast SSE state update every 1 second
    this.sseBroadcastInterval = setInterval(() => {
      this.broadcastSse();
    }, 1000);

    this.addLog('INFO', 'Data Ingestion & Memory Engine active. Rolling 100 1m candles buffer online.');
  }

  private setupListeners(): void {
    // 1m Candle Closed event: Evaluate Triggers
    this.binanceStream.on('candleClosed', async (closedCandle: Candle, allCandles: Candle[]) => {
      await this.handleCandleClosed(closedCandle, allCandles);
    });

    this.binanceStream.on('connected', () => {
      this.addLog('INFO', 'Binance WebSocket btcusdt@kline_1m connected.');
    });

    this.binanceStream.on('disconnected', () => {
      this.addLog('WARN', 'Binance WebSocket disconnected. Reconnection watchdog initiated.');
    });
  }

  /**
   * Evaluate triggers ONLY on 1m candle closes when the bot is Active
   */
  private async handleCandleClosed(closedCandle: Candle, allCandles: Candle[]): Promise<void> {
    const now = Date.now();
    const windowState = this.quantEngine.getContractWindowState(now);
    const oiData = this.binanceStream.getOpenInterest();
    const metrics = this.quantEngine.evaluateSignal(allCandles, oiData, now);

    this.addLog(
      'INFO',
      `1m Candle Closed @ $${closedCandle.close.toFixed(2)} | Z-Score: ${metrics.zScore.toFixed(2)}σ | Δ: $${metrics.momentumDelta.toFixed(1)} | OI Drop: ${metrics.oiDropPct.toFixed(2)}% | Window: ${windowState.minuteFormatted}`
    );

    // If bot is inactive, do not execute
    if (!this.config.active) {
      return;
    }

    // Check MASTER TRIGGER RULE:
    // Signal fires ONLY when (Z-Score Condition AND Momentum Delta AND OI Drop) are ALL TRUE simultaneously!
    if (!metrics.isAllTriggered) {
      return;
    }

    // All 3 conditions triggered!
    this.addLog('TRIGGER', `🚨 QUANT SIGNAL TRIGGERED! [|Z| >= ${metrics.zScoreThreshold}σ, Δ >= $${metrics.momentumThreshold}, OI Drop >= ${metrics.oiDropThreshold}%]`, {
      zScore: metrics.zScore,
      momentumDelta: metrics.momentumDelta,
      oiDropPct: metrics.oiDropPct,
      currentPrice: metrics.currentPrice,
      openPrice15m: metrics.openPrice15m,
    });

    // Check Time Window Filter (Golden Window: Minute 03:30 - 08:30)
    if (!windowState.isGoldenWindow) {
      this.addLog(
        'WARN',
        `⚠️ Trade blocked by Time Window Filter. Current cycle time: ${windowState.minuteFormatted}. Entries permitted ONLY during Golden Window [03:30 - 08:30].`
      );
      return;
    }

    // Sync latest contract
    const contract = await this.limitlessClient.syncContract(metrics.currentPrice, metrics.openPrice15m);
    
    // Choose side based on signal and price filters
    let targetSide: 'YES' | 'NO' = metrics.signalDirection !== 'NONE' ? metrics.signalDirection : (metrics.currentPrice >= metrics.openPrice15m ? 'YES' : 'NO');
    let targetPrice = targetSide === 'YES' ? contract.yesPrice : contract.noPrice;

    // If preferred side is outside [$0.01, $0.25], check if opposing side qualifies for value hunting
    if (targetPrice < this.config.priceFloor || targetPrice > this.config.priceCap) {
      const altSide: 'YES' | 'NO' = targetSide === 'YES' ? 'NO' : 'YES';
      const altPrice = altSide === 'YES' ? contract.yesPrice : contract.noPrice;
      if (altPrice >= this.config.priceFloor && altPrice <= this.config.priceCap) {
        this.addLog('INFO', `Primary side ${targetSide} price ($${targetPrice}) exceeds cap. Switching to value-entry ${altSide} ($${altPrice}).`);
        targetSide = altSide;
        targetPrice = altPrice;
      } else {
        this.addLog(
          'WARN',
          `❌ Order skipped by Price Cap/Floor Filter: Neither YES ($${contract.yesPrice}) nor NO ($${contract.noPrice}) is within [$0.01, $0.25].`
        );
        return;
      }
    }

    // Execute order
    await this.executeOrderInternal(contract, targetSide, metrics.currentPrice);
  }

  private async executeOrderInternal(
    contract: LimitlessContract,
    side: 'YES' | 'NO',
    currentPrice: number,
    bypassPriceFilter: boolean = false
  ): Promise<Position | null> {
    this.addLog('EXECUTION', `Initiating FAK Order on Limitless Exchange: ${side} @ contract strike $${contract.targetStrikePrice}`);

    const result = await this.limitlessClient.executeOrder({
      contract,
      side,
      currentBtcPrice: currentPrice,
      isLiveMode: this.config.liveMode,
      bypassPriceFilter,
    });

    if (!result.success || !result.position) {
      this.addLog('WARN', `Order execution rejected: ${result.error}`);
      return null;
    }

    const pos = result.position;
    this.positions.unshift(pos);
    // Strict memory cap for 1GB VPS: keep last 30 positions
    if (this.positions.length > 30) {
      this.positions.pop();
    }

    this.addLog(
      'EXECUTION',
      `✅ FAK Order Filled: Bought ${pos.shares} shares of ${pos.side} @ $${pos.entryPrice.toFixed(2)} (Cost: $${pos.totalCost.toFixed(2)} [10% balance]). Hold to Expiration rule active until Minute 15:00. Tx: ${pos.txHash?.substring(0, 10)}...`
    );

    return pos;
  }

  /**
   * Check and settle positions that have reached Minute 15:00 expiration
   */
  private checkSettlements(): void {
    const currentPrice = this.binanceStream.getLatestPrice();
    const updatedPositions = this.limitlessClient.settlePositions(this.positions, currentPrice);

    for (let i = 0; i < updatedPositions.length; i++) {
      const oldPos = this.positions[i];
      const newPos = updatedPositions[i];
      if (oldPos && newPos && oldPos.status === 'HOLD_TO_EXPIRATION' && newPos.status !== 'HOLD_TO_EXPIRATION') {
        const isWon = newPos.status === 'EXPIRED_WON';
        this.addLog(
          'SETTLEMENT',
          `${isWon ? '🎉 POSITION SETTLED: WON!' : '📉 POSITION SETTLED: LOST.'} ${newPos.side} strike $${newPos.targetStrike} | Settlement BTC: $${currentPrice.toFixed(2)} | PnL: ${newPos.pnl && newPos.pnl >= 0 ? '+' : ''}$${newPos.pnl?.toFixed(2)}`
        );
      }
    }

    this.positions = updatedPositions;
  }

  /**
   * Manual signal trigger for testing & verification
   */
  public async manualTriggerTest(options?: {
    forceDirection?: 'YES' | 'NO';
    bypassWindow?: boolean;
    bypassPriceFilter?: boolean;
  }): Promise<{ success: boolean; message: string; position?: Position }> {
    const candles = this.binanceStream.getCandles();
    const currentPrice = this.binanceStream.getLatestPrice();
    const cycleOpenPrice = this.quantEngine.get15mCycleOpenPrice(candles);
    const windowState = this.quantEngine.getContractWindowState();

    this.addLog('TRIGGER', '🧪 MANUAL QUANT TEST TRIGGER DISPATCHED by Operator');

    if (!windowState.isGoldenWindow && !options?.bypassWindow) {
      const msg = `Manual trigger blocked: Golden Window inactive (${windowState.minuteFormatted}). Activate "Bypass Window" in test options to override.`;
      this.addLog('WARN', msg);
      return { success: false, message: msg };
    }

    const contract = await this.limitlessClient.syncContract(currentPrice, cycleOpenPrice);
    const side = options?.forceDirection || 'YES';

    // Check price filter unless bypassed
    const tokenPrice = side === 'YES' ? contract.yesPrice : contract.noPrice;
    if (!options?.bypassPriceFilter && (tokenPrice < this.config.priceFloor || tokenPrice > this.config.priceCap)) {
      const msg = `Manual trigger blocked: ${side} price ($${tokenPrice.toFixed(2)}) outside [$0.01, $0.25].`;
      this.addLog('WARN', msg);
      return { success: false, message: msg };
    }

    const pos = await this.executeOrderInternal(contract, side, currentPrice, options?.bypassPriceFilter);
    if (!pos) {
      return { success: false, message: 'Execution failed, check execution logs.' };
    }

    return {
      success: true,
      message: `Manual order executed: ${side} ${pos.shares} shares @ $${pos.entryPrice.toFixed(2)}`,
      position: pos,
    };
  }

  public updateConfig(newConfig: Partial<BotConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.quantEngine.setConfig({
      zScoreThreshold: this.config.zScoreThreshold,
      momentumThreshold: this.config.momentumThreshold,
      oiDropThreshold: this.config.oiDropThreshold,
    });
    this.limitlessClient.updateCredentials(
      this.config.limitlessTokenId,
      this.config.limitlessTokenSecret,
      this.config.limitlessWalletAddress
    );
    this.addLog('INFO', `Bot configuration updated. Active: ${this.config.active}, Live Mode: ${this.config.liveMode}`);
  }

  public setWalletBalance(balance: number): void {
    this.limitlessClient.setWalletBalance(balance);
    this.addLog('INFO', `Wallet balance manually updated to $${balance.toFixed(2)} USDC.`);
  }

  public addLog(
    level: ExecutionLog['level'],
    message: string,
    data?: Record<string, unknown>
  ): void {
    const log: ExecutionLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
      level,
      message,
      data,
    };
    this.logs.unshift(log);
    // Strict 1GB VPS memory constraint: cap logs at 60
    if (this.logs.length > 60) {
      this.logs.pop();
    }
  }

  public getFullState(): FullBotState {
    const now = Date.now();
    const candles = this.binanceStream.getCandles();
    const binanceHealth = this.binanceStream.getHealth();
    const limitlessStatus = this.limitlessClient.getStatus();
    const oiData = this.binanceStream.getOpenInterest();
    const metrics = this.quantEngine.evaluateSignal(candles, oiData, now);
    const windowState = this.quantEngine.getContractWindowState(now);
    const openPrice15m = this.quantEngine.get15mCycleOpenPrice(candles, now);
    const memUsage = process.memoryUsage();

    // Contract
    const contract: LimitlessContract = {
      id: `limitless-btc-15m-${Math.floor(now / (15 * 60 * 1000)) * (15 * 60 * 1000) + 900000}`,
      title: `BTC Above $${Math.round(openPrice15m).toLocaleString()} @ 15M Expiry`,
      targetStrikePrice: Math.round(openPrice15m),
      yesPrice: 0.18,
      noPrice: 0.82,
      expiryTimestamp: Math.floor(now / (15 * 60 * 1000)) * (15 * 60 * 1000) + 900000,
      cycleStartTimestamp: Math.floor(now / (15 * 60 * 1000)) * (15 * 60 * 1000),
      isPriceInRangeYes: true,
      isPriceInRangeNo: false,
      network: 'Base Mainnet',
    };

    const health: SystemHealth = {
      binanceWsConnected: binanceHealth.isConnected,
      binanceLastMessageAt: binanceHealth.lastMessageAt,
      limitlessApiConnected: limitlessStatus.isConnected,
      limitlessLatencyMs: limitlessStatus.latencyMs,
      rssMemoryMB: parseFloat((memUsage.rss / 1024 / 1024).toFixed(1)),
      heapUsedMB: parseFloat((memUsage.heapUsed / 1024 / 1024).toFixed(1)),
      candleCount: candles.length,
      uptimeSeconds: Math.floor((now - this.startTime) / 1000),
    };

    return {
      config: this.config,
      health,
      metrics,
      window: windowState,
      contract,
      walletBalance: this.limitlessClient.getWalletBalance(),
      positions: this.positions,
      logs: this.logs,
      candles: candles.slice(-50), // Return last 50 for frontend chart to save bandwidth
    };
  }

  public registerSseClient(res: Response): void {
    this.sseClients.push(res);
    res.on('close', () => {
      this.sseClients = this.sseClients.filter((c) => c !== res);
    });

    // Send immediate initial state
    try {
      const state = this.getFullState();
      res.write(`data: ${JSON.stringify(state)}\n\n`);
    } catch {
      // client may have closed
    }
  }

  private broadcastSse(): void {
    if (this.sseClients.length === 0) return;

    try {
      const state = this.getFullState();
      const payload = `data: ${JSON.stringify(state)}\n\n`;
      this.sseClients.forEach((client) => {
        try {
          client.write(payload);
        } catch {
          // ignore closed socket
        }
      });
    } catch {
      // ignore
    }
  }

  public stop(): void {
    if (this.contractSyncInterval) clearInterval(this.contractSyncInterval);
    if (this.settlementInterval) clearInterval(this.settlementInterval);
    if (this.sseBroadcastInterval) clearInterval(this.sseBroadcastInterval);
    this.binanceStream.stop();
  }
}
