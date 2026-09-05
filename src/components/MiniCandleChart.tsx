import React from 'react';
import { Candle } from '../types';

interface MiniCandleChartProps {
  candles: Candle[];
  openPrice15m: number;
  currentPrice: number;
  zScore: number;
  isZScoreTriggered: boolean;
}

export const MiniCandleChart: React.FC<MiniCandleChartProps> = ({
  candles,
  openPrice15m,
  currentPrice,
  zScore,
  isZScoreTriggered,
}) => {
  if (candles.length < 2) {
    return (
      <div className="h-44 flex items-center justify-center text-xs font-mono text-zinc-500">
        جاري تحميل بث الشموع البيانية اللحظي...
      </div>
    );
  }

  // Use last 40 candles for the visualizer
  const displayCandles = candles.slice(-40);
  const minPrice = Math.min(...displayCandles.map((c) => c.low), openPrice15m * 0.998);
  const maxPrice = Math.max(...displayCandles.map((c) => c.high), openPrice15m * 1.002);
  const priceRange = maxPrice - minPrice || 1;

  const width = 800;
  const height = 180;
  const paddingY = 16;
  const chartHeight = height - paddingY * 2;

  const scaleY = (p: number) => {
    const norm = (p - minPrice) / priceRange;
    return height - paddingY - norm * chartHeight;
  };

  const openPriceY = scaleY(openPrice15m);
  const currentPriceY = scaleY(currentPrice);

  const candleWidth = (width / displayCandles.length) * 0.65;
  const stepX = width / displayCandles.length;

  return (
    <div
      id="mini-candle-chart"
      className="bg-[#0a0a0a] border border-[#222] p-5 sm:p-6 space-y-3"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono">
        <div className="flex items-center gap-2">
          <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono font-bold">
            بث شموع 1 دقيقة (Binance BTC/USDT)
          </h3>
          <span className="text-[10px] text-zinc-600">• حد الذاكرة: 100 شمعة</span>
        </div>
        <div className="flex items-center gap-4 text-[10px] uppercase tracking-tight">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 bg-blue-500 inline-block" />
            <span className="text-zinc-400">افتتاح 15M (${openPrice15m.toFixed(1)})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 bg-[#00ff9d] inline-block" />
            <span className="text-zinc-400">السعر الفوري (${currentPrice.toFixed(1)})</span>
          </div>
        </div>
      </div>

      <div dir="ltr" className="relative w-full overflow-hidden bg-[#111] border border-[#222]">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-44 select-none"
          preserveAspectRatio="none"
        >
          {/* Horizontal gridlines */}
          <line
            x1="0"
            y1={openPriceY}
            x2={width}
            y2={openPriceY}
            stroke="#3b82f6"
            strokeWidth="1.2"
            strokeDasharray="4 4"
            opacity="0.75"
          />

          {/* Render Candles */}
          {displayCandles.map((c, i) => {
            const x = i * stepX + stepX / 2;
            const openY = scaleY(c.open);
            const closeY = scaleY(c.close);
            const highY = scaleY(c.high);
            const lowY = scaleY(c.low);

            const isUp = c.close >= c.open;
            const bodyTop = Math.min(openY, closeY);
            const bodyHeight = Math.max(2, Math.abs(closeY - openY));
            const color = isUp ? '#00ff9d' : '#ff4d4d';

            return (
              <g key={c.time} className="transition-all">
                {/* Wick */}
                <line
                  x1={x}
                  y1={highY}
                  x2={x}
                  y2={lowY}
                  stroke={color}
                  strokeWidth="1"
                  opacity="0.75"
                />
                {/* Body */}
                <rect
                  x={x - candleWidth / 2}
                  y={bodyTop}
                  width={candleWidth}
                  height={bodyHeight}
                  fill={color}
                  opacity="0.9"
                />
              </g>
            );
          })}

          {/* Current live price line */}
          <line
            x1="0"
            y1={currentPriceY}
            x2={width}
            y2={currentPriceY}
            stroke={isZScoreTriggered ? '#00ff9d' : '#00ff9d'}
            strokeWidth="1.2"
            strokeDasharray="2 2"
            opacity="0.9"
          />
        </svg>

        {/* Floating Price Tags */}
        <div
          className="absolute right-2 font-mono text-[10px] px-2 py-0.5 bg-[#1a1a1a] border border-[#333] text-blue-400"
          style={{ top: `${(openPriceY / height) * 100}%`, transform: 'translateY(-50%)' }}
        >
          افتتاح 15M: ${openPrice15m.toFixed(1)}
        </div>

        <div
          className={`absolute left-2 font-mono text-[10px] px-2 py-0.5 border font-bold ${
            isZScoreTriggered
              ? 'bg-[#00ff9d]/20 border-[#00ff9d] text-[#00ff9d]'
              : 'bg-[#1a1a1a] border-[#333] text-white'
          }`}
          style={{ top: `${(currentPriceY / height) * 100}%`, transform: 'translateY(-50%)' }}
        >
          BTC: ${currentPrice.toFixed(1)} ({zScore >= 0 ? '+' : ''}{zScore}σ)
        </div>
      </div>
    </div>
  );
};
