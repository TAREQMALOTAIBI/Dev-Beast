import React from 'react';
import type { Candle, BollingerBandsValues, AdxInfo, RsiDivergenceInfo } from '../bot/types';
import { Activity, Compass, Zap, ShieldAlert, CheckCircle2, AlertTriangle } from 'lucide-react';

interface ChartViewerProps {
  candles: Candle[];
  bb: BollingerBandsValues;
  rsi: number;
  overboughtThreshold: number;
  oversoldThreshold: number;
  signal: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL';
  zScore?: number;
  mean?: number;
  stdDev?: number;
  adx?: AdxInfo;
  rsiDivergence?: RsiDivergenceInfo;
}

export const ChartViewer: React.FC<ChartViewerProps> = ({
  candles,
  bb,
  rsi,
  overboughtThreshold,
  oversoldThreshold,
  signal,
  zScore = 0,
  mean,
  stdDev,
  adx,
  rsiDivergence,
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

  // ADX values fallback
  const adxVal = adx?.adx ?? 22.0;
  const isAdxRanging = adx ? adx.isFavorableForMeanReversion : adxVal <= 28;

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
                إطار 1 دقيقة (1m)
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
            المتوسط (30m): <span className="font-mono font-bold">${bb.middle.toLocaleString()}</span>
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
              <g key={`${candle.timestamp}-${idx}`}>
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
                ? '⚡ إشارة ارتداد هابط (Z >= +2.00) - شراء عقد NO'
                : '🚀 إشارة ارتداد صاعد (Z <= -2.00) - شراء عقد YES'}
            </span>
          </div>
        )}
      </div>

      {/* لوحة المؤشرات التأكيدية الثلاثة (Z-Score + ADX 14 + RSI Divergence) */}
      <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-3">
        {/* 1. مؤشر Z-Score (Lookback 30 candles) */}
        <div>
          <div className="flex flex-wrap items-center justify-between text-xs mb-1.5 gap-2">
            <div className="flex items-center gap-2">
              <span className="text-white font-bold flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-cyan-400" />
                مؤشر Z-Score (فريم 1m • نافذة 30 شمعة • العتبة ±2.00):
              </span>
              <span
                dir="ltr"
                className={`font-mono font-bold text-sm px-2 py-0.5 rounded ${
                  zScore >= 2.0
                    ? 'bg-rose-950 text-rose-400 border border-rose-500/40 animate-pulse'
                    : zScore <= -2.0
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/40 animate-pulse'
                    : 'bg-slate-900 text-cyan-300 border border-slate-700'
                }`}
              >
                {zScore > 0 ? '+' : ''}{zScore.toFixed(3)}
              </span>
              {mean && (
                <span className="text-[11px] text-slate-400 font-mono hidden sm:inline" dir="ltr">
                  (المتوسط: ${mean.toLocaleString()} | الانحراف: ${stdDev})
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-[11px] text-slate-400">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                إشارة هبوط (شراء NO): &ge; +2.00
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                إشارة صعود (شراء YES): &le; -2.00
              </span>
            </div>
          </div>

          {/* Z-Score Meter Visualizer (-3.0 to +3.0) */}
          <div className="relative h-6 bg-slate-950 rounded-lg overflow-hidden border border-slate-800 flex items-center px-2">
            {/* Neutral center guide (0) */}
            <div className="absolute top-0 bottom-0 left-1/2 w-px bg-slate-700 z-0" />
            
            {/* Bullish oversold zone (<= -2.0) on left */}
            <div
              className="absolute top-0 bottom-0 left-0 bg-emerald-500/20 border-r border-emerald-500/50"
              style={{ width: '16.67%' }}
              title="منطقة إشارة الصعود (Z <= -2.00)"
            />
            {/* Bearish overbought zone (>= +2.0) on right */}
            <div
              className="absolute top-0 bottom-0 right-0 bg-rose-500/20 border-l border-rose-500/50"
              style={{ width: '16.67%' }}
              title="منطقة إشارة الهبوط (Z >= +2.00)"
            />

            {/* Dynamic Z-Score Needle */}
            {(() => {
              const clampedZ = Math.min(Math.max(zScore, -3.0), 3.0);
              const percent = ((clampedZ + 3.0) / 6.0) * 100;
              return (
                <div
                  className="absolute top-0.5 bottom-0.5 w-3 rounded-full transition-all duration-300 -translate-x-1.5 shadow-md flex items-center justify-center z-10"
                  style={{
                    left: `${percent}%`,
                    backgroundColor:
                      zScore >= 2.0
                        ? '#f43f5e'
                        : zScore <= -2.0
                        ? '#10b981'
                        : '#38bdf8',
                  }}
                />
              );
            })()}
          </div>
        </div>

        {/* 2. مؤشرا التأكيد الإضافيان المتطابقان مع إعداداتك: ADX (14) و RSI Divergence */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
          {/* كرت مؤشر ADX (Average Directional Index) */}
          <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5">
                <Compass className="w-4 h-4 text-amber-400" />
                <span className="font-bold text-xs text-white">فلتر نظام السوق (ADX 14):</span>
                <span className="font-mono text-xs font-bold text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30">
                  {adxVal}
                </span>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  isAdxRanging
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                    : 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                }`}
              >
                {isAdxRanging ? '✅ سوق عرضي ملائم (≤ 28)' : '⚡ اتجاه كاسح (> 28)'}
              </span>
            </div>

            {/* ADX mini visual progress */}
            <div className="space-y-1">
              <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden flex">
                {/* Ranging region (0 to 28 = 56%) */}
                <div
                  className="h-full bg-emerald-500/30 border-r border-emerald-500/60"
                  style={{ width: '56%' }}
                  title="نطاق التذبذب العرضي المناسب للارتداد (ADX <= 28)"
                />
                {/* Trending region (28 to 50 = 44%) */}
                <div
                  className="h-full bg-amber-500/30"
                  style={{ width: '44%' }}
                  title="نطاق الاتجاه القوي (ADX > 28)"
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span>0 (ركود تام)</span>
                <span className="text-emerald-400 font-mono font-semibold">28 (عتبة الارتداد المثالي)</span>
                <span>50+ (ترند عنيف)</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 mt-2 leading-tight">
              {adx?.descriptionArabic || (isAdxRanging
                ? 'السوق في تذبذب عرضي، مما يرفع احتمالية نجاح ارتداد السعر إلى المتوسط بشكل كبير.'
                : 'السوق في ترند اتجاهي قوي، يشترط الروبوت وجود دايفرجنس لتأكيد الارتداد ومنع الدخول المعاكس.')}
            </p>
          </div>

          {/* كرت انفراج مؤشر القوة النسبية (RSI Divergence) */}
          <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-cyan-400" />
                <span className="font-bold text-xs text-white">انفراج RSI (Divergence):</span>
                <span className="font-mono text-xs text-slate-300 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
                  RSI: {rsi}
                </span>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                  rsiDivergence?.detected && rsiDivergence.type === 'BULLISH'
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 animate-pulse'
                    : rsiDivergence?.detected && rsiDivergence.type === 'BEARISH'
                    ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 animate-pulse'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                {rsiDivergence?.detected && rsiDivergence.type === 'BULLISH' ? (
                  <>🟢 دايفرجنس صاعد مؤكد (YES)</>
                ) : rsiDivergence?.detected && rsiDivergence.type === 'BEARISH' ? (
                  <>🔴 دايفرجنس هابط مؤكد (NO)</>
                ) : (
                  <>⚪ لا يوجد انفراج (زخم متطابق)</>
                )}
              </span>
            </div>

            {/* RSI Meter Visualizer */}
            <div className="space-y-1">
              <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden relative">
                {/* Oversold zone (0 to 30) */}
                <div className="absolute top-0 bottom-0 left-0 bg-emerald-500/30" style={{ width: '30%' }} />
                {/* Overbought zone (70 to 100) */}
                <div className="absolute top-0 bottom-0 right-0 bg-rose-500/30" style={{ width: '30%' }} />
                {/* RSI Indicator Pin */}
                <div
                  className="absolute top-0 bottom-0 w-2 bg-cyan-400 rounded-full shadow"
                  style={{ left: `${Math.min(Math.max(rsi, 0), 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span className="text-emerald-400 font-mono">30 (تشبع بيع)</span>
                <span className="text-slate-400 font-mono font-semibold">50 (حياد)</span>
                <span className="text-rose-400 font-mono">70 (تشبع شراء)</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 mt-2 leading-tight">
              {rsiDivergence?.descriptionArabic ||
                'يقارن الروبوت قمم وقيعان السعر مع قمم وقيعان RSI لرصد ضعف الزخم واستباق الانعكاس بدقة.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
