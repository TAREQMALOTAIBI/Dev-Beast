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
  XCircle,
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
  priceDeviation?: {
    delta: number;
    absDelta: number;
    openPrice: number | null;
  };
  pendingGtcOrder?: any;
  onCancelPendingOrder?: () => void;
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
  lang,
  metric,
  executionNotice,
  onClearNotice,
  contractLockInfo,
  onClearTradeLock,
  priceDeviation,
  pendingGtcOrder,
  onCancelPendingOrder,
}) => {
  const isAr = lang === 'ar';

  const currentPrice = Number(metric?.price || 0);
  const openPrice = Number(metric?.mean || priceDeviation?.openPrice || 0);
  const priceDiff = priceDeviation?.delta ?? (currentPrice && openPrice ? currentPrice - openPrice : 0);
  const absPriceDiff = Math.abs(priceDiff);
  const isMove150Reached = absPriceDiff >= 150;
  const isUpLeading = priceDiff >= 0;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/90 backdrop-blur-sm p-4 flex flex-col gap-3.5 shadow-lg">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <Radio className={`w-4 h-4 ${botActive ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`} />
          <h3 className="font-bold text-slate-100 text-xs tracking-wider uppercase flex items-center gap-1.5">
            <span>
              {isAr
                ? 'استراتيجية تحرك 150$ · أمر GTC عند 20% · إلغاء عند بقاء 1 دقيقة'
                : '$150 Movement Strategy · GTC @ 20% · Cancel @ 1m'}
            </span>
          </h3>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-950 text-sky-300 border border-sky-700/60">
            {isAr ? 'أمر GTC @ 20%' : 'GTC @ 20%'}
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

      {/* Active Pending GTC Order Banner */}
      {pendingGtcOrder && pendingGtcOrder.status === 'PENDING_FILL' && (
        <div className="p-3 rounded-xl bg-sky-950/60 border border-sky-500/60 flex items-center justify-between gap-3 text-xs text-sky-200 shadow-md">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-ping"></span>
            <div>
              <div className="font-bold text-sky-300 flex items-center gap-2">
                <span>🎯 {isAr ? `يوجد أمر GTC معلق عند 20% ($0.20)` : `Pending GTC Order @ 20% ($0.20)`}</span>
                <span className="text-[10px] bg-sky-900 text-sky-200 px-1.5 py-0.5 rounded font-mono">
                  {pendingGtcOrder.outcome}
                </span>
              </div>
              <div className="text-[10px] text-slate-300 mt-0.5">
                {isAr
                  ? `أمر الشراء ينتظر التنفيذ في دفتر الأوامر. سيتم إلغاؤه تلقائياً في حال عدم التنفيذ عند بقاء دقيقة واحدة (≤ 60 ثانية).`
                  : `Waiting for fill on CLOB. Auto-cancels if unfilled when 1 minute remains.`}
              </div>
            </div>
          </div>
          {onCancelPendingOrder && (
            <button
              onClick={onCancelPendingOrder}
              className="px-2.5 py-1 text-[11px] font-bold bg-rose-600 hover:bg-rose-500 text-white rounded-lg flex items-center gap-1 cursor-pointer shrink-0"
            >
              <XCircle className="w-3 h-3" />
              <span>{isAr ? 'إلغاء الأمر الآن' : 'Cancel Now'}</span>
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
                ? '⚠️ تنبيه: الروبوت متوقف حالياً. اضغط "تشغيل الآن" ليقوم بوضع أمر GTC عند 20% تلقائياً عند تحرك السعر 150$.'
                : '⚠️ Notice: Bot is paused. Click Start Now to enable automatic GTC orders upon $150 price movement.'}
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
              {isAr ? 'حالة محرك التداول التلقائي:' : 'Trading Engine Status:'}
            </span>
          </div>

          <span
            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide ${
              botActive
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}
          >
            {isAr ? (botActive ? '● نشط ويعمل تلقائياً (استراتيجية 150$)' : '○ متوقف حالياً') : (botActive ? '● AUTO RUNNING ($150 STRATEGY)' : '○ PAUSED')}
          </span>
        </div>

        {/* Primary Action Button */}
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
              <span>{isAr ? 'تشغيل الروبوت الآن' : 'Start Trading Bot'}</span>
            </>
          )}
        </button>

        {/* Anti-Duplicate Contract Lock Status */}
        {contractLockInfo?.isLocked ? (
          <div className="mt-2.5 p-2.5 rounded-lg bg-sky-950/40 border border-sky-600/40 flex items-center justify-between gap-2 text-xs text-sky-200">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-sky-400 shrink-0 animate-pulse"></span>
              <div className="min-w-0">
                <div className="font-bold text-sky-300 flex items-center gap-1.5 flex-wrap">
                  <span>🔒 {isAr ? 'تم إرسال أمر العقد الحالي (قفل حماية)' : 'Contract Order Active'}</span>
                </div>
                <div className="text-[10px] text-slate-300 mt-0.5 truncate">
                  {isAr
                    ? 'يفتح الروبوت أمر GTC واحد لكل عقد 5 دقائق عند تحرك السعر 150$، وينتقل للعقد الجديد فور بدئه.'
                    : 'Bot places 1 GTC order per 5m contract when price moves $150, then auto-transitions.'}
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
                    ? '⚡ الروبوت يراقب حركة السعر: عند وصول الفارق إلى ≥ 150$ صعوداً أو هبوطاً يضع أمر GTC عند 20%، ويلغيه تلقائياً إذا بقي دقيقة واحدة دون تنفيذ.'
                    : 'التنفيذ التلقائي متوقف حالياً. اضغط الزر أعلاه لتشغيل الروبوت.')
                : (botActive
                    ? '⚡ Bot is monitoring: When price moves ≥ $150 up/down, places GTC @ 20% and cancels at 1 min remaining if unfilled.'
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
                <span>{isAr ? 'تجربة إرسال أمر GTC فوري عند 20% (0.20$):' : 'Test Instant GTC Order @ 20% ($0.20):'}</span>
              </span>
              <span className="text-[10px] text-sky-400 font-mono">GTC Limit</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onTriggerManualTrade('LONG')}
                disabled={isExecuting}
                className="py-2 px-3 rounded-lg font-bold text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <TrendingUp className="w-3.5 h-3.5" />
                <span>{isAr ? 'أمر GTC صعود (UP @ 20%)' : 'GTC BUY UP @ 20%'}</span>
              </button>
              <button
                onClick={() => onTriggerManualTrade('SHORT')}
                disabled={isExecuting}
                className="py-2 px-3 rounded-lg font-bold text-xs bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <TrendingDown className="w-3.5 h-3.5" />
                <span>{isAr ? 'أمر GTC هبوط (DOWN @ 20%)' : 'GTC BUY DOWN @ 20%'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Strategy Conditions & Deviation Monitor */}
      <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/70 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
          <span className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>{isAr ? 'مؤشر مراقبة تحرك الـ 150 دولار عن سعر الأساس:' : '$150 Price Deviation Status:'}</span>
          </span>
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
              isMove150Reached
                ? 'bg-emerald-500 text-slate-950 animate-pulse'
                : 'bg-slate-800 text-slate-300'
            }`}
          >
            {isMove150Reached
              ? (isAr ? `✓ تم الوصول إلى 150$ (${absPriceDiff.toFixed(1)}$)` : `✓ Reached $150 ($${absPriceDiff.toFixed(1)})`)
              : (isAr ? `بانتظار 150$ (${absPriceDiff.toFixed(1)}$ / 150$)` : `Waiting for $150 ($${absPriceDiff.toFixed(1)} / $150)`)}
          </span>
        </div>

        {/* Progress meter to $150 */}
        <div className="space-y-1">
          <div className="flex justify-between text-[11px] font-mono text-slate-400">
            <span>{isAr ? 'التحرك الحالي من سعر الأساس:' : 'Current Deviation:'}</span>
            <span className={`font-bold ${isMove150Reached ? 'text-emerald-400' : 'text-amber-400'}`}>
              {priceDiff >= 0 ? '+' : ''}${priceDiff.toFixed(1)} {isMove150Reached ? '✓' : ''}
            </span>
          </div>
          <div className="w-full bg-slate-900 border border-slate-800 rounded-full h-2.5 overflow-hidden">
            <div
              className={`h-2.5 rounded-full transition-all duration-500 ${
                isMove150Reached
                  ? 'bg-emerald-400 shadow-md shadow-emerald-500/50'
                  : 'bg-amber-400'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, (absPriceDiff / 150) * 100))}%` }}
            ></div>
          </div>
        </div>

        {/* Live Deviation Breakdown Grid */}
        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
          <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 flex flex-col gap-0.5">
            <span className="text-slate-400 text-[10px]">{isAr ? 'سعر الأساس (Open Price):' : 'Base Price (Open):'}</span>
            <span className="text-amber-300 font-bold">${openPrice ? openPrice.toFixed(2) : '---'}</span>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 flex flex-col gap-0.5">
            <span className="text-slate-400 text-[10px]">{isAr ? 'السعر اللحظي (Spot):' : 'Live Spot Price:'}</span>
            <span className="text-slate-100 font-bold">${currentPrice ? currentPrice.toFixed(2) : '---'}</span>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 flex flex-col gap-0.5">
            <span className="text-slate-400 text-[10px]">{isAr ? 'نوع الأمر وسعر التنفيذ:' : 'Order Type & Price:'}</span>
            <span className="text-sky-300 font-bold">GTC @ 20% ($0.20)</span>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 flex flex-col gap-0.5">
            <span className="text-slate-400 text-[10px]">{isAr ? 'شرط الإلغاء:' : 'Cancel Condition:'}</span>
            <span className="text-rose-400 font-bold flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>{isAr ? 'إلغاء عند بقاء 1 دقيقة' : 'Cancel at 1m left'}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
