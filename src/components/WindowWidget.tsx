import React from 'react';
import { Clock, ShieldAlert, Sparkles, CheckCircle2 } from 'lucide-react';
import { ContractWindow } from '../types';

interface WindowWidgetProps {
  window: ContractWindow;
}

export const WindowWidget: React.FC<WindowWidgetProps> = ({ window }) => {
  const totalCycleSeconds = 900; // 15 minutes
  const elapsed = Math.min(Math.max(0, window.elapsedSeconds), totalCycleSeconds);
  const progressPct = (elapsed / totalCycleSeconds) * 100;

  // Golden Window is from 210s (03:30) to 510s (08:30)
  const goldenStartPct = (210 / totalCycleSeconds) * 100; // 23.33%
  const goldenWidthPct = ((510 - 210) / totalCycleSeconds) * 100; // 33.33%

  return (
    <div
      id="contract-window-widget"
      className="bg-[#0a0a0a] border border-[#222] p-5 sm:p-6 flex flex-col justify-between"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1 font-mono font-bold">
            مراقب دورة عقد 15 دقيقة
          </h2>
          <div className="text-xs text-zinc-400 font-mono">
            بوابة النافذة الذهبية: من الدقيقة 03:30 إلى 08:30 (شبكة Base Mainnet)
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div
            id="golden-window-badge"
            className={`px-3 py-1 text-[10px] uppercase font-mono font-bold tracking-wider border transition-all ${
              window.isGoldenWindow
                ? 'bg-[#00ff9d]/10 text-[#00ff9d] border-[#00ff9d]/40'
                : 'bg-[#ff4d4d]/10 text-[#ff4d4d] border-[#ff4d4d]/30'
            }`}
          >
            {window.isGoldenWindow ? '● النافذة الذهبية نشطة' : '○ النافذة مغلقة / بانتظار الدورة'}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center">
        <div className="flex items-end justify-between mb-2">
          <span className="text-4xl sm:text-5xl font-mono font-bold leading-none text-white dir-ltr">
            {window.minuteFormatted.replace('Min ', '').split(' / ')[0]}{' '}
            <span className="text-xl sm:text-2xl text-zinc-600">/ 15:00</span>
          </span>
          <span className="text-xs sm:text-sm text-zinc-400 font-mono">
            {window.isGoldenWindow
              ? `تغلق النافذة خلال ${Math.floor(window.secondsToWindowEnd / 60)} د و ${window.secondsToWindowEnd % 60} ث`
              : `تفتح النافذة القادمة خلال ${Math.floor(window.secondsToWindowStart / 60)} د و ${window.secondsToWindowStart % 60} ث`}
          </span>
        </div>

        {/* Geometric 15M Timeline Bar (kept LTR for time progression) */}
        <div dir="ltr" className="w-full h-8 bg-[#111] border border-[#222] relative overflow-hidden">
          {/* Golden Window Highlight Zone (23.33% to 56.67%) */}
          <div
            className="absolute h-full bg-[#00ff9d]/15 border-x border-[#00ff9d]/40 flex items-center justify-center z-0"
            style={{ left: `${goldenStartPct}%`, width: `${goldenWidthPct}%` }}
          >
            <span className="text-[9px] font-mono uppercase tracking-widest text-[#00ff9d] font-bold hidden sm:inline opacity-80">
              النافذة الذهبية [03:30 - 08:30]
            </span>
          </div>

          {/* Progress fill */}
          <div
            className={`h-full transition-all duration-500 relative z-10 ${
              window.isGoldenWindow ? 'bg-[#00ff9d]' : 'bg-zinc-700/60'
            }`}
            style={{ width: `${progressPct}%` }}
          />

          {/* Vertical white needle */}
          <div
            className="absolute top-0 bottom-0 w-[2px] bg-white z-20 transition-all duration-500"
            style={{ left: `${progressPct}%` }}
          />
        </div>

        <div dir="ltr" className="flex justify-between mt-2 text-[9px] uppercase text-zinc-600 tracking-tight font-bold font-mono">
          <span>00:00 بداية</span>
          <span className="text-[#00ff9d]/80">03:30 بداية الذهبية</span>
          <span className="text-[#00ff9d]/80">08:30 نهاية الذهبية</span>
          <span>15:00 انتهاء الصلاحية</span>
        </div>
      </div>
    </div>
  );
};
