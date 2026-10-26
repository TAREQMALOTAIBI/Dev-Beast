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
  executionNotice,
  onClearNotice,
  contractLockInfo,
  onClearTradeLock,
}) => {
  const isAr = lang === 'ar';

  const lowerThresh = config.zScoreLower !== undefined ? config.zScoreLower : -config.zScoreUpper;
  const lowerEntryThresh = config.zScoreLowerEntry !== undefined ? config.zScoreLowerEntry : -config.zScoreEntry;

  // Upper direction phase (Short / Down) - Entry only upon exceeding threshold 2 (>= 2.0σ)
  let upperPhase: 'MONITORING' | 'ENTRY_TRIGGERED' = 'MONITORING';
  if (currentZScore >= config.zScoreUpper || crossedUpperThreshold || (isEntrySignal && (activeSignal === 'ENTRY_SHORT' || lastTradeDirection === 'SHORT'))) {
    upperPhase = 'ENTRY_TRIGGERED';
  }

  // Lower direction phase (Long / Up) - Entry only upon exceeding threshold -2 (<= -2.0σ)
  let lowerPhase: 'MONITORING' | 'ENTRY_TRIGGERED' = 'MONITORING';
  if (currentZScore <= lowerThresh || crossedLowerThreshold || (isEntrySignal && (activeSignal === 'ENTRY_LONG' || lastTradeDirection === 'LONG'))) {
    lowerPhase = 'ENTRY_TRIGGERED';
  }

  // Z-Score percentage within -3 to +3 range
  const normalizedZPct = Math.min(100, Math.max(0, ((currentZScore + 3) / 6) * 100));

  const lowerArmPct = ((lowerThresh + 3) / 6) * 100;
  const lowerEntryPct = ((lowerEntryThresh + 3) / 6) * 100;
  const upperEntryPct = ((config.zScoreEntry + 3) / 6) * 100;
  const upperArmPct = ((config.zScoreUpper + 3) / 6) * 100;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/90 backdrop-blur-sm p-4 flex flex-col gap-3.5 shadow-lg">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <Radio className={`w-4 h-4 ${botActive ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`} />
          <h3 className="font-bold text-slate-100 text-xs tracking-wider uppercase flex items-center gap-1.5">
            <span>{isAr ? 'استراتيجية الانعكاس الإحصائي ثنائية الاتجاه' : 'Bidirectional Z-Score Strategy'}</span>
          </h3>
        </div>

        <div className="flex items-center gap-2">
          {/* Mode pill */}
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-950 text-sky-300 border border-sky-800/60">
            {isAr
              ? config.strategyDirection === 'BOTH'
                ? '⚡ صعود + هبوط (ثنائي)'
                : config.strategyDirection === 'LONG_ONLY'
                ? '▲ صعود فقط'
                : '▼ هبوط فقط'
              : config.strategyDirection === 'BOTH'
              ? '⚡ Both (Long & Short)'
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
            {isAr ? (botActive ? '● نشط ويعمل تلقائياً (كلا الاتجاهين)' : '○ متوقف حالياً') : (botActive ? '● AUTO RUNNING (BIDIRECTIONAL)' : '○ PAUSED')}
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
                  <span>🔒 {isAr ? 'تم تنفيذ صفقة هذا العقد (حماية وتأمين تلقائي)' : 'Contract Completed (Auto Protected)'}</span>
                  {contractLockInfo.cooldownRemainingMinutes ? (
                    <span className="text-[10px] bg-sky-900/80 text-sky-200 border border-sky-700/60 px-1.5 py-0.5 rounded font-mono font-bold">
                      {isAr ? `تجديد وانتقال تلقائي بعد ${contractLockInfo.cooldownRemainingMinutes} دقيقة` : `Auto-resets in ${contractLockInfo.cooldownRemainingMinutes}m`}
                    </span>
                  ) : null}
                </div>
                <div className="text-[10px] text-slate-300 mt-0.5 truncate">
                  {isAr
                    ? 'يفتح الروبوت صفقة واحدة فقط لكل عقد 15 دقيقة، وسينتقل تلقائياً للعقد القادم دون أي حاجة لضغط أي زر.'
                    : 'Bot opens 1 trade max per 15m contract, then auto-transitions to next contract with zero clicks.'}
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
          <div className="mt-2.5 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 text-center flex items-center justify-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            <span>
              {isAr
                ? (botActive ? '⚡ محرك التداول الآلي يعمل بنشاط: جاهز لتنفيذ الصفقة القادمة تلقائياً عند تحقق إشارات Z-Score' : 'التنفيذ التلقائي متوقف حالياً. اضغط الزر أعلاه لتشغيل الروبوت.')
                : (botActive ? '⚡ Automated engine active: Ready for next trade on Z-Score reversal.' : 'Automated execution is paused. Click above to start.')}
            </span>
          </div>
        )}

        {/* Instant Trade Testing Buttons */}
        {onTriggerManualTrade && (
          <div className="mt-3 pt-3 border-t border-slate-800/80">
            <div className="text-[11px] text-slate-300 font-semibold mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>{isAr ? 'تنفيذ فوري وتجربة صفقة الآن (سقف مخاطرة 5%):' : 'Instant Trade / Direct Execution (5% Max):'}</span>
              </span>
              <span className="text-[10px] text-emerald-400 font-mono">Real CLOB</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onTriggerManualTrade('LONG')}
                disabled={isExecuting}
                className="py-2 px-3 rounded-lg font-bold text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                title={isAr ? 'شراء عقد UP صعود مباشرة بسعر السوق اللحظي' : 'Buy UP contract at live market ask'}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                <span>{isAr ? 'شراء UP (صعود) فوري' : 'Buy UP (Long)'}</span>
              </button>
              <button
                onClick={() => onTriggerManualTrade('SHORT')}
                disabled={isExecuting}
                className="py-2 px-3 rounded-lg font-bold text-xs bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                title={isAr ? 'شراء عقد DOWN هبوط مباشرة بسعر السوق اللحظي' : 'Buy DOWN contract at live market ask'}
              >
                <TrendingDown className="w-3.5 h-3.5" />
                <span>{isAr ? 'شراء DOWN (هبوط) فوري' : 'Buy DOWN (Short)'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Dual Direction Live Strategy Status Wings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
        {/* Wing 1: Upper Direction (Bearish Reversion / Short / DOWN) */}
        <div
          className={`p-3 rounded-xl border transition-all ${
            upperPhase === 'ENTRY_TRIGGERED'
              ? 'bg-rose-950/40 border-rose-500 shadow-md shadow-rose-950/40 ring-1 ring-rose-500 animate-pulse'
              : 'bg-slate-950/40 border-slate-800/80'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <TrendingDown className={`w-3.5 h-3.5 ${upperPhase === 'ENTRY_TRIGGERED' ? 'text-rose-400' : 'text-slate-400'}`} />
              <span className="font-bold text-slate-100 text-[11px]">
                {isAr ? '1. اتجاه الصعود / ذروة الشراء (Short / DOWN)' : '1. Overbought / Short Reversion (DOWN)'}
              </span>
            </div>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                upperPhase === 'ENTRY_TRIGGERED'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/60'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {upperPhase === 'ENTRY_TRIGGERED'
                ? (isAr ? '🎯 تجاوز العتبة 2 - دخول هبوط!' : '🎯 EXCEEDED 2 - SHORT TRIGGERED')
                : (isAr ? 'مراقبة (في انتظار تجاوز +2σ)' : 'MONITORING (< +2σ)')}
            </span>
          </div>

          <div className="text-[11px] text-slate-300 space-y-1 font-mono">
            <div className="flex justify-between">
              <span className="text-slate-400">{isAr ? 'شرط الدخول في الصعود:' : 'Entry Condition (Rise):'}</span>
              <span className="text-rose-400 font-bold">&ge; +{config.zScoreUpper.toFixed(2)}σ</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-slate-500">{isAr ? 'نوع الصفقة المنفذة:' : 'Action Executed:'}</span>
              <span className="text-amber-400 font-bold">{isAr ? 'شراء عقد DOWN (هبوط)' : 'Buy DOWN Contract'}</span>
            </div>
          </div>
        </div>

        {/* Wing 2: Lower Direction (Bullish Reversion / Long / UP) */}
        <div
          className={`p-3 rounded-xl border transition-all ${
            lowerPhase === 'ENTRY_TRIGGERED'
              ? 'bg-emerald-950/40 border-emerald-500 shadow-md shadow-emerald-950/40 ring-1 ring-emerald-500 animate-pulse'
              : 'bg-slate-950/40 border-slate-800/80'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <TrendingUp className={`w-3.5 h-3.5 ${lowerPhase === 'ENTRY_TRIGGERED' ? 'text-emerald-400' : 'text-slate-400'}`} />
              <span className="font-bold text-slate-100 text-[11px]">
                {isAr ? '2. اتجاه الهبوط / ذروة البيع (Long / UP)' : '2. Oversold / Long Rebound (UP)'}
              </span>
            </div>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                lowerPhase === 'ENTRY_TRIGGERED'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/60'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {lowerPhase === 'ENTRY_TRIGGERED'
                ? (isAr ? '🎯 تجاوز العتبة 2 - دخول صعود!' : '🎯 EXCEEDED 2 - LONG TRIGGERED')
                : (isAr ? 'مراقبة (في انتظار تجاوز -2σ)' : 'MONITORING (> -2σ)')}
            </span>
          </div>

          <div className="text-[11px] text-slate-300 space-y-1 font-mono">
            <div className="flex justify-between">
              <span className="text-slate-400">{isAr ? 'شرط الدخول في الهبوط:' : 'Entry Condition (Decline):'}</span>
              <span className="text-emerald-400 font-bold">&le; {lowerThresh.toFixed(2)}σ</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-slate-500">{isAr ? 'نوع الصفقة المنفذة:' : 'Action Executed:'}</span>
              <span className="text-teal-400 font-bold">{isAr ? 'شراء عقد UP (صعود)' : 'Buy UP Contract'}</span>
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
                currentZScore >= config.zScoreUpper
                  ? 'text-rose-400'
                  : currentZScore <= lowerThresh
                  ? 'text-emerald-400'
                  : currentZScore > 0
                  ? 'text-amber-400'
                  : 'text-sky-300'
              }`}
            >
              {currentZScore > 0 ? `+${currentZScore.toFixed(2)}σ` : `${currentZScore.toFixed(2)}σ`}
            </span>
          </span>

          <div className="flex items-center gap-3 text-[11px] font-mono">
            <span className="text-emerald-400">
              {isAr ? 'عتبة دخول الصعود:' : 'Long Trigger:'} {lowerThresh.toFixed(2)}σ
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-rose-400">
              {isAr ? 'عتبة دخول الهبوط:' : 'Short Trigger:'} +{config.zScoreUpper.toFixed(2)}σ
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
            {/* Lower Threshold Marker (-2.0σ) */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-emerald-400 z-20 shadow-xs shadow-emerald-400"
              style={{ left: `${lowerArmPct}%` }}
              title={`Lower Threshold: ${lowerThresh}σ`}
            />
            {/* Upper Threshold Marker (+2.0σ) */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-rose-500 z-20 shadow-xs shadow-rose-500"
              style={{ left: `${upperArmPct}%` }}
              title={`Upper Threshold: +${config.zScoreUpper}σ`}
            />

            {/* Value fill from left (-3.0) to right (+3.0) */}
            <div
              className={`h-full transition-all duration-300 ${
                currentZScore >= config.zScoreUpper
                  ? 'bg-rose-500'
                  : currentZScore <= lowerThresh
                  ? 'bg-emerald-400'
                  : currentZScore > 0
                  ? 'bg-amber-400/80'
                  : 'bg-sky-500/80'
              }`}
              style={{ width: `${normalizedZPct}%` }}
            />
          </div>

          <div className="flex justify-between text-[10px] font-mono text-slate-500 px-0.5">
            <span className="text-emerald-400 font-bold">{lowerThresh.toFixed(1)}σ ({isAr ? 'دخول صعود' : 'Long'})</span>
            <span className="text-slate-400">0.0σ (SMA)</span>
            <span className="text-rose-400 font-bold">+{config.zScoreUpper.toFixed(1)}σ ({isAr ? 'دخول هبوط' : 'Short'})</span>
          </div>
        </div>

        {/* Real-Time Mathematical Formula Verification Proof */}
        {metric && metric.stdDev > 0 && (
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
                <span className="font-bold text-slate-100">${metric.price.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-slate-500">{isAr ? 'المتوسط (μ): ' : 'Mean (μ): '}</span>
                <span className="font-bold text-slate-100">${metric.mean.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-slate-500">{isAr ? 'الانحراف (σ): ' : 'StdDev (σ): '}</span>
                <span className="font-bold text-slate-100">${metric.stdDev.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-slate-500">{isAr ? 'الفارق (P-μ): ' : 'Diff (P-μ): '}</span>
                <span className={`font-bold ${metric.price - metric.mean >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {metric.price - metric.mean >= 0 ? '+' : ''}{(metric.price - metric.mean).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="pt-1.5 text-[10px] text-slate-400 border-t border-slate-900 flex flex-wrap items-center justify-between gap-1">
              <span className="text-slate-400">Z = (Price - Mean) / StdDev</span>
              <span className="text-emerald-300 font-bold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                ({(metric.price - metric.mean).toFixed(2)}) / {metric.stdDev.toFixed(2)} = {metric.zScore > 0 ? '+' : ''}{metric.zScore.toFixed(2)}σ
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
