import React, { useState } from 'react';
import { useTradingBot } from './hooks/useTradingBot';
import { TerminalChart } from './components/TerminalChart';
import { StrategyStatusCard } from './components/StrategyStatusCard';
import { LimitlessMarketBanner } from './components/LimitlessMarketBanner';
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
  RefreshCw,
  Wallet,
  ExternalLink,
  Power,
  AlertCircle,
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
    latestMetric,
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
            {/* Primary Robot Start/Stop Button */}
            <button
              onClick={toggleBot}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer select-none whitespace-nowrap ${
                botActive
                  ? 'bg-emerald-950/70 hover:bg-emerald-900/80 text-emerald-300 border-emerald-500/60 shadow-sm shadow-emerald-950/60'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-700 hover:border-slate-600 shadow-sm'
              }`}
              title={
                isAr
                  ? (botActive ? 'الروبوت نشط - اضغط لإيقافه مؤقتاً' : 'الروبوت متوقف - اضغط للتشغيل الآن')
                  : (botActive ? 'Bot is Active - Click to Pause' : 'Bot is Paused - Click to Start')
              }
            >
              <span className="relative flex h-2 w-2">
                {botActive && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                )}
                <span className={`relative inline-flex rounded-full h-2 w-2 ${botActive ? 'bg-emerald-400' : 'bg-slate-500'}`}></span>
              </span>
              <Power className={`w-3.5 h-3.5 ${botActive ? 'text-emerald-400' : 'text-slate-400'}`} />
              <span>
                {isAr
                  ? (botActive ? 'الروبوت: يعمل' : 'تشغيل الروبوت')
                  : (botActive ? 'Bot: Active' : 'Start Bot')}
              </span>
            </button>

            {/* Language Switcher */}
            <button
              onClick={() => setLang(isAr ? 'en' : 'ar')}
              className="flex items-center gap-1 px-2.5 py-1 text-xs text-slate-400 hover:text-slate-100 bg-slate-900 border border-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="Toggle Language / تبديل اللغة"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{isAr ? 'English' : 'عربي'}</span>
            </button>

            {/* Config Trigger */}
            <button
              onClick={() => setIsConfigOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 border border-emerald-700/60 rounded-lg transition-colors whitespace-nowrap shrink-0 shadow-sm cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" />
              <span>{isAr ? 'إعدادات ومفاتيح التداول الحي' : 'Live Credentials & Config'}</span>
              {hasEnvCredentials && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-emerald-950 animate-pulse" title={isAr ? 'المفاتيح نشطة من .env' : 'Active from .env'}></span>
              )}
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
            <div className="flex items-center gap-2">
              <span className="text-slate-400">
                {isAr ? 'الرصيد الحي المباشر:' : 'Live Balance:'}
              </span>
              <span className="text-emerald-300 font-mono font-bold text-sm bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/50 shadow-sm flex items-center gap-1">
                <span>{formatUsd(currentBalance)}</span>
                <span className="text-[10px] text-emerald-400 font-sans font-normal">USDC</span>
              </span>

              {isLiveBalance && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-600/60 shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>{isAr ? 'شبكة Base الحية' : 'Live Base (8453)'}</span>
                </span>
              )}

              <button
                onClick={() => refreshLiveBalance()}
                disabled={isFetchingBalance}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-slate-200 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 transition-colors cursor-pointer select-none shadow-xs disabled:opacity-70"
                title={isAr ? 'اضغط هنا لتحديث الرصيد الحي يدوياً من البلوكشين' : 'Click to refresh balance manually from blockchain'}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isFetchingBalance ? 'animate-spin text-emerald-400' : 'text-slate-300'}`} />
                <span className="text-[11px] font-semibold">{isAr ? 'تحديث الرصيد' : 'Refresh'}</span>
              </button>
            </div>
            {liveWallet?.address ? (
              <>
                <span className="text-slate-700">·</span>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-300 font-mono">
                  <Wallet className="w-3.5 h-3.5 text-sky-400" />
                  <a
                    href={`https://basescan.org/address/${liveWallet.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-400 hover:underline hover:text-sky-300 flex items-center gap-0.5"
                    title={liveWallet.address}
                  >
                    <span>
                      {liveWallet.username
                        ? `${liveWallet.username} (${liveWallet.address.slice(0, 6)}...${liveWallet.address.slice(-4)})`
                        : `${liveWallet.address.slice(0, 6)}...${liveWallet.address.slice(-4)}`}
                    </span>
                    <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                  </a>
                  {liveWallet.ethBalance > 0 && (
                    <span className="text-slate-500 text-[10px]">
                      ({liveWallet.ethBalance.toFixed(4)} ETH gas)
                    </span>
                  )}
                </div>
              </>
            ) : (
              <>
                <span className="text-slate-700">·</span>
                <button
                  onClick={() => setIsConfigOpen(true)}
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] bg-amber-950/70 text-amber-300 border border-amber-600/50 hover:bg-amber-900/80 cursor-pointer transition-colors"
                  title={isAr ? 'اضغط لربط المحفظة الحية' : 'Click to configure live wallet'}
                >
                  <AlertCircle className="w-3 h-3 text-amber-400" />
                  <span>{isAr ? 'المحفظة غير مربوطة (وضع المعاينة)' : 'Wallet Not Linked (Preview Mode)'}</span>
                </button>
              </>
            )}
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
              Kelly 10% Cap: <span className="text-emerald-400 font-bold">{formatUsd(kelly.positionSizeUsd)}</span>
            </div>
            <span className="text-slate-700">·</span>
            <div className="flex items-center gap-1">
              <span className="text-slate-400">{isAr ? 'نوع الأمر:' : 'Order:'}</span>
              <span className="text-emerald-300 font-bold bg-emerald-950/70 px-1.5 py-0.5 rounded border border-emerald-600/50">
                {config.orderType} ≤ ${config.maxPriceCents.toFixed(2)}
              </span>
            </div>
            {hasEnvCredentials && (
              <>
                <span className="text-slate-700">·</span>
                <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>{isAr ? 'مفاتيح HMAC: نشطة' : 'HMAC: Active'}</span>
                </div>
              </>
            )}
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
            {/* Limitless 15-Minute Live Market Showcase Banner */}
            <LimitlessMarketBanner
              market={activeLimitlessMarket}
              limitlessStatus={limitlessStatus}
              currentBinancePrice={latestCandle?.close}
              orderbook={orderbook}
              oracle={oracle}
              isRefreshing={isRefreshingMarket}
              onRefresh={refreshActiveMarket}
              lang={lang}
            />

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
                  lowerThreshold={config.zScoreLower ?? -config.zScoreUpper}
                  lowerEntryThreshold={config.zScoreLowerEntry ?? -config.zScoreEntry}
                />
              </div>

              {/* Right Col: Live Strategy State Machine */}
              <div className="space-y-6">
                <StrategyStatusCard
                  currentZScore={currentZScore}
                  crossedUpperThreshold={crossedUpperThreshold}
                  crossedLowerThreshold={crossedLowerThreshold}
                  lastTradeDirection={lastTradeDirection}
                  activeSignal={activeSignal}
                  isEntrySignal={isEntrySignal}
                  botActive={botActive}
                  onToggleBot={toggleBot}
                  onTriggerManualTrade={triggerManualTrade}
                  isExecuting={isExecuting}
                  soundEnabled={soundEnabled}
                  onToggleSound={toggleSound}
                  config={config}
                  lang={lang}
                  metric={latestMetric}
                  emaFilter={emaFilter}
                  executionNotice={executionNotice}
                  onClearNotice={() => setExecutionNotice(null)}
                  contractLockInfo={contractLockInfo}
                  onClearTradeLock={clearTradeLock}
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
                        {(kelly.riskToTake * 100).toFixed(2)}% (Max 10%)
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
                        {kelly.numberOfContracts} @ ${config.maxPriceCents.toFixed(2)} ({config.orderType})
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>{isAr ? 'نمط التنفيذ المعتمد:' : 'Execution Mode:'}</span>
                      <span className="text-emerald-400 font-bold">
                        {isAr ? 'أمر موحد مباشر (بدون تجزئة)' : 'Direct Order (No Chunks)'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-400 pt-1.5 border-t border-slate-800/80 text-[11px]">
                      <span>{isAr ? 'مصدر الرصيد المعتمد:' : 'Balance Source:'}</span>
                      <span className="font-sans font-medium flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                        <span className="text-emerald-400 font-semibold">{isAr ? 'محفظة Base الحية (USDC)' : 'Live Base USDC Wallet'}</span>
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
                chunksCount={config.fractionChunks}
                onTriggerManualTrade={triggerManualTrade}
                botActive={botActive}
                onToggleBot={toggleBot}
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
              isLiveBalance={isLiveBalance}
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
                Formula: Kelly% = (b·p - q) / b | Enforced Cap: Math.min(Kelly%, 0.10)
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
            <span>Binance 1h Z-Score Mean Reversion</span>
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
        hasEnvCredentials={hasEnvCredentials}
        liveWallet={liveWallet}
      />
    </div>
  );
}
