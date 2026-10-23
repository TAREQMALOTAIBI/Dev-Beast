import React from 'react';
import { BotConfig } from '../types/bot';
import { ShieldAlert, Zap, Radio, Volume2, VolumeX, Pause, Play, AlertCircle, Power, PlayCircle, PauseCircle } from 'lucide-react';
import { soundController } from '../utils/audio';

interface StrategyStatusCardProps {
  currentZScore: number;
  crossedUpperThreshold: boolean;
  isEntrySignal: boolean;
  botActive: boolean;
  onToggleBot: () => void;
  onTriggerManualTrade?: () => void;
  isExecuting?: boolean;
  soundEnabled: boolean;
  onToggleSound: () => void;
  config: BotConfig;
  lang: 'en' | 'ar';
}

export const StrategyStatusCard: React.FC<StrategyStatusCardProps> = ({
  currentZScore,
  crossedUpperThreshold,
  isEntrySignal,
  botActive,
  onToggleBot,
  onTriggerManualTrade,
  isExecuting = false,
  soundEnabled,
  onToggleSound,
  config,
  lang,
}) => {
  const isAr = lang === 'ar';

  // Strategy Phase determination
  let phase: 'MONITORING' | 'ARMED' | 'ENTRY_TRIGGERED' = 'MONITORING';
  if (isEntrySignal) {
    phase = 'ENTRY_TRIGGERED';
  } else if (crossedUpperThreshold) {
    phase = 'ARMED';
  }

  // Z-Score percentage within -3 to +3 range
  const normalizedZPct = Math.min(100, Math.max(0, ((currentZScore + 3) / 6) * 100));

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/90 backdrop-blur-sm p-4 flex flex-col gap-3.5 shadow-lg">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <Radio className={`w-4 h-4 ${botActive ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`} />
          <h3 className="font-bold text-slate-100 text-xs tracking-wider uppercase">
            {isAr ? 'حالة استراتيجية الانعكاس الإحصائي' : 'Strategy State Machine'}
          </h3>
        </div>

        <div className="flex items-center gap-2">
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

      {/* Primary Prominent Robot Control Box */}
      <div className={`p-3.5 rounded-xl border transition-all ${
        botActive
          ? 'bg-gradient-to-b from-emerald-950/40 to-slate-950/60 border-emerald-600/50 shadow-lg shadow-emerald-950/40'
          : 'bg-gradient-to-b from-slate-900/80 to-slate-950/60 border-slate-800'
      }`}>
        {/* Status Line */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${
              botActive ? 'bg-emerald-400 animate-pulse ring-4 ring-emerald-500/20' : 'bg-slate-600 ring-2 ring-slate-700'
            }`} />
            <span className="font-bold text-xs text-slate-200">
              {isAr ? 'حالة الروبوت:' : 'Trading Engine:'}
            </span>
          </div>

          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide ${
            botActive
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              : 'bg-slate-800 text-slate-400 border border-slate-700'
          }`}>
            {isAr ? (botActive ? '● نشط ويعمل تلقائياً' : '○ متوقف حالياً') : (botActive ? '● AUTO RUNNING' : '○ PAUSED')}
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
              <span>{isAr ? 'تشغيل الروبوت الآن' : 'Start Trading Bot Now'}</span>
            </>
          )}
        </button>

        {/* Sub Row: Manual Test Order & Info */}
        <div className="mt-2.5 pt-2.5 border-t border-slate-800/80 flex items-center justify-between gap-2 text-[11px]">
          <span className="text-slate-400 text-[10px] truncate">
            {isAr
              ? (botActive ? 'يتم فحص شمعة 15m وتنفيذ الصفقات تلقائياً' : 'لن يتم فتح صفقات تلقائية حتى تضغط تشغيل')
              : (botActive ? 'Monitoring 15m candles & auto-placing orders' : 'Auto execution paused')}
          </span>

          {onTriggerManualTrade && (
            <button
              onClick={onTriggerManualTrade}
              disabled={isExecuting}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-slate-800/80 hover:bg-slate-700 text-sky-300 hover:text-sky-200 border border-slate-700 hover:border-sky-700/60 transition-colors disabled:opacity-50 cursor-pointer shrink-0"
              title={isAr ? 'تجربة إرسال أمر فحص فوري إلى Limitless' : 'Execute an immediate test order via Limitless'}
            >
              <Zap className="w-3 h-3 text-sky-400" />
              <span>{isAr ? 'أمر فحص' : 'Test Order'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Status Indicator Block */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {/* Phase 1: Monitoring */}
        <div
          className={`p-2.5 rounded-lg border text-xs transition-all ${
            phase === 'MONITORING'
              ? 'bg-sky-950/40 border-sky-500/50 text-slate-100 shadow-sm'
              : 'bg-slate-950/30 border-slate-900 text-slate-500'
          }`}
        >
          <div className="font-semibold flex items-center justify-between mb-1">
            <span>1. {isAr ? 'المراقبة المستمرة' : 'Monitoring'}</span>
            {phase === 'MONITORING' && <span className="w-2 h-2 rounded-full bg-sky-400"></span>}
          </div>
          <div className="text-[11px] text-slate-400">
            {isAr ? 'بانتظار تجاوز 2.0σ' : 'Waiting for Z > 2.0σ'}
          </div>
        </div>

        {/* Phase 2: Armed */}
        <div
          className={`p-2.5 rounded-lg border text-xs transition-all ${
            phase === 'ARMED'
              ? 'bg-rose-950/40 border-rose-500/70 text-slate-100 shadow-sm animate-pulse'
              : 'bg-slate-950/30 border-slate-900 text-slate-500'
          }`}
        >
          <div className="font-semibold flex items-center justify-between mb-1">
            <span>2. {isAr ? 'تأهب الدخول (Armed)' : 'Armed / Overbought'}</span>
            {phase === 'ARMED' && <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />}
          </div>
          <div className="text-[11px] text-slate-400">
            {isAr ? 'تجاوز 2.0σ، بانتظار الهبوط تحت 1.90' : 'Z crossed > 2.0σ, watching < 1.90'}
          </div>
        </div>

        {/* Phase 3: Triggered */}
        <div
          className={`p-2.5 rounded-lg border text-xs transition-all ${
            phase === 'ENTRY_TRIGGERED'
              ? 'bg-amber-950/40 border-amber-500 text-slate-100 shadow-sm'
              : 'bg-slate-950/30 border-slate-900 text-slate-500'
          }`}
        >
          <div className="font-semibold flex items-center justify-between mb-1">
            <span>3. {isAr ? 'إشارة الدخول (ENTRY)' : 'Entry Signal'}</span>
            {phase === 'ENTRY_TRIGGERED' && <Zap className="w-3.5 h-3.5 text-amber-400" />}
          </div>
          <div className="text-[11px] text-slate-400">
            {isAr ? 'تنفيذ 4 أجزاء متتالية' : '4-chunk order execution'}
          </div>
        </div>
      </div>

      {/* Live Z-Score Gauge Bar */}
      <div className="space-y-1.5 pt-1">
        <div className="flex justify-between text-xs font-mono">
          <span className="text-slate-400">
            {isAr ? 'قيمة Z-Score الحالية:' : 'Current Z-Score:'}{' '}
            <span
              className={`font-bold ${
                currentZScore >= config.zScoreUpper
                  ? 'text-rose-400'
                  : currentZScore >= config.zScoreEntry
                  ? 'text-amber-400'
                  : 'text-sky-300'
              }`}
            >
              {currentZScore.toFixed(2)}σ
            </span>
          </span>
          <span className="text-slate-500 text-[11px]">
            Target: &lt; {config.zScoreEntry.toFixed(2)}σ
          </span>
        </div>

        {/* Meter */}
        <div className="relative w-full h-2.5 bg-slate-950 rounded-full border border-slate-800 overflow-hidden">
          {/* Threshold markers */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-10"
            style={{ left: `${((config.zScoreEntry + 3) / 6) * 100}%` }}
            title={`Entry: ${config.zScoreEntry}`}
          />
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-rose-500 z-10"
            style={{ left: `${((config.zScoreUpper + 3) / 6) * 100}%` }}
            title={`Upper: ${config.zScoreUpper}`}
          />

          {/* Value fill */}
          <div
            className={`h-full transition-all duration-300 ${
              currentZScore >= config.zScoreUpper
                ? 'bg-rose-500'
                : currentZScore >= config.zScoreEntry
                ? 'bg-amber-400'
                : 'bg-sky-400'
            }`}
            style={{ width: `${normalizedZPct}%` }}
          />
        </div>

        <div className="flex justify-between text-[10px] font-mono text-slate-500">
          <span>-3.0σ</span>
          <span>0.0σ</span>
          <span className="text-amber-400">+{config.zScoreEntry.toFixed(1)}σ</span>
          <span className="text-rose-400">+{config.zScoreUpper.toFixed(1)}σ</span>
          <span>+3.0σ</span>
        </div>
      </div>
    </div>
  );
};
