import React from 'react';
import type { Candle, BollingerBandsValues } from '../bot/types';

interface ChartViewerProps {
  candles: Candle[];
  bb: BollingerBandsValues;
  rsi: number;
  overboughtThreshold: number;
  oversoldThreshold: number;
  signal: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL';
}

export const ChartViewer: React.FC<ChartViewerProps> = ({
  candles,
  bb,
  rsi,
  overboughtThreshold,
  oversoldThreshold,
  signal,
}) => {
  if (!candles || candles.length === 0) {
    return (
      <div className="h-72 flex items-center justify-center bg-slate-900/60 rounded-xl border border-slate-800 text-slate-500 font-mono text-sm">
        لا تتوفر بيانات شموع حالياً
      </div>
    );
  }

  // Display the last 35 candles for readable scale
  const displayCandles = candles.slice(-35);
  const minPrice = Math.min(...displayCandles.map((c) => Math.min(c.low, bb.lower * 0.999)));
  const maxPrice = Math.max(...displayCandles.map((c) => Math.max(c.high, bb.upper * 1.001)));
  const priceRange = Math.max(maxPrice - minPrice, 50);

  const chartHeight = 240;
  const chartWidth = 720;
  const candleSlotWidth = chartWidth / displayCandles.length;
  const candleBodyWidth = Math.max(candleSlotWidth * 0.65, 4);

  const getY = (price: number) => {
    return chartHeight - ((price - minPrice) / priceRange) * (chartHeight - 40) - 20;
  };

  const currentCandle = displayCandles[displayCandles.length - 1];

  return (
    <div className="bg-slate-900/80 rounded-2xl border border-slate-800/80 p-4 shadow-2xl backdrop-blur-md">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white tracking-wide text-sm sm:text-base">البيتكوين مقابل الدولار (BTC/USD)</span>
              <span className="px-2 py-0.5 text-xs font-mono rounded bg-slate-800 text-cyan-400 border border-slate-700">
                إطار 1 دقيقة
              </span>
              <span className="px-2 py-0.5 text-xs rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                بث عقود 15m
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              آخر إغلاق: <span className="text-white font-mono font-semibold">${currentCandle.close.toLocaleString()}</span>
            </p>
          </div>
        </div>

        {/* Indicator summary pills */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300">
            الحد العلوي BB: <span className="font-mono font-bold">${bb.upper.toLocaleString()}</span>
          </div>
          <div className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300">
            المتوسط: <span className="font-mono font-bold">${bb.middle.toLocaleString()}</span>
          </div>
          <div className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
            الحد السفلي BB: <span className="font-mono font-bold">${bb.lower.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Main SVG Candlestick & Bollinger Bands Chart */}
      <div className="relative mt-3 w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full h-56 select-none"
          preserveAspectRatio="none"
        >
          {/* Grid lines */}
          {[0.2, 0.4, 0.6, 0.8].map((ratio, idx) => {
            const y = chartHeight * ratio;
            const price = maxPrice - ratio * priceRange;
            return (
              <g key={idx}>
                <line
                  x1="0"
                  y1={y}
                  x2={chartWidth}
                  y2={y}
                  stroke="#1e293b"
                  strokeDasharray="4 4"
                  strokeWidth="1"
                />
                <text
                  x="8"
                  y={y - 4}
                  fill="#475569"
                  fontSize="9"
                  fontFamily="monospace"
                  textAnchor="start"
                >
                  ${Math.round(price).toLocaleString()}
                </text>
              </g>
            );
          })}

          {/* Upper BB Line */}
          <line
            x1="0"
            y1={getY(bb.upper)}
            x2={chartWidth}
            y2={getY(bb.upper)}
            stroke="#f43f5e"
            strokeWidth="1.5"
            strokeDasharray="3 3"
          />
          <text
            x={chartWidth - 10}
            y={getY(bb.upper) - 4}
            fill="#f43f5e"
            fontSize="9"
            fontWeight="bold"
            fontFamily="'Cairo', sans-serif"
            textAnchor="end"
          >
            الحد العلوي للبولنجر (2σ)
          </text>

          {/* Middle BB Line */}
          <line
            x1="0"
            y1={getY(bb.middle)}
            x2={chartWidth}
            y2={getY(bb.middle)}
            stroke="#64748b"
            strokeWidth="1"
            strokeDasharray="2 2"
          />

          {/* Lower BB Line */}
          <line
            x1="0"
            y1={getY(bb.lower)}
            x2={chartWidth}
            y2={getY(bb.lower)}
            stroke="#10b981"
            strokeWidth="1.5"
            strokeDasharray="3 3"
          />
          <text
            x={chartWidth - 10}
            y={getY(bb.lower) + 12}
            fill="#10b981"
            fontSize="9"
            fontWeight="bold"
            fontFamily="'Cairo', sans-serif"
            textAnchor="end"
          >
            الحد السفلي للبولنجر (2σ)
          </text>

          {/* Candlesticks */}
          {displayCandles.map((candle, idx) => {
            const isGreen = candle.close >= candle.open;
            const x = idx * candleSlotWidth + candleSlotWidth / 2;
            const yHigh = getY(candle.high);
            const yLow = getY(candle.low);
            const yOpen = getY(candle.open);
            const yClose = getY(candle.close);
            const candleTop = Math.min(yOpen, yClose);
            const candleHeight = Math.max(Math.abs(yClose - yOpen), 2);
            const color = isGreen ? '#10b981' : '#f43f5e';

            return (
              <g key={candle.timestamp}>
                {/* Wick */}
                <line
                  x1={x}
                  y1={yHigh}
                  x2={x}
                  y2={yLow}
                  stroke={color}
                  strokeWidth="1.2"
                />
                {/* Body */}
                <rect
                  x={x - candleBodyWidth / 2}
                  y={candleTop}
                  width={candleBodyWidth}
                  height={candleHeight}
                  fill={color}
                  rx="1"
                />
              </g>
            );
          })}

          {/* Current Price Marker */}
          <line
            x1="0"
            y1={getY(currentCandle.close)}
            x2={chartWidth}
            y2={getY(currentCandle.close)}
            stroke="#38bdf8"
            strokeWidth="1.2"
          />
        </svg>

        {/* Floating trigger alert banner */}
        {signal !== 'NEUTRAL' && (
          <div
            className={`absolute top-3 left-3 px-3 py-1.5 rounded-xl border backdrop-blur-md flex items-center gap-2 text-xs font-bold shadow-lg animate-bounce ${
              signal === 'OVERBOUGHT'
                ? 'bg-rose-500/20 border-rose-500/50 text-rose-300'
                : 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
            }`}
          >
            <span>
              {signal === 'OVERBOUGHT'
                ? '⚡ إشارة ذروة شراء حادة (RSI > 85 وكسر الحد العلوي)'
                : '🚀 إشارة ذروة بيع حادة (RSI < 15 وكسر الحد السفلي)'}
            </span>
          </div>
        )}
      </div>

      {/* Sub-Chart: RSI (14) Oscillator Panel */}
      <div className="mt-3 pt-3 border-t border-slate-800/80">
        <div className="flex flex-wrap items-center justify-between text-xs mb-1.5 gap-2">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-semibold">مؤشر القوة النسبية RSI (14):</span>
            <span
              className={`font-mono font-bold text-sm ${
                rsi >= overboughtThreshold
                  ? 'text-rose-400'
                  : rsi <= oversoldThreshold
                  ? 'text-emerald-400'
                  : 'text-cyan-300'
              }`}
            >
              {rsi.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-slate-400">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              مستوى ذروة الشراء: &gt; {overboughtThreshold}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              مستوى ذروة البيع: &lt; {oversoldThreshold}
            </span>
          </div>
        </div>

        {/* RSI Meter Visualizer */}
        <div className="relative h-6 bg-slate-950 rounded-lg overflow-hidden border border-slate-800 flex items-center px-2">
          {/* Overbought zone highlight (>85) */}
          <div
            className="absolute top-0 bottom-0 left-0 bg-rose-500/15 border-r border-rose-500/40"
            style={{ width: `${100 - overboughtThreshold}%` }}
          />
          {/* Oversold zone highlight (<15) */}
          <div
            className="absolute top-0 bottom-0 right-0 bg-emerald-500/15 border-l border-emerald-500/40"
            style={{ width: `${oversoldThreshold}%` }}
          />

          {/* Dynamic Needle */}
          <div
            className="absolute top-0.5 bottom-0.5 w-2 rounded-full transition-all duration-300 -translate-x-1 shadow-md shadow-cyan-500/30 flex items-center justify-center"
            style={{
              right: `${Math.min(Math.max(rsi, 2), 98)}%`,
              backgroundColor:
                rsi >= overboughtThreshold
                  ? '#f43f5e'
                  : rsi <= oversoldThreshold
                  ? '#10b981'
                  : '#38bdf8',
            }}
          />
        </div>
      </div>
    </div>
  );
};
