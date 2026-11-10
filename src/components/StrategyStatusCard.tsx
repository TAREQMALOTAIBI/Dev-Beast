import React from 'react';
import { BotConfig } from '../types/bot';
import {
  Zap,
  Radio,
  Volume2,
  VolumeX,
  Power,
  PauseCircle,
  TrendingUp,
  TrendingDown,
  Clock,
  ShieldCheck,
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
  threeFiltersStatus?: any;
  advancedFiltersStatus?: import('../utils/math').AdvancedFiltersStatus | null;
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
  recentChartSignal?: any;
}

export const StrategyStatusCard: React.FC<StrategyStatusCardProps> = ({
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

  const currentPrice = Number(metric?.price || 0);
  const openPrice = Number(metric?.mean || 0);
  const priceDiff = currentPrice && openPrice ? currentPrice - openPrice : 0;
  const isLeadingUp = priceDiff >= 0;

  const isInLastMinuteWindow = crossedUpperThreshold || crossedLowerThreshold;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/90 backdrop-blur-sm p-4 flex flex-col gap-3.5 shadow-lg">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <Radio className={`w-4 h-4 ${botActive ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`} />
          <h3 className="font-bold text-slate-100 text-xs tracking-wider uppercase flex items-center gap-1.5">
            <span>
              {isAr
                ? 'استراتيجية قنص الدقيقة الأخيرة (عقود 5 دقائق · بدون مؤشرات أو فلاتر)'
                : 'Last-Minute 5m Sniper Strategy (No Indicators / No Filters)'}
            </span>
          </h3>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700/60">
            {isAr ? '⚡ عقد 5 دقائق (5m)' : '⚡ 5m Contract'}
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

      {/* Warning Notice when Bot is Paused */}
      {!botActive && (
        <div className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-600/40 text-[11px] text-amber-300 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
            <span>
              {isAr
                ? '⚠️ تنبيه: الروبوت متوقف حالياً. اضغط "تشغيل الآن" ليقوم بالدخول التلقائي في آخر دقيقة من عقد الـ 5 دقائق.'
                : '⚠️ Notice: Bot is currently paused. Click Start Now to enable automatic last-minute 5m entries.'}
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
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                botActive ? 'bg-emerald-400 animate-pulse ring-4 ring-emerald-500/20' : 'bg-slate-600 ring-2 ring-slate-700'
              }`}
            />
            <span className="font-bold text-xs text-slate-200">
              {isAr ? 'حالة محرك قنص الدقيقة الأخيرة:' : 'Last-Minute Sniper Engine:'}
            </span>
          </div>

          <span
            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide ${
              botActive
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}
          >
            {isAr ? (botActive ? '● نشط ويعمل تلقائياً (عقود 5 دقائق)' : '○ متوقف حالياً') : (botActive ? '● AUTO RUNNING (5m CONTRACTS)' : '○ PAUSED')}
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
              <span>{isAr ? 'تشغيل الروبوت الآن (دخول آخر دقيقة تلقائياً)' : 'Start Trading Bot (Auto Last-Minute Entry)'}</span>
            </>
          )}
        </button>

        {/* Anti-Duplicate Contract Lock Status (Auto-transitions every 5 minutes) */}
        {contractLockInfo?.isLocked ? (
          <div className="mt-2.5 p-2.5 rounded-lg bg-sky-950/40 border border-sky-600/40 flex items-center justify-between gap-2 text-xs text-sky-200">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-sky-400 shrink-0 animate-pulse"></span>
              <div className="min-w-0">
                <div className="font-bold text-sky-300 flex items-center gap-1.5 flex-wrap">
                  <span>🔒 {isAr ? 'تم تنفيذ صفقة عقد الـ 5 دقائق الحالي (10% من الرصيد)' : '5m Contract Trade Completed (10% Capital)'}</span>
                </div>
                <div className="text-[10px] text-slate-300 mt-0.5 truncate">
                  {isAr
                    ? 'يفتح الروبوت صفقة واحدة بنسبة 10% لكل عقد 5 دقائق، وينتقل تلقائياً للعقد الجديد فور بدايته.'
                    : 'Bot opens 1 trade (10% capital) per 5m contract, then auto-transitions to the next 5m contract.'}
                </div>
              </div>
            </div>
            {onClearTradeLock && (
              <button
                onClick={onClearTradeLock}
                className="shrink-0 text-[10px] font-medium px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 cursor-pointer transition-colors"
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
                    ? '⚡ يراقب الروبوت عقد الـ 5 دقائق وسيقوم بالدخول تلقائياً في آخر 60 ثانية في العقد المضمون تقريباً بأمر FAK وبدون سقف سعري (10% من الرصيد).'
                    : 'التنفيذ التلقائي متوقف حالياً. اضغط الزر أعلاه لتشغيل الروبوت.')
                : (botActive
                    ? '⚡ Monitoring 5m BTC contract: Auto-entering in the final 60s on the winning contract via FAK with no price cap (10% capital).'
                    : 'Automated execution is paused. Click above to start.')}
            </span>
          </div>
        )}

        {/* Instant Manual Trade Testing Buttons */}
        {onTriggerManualTrade && (
          <div className="mt-3 pt-3 border-t border-slate-800/80">
            <div className="text-[11px] text-slate-300 font-semibold mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>{isAr ? 'تنفيذ يدوي فوري (أمر FAK بدون سقف سعري وبحجم 10% من الرصيد):' : 'Instant Manual Execution (FAK No Price Cap, 10% Capital):'}</span>
              </span>
              <span className="text-[10px] text-emerald-400 font-mono">5m CLOB</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onTriggerManualTrade('LONG')}
                disabled={isExecuting}
                className="py-2 px-3 rounded-lg font-bold text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <TrendingUp className="w-3.5 h-3.5" />
                <span>{isAr ? 'شراء UP (صعود) فوري FAK' : 'Buy UP (Long) FAK'}</span>
              </button>
              <button
                onClick={() => onTriggerManualTrade('SHORT')}
                disabled={isExecuting}
                className="py-2 px-3 rounded-lg font-bold text-xs bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <TrendingDown className="w-3.5 h-3.5" />
                <span>{isAr ? 'شراء DOWN (هبوط) فوري FAK' : 'Buy DOWN (Short) FAK'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Strategy Rules Summary Card (Clean - No Indicators or Filters) */}
      <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/70 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
          <span className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>{isAr ? 'قواعد استراتيجية قنص الدقيقة الأخيرة المعتمدة:' : 'Active Last-Minute 5m Sniper Rules:'}</span>
          </span>
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
              isInLastMinuteWindow
                ? 'bg-emerald-500 text-slate-950 animate-pulse'
                : 'bg-slate-800 text-slate-300'
            }`}
          >
            {isInLastMinuteWindow
              ? (isAr ? '🎯 داخل الدقيقة الأخيرة الآن!' : '🎯 IN LAST MINUTE NOW!')
              : (isAr ? '⏳ بانتظار الدقيقة الأخيرة (≤ 60ث)' : '⏳ Waiting for Last Minute (≤ 60s)')}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
          <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 flex flex-col gap-0.5">
            <span className="text-slate-400 text-[10px]">{isAr ? 'العقد المستهدف:' : 'Target Market:'}</span>
            <span className="text-emerald-400 font-bold">{isAr ? 'بيتكوين 5 دقائق (5m)' : 'BTC 5-Minute (5m)'}</span>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 flex flex-col gap-0.5">
            <span className="text-slate-400 text-[10px]">{isAr ? 'توقيت الدخول:' : 'Entry Timing:'}</span>
            <span className="text-amber-400 font-bold flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>{isAr ? 'آخر دقيقة (≤ 60 ثانية)' : 'Last Minute (≤ 60s)'}</span>
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 flex flex-col gap-0.5">
            <span className="text-slate-400 text-[10px]">{isAr ? 'نوع الأمر والسقف:' : 'Order & Price Cap:'}</span>
            <span className="text-sky-300 font-bold">{isAr ? 'FAK · بدون سقف سعري' : 'FAK · No Price Cap'}</span>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 flex flex-col gap-0.5">
            <span className="text-slate-400 text-[10px]">{isAr ? 'نسبة الدخول من الرصيد:' : 'Capital Allocation:'}</span>
            <span className="text-white font-bold">
              {((config.maxRiskPercent || 0.10) * 100).toFixed(0)}% {isAr ? 'من رأس المال' : 'of Capital'}
            </span>
          </div>
        </div>

        {/* Live Winning Outcome Box */}
        <div
          className={`p-3 rounded-xl border flex items-center justify-between ${
            isEntrySignal && (activeSignal === 'ENTRY_LONG' || lastTradeDirection === 'LONG')
              ? 'bg-emerald-950/60 border-emerald-400'
              : isEntrySignal && (activeSignal === 'ENTRY_SHORT' || lastTradeDirection === 'SHORT')
              ? 'bg-rose-950/60 border-rose-400'
              : isLeadingUp
              ? 'bg-emerald-950/30 border-emerald-600/40'
              : 'bg-rose-950/30 border-rose-600/40'
          }`}
        >
          <div>
            <div className="text-[10px] text-slate-400">
              {isAr ? 'العقد المضمون تقريباً حسب السعر الحالي مقابل الافتتاح:' : 'Almost-Guaranteed Winning Contract Now:'}
            </div>
            <div className={`text-xs font-extrabold mt-0.5 flex items-center gap-1.5 ${isLeadingUp ? 'text-emerald-300' : 'text-rose-300'}`}>
              {isLeadingUp ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <span>
                {isLeadingUp
                  ? (isAr ? 'عقد صعود (UP / LONG)' : 'UP / LONG Contract')
                  : (isAr ? 'عقد هبوط (DOWN / SHORT)' : 'DOWN / SHORT Contract')}
              </span>
            </div>
          </div>

          {currentPrice > 0 && openPrice > 0 && (
            <div className="text-right font-mono text-[11px]">
              <div className="text-slate-400">{isAr ? 'الفارق عن سعر البداية:' : 'Spread vs Open:'}</div>
              <div className={`font-bold ${priceDiff >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {priceDiff >= 0 ? '+' : ''}${priceDiff.toFixed(2)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
