import React, { useMemo, useState } from 'react';
import { CandleData, ZScoreMetric } from '../types/bot';
import { formatPrice } from '../utils/math';

interface TerminalChartProps {
  candles: CandleData[];
  metrics: ZScoreMetric[];
  symbol: string;
  timeframe: string;
  periods: number;
  upperThreshold: number;
  entryThreshold: number;
}

export const TerminalChart: React.FC<TerminalChartProps> = ({
  candles,
  metrics,
  symbol,
  timeframe,
  periods,
  upperThreshold,
  entryThreshold,
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Compute slice to render (show last 40-50 candles for clean density)
  const displayCount = Math.min(candles.length, 45);
  const visibleCandles = useMemo(() => candles.slice(-displayCount), [candles, displayCount]);
  const visibleMetrics = useMemo(() => metrics.slice(-displayCount), [metrics, displayCount]);

  // Dimensions
  const width = 860;
  const candleHeight = 260;
  const zScoreHeight = 130;
  const padding = { top: 20, right: 70, bottom: 25, left: 16 };

  // Price Extents
  const { minPrice, maxPrice } = useMemo(() => {
    if (visibleCandles.length === 0) return { minPrice: 0, maxPrice: 100 };
    let min = Infinity;
    let max = -Infinity;

    visibleCandles.forEach((c) => {
      if (c.low < min) min = c.low;
      if (c.high > max) max = c.high;
    });

    visibleMetrics.forEach((m) => {
      if (m.upperBand > max) max = m.upperBand;
      if (m.lowerBand < min) min = m.lowerBand;
    });

    const buffer = (max - min) * 0.08 || 1;
    return { minPrice: min - buffer, maxPrice: max + buffer };
  }, [visibleCandles, visibleMetrics]);

  // Coordinate scales
  const chartWidth = width - padding.left - padding.right;
  const candleY = (val: number) => {
    return candleHeight - padding.bottom - ((val - minPrice) / (maxPrice - minPrice || 1)) * (candleHeight - padding.top - padding.bottom);
  };

  const candleX = (idx: number) => {
    const step = chartWidth / (visibleCandles.length || 1);
    return padding.left + idx * step + step / 2;
  };

  // Z-Score scale (-3.0 to +3.0)
  const zMin = -3.0;
  const zMax = 3.0;
  const zY = (val: number) => {
    const clamped = Math.max(zMin, Math.min(zMax, val));
    return zScoreHeight - 20 - ((clamped - zMin) / (zMax - zMin)) * (zScoreHeight - 35);
  };

  // SVG Paths for Mean, Upper Band, Entry Band, and Lower Band
  const meanPath = useMemo(() => {
    return visibleMetrics
      .map((m, i) => {
        const x = candleX(i);
        const y = candleY(m.mean);
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  }, [visibleMetrics, candleX, candleY]);

  const upperBandPath = useMemo(() => {
    return visibleMetrics
      .map((m, i) => {
        const x = candleX(i);
        const y = candleY(m.upperBand);
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  }, [visibleMetrics, candleX, candleY]);

  const entryBandPath = useMemo(() => {
    return visibleMetrics
      .map((m, i) => {
        const x = candleX(i);
        const y = candleY(m.entryBand);
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  }, [visibleMetrics, candleX, candleY]);

  // Z-Score line
  const zScorePath = useMemo(() => {
    return visibleMetrics
      .map((m, i) => {
        const x = candleX(i);
        const y = zY(m.zScore);
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  }, [visibleMetrics, candleX, zY]);

  const hoveredCandle = hoverIndex !== null ? visibleCandles[hoverIndex] : visibleCandles[visibleCandles.length - 1];
  const hoveredMetric = hoverIndex !== null ? visibleMetrics[hoverIndex] : visibleMetrics[visibleMetrics.length - 1];

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/90 backdrop-blur-sm overflow-hidden flex flex-col">
      {/* Top Header / Meta Bar */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-800 px-4 py-3 bg-slate-950/40 text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-100 text-sm tracking-wide">{symbol}</span>
            <span className="text-slate-400 font-mono">{timeframe}</span>
          </div>
          <span className="text-slate-600">·</span>
          <div className="text-slate-400">
            Z-Score Window: <span className="font-mono text-slate-200">{periods} Periods</span>
          </div>
        </div>

        {/* Hover Readouts */}
        {hoveredCandle && (
          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="text-slate-400">
              O: <span className="text-slate-200">{formatPrice(hoveredCandle.open)}</span>
            </span>
            <span className="text-slate-400">
              H: <span className="text-slate-200">{formatPrice(hoveredCandle.high)}</span>
            </span>
            <span className="text-slate-400">
              L: <span className="text-slate-200">{formatPrice(hoveredCandle.low)}</span>
            </span>
            <span className="text-slate-400">
              C:{' '}
              <span className={hoveredCandle.close >= hoveredCandle.open ? 'text-emerald-400' : 'text-rose-400'}>
                {formatPrice(hoveredCandle.close)}
              </span>
            </span>
            {hoveredMetric && (
              <span className="text-slate-300 bg-slate-800/80 px-2 py-0.5 rounded">
                Z: <span className="text-sky-300 font-bold">{hoveredMetric.zScore.toFixed(2)}σ</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* SVG Canvas Area */}
      <div className="relative w-full overflow-x-auto select-none bg-slate-950/60 p-2">
        <svg
          viewBox={`0 0 ${width} ${candleHeight + zScoreHeight}`}
          className="w-full h-auto block"
          onMouseLeave={() => setHoverIndex(null)}
        >
          <defs>
            {/* Grid Line Pattern */}
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="1" />
            </pattern>
            {/* Gradient for Z-Score Fill */}
            <linearGradient id="zFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Background Grid */}
          <rect width={width} height={candleHeight + zScoreHeight} fill="url(#grid)" />

          {/* ================= PANE 1: CANDLESTICK & STATISTICAL BANDS ================= */}
          {/* Price Horizontal Grid & Labels */}
          {[0.2, 0.5, 0.8].map((ratio, i) => {
            const priceVal = minPrice + ratio * (maxPrice - minPrice);
            const y = candleY(priceVal);
            return (
              <g key={i}>
                <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                <text x={width - padding.right + 8} y={y + 4} fill="#64748b" fontSize="10" fontFamily="JetBrains Mono, monospace">
                  {formatPrice(priceVal)}
                </text>
              </g>
            );
          })}

          {/* Upper Threshold Band (Red/Orange dashed line) */}
          <path d={upperBandPath} fill="none" stroke="#f43f5e" strokeWidth="1.2" strokeDasharray="4 3" opacity="0.8" />
          {/* Entry Threshold Band (Amber line) */}
          <path d={entryBandPath} fill="none" stroke="#f59e0b" strokeWidth="1" strokeDasharray="2 2" opacity="0.85" />
          {/* Mean Line (Sky blue line) */}
          <path d={meanPath} fill="none" stroke="#38bdf8" strokeWidth="1.5" opacity="0.9" />

          {/* Candlesticks */}
          {visibleCandles.map((c, i) => {
            const x = candleX(i);
            const isBullish = c.close >= c.open;
            const candleColor = isBullish ? '#10b981' : '#f43f5e';
            const yHigh = candleY(c.high);
            const yLow = candleY(c.low);
            const yOpen = candleY(c.open);
            const yClose = candleY(c.close);
            const bodyTop = Math.min(yOpen, yClose);
            const bodyHeight = Math.max(Math.abs(yClose - yOpen), 1.5);
            const step = chartWidth / visibleCandles.length;
            const bodyWidth = Math.max(step * 0.65, 3);

            const metric = visibleMetrics[i];
            const isEntrySignal = metric?.signal === 'ENTRY';
            const isArmed = metric?.signal === 'ARMED';

            return (
              <g
                key={c.time}
                onMouseEnter={() => setHoverIndex(i)}
                className="cursor-crosshair transition-opacity"
              >
                {/* Wick */}
                <line x1={x} y1={yHigh} x2={x} y2={yLow} stroke={candleColor} strokeWidth="1.2" />
                {/* Candle Body */}
                <rect
                  x={x - bodyWidth / 2}
                  y={bodyTop}
                  width={bodyWidth}
                  height={bodyHeight}
                  fill={candleColor}
                  rx="1"
                />

                {/* Entry Signal Marker */}
                {isEntrySignal && (
                  <g>
                    <circle cx={x} cy={yHigh - 12} r="5" fill="#f59e0b" className="animate-pulse" />
                    <text x={x} y={yHigh - 20} fill="#f59e0b" fontSize="9" fontWeight="bold" textAnchor="middle">
                      BUY
                    </text>
                  </g>
                )}

                {/* Armed state alert marker */}
                {isArmed && !isEntrySignal && (
                  <circle cx={x} cy={yHigh - 8} r="3" fill="#f43f5e" opacity="0.8" />
                )}
              </g>
            );
          })}

          {/* Pane Divider */}
          <line
            x1={padding.left}
            y1={candleHeight}
            x2={width - padding.right}
            y2={candleHeight}
            stroke="#1e293b"
            strokeWidth="1.5"
          />

          {/* ================= PANE 2: Z-SCORE OSCILLATOR ================= */}
          <g transform={`translate(0, ${candleHeight})`}>
            {/* Title / Indicator Label */}
            <text x={padding.left} y={16} fill="#94a3b8" fontSize="11" fontWeight="600">
              14-PERIOD Z-SCORE OSCILLATOR (σ)
            </text>

            {/* Upper Bound Line (+2.0σ) */}
            <line
              x1={padding.left}
              y1={zY(upperThreshold)}
              x2={width - padding.right}
              y2={zY(upperThreshold)}
              stroke="#f43f5e"
              strokeWidth="1"
              strokeDasharray="4 2"
              opacity="0.8"
            />
            <text x={width - padding.right + 8} y={zY(upperThreshold) + 3} fill="#f43f5e" fontSize="9" fontFamily="JetBrains Mono, monospace">
              +{upperThreshold.toFixed(1)}σ (Arm)
            </text>

            {/* Entry Threshold Line (+1.90σ) */}
            <line
              x1={padding.left}
              y1={zY(entryThreshold)}
              x2={width - padding.right}
              y2={zY(entryThreshold)}
              stroke="#f59e0b"
              strokeWidth="1"
              strokeDasharray="2 2"
              opacity="0.9"
            />
            <text x={width - padding.right + 8} y={zY(entryThreshold) + 3} fill="#f59e0b" fontSize="9" fontFamily="JetBrains Mono, monospace">
              +{entryThreshold.toFixed(2)}σ (Trigger)
            </text>

            {/* Zero Baseline */}
            <line
              x1={padding.left}
              y1={zY(0)}
              x2={width - padding.right}
              y2={zY(0)}
              stroke="#475569"
              strokeWidth="1"
              opacity="0.5"
            />
            <text x={width - padding.right + 8} y={zY(0) + 3} fill="#64748b" fontSize="9" fontFamily="JetBrains Mono, monospace">
              0.0σ
            </text>

            {/* Lower Bound Line (-2.0σ) */}
            <line
              x1={padding.left}
              y1={zY(-upperThreshold)}
              x2={width - padding.right}
              y2={zY(-upperThreshold)}
              stroke="#10b981"
              strokeWidth="1"
              strokeDasharray="4 2"
              opacity="0.6"
            />
            <text x={width - padding.right + 8} y={zY(-upperThreshold) + 3} fill="#10b981" fontSize="9" fontFamily="JetBrains Mono, monospace">
              -{upperThreshold.toFixed(1)}σ
            </text>

            {/* Z-Score Curve */}
            <path d={zScorePath} fill="none" stroke="#38bdf8" strokeWidth="2" />

            {/* Active Points */}
            {visibleMetrics.map((m, i) => {
              const x = candleX(i);
              const y = zY(m.zScore);
              const isOver = m.zScore >= upperThreshold;
              const isTrigger = m.signal === 'ENTRY';

              return (
                <g key={i}>
                  {isTrigger ? (
                    <circle cx={x} cy={y} r="5" fill="#f59e0b" stroke="#fff" strokeWidth="1.5" />
                  ) : isOver ? (
                    <circle cx={x} cy={y} r="3.5" fill="#f43f5e" />
                  ) : null}
                </g>
              );
            })}
          </g>

          {/* Hover Crosshair vertical bar */}
          {hoverIndex !== null && (
            <g>
              <line
                x1={candleX(hoverIndex)}
                y1={padding.top}
                x2={candleX(hoverIndex)}
                y2={candleHeight + zScoreHeight - 15}
                stroke="#94a3b8"
                strokeWidth="1"
                strokeDasharray="3 3"
                opacity="0.6"
              />
            </g>
          )}
        </svg>
      </div>

      {/* Legend & Status */}
      <div className="flex flex-wrap items-center justify-between px-4 py-2 bg-slate-950/70 border-t border-slate-800 text-[11px] text-slate-400">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-sky-400 inline-block"></span>
            <span>14-SMA (Mean)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-rose-500 inline-block border-b border-dashed border-rose-500"></span>
            <span>+2.0σ Upper Arm</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-amber-400 inline-block border-b border-dashed border-amber-400"></span>
            <span>+1.90σ Entry Trigger</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-emerald-500 inline-block"></span>
            <span>-2.0σ Lower</span>
          </div>
        </div>
        <div className="text-slate-500 font-mono">
          Updated on 15m candle close · Mean Reversion
        </div>
      </div>
    </div>
  );
};
