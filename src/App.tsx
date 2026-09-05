import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { WindowWidget } from './components/WindowWidget';
import { MetricsCards } from './components/MetricsCards';
import { ContractMonitor } from './components/ContractMonitor';
import { PositionsTable } from './components/PositionsTable';
import { ExecutionConsole } from './components/ExecutionConsole';
import { MiniCandleChart } from './components/MiniCandleChart';
import { ConfigModal } from './components/ConfigModal';
import { FullBotState, BotConfig } from './types';

// Default initial state before first SSE tick
const INITIAL_STATE: FullBotState = {
  config: {
    active: true,
    liveMode: false,
    zScoreThreshold: 1.5,
    momentumThreshold: 25.0,
    oiDropThreshold: 0.5,
    riskPercentage: 0.1,
    priceFloor: 0.01,
    priceCap: 0.25,
    goldenWindowStartSec: 210,
    goldenWindowEndSec: 510,
    limitlessTokenId: '',
    limitlessTokenSecret: '',
    limitlessWalletAddress: '',
  },
  health: {
    binanceWsConnected: true,
    binanceLastMessageAt: Date.now(),
    limitlessApiConnected: true,
    limitlessLatencyMs: 14,
    rssMemoryMB: 42.5,
    heapUsedMB: 28.1,
    candleCount: 100,
    uptimeSeconds: 12,
  },
  metrics: {
    currentPrice: 89520.5,
    openPrice15m: 89500.0,
    zScore: 1.15,
    zScoreThreshold: 1.5,
    isZScoreTriggered: false,
    momentumDelta: 20.5,
    momentumThreshold: 25.0,
    isMomentumTriggered: false,
    openInterest: 82450.0,
    prevOpenInterest: 82510.0,
    oiDropPct: 0.07,
    oiDropThreshold: 0.5,
    isOiDropTriggered: false,
    isAllTriggered: false,
    signalDirection: 'NONE',
    lastEvaluatedAt: Date.now(),
  },
  window: {
    cycleMinutes: 15,
    elapsedSeconds: 320,
    minuteFormatted: 'Min 05:20 / 15:00',
    isGoldenWindow: true,
    goldenWindowLabel: 'GOLDEN WINDOW ACTIVE [03:30-08:30]',
    secondsToWindowStart: 0,
    secondsToWindowEnd: 190,
  },
  contract: {
    id: 'limitless-btc-15m-active',
    title: 'BTC Above $89,500 @ 15M Expiry',
    targetStrikePrice: 89500,
    yesPrice: 0.18,
    noPrice: 0.82,
    bestYesBid: 0.17,
    bestYesAsk: 0.19,
    bestNoBid: 0.81,
    bestNoAsk: 0.83,
    expiryTimestamp: Date.now() + 580000,
    cycleStartTimestamp: Date.now() - 320000,
    isPriceInRangeYes: true,
    isPriceInRangeNo: false,
    network: 'Base Mainnet',
  },
  walletBalance: 0.0,
  isWalletConnected: false,
  walletAddress: '',
  ethGasBalance: 0,
  positions: [],
  logs: [
    {
      id: 'init-1',
      timestamp: Date.now(),
      level: 'INFO',
      message: 'Institutional Quant Engine initialized for 15M BTC Prediction Contracts on Limitless Exchange (Base Mainnet).',
    },
    {
      id: 'init-2',
      timestamp: Date.now() - 2000,
      level: 'INFO',
      message: 'Rolling 100 1m candles buffer loaded. 1GB VPS memory constraints strictly enforced.',
    },
  ],
  candles: [],
};

export default function App() {
  const [state, setState] = useState<FullBotState>(INITIAL_STATE);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Fetch full state once via REST, then maintain via SSE
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = (await res.json()) as FullBotState;
        setState(data);
        setConnectionError(null);
      }
    } catch (e) {
      // server starting up
    }
  }, []);

  useEffect(() => {
    fetchStatus();

    // Setup Server-Sent Events (SSE) stream for instant real-time pushes
    let eventSource: EventSource | null = null;
    let pollInterval: NodeJS.Timeout | null = null;

    try {
      eventSource = new EventSource('/api/stream');

      eventSource.onmessage = (event) => {
        try {
          const freshState = JSON.parse(event.data) as FullBotState;
          setState(freshState);
          setConnectionError(null);
        } catch (err) {
          console.error('Failed to parse SSE state:', err);
        }
      };

      eventSource.onerror = () => {
        // SSE disconnected, fallback to 2s polling
        if (!pollInterval) {
          pollInterval = setInterval(fetchStatus, 2000);
        }
      };
    } catch {
      pollInterval = setInterval(fetchStatus, 2000);
    }

    return () => {
      if (eventSource) eventSource.close();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [fetchStatus]);

  // Actions
  const handleToggleActive = async (active: boolean) => {
    try {
      const res = await fetch('/api/bot/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      });
      if (res.ok) {
        setState((prev) => ({
          ...prev,
          config: { ...prev.config, active },
        }));
      }
    } catch (e) {
      console.error('Failed to toggle bot active:', e);
    }
  };

  const handleToggleLiveMode = async (liveMode: boolean) => {
    // If user attempts to enable Live Mode without a valid wallet address, open config
    if (liveMode && (!state.config.limitlessWalletAddress || !/^0x[a-fA-F0-9]{40}$/.test(state.config.limitlessWalletAddress))) {
      setIsConfigOpen(true);
      return;
    }

    try {
      const res = await fetch('/api/bot/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ liveMode }),
      });
      if (res.ok) {
        setState((prev) => ({
          ...prev,
          config: { ...prev.config, liveMode },
        }));
      }
    } catch (e) {
      console.error('Failed to toggle live mode:', e);
    }
  };

  const handleRefreshWalletBalance = async () => {
    try {
      const res = await fetch('/api/bot/wallet-refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        setState((prev) => ({
          ...prev,
          walletBalance: typeof data.usdc === 'number' ? data.usdc : prev.walletBalance,
          isWalletConnected: data.connected !== undefined ? data.connected : prev.isWalletConnected,
          ethGasBalance: typeof data.eth === 'number' ? data.eth : prev.ethGasBalance,
          walletAddress: data.walletAddress || prev.walletAddress,
        }));
      }
    } catch (e) {
      console.error('Failed to refresh on-chain balance:', e);
    }
  };

  const handleSaveConfig = async (updated: Partial<BotConfig>) => {
    try {
      const res = await fetch('/api/bot/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.state) {
          setState(data.state);
        } else {
          setState((prev) => ({
            ...prev,
            config: { ...prev.config, ...updated },
          }));
        }
      }
    } catch (e) {
      console.error('Failed to save configuration:', e);
    }
  };

  const handleUpdateWalletBalance = async (balance: number) => {
    try {
      const res = await fetch('/api/bot/wallet-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ balance }),
      });
      if (res.ok) {
        setState((prev) => ({
          ...prev,
          walletBalance: balance,
        }));
      }
    } catch (e) {
      console.error('Failed to update wallet balance:', e);
    }
  };

  const handleManualTrigger = async (
    side: 'YES' | 'NO',
    bypassWindow: boolean,
    bypassPriceFilter: boolean
  ) => {
    try {
      const res = await fetch('/api/bot/manual-trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          forceDirection: side,
          bypassWindow,
          bypassPriceFilter,
        }),
      });
      if (res.ok) {
        await fetchStatus();
      }
    } catch (e) {
      console.error('Manual trigger failed:', e);
    }
  };

  return (
    <div className="min-h-screen bg-[#000000] text-zinc-100 flex flex-col font-mono selection:bg-[#00ff9d]/30 selection:text-[#00ff9d]">
      {/* Header */}
      <Header
        config={state.config}
        health={state.health}
        walletBalance={state.walletBalance}
        isWalletConnected={state.isWalletConnected}
        walletAddress={state.walletAddress || state.config.limitlessWalletAddress}
        ethGasBalance={state.ethGasBalance}
        onRefreshWallet={handleRefreshWalletBalance}
        onToggleActive={handleToggleActive}
        onToggleLiveMode={handleToggleLiveMode}
        onOpenConfig={() => setIsConfigOpen(true)}
      />

      {/* Main Content Dashboard */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* 15M Contract Cycle Window Widget */}
        <WindowWidget window={state.window} />

        {/* Live Metrics & Quant Signal Engine Cards */}
        <MetricsCards metrics={state.metrics} />

        {/* 1M Candle Visualizer */}
        <MiniCandleChart
          candles={state.candles}
          openPrice15m={state.metrics.openPrice15m}
          currentPrice={state.metrics.currentPrice}
          zScore={state.metrics.zScore}
          isZScoreTriggered={state.metrics.isZScoreTriggered}
        />

        {/* Limitless Exchange Contract Monitor & Execution Module */}
        <ContractMonitor
          contract={state.contract}
          config={state.config}
          walletBalance={state.walletBalance}
          currentBtcPrice={state.metrics.currentPrice}
          onManualTrigger={handleManualTrigger}
        />

        {/* Positions Table & Settlement Ledger */}
        <PositionsTable
          positions={state.positions}
          currentBtcPrice={state.metrics.currentPrice}
        />

        {/* Execution Logs & Stats Console */}
        <ExecutionConsole logs={state.logs} />
      </main>

      {/* Footer */}
      <footer className="border-t border-[#222] bg-[#0a0a0a] px-4 sm:px-6 py-4 text-xs font-mono text-zinc-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-[#00ff9d]"></span>
            <span>محرك Limitless 15M BTC الكمي • شبكة Base Mainnet • توقيع Privy HMAC-SHA256</span>
          </div>
          <div className="text-zinc-600">
            تقييد صارم للذاكرة الدائرية: 100 شمعة دقيقة • بنية تحتية مخصصة لخوادم VPS بذاكرة 1GB RAM
          </div>
        </div>
      </footer>

      {/* Configuration Modal */}
      {isConfigOpen && (
        <ConfigModal
          config={state.config}
          walletBalance={state.walletBalance}
          isWalletConnected={state.isWalletConnected}
          ethGasBalance={state.ethGasBalance}
          onClose={() => setIsConfigOpen(false)}
          onSaveConfig={handleSaveConfig}
          onRefreshBalance={handleRefreshWalletBalance}
        />
      )}
    </div>
  );
}
