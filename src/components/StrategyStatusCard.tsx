import React from 'react';
import { BotConfig } from '../types/bot';
import {
  ShieldAlert,
  Zap,
  Radio,
  Volume2,
  VolumeX,
  Power,
  PauseCircle,
  TrendingUp,
  TrendingDown,
  ArrowDownCircle,
  ArrowUpCircle,
} from 'lucide-react';

interface StrategyStatusCardProps {
  currentZScore: number;
  crossedUpperThreshold: boolean;
  crossedLowerThreshold?: boolean;
  lastTradeDirection?: 'SHORT' | 'LONG' | null;
  activeSignal?: 'ENTRY_SHORT' | 'ENTRY_LONG' | null;
  isEntrySignal: boolean;
  botActive: boolean;
  onToggleBot: () => void;
  onTriggerManualTrade?: (direction: 'SHORT' | 'LONG') => void;
  isExecuting?: boolean;
  soundEnabled: boolean;
  onToggleSound: () => void;
  config: BotConfig;
  lang: 'en' | 'ar';
  metric?: import('../types/bot').ZScoreMetric | null;
  threeFiltersStatus?: import('../utils/math').ThreeFiltersStatus | null;
  executionNotice?: {
    type: 'SUCCESS' | 'WARNING' | 'ERROR';
    message: string;
    timestamp: number;
    action?: 'START_BOT' | 'TRIGGER_TRADE';
  } | null;
  onClearNotice?: () => void;
  contractLockInfo?: {
    isLocked: boolean;
    reason?: string;
    cooldownRemainingMinutes?: number;
    lastTradedSlug?: string;
  };
  onClearTradeLock?: () => void;
  recentChartSignal?: {
    direction: 'SHORT' | 'LONG';
    candleTime: number;
    zScore: number;
    ageMinutes: number;
  } | null;
}

export const StrategyStatusCard: React.FC<StrategyStatusCardProps> = ({
  currentZScore,
  crossedUpperThreshold,
  crossedLowerThreshold = false,
  lastTradeDirection,
  activeSignal,
  isEntrySignal,
  botActive,
  onToggleBot,
  onTriggerManualTrade,
  isExecuting = false,
  soundEnabled,
  onToggleSound,
  config,
  lang,
  metric,
  threeFiltersStatus,
  executionNotice,
  onClearNotice,
  contractLockInfo,
  onClearTradeLock,
  recentChartSignal,
}) => {
  const isAr = lang === 'ar';

  const safeUpperThresh = Number.isFinite(Number(config?.zScoreUpper)) ? Number(config.zScoreUpper) : 2.2;
  const lowerThresh =
    config?.zScoreLower !== undefined && Number.isFinite(Number(config.zScoreLower))
      ? Number(config.zScoreLower)
      : -safeUpperThresh;
  const safeCurrentZ = Number.isFinite(Number(currentZScore)) ? Number(currentZScore) : 0;

  // Upper direction phase (Short / Down): Direct Single Confirmation >= +2.20σ + 3 Filters
  let upperPhase: 'MONITORING' | 'ARMED' | 'ENTRY_TRIGGERED' = 'MONITORING';
  if (isEntrySignal && (activeSignal === 'ENTRY_SHORT' || lastTradeDirection === 'SHORT')) {
    upperPhase = 'ENTRY_TRIGGERED';
  } else if (crossedUpperThreshold || safeCurrentZ >= safeUpperThresh) {
    upperPhase = 'ARMED';
  }

  // Lower direction phase (Long / Up): Direct Single Confirmation <= -2.20σ + 3 Filters
  let lowerPhase: 'MONITORING' | 'ARMED' | 'ENTRY_TRIGGERED' = 'MONITORING';
  if (isEntrySignal && (activeSignal === 'ENTRY_LONG' || lastTradeDirection === 'LONG')) {
    lowerPhase = 'ENTRY_TRIGGERED';
  } else if (crossedLowerThreshold || safeCurrentZ <= lowerThresh) {
    lowerPhase = 'ARMED';
  }

  // Z-Score percentage within -3.5 to +3.5 range
  const normalizedZPct = Math.min(100, Math.max(0, ((safeCurrentZ + 3.5) / 7) * 100));

  const lowerArmPct = Math.min(100, Math.max(0, ((lowerThresh + 3.5) / 7) * 100));
  const upperArmPct = Math.min(100, Math.max(0, ((safeUpperThresh + 3.5) / 7) * 100));

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/90 backdrop-blur-sm p-4 flex flex-col gap-3.5 shadow-lg">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <Radio className={`w-4 h-4 ${botActive ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`} />
          <h3 className="font-bold text-slate-100 text-xs tracking-wider uppercase flex items-center gap-1.5">
            <span>
              {isAr
                ? `استراتيجية الدخول المباشر (1m Live · 30-SMA · ±${safeUpperThresh.toFixed(2)}σ + الفلاتر الـ 3)`
                : `Direct Z-Score Strategy (1m · 30-SMA · ±${safeUpperThresh.toFixed(2)}σ + 3 Filters)`}
            </span>
          </h3>
        </div>

        <div className="flex items-center gap-2">
          {/* Mode pill */}
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-950 text-sky-300 border border-sky-800/60">
            {isAr
              ? config.strategyDirection === 'BOTH'
                ? '⚡ صعود + هبوط (عقد 15m)'
                : config.strategyDirection === 'LONG_ONLY'
                ? '▲ صعود فقط'
                : '▼ هبوط فقط'
              : config.strategyDirection === 'BOTH'
              ? '⚡ Both (15m Contract)'
              : config.strategyDirection === 'LONG_ONLY'
              ? '▲ Long Only'
              : '▼ Short Only'}
          </span>

          <button
            onClick={onToggleSound}
            className={`p-1.5 rounded-lg border transition-colors ${
              soundEnabled
                ? 'bg-slate-800 text-sky-400 border-slate-700'
                : 'bg-slate-900 text-slate-500 border-slate-800'
            }`}
            title={soundEnabled ? 'Mute audio cues' : 'Enable audio cues'}
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Execution Alert / Diagnostic Banner */}
      {executionNotice && (
        <div
          className={`p-3 rounded-xl border flex items-start justify-between gap-3 text-xs transition-all ${
            executionNotice.type === 'SUCCESS'
              ? 'bg-emerald-950/70 border-emerald-500/70 text-emerald-200'
              : executionNotice.type === 'ERROR'
              ? 'bg-rose-950/70 border-rose-500/70 text-rose-200'
              : 'bg-amber-950/70 border-amber-500/70 text-amber-200 animate-pulse'
          }`}
        >
          <div className="flex items-start gap-2">
            <Zap className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
            <div className="space-y-1">
              <p className="font-semibold">{executionNotice.message}</p>
              {executionNotice.action === 'START_BOT' && !botActive && (
                <button
                  onClick={onToggleBot}
                  className="mt-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md font-bold text-[11px] shadow-sm cursor-pointer flex items-center gap-1.5"
                >
                  <Power className="w-3 h-3" />
                  <span>{isAr ? 'اضغط هنا لتشغيل الروبوت الآن' : 'Start Bot Now'}</span>
                </button>
              )}
            </div>
          </div>
          {onClearNotice && (
            <button
              onClick={onClearNotice}
              className="text-slate-400 hover:text-slate-200 text-xs px-1.5 py-0.5 rounded cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* Warning Notice when Bot is Paused but Signals Occur */}
      {!botActive && (
        <div className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-600/40 text-[11px] text-amber-300 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
            <span>
              {isAr
                ? '⚠️ تنبيه: الروبوت متوقف حالياً. يتم رصد الإشارات فقط على الشارت ولن يتم إرسال صفقات تلقائية حتى تضغط تشغيل الروبوت.'
                : '⚠️ Notice: Bot is currently paused. Signals are monitored on the chart, but automatic trades will not execute until you click Start Bot.'}
            </span>
          </div>
          <button
            onClick={onToggleBot}
            className="shrink-0 px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded text-[10px] cursor-pointer"
          >
            {isAr ? 'تشغيل الآن' : 'Start Now'}
          </button>
        </div>
      )}

      {/* Primary Prominent Robot Control Box */}
      <div
        className={`p-3.5 rounded-xl border transition-all ${
          botActive
            ? 'bg-gradient-to-b from-emerald-950/40 to-slate-950/60 border-emerald-600/50 shadow-lg shadow-emerald-950/40'
            : 'bg-gradient-to-b from-slate-900/80 to-slate-950/60 border-slate-800'
        }`}
      >
        {/* Status Line */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                botActive ? 'bg-emerald-400 animate-pulse ring-4 ring-emerald-500/20' : 'bg-slate-600 ring-2 ring-slate-700'
              }`}
            />
            <span className="font-bold text-xs text-slate-200">
              {isAr ? 'حالة محرك التداول:' : 'Trading Engine:'}
            </span>
          </div>

          <span
            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide ${
              botActive
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}
          >
            {isAr ? (botActive ? '● نشط ويعمل تلقائياً (عقود 15 دقيقة)' : '○ متوقف حالياً') : (botActive ? '● AUTO RUNNING (15m CONTRACTS)' : '○ PAUSED')}
          </span>
        </div>

        {/* Primary Big Full-Width Action Button */}
        <button
          onClick={onToggleBot}
          className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs transition-all shadow-md cursor-pointer flex items-center justify-center gap-2 select-none ${
            botActive
              ? 'bg-slate-900 hover:bg-rose-950/60 text-rose-300 hover:text-white border border-rose-800/60 hover:border-rose-600 shadow-rose-950/40'
              : 'bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white shadow-emerald-950/60 ring-1 ring-emerald-400/50 hover:shadow-emerald-500/20'
          }`}
        >
          {botActive ? (
            <>
              <PauseCircle className="w-4 h-4 text-rose-400" />
              <span>{isAr ? 'إيقاف الروبوت مؤقتاً' : 'Pause Trading Bot'}</span>
            </>
          ) : (
            <>
              <Power className="w-4 h-4 text-white" />
              <span>{isAr ? 'تشغيل الروبوت الآن (كلا الاتجاهين)' : 'Start Trading Bot (Both Directions)'}</span>
            </>
          )}
        </button>

        {/* Anti-Duplicate Contract Lock Status (Auto-transitions every 15 minutes) */}
        {contractLockInfo?.isLocked ? (
          <div className="mt-2.5 p-2.5 rounded-lg bg-sky-950/40 border border-sky-600/40 flex items-center justify-between gap-2 text-xs text-sky-200">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-sky-400 shrink-0 animate-pulse"></span>
              <div className="min-w-0">
                <div className="font-bold text-sky-300 flex items-center gap-1.5 flex-wrap">
                  <span>🔒 {isAr ? 'تم تنفيذ صفقة عقد الـ 15 دقيقة (حماية تلقائية)' : '15m Contract Completed (Auto Protected)'}</span>
                  {contractLockInfo.cooldownRemainingMinutes ? (
                    <span className="text-[10px] bg-sky-900/80 text-sky-200 border border-sky-700/60 px-1.5 py-0.5 rounded font-mono font-bold">
                      {isAr ? `تجديد وانتقال تلقائي بعد ${contractLockInfo.cooldownRemainingMinutes} دقيقة` : `Auto-resets in ${contractLockInfo.cooldownRemainingMinutes}m`}
                    </span>
                  ) : null}
                </div>
                <div className="text-[10px] text-slate-300 mt-0.5 truncate">
                  {isAr
                    ? 'يفتح الروبوت صفقة واحدة بحجم ثابت 4% لكل عقد 15 دقيقة، وينتقل تلقائياً للعقد القادم.'
                    : 'Bot opens 1 trade max (Fixed 4% bankroll) per 15m contract, then auto-transitions to next contract.'}
                </div>
              </div>
            </div>
            {onClearTradeLock && (
              <button
                onClick={onClearTradeLock}
                className="shrink-0 text-[10px] font-medium px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 cursor-pointer transition-colors"
                title={isAr ? 'تجاوز مؤقت وفتح صفقة جديدة الآن' : 'Manually override and trade immediately'}
              >
                {isAr ? 'تجاوز يدوي' : 'Override'}
              </button>
            )}
          </div>
        ) : (
          <div className="mt-2.5 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 text-center flex items-center justify-center gap-1.5 flex-wrap">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            <span>
              {isAr
                ? (botActive
                    ? `⚡ محرك البث الحي نشط (4% ثابت · قفل 15m): ينفذ فوراً عند التأكيد المباشر (±${safeUpperThresh.toFixed(2)}σ) بشرط تحقق الفلاتر الثلاثة`
                    : 'التنفيذ التلقائي متوقف حالياً. اضغط الزر أعلاه لتشغيل الروبوت.')
                : (botActive
                    ? `⚡ Live WS engine active (Fixed 4% · 15m Lock): Executes immediately on Single Confirm (±${safeUpperThresh.toFixed(2)}σ) + 3 Filters.`
                    : 'Automated execution is paused. Click above to start.')}
            </span>
          </div>
        )}

        {/* Instant Trade Testing Buttons */}
        {onTriggerManualTrade && (
          <div className="mt-3 pt-3 border-t border-slate-800/80">
            <div className="text-[11px] text-slate-300 font-semibold mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>{isAr ? 'تنفيذ فوري وتجربة صفقة الآن (4% رأس المال · أمر GTC بسقف دخول ≤ 20% / $0.20):' : 'Instant Trade (4% Capital · GTC Max Share Price ≤ 20% / $0.20):'}</span>
              </span>
              <span className="text-[10px] text-emerald-400 font-mono">15m CLOB</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onTriggerManualTrade('LONG')}
                disabled={isExecuting}
                className="py-2 px-3 rounded-lg font-bold text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                title={isAr ? 'شراء عقد UP صعود (أمر GTC بسقف دخول ≤ 20% / 20 سنت)' : 'Buy UP contract (GTC max share price ≤ 20% / $0.20)'}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                <span>{isAr ? 'شراء UP (صعود) فوري' : 'Buy UP (Long)'}</span>
              </button>
              <button
                onClick={() => onTriggerManualTrade('SHORT')}
                disabled={isExecuting}
                className="py-2 px-3 rounded-lg font-bold text-xs bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                title={isAr ? 'شراء عقد DOWN هبوط (أمر GTC بسقف دخول ≤ 20% / 20 سنت)' : 'Buy DOWN contract (GTC max share price ≤ 20% / $0.20)'}
              >
                <TrendingDown className="w-3.5 h-3.5" />
                <span>{isAr ? 'شراء DOWN (هبوط) فوري' : 'Buy DOWN (Short)'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Strategy Summary Strip */}
      <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/70 space-y-2.5">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 flex-wrap gap-1.5">
          <span className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>{isAr ? 'إعدادات الاستراتيجية المعتمدة (تأكيد واحد مباشر + الفلاتر الثلاثة):' : 'Approved Bot Parameters (Single Direct Confirm + 3 Filters):'}</span>
          </span>
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-500/50">
            {isAr ? `تأكيد واحد ±${safeUpperThresh.toFixed(2)}σ + 3 فلاتر` : `Single ±${safeUpperThresh.toFixed(2)}σ + 3 Filters`}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
          <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-800 flex flex-col">
            <span className="text-slate-400 text-[10px]">{isAr ? 'البث والمتوسط:' : 'Stream & SMA:'}</span>
            <span className="text-sky-300 font-bold">1m Live · 30-SMA</span>
          </div>
          <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-800 flex flex-col">
            <span className="text-slate-400 text-[10px]">{isAr ? 'عتبة الدخول المباشر:' : 'Direct Entry:'}</span>
            <span className="text-emerald-400 font-bold">±{safeUpperThresh.toFixed(2)}σ (تأكيد واحد)</span>
          </div>
          <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-800 flex flex-col">
            <span className="text-slate-400 text-[10px]">{isAr ? 'الفلاتر المفعّلة:' : 'Active Filters:'}</span>
            <span className="text-amber-400 font-bold">Open + EMA60 + ≥6m</span>
          </div>
          <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-800 flex flex-col">
            <span className="text-slate-400 text-[10px]">{isAr ? 'سقف الدخول ورأس المال:' : 'Max Price & Capital:'}</span>
            <span className="text-slate-100 font-bold">4% · GTC ≤ 20%</span>
          </div>
        </div>

        {/* Live 3 Filters Status Strip */}
        {threeFiltersStatus && (
          <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
            <div className="text-[10px] font-bold text-sky-400 flex items-center justify-between">
              <span>{isAr ? '🛡️ حالة الفلاتر الثلاثة الحية (يجب تحققها لحظة لمس ±2.20σ):' : '🛡️ Live 3-Filters Status (Required at ±2.20σ):'}</span>
              <span className="font-mono text-[10px] text-slate-400">
                {isAr
                  ? `UP: ${threeFiltersStatus.canEnterLong ? '✓ جاهز' : '✗ محظور'} | DOWN: ${threeFiltersStatus.canEnterShort ? '✓ جاهز' : '✗ محظور'}`
                  : `UP: ${threeFiltersStatus.canEnterLong ? '✓ OK' : '✗ BLOCKED'} | DOWN: ${threeFiltersStatus.canEnterShort ? '✓ OK' : '✗ BLOCKED'}`}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 text-[10px] font-mono">
              {/* Filter 1: SMA-30 vs Open Price */}
              <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800/90 flex flex-col justify-between gap-1">
                <span className="text-slate-400 font-sans font-semibold">
                  {isAr ? '1) فلتر سعر الافتتاح (Open Price):' : '1) Open Price Filter:'}
                </span>
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">
                    {threeFiltersStatus.openPriceFilter?.openPrice
                      ? `Open: $${Number(threeFiltersStatus.openPriceFilter.openPrice || 0).toFixed(0)}`
                      : isAr ? 'بانتظار السعر...' : 'Syncing...'}
                  </span>
                  <span className="flex items-center gap-1 font-bold">
                    <span className={threeFiltersStatus.openPriceFilter?.passedLong ? 'text-emerald-400' : 'text-slate-600'}>
                      UP:{threeFiltersStatus.openPriceFilter?.passedLong ? '✓' : '✗'}
                    </span>
                    <span className="text-slate-600">/</span>
                    <span className={threeFiltersStatus.openPriceFilter?.passedShort ? 'text-rose-400' : 'text-slate-600'}>
                      DN:{threeFiltersStatus.openPriceFilter?.passedShort ? '✓' : '✗'}
                    </span>
                  </span>
                </div>
              </div>

              {/* Filter 2: EMA-60 Trend Slope */}
              <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800/90 flex flex-col justify-between gap-1">
                <span className="text-slate-400 font-sans font-semibold">
                  {isAr ? '2) فلتر الاتجاه الأكبر (EMA-60):' : '2) EMA-60 Trend Filter:'}
                </span>
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">
                    Slope: {Number(threeFiltersStatus.ema60Filter?.ema60SlopeSigma || 0) >= 0 ? '+' : ''}
                    {Number(threeFiltersStatus.ema60Filter?.ema60SlopeSigma || 0).toFixed(2)}σ
                  </span>
                  <span className="flex items-center gap-1 font-bold">
                    <span className={threeFiltersStatus.ema60Filter?.passedLong ? 'text-emerald-400' : 'text-slate-600'}>
                      UP:{threeFiltersStatus.ema60Filter?.passedLong ? '✓' : '✗'}
                    </span>
                    <span className="text-slate-600">/</span>
                    <span className={threeFiltersStatus.ema60Filter?.passedShort ? 'text-rose-400' : 'text-slate-600'}>
                      DN:{threeFiltersStatus.ema60Filter?.passedShort ? '✓' : '✗'}
                    </span>
                  </span>
                </div>
              </div>

              {/* Filter 3: Minimum Time Remaining (>= 6m) */}
              <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800/90 flex flex-col justify-between gap-1">
                <span className="text-slate-400 font-sans font-semibold">
                  {isAr ? '3) فلتر الوقت المتبقي (≥ 6 د):' : '3) Time Left Filter (≥ 6m):'}
                </span>
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">
                    {threeFiltersStatus.timeFilter?.remainingMinutes !== null &&
                    threeFiltersStatus.timeFilter?.remainingMinutes !== undefined
                      ? `${Number(threeFiltersStatus.timeFilter.remainingMinutes).toFixed(1)}m`
                      : '--'}
                  </span>
                  <span className={`font-bold ${threeFiltersStatus.timeFilter.passed ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {threeFiltersStatus.timeFilter.passed
                      ? (isAr ? '✓ وقت كافٍ' : '✓ VALID')
                      : (isAr ? '⏳ < 6 دقائق' : '⏳ < 6m LEFT')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Dual Direction Live Strategy Status Wings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
        {/* Wing 1: Lower Direction (Long / UP) */}
        <div
          className={`p-3 rounded-xl border transition-all ${
            lowerPhase === 'ENTRY_TRIGGERED'
              ? 'bg-emerald-950/40 border-emerald-500 shadow-md shadow-emerald-950/40 ring-1 ring-emerald-500 animate-pulse'
              : lowerPhase === 'ARMED'
              ? 'bg-amber-950/30 border-amber-500/60 ring-1 ring-amber-500/30'
              : 'bg-slate-950/40 border-slate-800/80'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <TrendingUp className={`w-3.5 h-3.5 ${lowerPhase === 'ENTRY_TRIGGERED' ? 'text-emerald-400' : lowerPhase === 'ARMED' ? 'text-amber-400' : 'text-slate-400'}`} />
              <span className="font-bold text-slate-100 text-[11px]">
                {isAr ? '1. شروط صفقة الصعود (Long / UP)' : '1. Long Entry Conditions (UP)'}
              </span>
            </div>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                lowerPhase === 'ENTRY_TRIGGERED'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/60'
                  : lowerPhase === 'ARMED'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/60'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {lowerPhase === 'ENTRY_TRIGGERED'
                ? (isAr ? '🎯 تحقق الشرط + الفلاتر - دخول Long!' : '🎯 LONG TRIGGERED')
                : lowerPhase === 'ARMED'
                ? (isAr ? `🛡️ عند ${lowerThresh.toFixed(2)}σ (بانتظار الفلاتر)` : `🛡️ AT ${lowerThresh.toFixed(2)}σ (FILTER HOLD)`)
                : (isAr ? 'مراقبة البث الحي' : 'LIVE MONITORING')}
            </span>
          </div>

          <div className="text-[11px] text-slate-300 space-y-1.5 font-mono">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">{isAr ? '1) التأكيد المباشر:' : '1) Direct Confirm:'} z &le; {lowerThresh.toFixed(2)}σ</span>
              <span className={`font-bold ${safeCurrentZ <= lowerThresh ? 'text-emerald-400' : 'text-slate-500'}`}>
                {safeCurrentZ <= lowerThresh ? (isAr ? '✓ متحقق' : '✓ REACHED') : `(${safeCurrentZ.toFixed(2)}σ)`}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">{isAr ? '2) الفلاتر الثلاثة:' : '2) 3 Smart Filters:'}</span>
              <span className={`font-bold ${threeFiltersStatus?.canEnterLong !== false ? 'text-emerald-400' : 'text-amber-400'}`}>
                {threeFiltersStatus?.canEnterLong !== false
                  ? (isAr ? '✓ متحققة للصعود' : '✓ ALL PASSED')
                  : (isAr ? '✗ محظور حالياً' : '✗ FILTER BLOCKED')}
              </span>
            </div>
            <div className="flex justify-between text-[10px] pt-1 border-t border-slate-800/80">
              <span className="text-slate-500">{isAr ? 'الإجراء عند التحقق:' : 'Action:'}</span>
              <span className="text-teal-400 font-bold">{isAr ? 'شراء عقد UP فوري (4% · GTC ≤ 20%)' : 'Buy UP (4% · GTC ≤ 20%)'}</span>
            </div>
          </div>
        </div>

        {/* Wing 2: Upper Direction (Short / DOWN) */}
        <div
          className={`p-3 rounded-xl border transition-all ${
            upperPhase === 'ENTRY_TRIGGERED'
              ? 'bg-rose-950/40 border-rose-500 shadow-md shadow-rose-950/40 ring-1 ring-rose-500 animate-pulse'
              : upperPhase === 'ARMED'
              ? 'bg-amber-950/30 border-amber-500/60 ring-1 ring-amber-500/30'
              : 'bg-slate-950/40 border-slate-800/80'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <TrendingDown className={`w-3.5 h-3.5 ${upperPhase === 'ENTRY_TRIGGERED' ? 'text-rose-400' : upperPhase === 'ARMED' ? 'text-amber-400' : 'text-slate-400'}`} />
              <span className="font-bold text-slate-100 text-[11px]">
                {isAr ? '2. شروط صفقة الهبوط (Short / DOWN)' : '2. Short Entry Conditions (DOWN)'}
              </span>
            </div>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                upperPhase === 'ENTRY_TRIGGERED'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/60'
                  : upperPhase === 'ARMED'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/60'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {upperPhase === 'ENTRY_TRIGGERED'
                ? (isAr ? '🎯 تحقق الشرط + الفلاتر - دخول Short!' : '🎯 SHORT TRIGGERED')
                : upperPhase === 'ARMED'
                ? (isAr ? `🛡️ عند +${safeUpperThresh.toFixed(2)}σ (بانتظار الفلاتر)` : `🛡️ AT +${safeUpperThresh.toFixed(2)}σ (FILTER HOLD)`)
                : (isAr ? 'مراقبة البث الحي' : 'LIVE MONITORING')}
            </span>
          </div>

          <div className="text-[11px] text-slate-300 space-y-1.5 font-mono">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">{isAr ? '1) التأكيد المباشر:' : '1) Direct Confirm:'} z &ge; +{safeUpperThresh.toFixed(2)}σ</span>
              <span className={`font-bold ${safeCurrentZ >= safeUpperThresh ? 'text-rose-400' : 'text-slate-500'}`}>
                {safeCurrentZ >= safeUpperThresh ? (isAr ? '✓ متحقق' : '✓ REACHED') : `(${safeCurrentZ > 0 ? '+' : ''}${safeCurrentZ.toFixed(2)}σ)`}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">{isAr ? '2) الفلاتر الثلاثة:' : '2) 3 Smart Filters:'}</span>
              <span className={`font-bold ${threeFiltersStatus?.canEnterShort !== false ? 'text-rose-400' : 'text-amber-400'}`}>
                {threeFiltersStatus?.canEnterShort !== false
                  ? (isAr ? '✓ متحققة للهبوط' : '✓ ALL PASSED')
                  : (isAr ? '✗ محظور حالياً' : '✗ FILTER BLOCKED')}
              </span>
            </div>
            <div className="flex justify-between text-[10px] pt-1 border-t border-slate-800/80">
              <span className="text-slate-500">{isAr ? 'الإجراء عند التحقق:' : 'Action:'}</span>
              <span className="text-amber-400 font-bold">{isAr ? 'شراء عقد DOWN فوري (4% · GTC ≤ 20%)' : 'Buy DOWN (4% · GTC ≤ 20%)'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Live Bidirectional Z-Score Gauge Bar (Forced LTR) */}
      <div className="space-y-1.5 pt-1">
        <div className="flex justify-between text-xs font-mono">
          <span className="text-slate-400">
            {isAr ? 'قيمة Z-Score اللحظية:' : 'Current Z-Score:'}{' '}
            <span
              className={`font-bold text-sm ${
                safeCurrentZ >= safeUpperThresh
                  ? 'text-rose-400'
                  : safeCurrentZ <= lowerThresh
                  ? 'text-emerald-400'
                  : safeCurrentZ > 0
                  ? 'text-amber-400'
                  : 'text-sky-300'
              }`}
            >
              {safeCurrentZ > 0 ? `+${safeCurrentZ.toFixed(2)}σ` : `${safeCurrentZ.toFixed(2)}σ`}
            </span>
          </span>

          <div className="flex items-center gap-3 text-[11px] font-mono">
            <span className="text-emerald-400">
              {isAr ? 'دخول صعود:' : 'Long:'} &le; {lowerThresh.toFixed(2)}σ
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-rose-400">
              {isAr ? 'دخول هبوط:' : 'Short:'} &ge; +{safeUpperThresh.toFixed(2)}σ
            </span>
          </div>
        </div>

        {/* Meter - LTR guaranteed */}
        <div dir="ltr" className="space-y-1">
          <div className="relative w-full h-3.5 bg-slate-950 rounded-full border border-slate-800 overflow-hidden">
            {/* Center Zero Marker (Mean SMA) */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-slate-600 z-10"
              style={{ left: '50%' }}
              title="0.0σ Mean"
            />
            {/* Lower Direct Confirmation (-2.20σ) */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-emerald-400 z-20 shadow-xs shadow-emerald-400"
              style={{ left: `${lowerArmPct}%` }}
              title={`Direct Confirmation (Long): ${lowerThresh}σ`}
            />
            {/* Upper Direct Confirmation (+2.20σ) */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-rose-500 z-20 shadow-xs shadow-rose-500"
              style={{ left: `${upperArmPct}%` }}
              title={`Direct Confirmation (Short): +${safeUpperThresh}σ`}
            />

            {/* Value fill from left (-3.5) to right (+3.5) */}
            <div
              className={`h-full transition-all duration-300 ${
                safeCurrentZ >= safeUpperThresh
                  ? 'bg-rose-500'
                  : safeCurrentZ <= lowerThresh
                  ? 'bg-emerald-400'
                  : safeCurrentZ > 0
                  ? 'bg-amber-400/80'
                  : 'bg-sky-500/80'
              }`}
              style={{ width: `${normalizedZPct}%` }}
            />
          </div>

          <div className="flex justify-between text-[10px] font-mono text-slate-500 px-0.5">
            <span className="text-emerald-400 font-bold">{lowerThresh.toFixed(2)}σ (Direct Long + 3 Filters)</span>
            <span className="text-slate-400">0.0σ ({config.periods}-SMA)</span>
            <span className="text-rose-400 font-bold">+{safeUpperThresh.toFixed(2)}σ (Direct Short + 3 Filters)</span>
          </div>
        </div>

        {/* Real-Time Mathematical Formula Verification Proof */}
        {metric && Number(metric.stdDev) > 0 && (
          <div className="mt-2.5 p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] font-mono space-y-1.5">
            <div className="flex items-center justify-between text-slate-400 border-b border-slate-900 pb-1 text-[10px]">
              <span className="font-sans font-semibold text-slate-300">
                {isAr ? '📐 التحقق الحسابي الدقيق من معادلة Z-Score ثنائية الاتجاه' : '📐 Live Bidirectional Statistical Check'}
              </span>
              <span className="text-emerald-400 font-bold">{config.periods}-Periods SMA</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-300">
              <div>
                <span className="text-slate-500">{isAr ? 'السعر (P): ' : 'Price (P): '}</span>
                <span className="font-bold text-slate-100">${Number(metric.price || 0).toFixed(2)}</span>
              </div>
              <div>
                <span className="text-slate-500">{isAr ? 'المتوسط (μ): ' : 'Mean (μ): '}</span>
                <span className="font-bold text-slate-100">${Number(metric.mean || 0).toFixed(2)}</span>
              </div>
              <div>
                <span className="text-slate-500">{isAr ? 'الانحراف (σ): ' : 'StdDev (σ): '}</span>
                <span className="font-bold text-slate-100">${Number(metric.stdDev || 0).toFixed(2)}</span>
              </div>
              <div>
                <span className="text-slate-500">{isAr ? 'الفارق (P-μ): ' : 'Diff (P-μ): '}</span>
                <span className={`font-bold ${Number(metric.price || 0) - Number(metric.mean || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {Number(metric.price || 0) - Number(metric.mean || 0) >= 0 ? '+' : ''}
                  {(Number(metric.price || 0) - Number(metric.mean || 0)).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="pt-1.5 text-[10px] text-slate-400 border-t border-slate-900 flex flex-wrap items-center justify-between gap-1">
              <span className="text-slate-400">Z = (Price - Mean) / StdDev</span>
              <span className="text-emerald-300 font-bold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                ({(Number(metric.price || 0) - Number(metric.mean || 0)).toFixed(2)}) / {Number(metric.stdDev || 0).toFixed(2)} = {Number(metric.zScore || 0) > 0 ? '+' : ''}{Number(metric.zScore || 0).toFixed(2)}σ
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
