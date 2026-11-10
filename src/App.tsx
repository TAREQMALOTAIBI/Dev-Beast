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
  ShieldCheck,
  RefreshCw,
  Wallet,
  ExternalLink,
  Power,
  AlertCircle,
} from 'lucide-react';

export default function App() {
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
    threeFiltersStatus,
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
          <div className="flex items-center gap-3 shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-base md:text-lg font-extrabold tracking-tight text-white whitespace-nowrap">
              {isAr ? 'منصة التداول الحي المباشر · Limitless (عقود 5 دقائق)' : 'Limitless Live 5m Trading Terminal'}
            </span>
          </div>

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
              {isAr ? 'إدارة رأس المال وحجم العقود (10%)' : 'Capital & Sizing (10%)'}
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

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={toggleBot}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer select-none whitespace-nowrap ${
                botActive
                  ? 'bg-emerald-950/70 hover:bg-emerald-900/80 text-emerald-300 border-emerald-500/60 shadow-sm shadow-emerald-950/60'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-700 hover:border-slate-600 shadow-sm'
              }`}
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

            <button
              onClick={() => setLang(isAr ? 'en' : 'ar')}
              className="flex items-center gap-1 px-2.5 py-1 text-xs text-slate-400 hover:text-slate-100 bg-slate-900 border border-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{isAr ? 'English' : 'عربي'}</span>
            </button>

            <button
              onClick={() => setIsConfigOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 border border-emerald-700/60 rounded-lg transition-colors whitespace-nowrap shrink-0 shadow-sm cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" />
              <span>{isAr ? 'إعدادات ومفاتيح التداول الحي' : 'Live Credentials & Config'}</span>
              {hasEnvCredentials && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-emerald-950 animate-pulse"></span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ================= 2. LIVE TELEMETRY STRIP ================= */}
      <section className="border-b border-slate-800/60 bg-slate-950/60 px-4 md:px-8 py-2.5 text-xs">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="font-bold text-slate-100 tracking-wider">
              {config.symbol}
            </span>
            <span className="text-slate-400 font-mono">5m Contract</span>
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
                </div>
              </>
            ) : (
              <>
                <span className="text-slate-700">·</span>
                <button
                  onClick={() => setIsConfigOpen(true)}
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] bg-amber-950/70 text-amber-300 border border-amber-600/50 hover:bg-amber-900/80 cursor-pointer transition-colors"
                >
                  <AlertCircle className="w-3 h-3 text-amber-400" />
                  <span>{isAr ? 'المحفظة غير مربوطة (وضع المعاينة)' : 'Wallet Not Linked (Preview Mode)'}</span>
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-4 text-[11px] text-slate-400 font-mono">
            <div>
              Binance Feed:{' '}
              <span className={binanceStatus === 'CONNECTED' ? 'text-emerald-400 font-bold' : 'text-amber-400'}>
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
              {isAr ? 'حجم الصفقة (10% من رأس المال):' : '10% Capital Size:'}{' '}
              <span className="text-emerald-400 font-bold">{formatUsd(kelly.positionSizeUsd)}</span>
            </div>
            <span className="text-slate-700">·</span>
            <div className="flex items-center gap-1">
              <span className="text-slate-400">{isAr ? 'نوع الأمر:' : 'Order:'}</span>
              <span className="text-emerald-300 font-bold bg-emerald-950/70 px-1.5 py-0.5 rounded border border-emerald-600/50">
                {isAr ? 'FAK (بدون سقف سعري)' : 'FAK (No Price Cap)'}
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

      {/* ================= 3. WORKSPACE VIEWPORT ================= */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-6 space-y-6">
        {activeTab === 'terminal' && (
          <div className="space-y-6">
            {/* Limitless 5-Minute Live Market Banner */}
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

            {/* Top Row: Candlestick Chart & Strategy Card */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              <div className="lg:col-span-2">
                <TerminalChart
                  candles={candles}
                  metrics={metrics}
                  symbol={config.symbol}
                  timeframe={config.timeframe}
                />
              </div>

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
                  threeFiltersStatus={threeFiltersStatus}
                  advancedFiltersStatus={advancedFiltersStatus}
                  executionNotice={executionNotice}
                  onClearNotice={() => setExecutionNotice(null)}
                  contractLockInfo={contractLockInfo}
                  onClearTradeLock={clearTradeLock}
                  recentChartSignal={recentChartSignal}
                />

                {/* Sizing & Position Allocation Card */}
                <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/90 text-xs flex flex-col gap-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="font-semibold text-slate-200">
                      {isAr ? 'حجم الصفقة المحسوب (10% من رأس المال لكل عقد 5 دقائق)' : 'Calculated Live Allocation (10% Capital per 5m Contract)'}
                    </span>
                    <button
                      onClick={() => setActiveTab('kelly')}
                      className="text-emerald-400 hover:text-emerald-300 transition-colors"
                    >
                      {isAr ? 'تفاصيل الحجم ←' : 'Sizing Details →'}
                    </button>
                  </div>
                  <div className="space-y-2 font-mono">
                    <div className="flex justify-between text-slate-400">
                      <span>{isAr ? 'نسبة الدخول المعتمدة:' : 'Applied Capital Ratio:'}</span>
                      <span className="text-emerald-400 font-bold">
                        {((config.maxRiskPercent || 0.10) * 100).toFixed(0)}% ({isAr ? 'من رأس المال' : 'of Capital'})
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>{isAr ? 'حجم الاستثمار بالدولار:' : 'Position Size (USD):'}</span>
                      <span className="text-slate-100 font-bold">
                        {formatUsd(kelly.positionSizeUsd)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>{isAr ? 'نوع الأمر وسقف الدخول:' : 'Order Type & Price Cap:'}</span>
                      <span className="text-sky-400 font-bold">
                        {isAr ? 'FAK · بدون سقف سعري (تنفيذ فوري)' : 'FAK · No Price Cap (Instant Fill)'}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>{isAr ? 'توقيت وقفل الدخول:' : 'Entry Timing & Lock:'}</span>
                      <span className="text-amber-400 font-bold">
                        {isAr ? 'آخر دقيقة (≤ 60ث) · صفقة واحدة لكل عقد 5m' : 'Last Minute (≤ 60s) · 1 Trade / 5m'}
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
          </div>
        )}

        {activeTab === 'code' && (
          <CodeInspector config={config} lang={lang} />
        )}
      </main>

      {/* ================= 4. FOOTER ================= */}
      <footer className="border-t border-slate-800/80 bg-slate-950/80 py-4 px-4 md:px-8 mt-auto text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span>{isAr ? 'نظام التداول المباشر لعقود 5 دقائق' : 'Live 5m BTC Sniper System'}</span>
            <span>·</span>
            <span>{isAr ? 'الدخول في آخر دقيقة (≤ 60 ثانية) في العقد المضمون تقريباً' : 'Last-Minute Entry (≤ 60s) on Winning Contract'}</span>
            <span>·</span>
            <span>{isAr ? 'أمر FAK بدون سقف سعري · 10% من رأس المال' : 'FAK No Price Cap · 10% Capital'}</span>
          </div>
          <div className="font-mono text-[11px] text-slate-500">
            Node.js / TypeScript WebSocket Architecture
          </div>
        </div>
      </footer>

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
