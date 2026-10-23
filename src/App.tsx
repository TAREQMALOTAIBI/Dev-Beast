import React, { useState } from 'react';
import { useTradingBot } from './hooks/useTradingBot';
import { TerminalChart } from './components/TerminalChart';
import { StrategyStatusCard } from './components/StrategyStatusCard';
import { KellyLab } from './components/KellyLab';
import { ExecutionConsole } from './components/ExecutionConsole';
import { CodeInspector } from './components/CodeInspector';
import { ConfigModal } from './components/ConfigModal';
import { formatUsd, formatPrice } from './utils/math';
import {
  SlidersHorizontal,
  Globe,
  Radio,
  Zap,
  Activity,
  Layers,
  FileCode,
  ShieldCheck,
} from 'lucide-react';

export default function App() {
  // Default to Arabic as requested by user
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const [activeTab, setActiveTab] = useState<'terminal' | 'kelly' | 'code'>('terminal');
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  const {
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
    kelly,
    soundEnabled,
    toggleSound,
    orderbook,
    oracle,
    positions,
  } = useTradingBot();

  const isAr = lang === 'ar';
  const latestCandle = candles[candles.length - 1];

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className="min-h-screen bg-[#080c14] text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-200"
    >
      {/* ================= 1. TOP BAR ================= */}
      <header className="border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md sticky top-0 z-40 px-4 md:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-8">
          {/* Zone 1: Single Wordmark */}
          <div className="flex items-center gap-3 shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-base md:text-lg font-extrabold tracking-tight text-white whitespace-nowrap">
              {isAr ? 'منصة التداول الحي المباشر · Limitless' : 'Limitless Live Trading Terminal'}
            </span>
          </div>

          {/* Zone 2: Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-400">
            <button
              onClick={() => setActiveTab('terminal')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 pb-0.5 border-b-2 ${
                activeTab === 'terminal'
                  ? 'border-emerald-400 text-white font-semibold'
                  : 'border-transparent'
              }`}
            >
              {isAr ? 'منصة التداول الحي المباشر' : 'Live Trading Terminal'}
            </button>
            <button
              onClick={() => setActiveTab('kelly')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 pb-0.5 border-b-2 ${
                activeTab === 'kelly'
                  ? 'border-emerald-400 text-white font-semibold'
                  : 'border-transparent'
              }`}
            >
              {isAr ? 'إدارة المخاطر وحجم العقود (كيلي)' : 'Kelly Risk Management'}
            </button>
            <button
              onClick={() => setActiveTab('code')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 pb-0.5 border-b-2 ${
                activeTab === 'code'
                  ? 'border-emerald-400 text-white font-semibold'
                  : 'border-transparent'
              }`}
            >
              {isAr ? 'كود الروبوت والتشغيل (Node.js)' : 'Production Code (Node.js)'}
            </button>
          </nav>

          {/* Zone 3: Primary Actions */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Language Switcher */}
            <button
              onClick={() => setLang(isAr ? 'en' : 'ar')}
              className="flex items-center gap-1 px-2.5 py-1 text-xs text-slate-400 hover:text-slate-100 bg-slate-900 border border-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
              title="Toggle Language / تبديل اللغة"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{isAr ? 'English' : 'عربي'}</span>
            </button>

            {/* Config Trigger */}
            <button
              onClick={() => setIsConfigOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 border border-emerald-700/60 rounded-lg transition-colors whitespace-nowrap shrink-0 shadow-sm"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" />
              <span>{isAr ? 'إعدادات ومفاتيح التداول الحي' : 'Live Credentials & Config'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* ================= 2. LIVE TELEMETRY STRIP (Clean Unboxed Metadata) ================= */}
      <section className="border-b border-slate-800/60 bg-slate-950/60 px-4 md:px-8 py-2.5 text-xs">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          {/* Pair & Price */}
          <div className="flex items-center gap-3">
            <span className="font-bold text-slate-100 tracking-wider">
              {config.symbol}
            </span>
            <span className="text-slate-400 font-mono">{config.timeframe}</span>
            <span className="text-slate-700">·</span>
            <span className="text-emerald-400 font-mono text-sm font-bold">
              ${latestCandle ? formatPrice(latestCandle.close) : 'Loading...'}
            </span>
            <span className="text-slate-700">·</span>
            <span className="text-slate-400">
              {isAr ? 'الرصيد الفعلي:' : 'Live Balance:'}{' '}
              <span className="text-slate-100 font-mono font-bold">
                {formatUsd(currentBalance)}
              </span>
            </span>
          </div>

          {/* Real Sockets Health */}
          <div className="flex items-center gap-4 text-[11px] text-slate-400 font-mono">
            <div>
              Binance Feed:{' '}
              <span
                className={
                  binanceStatus === 'CONNECTED'
                    ? 'text-emerald-400 font-bold'
                    : 'text-amber-400'
                }
              >
                {binanceStatus}
              </span>
            </div>
            <span className="text-slate-700">·</span>
            <div>
              Limitless WS:{' '}
              <span
                className={
                  limitlessStatus === 'AUTHENTICATED' || limitlessStatus === 'CONNECTED'
                    ? 'text-emerald-400 font-bold'
                    : 'text-amber-400'
                }
              >
                {limitlessStatus}
              </span>
            </div>
            <span className="text-slate-700">·</span>
            <div className="text-slate-300">
              Kelly 5% Cap: <span className="text-emerald-400 font-bold">{formatUsd(kelly.positionSizeUsd)}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Mobile Nav Switcher */}
      <div className="md:hidden flex border-b border-slate-800 bg-slate-950 px-4 overflow-x-auto text-xs py-2 gap-2">
        <button
          onClick={() => setActiveTab('terminal')}
          className={`px-3 py-1 rounded-md whitespace-nowrap ${
            activeTab === 'terminal' ? 'bg-emerald-600 text-white font-semibold' : 'text-slate-400'
          }`}
        >
          {isAr ? 'التداول الحي' : 'Live Terminal'}
        </button>
        <button
          onClick={() => setActiveTab('kelly')}
          className={`px-3 py-1 rounded-md whitespace-nowrap ${
            activeTab === 'kelly' ? 'bg-emerald-600 text-white font-semibold' : 'text-slate-400'
          }`}
        >
          {isAr ? 'معيار كيلي' : 'Kelly Risk'}
        </button>
        <button
          onClick={() => setActiveTab('code')}
          className={`px-3 py-1 rounded-md whitespace-nowrap ${
            activeTab === 'code' ? 'bg-emerald-600 text-white font-semibold' : 'text-slate-400'
          }`}
        >
          {isAr ? 'تشغيل الكود' : 'Runner'}
        </button>
      </div>

      {/* ================= 3. WORKSPACE VIEWPORT ================= */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-6 space-y-6">
        {/* VIEW 1: LIVE TERMINAL */}
        {activeTab === 'terminal' && (
          <div className="space-y-6">
            {/* Top Row: Dual Visualizer Chart & State Machine */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              {/* Left 2 Cols: Main Candlestick & Z-Score Chart */}
              <div className="lg:col-span-2">
                <TerminalChart
                  candles={candles}
                  metrics={metrics}
                  symbol={config.symbol}
                  timeframe={config.timeframe}
                  periods={config.periods}
                  upperThreshold={config.zScoreUpper}
                  entryThreshold={config.zScoreEntry}
                />
              </div>

              {/* Right Col: Live Strategy State Machine */}
              <div className="space-y-6">
                <StrategyStatusCard
                  currentZScore={currentZScore}
                  crossedUpperThreshold={crossedUpperThreshold}
                  isEntrySignal={isEntrySignal}
                  botActive={botActive}
                  onToggleBot={toggleBot}
                  soundEnabled={soundEnabled}
                  onToggleSound={toggleSound}
                  config={config}
                  lang={lang}
                />

                {/* Sizing & Position Allocation Card */}
                <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/90 text-xs flex flex-col gap-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="font-semibold text-slate-200">
                      {isAr ? 'حجم الصفقة المحسوب للصفقة القادمة' : 'Calculated Live Allocation'}
                    </span>
                    <button
                      onClick={() => setActiveTab('kelly')}
                      className="text-emerald-400 hover:text-emerald-300 transition-colors"
                    >
                      {isAr ? 'تفاصيل كيلي ←' : 'Kelly Sizing →'}
                    </button>
                  </div>
                  <div className="space-y-2 font-mono">
                    <div className="flex justify-between text-slate-400">
                      <span>{isAr ? 'نسبة المخاطرة:' : 'Risk Percentage:'}</span>
                      <span className="text-emerald-400 font-bold">
                        {(kelly.riskToTake * 100).toFixed(2)}% (Max 5%)
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>{isAr ? 'حجم الاستثمار بالدولار:' : 'Position Size (USD):'}</span>
                      <span className="text-slate-100 font-bold">
                        {formatUsd(kelly.positionSizeUsd)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>{isAr ? 'عقود التوقع المستهدفة:' : 'Prediction Contracts:'}</span>
                      <span className="text-sky-400 font-bold">
                        {kelly.numberOfContracts} @ ${config.maxPriceCents.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>{isAr ? 'تجزئة الأوامر (4 أجزاء):' : 'Chunk Split:'}</span>
                      <span className="text-purple-400">
                        3 × {kelly.chunkSize} + 1 × {kelly.lastChunkSize} contracts
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom: Live Execution Console */}
            <div>
              <ExecutionConsole
                currentChunks={currentChunks}
                activeTrade={activeTrade}
                tradeHistory={tradeHistory}
                wsLogs={wsLogs}
                orderbook={orderbook}
                oracle={oracle}
                positions={positions}
                isExecuting={isExecuting}
                limitlessStatus={limitlessStatus}
                marketSlug={config.limitlessMarketSlug}
                onOpenConfig={() => setIsConfigOpen(true)}
                lang={lang}
              />
            </div>
          </div>
        )}

        {/* VIEW 2: KELLY LAB */}
        {activeTab === 'kelly' && (
          <div className="space-y-6">
            <KellyLab
              balance={currentBalance}
              config={config}
              kelly={kelly}
              onUpdateConfig={updateConfig}
              lang={lang}
            />

            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 text-xs text-slate-300 space-y-3">
              <h3 className="font-bold text-slate-100 text-sm">
                {isAr
                  ? 'منهجية إدارة المخاطر في التداول الحي (Kelly Criterion)'
                  : 'Live Risk Management Methodology (Kelly Criterion)'}
              </h3>
              <p className="leading-relaxed">
                {isAr
                  ? 'في التداول الحي لأسواق التوقع (Prediction Markets)، تشتري عقوداً بسعر أقصاه 0.20$ للعقد الواحد. عند اكتمال الارتداد الإحصائي للوسط الحسابي، يصرف العقد بقيمة 1.00$ كاملة، مما يحقق ربحاً صافياً قدره 0.80$ لكل عقد، وتكون نسبة العائد إلى المخاطرة b = 4.0.'
                  : 'In live prediction market execution, contracts are placed at a maximum price of $0.20 per contract. Upon successful mean reversion, contracts settle at $1.00, yielding a net return of $0.80 per contract with odds ratio b = 4.0.'}
              </p>
              <div className="p-3 bg-slate-950 font-mono text-emerald-400 rounded-lg border border-slate-800">
                Formula: Kelly% = (b·p - q) / b | Enforced Cap: Math.min(Kelly%, 0.05)
              </div>
            </div>
          </div>
        )}

        {/* VIEW 3: CODE RUNNER */}
        {activeTab === 'code' && (
          <CodeInspector config={config} lang={lang} />
        )}
      </main>

      {/* ================= 4. FOOTER ================= */}
      <footer className="border-t border-slate-800/80 bg-slate-950/80 py-4 px-4 md:px-8 mt-auto text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span>{isAr ? 'نظام التداول الحي المباشر' : 'Live Trading System'}</span>
            <span>·</span>
            <span>Binance 15m Z-Score Mean Reversion</span>
            <span>·</span>
            <span>Limitless Exchange Execution</span>
          </div>
          <div className="font-mono text-[11px] text-slate-500">
            Node.js / TypeScript WebSocket Architecture
          </div>
        </div>
      </footer>

      {/* Configuration Drawer */}
      <ConfigModal
        config={config}
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        onSave={(newCfg) => updateConfig(newCfg)}
        lang={lang}
      />
    </div>
  );
}
