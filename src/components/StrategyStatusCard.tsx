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
  onTriggerManualTrade?: (direction?: 'SHORT' | 'LONG') => void;
  isExecuting?: boolean;
  soundEnabled: boolean;
  onToggleSound: () => void;
  config: BotConfig;
  lang: 'en' | 'ar';
  metric?: import('../types/bot').ZScoreMetric | null;
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
}) => {
  const isAr = lang === 'ar';

  const lowerThresh = config.zScoreLower !== undefined ? config.zScoreLower : -config.zScoreUpper;
  const lowerEntryThresh = config.zScoreLowerEntry !== undefined ? config.zScoreLowerEntry : -config.zScoreEntry;

  // Upper direction phase (Short / Down)
  let upperPhase: 'MONITORING' | 'ARMED' | 'ENTRY_TRIGGERED' = 'MONITORING';
  if (isEntrySignal && (activeSignal === 'ENTRY_SHORT' || lastTradeDirection === 'SHORT')) {
    upperPhase = 'ENTRY_TRIGGERED';
  } else if (crossedUpperThreshold) {
    upperPhase = 'ARMED';
  }

  // Lower direction phase (Long / Up)
  let lowerPhase: 'MONITORING' | 'ARMED' | 'ENTRY_TRIGGERED' = 'MONITORING';
  if (isEntrySignal && (activeSignal === 'ENTRY_LONG' || lastTradeDirection === 'LONG')) {
    lowerPhase = 'ENTRY_TRIGGERED';
  } else if (crossedLowerThreshold) {
    lowerPhase = 'ARMED';
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

        {/* Sub Row: Dual Manual Test Orders */}
        <div className="mt-2.5 pt-2.5 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <span className="text-slate-400 text-[10px] truncate">
            {isAr
              ? (botActive ? '⚡ تنفيذ لحظي: شراء DOWN عند الارتداد من القمة، وشراء UP عند الارتداد من القاع' : 'التنفيذ التلقائي متوقف حتى تضغط تشغيل')
              : (botActive ? '⚡ Auto-executes DOWN on upper pullback, and UP on lower bounce' : 'Auto execution paused')}
          </span>

          {onTriggerManualTrade && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onTriggerManualTrade('SHORT')}
                disabled={isExecuting}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-rose-950/70 hover:bg-rose-900 text-rose-300 border border-rose-700/60 transition-colors disabled:opacity-50 cursor-pointer shrink-0"
                title={isAr ? 'إرسال أمر فحص فوري لاتجاه الهبوط (SHORT / DOWN)' : 'Test Bearish Reversion Order (DOWN)'}
              >
                <ArrowDownCircle className="w-3 h-3 text-rose-400" />
                <span>{isAr ? 'فحص هبوط (DOWN)' : 'Test SHORT'}</span>
              </button>

              <button
                onClick={() => onTriggerManualTrade('LONG')}
                disabled={isExecuting}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-emerald-950/70 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/60 transition-colors disabled:opacity-50 cursor-pointer shrink-0"
                title={isAr ? 'إرسال أمر فحص فوري لاتجاه الصعود (LONG / UP)' : 'Test Bullish Reversion Order (UP)'}
              >
                <ArrowUpCircle className="w-3 h-3 text-emerald-400" />
                <span>{isAr ? 'فحص صعود (UP)' : 'Test LONG'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Dual Direction Live Strategy Status Wings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
        {/* Wing 1: Upper Direction (Bearish Reversion / Short / DOWN) */}
        <div
          className={`p-3 rounded-xl border transition-all ${
            upperPhase === 'ENTRY_TRIGGERED'
              ? 'bg-amber-950/40 border-amber-500 shadow-md shadow-amber-950/40 ring-1 ring-amber-500'
              : upperPhase === 'ARMED'
              ? 'bg-rose-950/40 border-rose-500/80 shadow-md shadow-rose-950/40 animate-pulse'
              : 'bg-slate-950/40 border-slate-800/80'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <TrendingDown className={`w-3.5 h-3.5 ${upperPhase === 'ARMED' ? 'text-rose-400' : 'text-slate-400'}`} />
              <span className="font-bold text-slate-100 text-[11px]">
                {isAr ? '1. اتجاه الهبوط (Bearish / DOWN)' : '1. Bearish Reversion (SHORT / DOWN)'}
              </span>
            </div>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                upperPhase === 'ENTRY_TRIGGERED'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/60'
                  : upperPhase === 'ARMED'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/60'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {upperPhase === 'ENTRY_TRIGGERED'
                ? (isAr ? '🎯 إشارة دخول هبوط!' : '🎯 SHORT TRIGGERED')
                : upperPhase === 'ARMED'
                ? (isAr ? '⚠️ مسلح (ذروة شراء)' : '⚠️ ARMED (OVERBOUGHT)')
                : (isAr ? 'مراقبة' : 'MONITORING')}
            </span>
          </div>

          <div className="text-[11px] text-slate-300 space-y-1 font-mono">
            <div className="flex justify-between">
              <span className="text-slate-400">{isAr ? 'عتبة التأهب (Arm):' : 'Arm Threshold:'}</span>
              <span className="text-rose-400 font-bold">&gt; +{config.zScoreUpper.toFixed(2)}σ</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">{isAr ? 'عتبة الدخول (Trigger):' : 'Trigger Pullback:'}</span>
              <span className="text-amber-400 font-bold">&lt; +{config.zScoreEntry.toFixed(2)}σ</span>
            </div>
          </div>
        </div>

        {/* Wing 2: Lower Direction (Bullish Reversion / Long / UP) */}
        <div
          className={`p-3 rounded-xl border transition-all ${
            lowerPhase === 'ENTRY_TRIGGERED'
              ? 'bg-teal-950/40 border-teal-500 shadow-md shadow-teal-950/40 ring-1 ring-teal-500'
              : lowerPhase === 'ARMED'
              ? 'bg-emerald-950/40 border-emerald-500/80 shadow-md shadow-emerald-950/40 animate-pulse'
              : 'bg-slate-950/40 border-slate-800/80'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <TrendingUp className={`w-3.5 h-3.5 ${lowerPhase === 'ARMED' ? 'text-emerald-400' : 'text-slate-400'}`} />
              <span className="font-bold text-slate-100 text-[11px]">
                {isAr ? '2. اتجاه الصعود (Bullish / UP)' : '2. Bullish Reversion (LONG / UP)'}
              </span>
            </div>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                lowerPhase === 'ENTRY_TRIGGERED'
                  ? 'bg-teal-500/20 text-teal-300 border border-teal-500/60'
                  : lowerPhase === 'ARMED'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/60'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {lowerPhase === 'ENTRY_TRIGGERED'
                ? (isAr ? '🎯 إشارة دخول صعود!' : '🎯 LONG TRIGGERED')
                : lowerPhase === 'ARMED'
                ? (isAr ? '⚠️ مسلح (ذروة بيع)' : '⚠️ ARMED (OVERSOLD)')
                : (isAr ? 'مراقبة' : 'MONITORING')}
            </span>
          </div>

          <div className="text-[11px] text-slate-300 space-y-1 font-mono">
            <div className="flex justify-between">
              <span className="text-slate-400">{isAr ? 'عتبة التأهب (Arm):' : 'Arm Threshold:'}</span>
              <span className="text-emerald-400 font-bold">&lt; {lowerThresh.toFixed(2)}σ</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">{isAr ? 'عتبة الدخول (Trigger):' : 'Trigger Rebound:'}</span>
              <span className="text-teal-400 font-bold">&gt; {lowerEntryThresh.toFixed(2)}σ</span>
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
              {isAr ? 'قاع صعود:' : 'Long Trigger:'} {lowerEntryThresh.toFixed(2)}σ
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-amber-400">
              {isAr ? 'قمة هبوط:' : 'Short Trigger:'} +{config.zScoreEntry.toFixed(2)}σ
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
            {/* Lower Arm Marker */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-emerald-500 z-20 shadow-xs shadow-emerald-500"
              style={{ left: `${lowerArmPct}%` }}
              title={`Lower Arm: ${lowerThresh}σ`}
            />
            {/* Lower Entry Marker */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-teal-400 z-20 shadow-xs shadow-teal-400"
              style={{ left: `${lowerEntryPct}%` }}
              title={`Lower Trigger: ${lowerEntryThresh}σ`}
            />
            {/* Upper Entry Threshold Marker */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-20 shadow-xs shadow-amber-400"
              style={{ left: `${upperEntryPct}%` }}
              title={`Upper Entry: +${config.zScoreEntry}σ`}
            />
            {/* Upper Threshold Marker */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-rose-500 z-20 shadow-xs shadow-rose-500"
              style={{ left: `${upperArmPct}%` }}
              title={`Upper Arm: +${config.zScoreUpper}σ`}
            />

            {/* Value fill from left (-3.0) to right (+3.0) */}
            <div
              className={`h-full transition-all duration-300 ${
                currentZScore >= config.zScoreUpper
                  ? 'bg-rose-500'
                  : currentZScore <= lowerThresh
                  ? 'bg-emerald-400'
                  : currentZScore >= config.zScoreEntry
                  ? 'bg-amber-400'
                  : currentZScore <= lowerEntryThresh
                  ? 'bg-teal-400'
                  : 'bg-sky-500'
              }`}
              style={{ width: `${normalizedZPct}%` }}
            />
          </div>

          <div className="flex justify-between text-[10px] font-mono text-slate-500 px-0.5">
            <span className="text-emerald-400">{lowerThresh.toFixed(1)}σ</span>
            <span className="text-teal-400">{lowerEntryThresh.toFixed(1)}σ</span>
            <span className="text-slate-400">0.0σ (SMA)</span>
            <span className="text-amber-400">+{config.zScoreEntry.toFixed(1)}σ</span>
            <span className="text-rose-400">+{config.zScoreUpper.toFixed(1)}σ</span>
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
