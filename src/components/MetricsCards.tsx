import React from 'react';
import {
  TrendingUp,
  TrendingDown,
  Gauge,
  Zap,
  Flame,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import { QuantMetrics } from '../types';

interface MetricsCardsProps {
  metrics: QuantMetrics;
}

export const MetricsCards: React.FC<MetricsCardsProps> = ({ metrics }) => {
  const priceDistance = metrics.currentPrice - metrics.openPrice15m;
  const isPositiveDistance = priceDistance >= 0;

  return (
    <div className="space-y-3">
      {/* 4 Quantitative Metric Cards Grid with 1px geometric grid lines */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-[#222] border border-[#222]">
        {/* Card 1: BTC Live Price */}
        <div
          id="metric-card-btc-price"
          className="bg-[#0a0a0a] p-5 sm:p-6 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono font-bold">
                سعر بيتكوين الفوري (بينانس)
              </h3>
              <span className="text-[10px] font-mono text-zinc-400">بث مباشر 1M</span>
            </div>
            <div className="text-3xl sm:text-4xl font-mono font-bold text-white mt-2">
              ${metrics.currentPrice.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#222] flex items-center justify-between text-xs">
            <span className="text-zinc-500 font-mono text-[10px]">
              افتتاح دورة 15M:
            </span>
            <div className="flex items-center gap-1.5 font-mono">
              <span className="text-zinc-300 font-medium">
                ${metrics.openPrice15m.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
              <span
                className={`text-[10px] font-bold ${
                  isPositiveDistance ? 'text-[#00ff9d]' : 'text-[#ff4d4d]'
                }`}
              >
                ({isPositiveDistance ? '+' : ''}${priceDistance.toFixed(1)})
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Rolling Z-Score (Price Anomaly) */}
        <div
          id="metric-card-z-score"
          className="bg-[#0a0a0a] p-5 sm:p-6 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono font-bold">
                مقياس Z-Score (إغلاق 20 فترة)
              </h3>
              <span
                className={`text-[9px] font-mono px-1.5 py-0.5 border font-bold tracking-wider ${
                  metrics.isZScoreTriggered
                    ? 'bg-[#00ff9d]/20 border-[#00ff9d]/40 text-[#00ff9d]'
                    : 'bg-[#111] border-[#222] text-zinc-500'
                }`}
              >
                {metrics.isZScoreTriggered ? 'مستوفى' : 'طبيعي'}
              </span>
            </div>

            <div className="text-3xl sm:text-4xl font-mono font-bold mt-2">
              <span
                className={
                  metrics.isZScoreTriggered
                    ? 'text-[#00ff9d]'
                    : metrics.zScore >= 0
                    ? 'text-white'
                    : 'text-[#ff4d4d]'
                }
              >
                {metrics.zScore >= 0 ? '+' : ''}
                {metrics.zScore.toFixed(2)}σ
              </span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#222] flex items-center justify-between text-xs">
            <span className="text-zinc-500 font-mono text-[10px]">
              قاعدة العتبة:
            </span>
            <span className="font-mono text-zinc-300 font-bold text-[11px]">
              |Z| ≥ {metrics.zScoreThreshold.toFixed(1)}σ
            </span>
          </div>
        </div>

        {/* Card 3: Momentum Delta (Absolute Volatility Gate) */}
        <div
          id="metric-card-momentum-delta"
          className="bg-[#0a0a0a] p-5 sm:p-6 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono font-bold">
                فارق الزخم السعري (|Δ|)
              </h3>
              <span
                className={`text-[9px] font-mono px-1.5 py-0.5 border font-bold tracking-wider ${
                  metrics.isMomentumTriggered
                    ? 'bg-[#00ff9d]/20 border-[#00ff9d]/40 text-[#00ff9d]'
                    : 'bg-[#111] border-[#222] text-zinc-500'
                }`}
              >
                {metrics.isMomentumTriggered ? 'البوابة مفتوحة' : 'مقفلة'}
              </span>
            </div>

            <div className="text-3xl sm:text-4xl font-mono font-bold mt-2">
              <span className={metrics.isMomentumTriggered ? 'text-[#00ff9d]' : 'text-white'}>
                ${metrics.momentumDelta.toFixed(1)}
              </span>
              <span className="text-xs text-zinc-500 font-mono mr-1">USD</span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#222] flex items-center justify-between text-xs">
            <span className="text-zinc-500 font-mono text-[10px]">
              بوابة التقلب:
            </span>
            <span className="font-mono text-zinc-300 font-bold text-[11px]">
              |P - P_open| ≥ ${metrics.momentumThreshold.toFixed(1)}
            </span>
          </div>
        </div>

        {/* Card 4: Open Interest Drop (Liquidation Flush) */}
        <div
          id="metric-card-oi-drop"
          className="bg-[#0a0a0a] p-5 sm:p-6 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono font-bold">
                تصفيات الفائدة المفتوحة (OI 1m)
              </h3>
              <span
                className={`text-[9px] font-mono px-1.5 py-0.5 border font-bold tracking-wider ${
                  metrics.isOiDropTriggered
                    ? 'bg-[#ff4d4d]/20 border-[#ff4d4d]/40 text-[#ff4d4d]'
                    : 'bg-[#111] border-[#222] text-zinc-500'
                }`}
              >
                {metrics.isOiDropTriggered ? 'رصد تصفية' : 'طبيعي'}
              </span>
            </div>

            <div className="text-3xl sm:text-4xl font-mono font-bold mt-2 flex items-baseline justify-between">
              <span
                className={
                  metrics.isOiDropTriggered
                    ? 'text-[#ff4d4d]'
                    : metrics.oiDropPct > 0
                    ? 'text-zinc-300'
                    : 'text-zinc-400'
                }
              >
                {metrics.oiDropPct > 0 ? '-' : '+'}
                {Math.abs(metrics.oiDropPct).toFixed(2)}%
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">
                OI: {Math.round(metrics.openInterest).toLocaleString()}
              </span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#222] flex items-center justify-between text-xs">
            <span className="text-zinc-500 font-mono text-[10px]">
              عتبة التصفية:
            </span>
            <span className="font-mono text-zinc-300 font-bold text-[11px]">
              هبوط ≥ {metrics.oiDropThreshold.toFixed(1)}% / 1m
            </span>
          </div>
        </div>
      </div>

      {/* MASTER TRIGGER RULE STATUS BANNER */}
      <div
        id="master-trigger-status-banner"
        className={`border p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 ${
          metrics.isAllTriggered
            ? 'bg-[#00ff9d]/10 border-[#00ff9d]/50'
            : 'bg-[#0a0a0a] border-[#222]'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-3 h-3 rounded-full shrink-0 ${
              metrics.isAllTriggered
                ? 'bg-[#00ff9d] shadow-[0_0_8px_#00ff9d]'
                : 'bg-zinc-700'
            }`}
          />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold tracking-wider text-zinc-400">
                المشغّل الكمي الرئيسي:
              </span>
              <span
                className={`text-xs font-mono font-bold px-2 py-0.5 border ${
                  metrics.isAllTriggered
                    ? 'bg-[#00ff9d] text-black border-[#00ff9d]'
                    : 'bg-[#111] text-zinc-400 border-[#222]'
                }`}
              >
                {metrics.isAllTriggered ? 'تم استيفاء الشروط الثلاثة بالتزامن' : 'بانتظار تطابق الشروط الثلاثة'}
              </span>
            </div>
            <p className="text-[11px] font-mono text-zinc-500 mt-1">
              يتم التقييم بدقة عند إغلاق شمعة الدقيقة: انحراف Z-Score + بوابة التقلب + تصفية الفائدة المفتوحة.
            </p>
          </div>
        </div>

        {/* 3 Indicators Pill Stack */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono self-stretch md:self-auto justify-between md:justify-end">
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 border text-[11px] ${
              metrics.isZScoreTriggered
                ? 'bg-[#00ff9d]/10 border-[#00ff9d]/40 text-[#00ff9d] font-bold'
                : 'bg-[#111] border-[#222] text-zinc-500'
            }`}
          >
            <span>{metrics.isZScoreTriggered ? '●' : '○'} |Z| ≥ {metrics.zScoreThreshold}σ</span>
          </div>

          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 border text-[11px] ${
              metrics.isMomentumTriggered
                ? 'bg-[#00ff9d]/10 border-[#00ff9d]/40 text-[#00ff9d] font-bold'
                : 'bg-[#111] border-[#222] text-zinc-500'
            }`}
          >
            <span>{metrics.isMomentumTriggered ? '●' : '○'} |Δ| ≥ ${metrics.momentumThreshold}</span>
          </div>

          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 border text-[11px] ${
              metrics.isOiDropTriggered
                ? 'bg-[#ff4d4d]/15 border-[#ff4d4d]/40 text-[#ff4d4d] font-bold'
                : 'bg-[#111] border-[#222] text-zinc-500'
            }`}
          >
            <span>{metrics.isOiDropTriggered ? '●' : '○'} تصفية OI ≥ {metrics.oiDropThreshold}%</span>
          </div>
        </div>
      </div>
    </div>
  );
};
