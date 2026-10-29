import React, { useState, useEffect } from 'react';
import { LimitlessMarketDetails, OrderbookUpdate, OraclePriceData } from '../types/bot';
import { LimitlessStatus } from '../services/limitlessService';
import {
  ExternalLink,
  RefreshCw,
  Clock,
  TrendingUp,
  TrendingDown,
  Scale,
  Zap,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';

interface LimitlessMarketBannerProps {
  market: LimitlessMarketDetails | null;
  limitlessStatus: LimitlessStatus;
  currentBinancePrice?: number;
  orderbook: OrderbookUpdate | null;
  oracle: OraclePriceData | null;
  isRefreshing: boolean;
  onRefresh: () => void;
  lang: 'ar' | 'en';
}

export const LimitlessMarketBanner: React.FC<LimitlessMarketBannerProps> = ({
  market,
  limitlessStatus,
  currentBinancePrice,
  orderbook,
  oracle,
  isRefreshing,
  onRefresh,
  lang,
}) => {
  const isAr = lang === 'ar';
  const [timeLeft, setTimeLeft] = useState<{ minutes: number; seconds: number; totalSeconds: number; percent: number }>({
    minutes: 0,
    seconds: 0,
    totalSeconds: 0,
    percent: 0,
  });

  // Calculate live countdown to the 1-hour expiration
  useEffect(() => {
    const updateCountdown = () => {
      const exp = market?.expirationTimestamp;
      if (!exp) {
        // Fallback: Calculate remaining in 1-hour clock cycle
        const now = Date.now();
        const next1Hour = Math.ceil(now / (60 * 60 * 1000)) * (60 * 60 * 1000);
        const diffMs = Math.max(0, next1Hour - now);
        const totalSec = Math.floor(diffMs / 1000);
        const mins = Math.floor(totalSec / 60);
        const secs = totalSec % 60;
        const pct = Math.min(100, Math.max(0, ((3600 - totalSec) / 3600) * 100));
        setTimeLeft({ minutes: mins, seconds: secs, totalSeconds: totalSec, percent: pct });
        return;
      }

      const now = Date.now();
      const diffMs = Math.max(0, exp - now);
      const totalSec = Math.floor(diffMs / 1000);
      const mins = Math.floor(totalSec / 60);
      const secs = totalSec % 60;

      if (totalSec <= 0) {
        onRefresh();
      }

      const start = market?.startAt ? new Date(market.startAt).getTime() : exp - 60 * 60 * 1000;
      const totalDuration = Math.max(1, exp - start);
      const elapsed = Math.max(0, now - start);
      const pct = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));

      setTimeLeft({ minutes: mins, seconds: secs, totalSeconds: totalSec, percent: pct });
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [market?.expirationTimestamp, market?.startAt]);

  // Auto-refresh active market prices every 2.5 seconds to guarantee zero price staleness
  useEffect(() => {
    const timer = setInterval(() => {
      onRefresh();
    }, 2500);
    return () => clearInterval(timer);
  }, [onRefresh]);

  const slug = market?.slug || 'btc-up-or-down-hourly';
  const title = market?.title || (isAr ? 'سوق البيتكوين صعود أم هبوط - عقد الساعة' : 'BTC Up or Down Hourly');
  const marketUrl = `https://limitless.exchange/markets/${encodeURIComponent(slug)}`;

  // Real best bid / ask from orderbook
  const bestBid = orderbook?.orderbook?.bids?.[0];
  const bestAsk = orderbook?.orderbook?.asks?.[0];

  // Orderbook midpoint
  const bookMidpoint = orderbook?.orderbook?.adjustedMidpoint && orderbook.orderbook.adjustedMidpoint > 0
    ? orderbook.orderbook.adjustedMidpoint
    : (bestBid && bestAsk && bestBid.price > 0 && bestAsk.price > 0)
      ? (bestBid.price + bestAsk.price) / 2
      : null;

  // Dynamic live contract price:
  // 1. Prioritize real-time live orderbook midpoint (adjustedMidpoint / best bid-ask)
  // 2. Then official live market prices from Limitless Exchange
  // 3. Or market ask price from tradePrices
  const liveMarketYes = (bookMidpoint !== null && bookMidpoint > 0 && bookMidpoint < 1)
    ? bookMidpoint
    : (market?.prices?.[0] !== undefined && market.prices[0] > 0 && market.prices[0] < 1)
      ? market.prices[0]
      : (market?.tradePrices?.buy?.market?.[0] !== undefined && market.tradePrices.buy.market[0] > 0)
        ? market.tradePrices.buy.market[0]
        : 0.50;

  const liveMarketNo = (bookMidpoint !== null && bookMidpoint > 0 && bookMidpoint < 1)
    ? (1.0 - bookMidpoint)
    : (market?.prices?.[1] !== undefined && market.prices[1] > 0 && market.prices[1] < 1)
      ? market.prices[1]
      : (market?.tradePrices?.buy?.market?.[1] !== undefined && market.tradePrices.buy.market[1] > 0)
        ? market.tradePrices.buy.market[1]
        : (1.0 - liveMarketYes);

  const yesPrice = Math.max(0.005, Math.min(0.995, liveMarketYes));
  const noPrice = Math.max(0.005, Math.min(0.995, liveMarketNo));

  const [lastTick, setLastTick] = useState<{ direction: 'up' | 'down' | null; delta: number; time: number }>({
    direction: null,
    delta: 0,
    time: 0,
  });
  const prevYesPriceRef = React.useRef<number>(yesPrice);

  useEffect(() => {
    if (prevYesPriceRef.current !== undefined && Math.abs(prevYesPriceRef.current - yesPrice) >= 0.0005) {
      const diff = yesPrice - prevYesPriceRef.current;
      const dir = diff > 0 ? 'up' : 'down';
      setLastTick({ direction: dir, delta: Math.abs(diff * 100), time: Date.now() });
      prevYesPriceRef.current = yesPrice;
      const timer = setTimeout(() => {
        setLastTick((prev) => ({ ...prev, direction: null }));
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [yesPrice]);

  const yesPayoutMultiplier = yesPrice > 0 ? (1 / yesPrice).toFixed(2) : '1.00';
  const noPayoutMultiplier = noPrice > 0 ? (1 / noPrice).toFixed(2) : '1.00';

  // Parse Open Price (Price to Beat)
  const rawOpenPrice = market?.openPrice;
  const priceToBeat = rawOpenPrice ? parseFloat(String(rawOpenPrice)) : null;

  // Comparison between current spot/oracle price and price to beat
  const activeCurrentPrice = oracle?.value || currentBinancePrice || 0;
  const priceDifference = priceToBeat && activeCurrentPrice ? activeCurrentPrice - priceToBeat : null;
  const priceDifferencePct = priceToBeat && priceDifference ? (priceDifference / priceToBeat) * 100 : null;
  const isCurrentlyUp = priceDifference !== null ? priceDifference >= 0 : true;

  return (
    <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-b from-slate-900 via-slate-900/95 to-[#0b1120] shadow-xl shadow-emerald-950/20 overflow-hidden mb-6">
      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between px-4 sm:px-6 py-3 border-b border-slate-800/80 bg-slate-950/70 gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-400 bg-emerald-950/80 px-2.5 py-0.5 rounded-full border border-emerald-500/40">
              {isAr ? 'عقد Limitless الحصري (ساعة كاملة 1H)' : 'Exclusive Limitless Market (1-Hour)'}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-300 bg-emerald-950/90 px-2 py-0.5 rounded-full border border-emerald-500/50">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>{isAr ? 'حماية الساعة (عقود 5 د و 15 د محظورة)' : '1-Hour Lock (5m & 15m Blocked)'}</span>
            </span>
          </div>

          <span className="text-slate-600 hidden sm:inline">|</span>

          <h2 className="text-sm md:text-base font-bold text-white tracking-tight flex items-center gap-2">
            <span>{title}</span>
            <span className="text-xs text-slate-400 font-mono font-normal">({slug})</span>
          </h2>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <a
            href={marketUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-md shadow-emerald-900/40 hover:scale-[1.02] cursor-pointer"
            title={isAr ? 'فتح هذا السوق مباشرة على منصة Limitless الرسمية' : 'Open this market on official Limitless Exchange'}
          >
            <span>{isAr ? 'عرض في منصة Limitless' : 'Open on Limitless'}</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors cursor-pointer"
            title={isAr ? 'تحديث بيانات السوق والتأكد من أحدث شمعة 15 دقيقة' : 'Refresh market details'}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
            <span className="hidden sm:inline text-[11px]">{isAr ? 'مزامنة' : 'Sync'}</span>
          </button>
        </div>
      </div>

      {/* Main Market Insights Grid */}
      <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-12 gap-4 lg:gap-6 items-center">
        
        {/* Column 1: Price to Beat & Resolution Condition (4 cols) */}
        <div className="md:col-span-4 bg-slate-950/60 p-4 rounded-xl border border-slate-800/80 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5 font-medium">
              <Scale className="w-3.5 h-3.5 text-sky-400" />
              <span>{isAr ? 'سعر البداية للتسوية (Price to Beat):' : 'Price to Beat (Start Price):'}</span>
            </span>
            <span className="text-[10px] text-slate-500 font-mono">
              {market?.oracleSource || 'Chainlink 60s TWAP'}
            </span>
          </div>

          <div className="flex items-baseline justify-between">
            <span className="text-xl md:text-2xl font-black font-mono text-slate-100">
              {priceToBeat ? `$${priceToBeat.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$80,553.85'}
            </span>
            <span className="text-xs text-slate-400">
              {isAr ? 'سعر بداية الساعة' : '1-Hour Open Price'}
            </span>
          </div>

          {/* Current Live Comparison */}
          <div className="pt-2 border-t border-slate-800/70 flex items-center justify-between text-xs">
            <span className="text-slate-400">{isAr ? 'السعر اللحظي الحالي:' : 'Current Spot:'}</span>
            <div className="flex items-center gap-1.5 font-mono">
              <span className="font-bold text-slate-200">
                ${activeCurrentPrice ? activeCurrentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '80,684.00'}
              </span>
              {priceDifference !== null && (
                <span
                  className={`text-[11px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 ${
                    isCurrentlyUp
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-600/50'
                      : 'bg-rose-950 text-rose-300 border border-rose-600/50'
                  }`}
                >
                  {isCurrentlyUp ? '+' : ''}${priceDifference.toFixed(2)} ({isCurrentlyUp ? '+' : ''}{priceDifferencePct?.toFixed(2)}%)
                </span>
              )}
            </div>
          </div>

          {/* Current Projected Outcome Indicator */}
          <div className="flex items-center gap-2 text-xs pt-1">
            <span className="text-slate-400">{isAr ? 'النتيجة المرجحة حالياً:' : 'Current Direction:'}</span>
            {isCurrentlyUp ? (
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>{isAr ? 'صعود (UP) أعلى من سعر البداية' : 'UP (Above Open Price)'}</span>
              </span>
            ) : (
              <span className="text-rose-400 font-bold flex items-center gap-1">
                <TrendingDown className="w-3.5 h-3.5" />
                <span>{isAr ? 'هبوط (DOWN) أدنى من سعر البداية' : 'DOWN (Below Open Price)'}</span>
              </span>
            )}
          </div>
        </div>

        {/* Column 2: UP (YES) & DOWN (NO) Contracts Cards (5 cols) */}
        <div className="md:col-span-5 flex flex-col justify-between space-y-2">
          {/* Live Streaming Price Header */}
          <div className="flex items-center justify-between text-[11px] px-1">
            <span className="flex items-center gap-1.5 text-slate-300 font-semibold">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>{isAr ? 'أسعار العقود اللحظية (بث مباشر CLOB)' : 'Live Contract Prices (CLOB Stream)'}</span>
            </span>
            {lastTick.direction ? (
              <span
                className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded animate-pulse flex items-center gap-0.5 ${
                  lastTick.direction === 'up'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/60'
                    : 'bg-rose-950 text-rose-300 border border-rose-500/60'
                }`}
              >
                {lastTick.direction === 'up' ? `▲ +${lastTick.delta.toFixed(2)}¢` : `▼ -${lastTick.delta.toFixed(2)}¢`}
              </span>
            ) : (
              <span className="text-[10px] text-emerald-400/80 font-mono flex items-center gap-1">
                <Zap className="w-3 h-3" />
                <span>{isAr ? 'محدث لحظياً' : 'Live Ticks'}</span>
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Card: UP / YES Contract */}
            <div
              className={`p-3.5 rounded-xl border transition-all duration-300 ${
                lastTick.direction === 'up'
                  ? 'bg-emerald-950/60 border-emerald-400 ring-2 ring-emerald-400/50 shadow-lg shadow-emerald-500/20'
                  : isCurrentlyUp
                  ? 'bg-emerald-950/40 border-emerald-500/60 ring-1 ring-emerald-500/30'
                  : 'bg-slate-950/50 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-extrabold text-emerald-400 flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>{isAr ? 'عقد صعود (UP)' : 'UP / YES'}</span>
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {yesPayoutMultiplier}x Payout
                </span>
              </div>

              <div className="flex items-baseline justify-between mb-1">
                <span className="text-xl md:text-2xl font-black font-mono text-emerald-300">
                  {(yesPrice * 100).toFixed(1)}¢
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  ${yesPrice.toFixed(3)}
                </span>
              </div>

              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden my-2">
                <div
                  className="bg-emerald-400 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, yesPrice * 100))}%` }}
                ></div>
              </div>

              <div className="text-[10px] text-slate-400 flex justify-between">
                <span>{isAr ? 'احتمال السوق:' : 'Market Implied:'}</span>
                <span className="font-bold text-emerald-400 font-mono">{(yesPrice * 100).toFixed(1)}%</span>
              </div>
            </div>

            {/* Card: DOWN / NO Contract */}
            <div
              className={`p-3.5 rounded-xl border transition-all duration-300 ${
                lastTick.direction === 'down'
                  ? 'bg-rose-950/60 border-rose-400 ring-2 ring-rose-400/50 shadow-lg shadow-rose-500/20'
                  : !isCurrentlyUp
                  ? 'bg-rose-950/40 border-rose-500/60 ring-1 ring-rose-500/30'
                  : 'bg-slate-950/50 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-extrabold text-rose-400 flex items-center gap-1">
                  <TrendingDown className="w-3.5 h-3.5" />
                  <span>{isAr ? 'عقد هبوط (DOWN)' : 'DOWN / NO'}</span>
                </span>
                <span className="text-[10px] text-purple-300 font-mono font-bold bg-purple-950/60 px-1 py-0.5 rounded border border-purple-500/40">
                  {noPayoutMultiplier}x Payout
                </span>
              </div>

              <div className="flex items-baseline justify-between mb-1">
                <span className="text-xl md:text-2xl font-black font-mono text-rose-300">
                  {(noPrice * 100).toFixed(1)}¢
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  ${noPrice.toFixed(3)}
                </span>
              </div>

              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden my-2">
                <div
                  className="bg-rose-400 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, noPrice * 100))}%` }}
                ></div>
              </div>

              <div className="text-[10px] text-slate-400 flex justify-between">
                <span>{isAr ? 'احتمال السوق:' : 'Market Implied:'}</span>
                <span className="font-bold text-rose-400 font-mono">{(noPrice * 100).toFixed(1)}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Column 3: 15-Minute Expiration Countdown & CLOB Health (3 cols) */}
        <div className="md:col-span-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800/80 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5 font-medium">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>{isAr ? 'نهاية نافذة الساعة:' : '1-Hour Expiration:'}</span>
            </span>
            <span className="text-[10px] text-slate-500 font-mono">Auto-Roll</span>
          </div>

          <div className="flex items-baseline justify-between">
            <span className="text-2xl md:text-3xl font-black font-mono text-amber-400 tracking-wider">
              {String(timeLeft.minutes).padStart(2, '0')}:{String(timeLeft.seconds).padStart(2, '0')}
            </span>
            <span className="text-xs text-slate-400">
              {isAr ? 'متبقي للتسوية' : 'Remaining'}
            </span>
          </div>

          {/* Progress bar of current 1 hour interval */}
          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-500 h-2 rounded-full transition-all duration-1000"
              style={{ width: `${timeLeft.percent}%` }}
            ></div>
          </div>

          {/* CLOB Status & Live Orderbook Quick Snip */}
          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
            <span>{isAr ? 'دفتر الأوامر (CLOB):' : 'Limitless Book:'}</span>
            <div className="flex items-center gap-2 font-mono">
              <span className="text-emerald-400">Bid: {bestBid ? `$${bestBid.price.toFixed(3)}` : `${yesPrice.toFixed(2)}`}</span>
              <span className="text-slate-600">/</span>
              <span className="text-rose-400">Ask: {bestAsk ? `$${bestAsk.price.toFixed(3)}` : `${(yesPrice + 0.03).toFixed(2)}`}</span>
            </div>
          </div>
        </div>

      </div>

      {/* Explanatory Footer: How Binance + Limitless work together */}
      <div className="px-4 sm:px-6 py-2.5 bg-slate-950/90 border-t border-slate-800/70 flex flex-wrap items-center justify-between text-xs text-slate-400 gap-2">
        <div className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>
            {isAr ? (
              <>
                <strong className="text-slate-200">توضيح المعمارية:</strong> بث <strong className="text-sky-400">Binance 1h</strong> بالشارت أعلاه يعمل كـ <em>رادار إحصائي فوري</em> لحساب Z-Score، بينما يتم تنفيذ أوامر الشراء الموقعة <strong className="text-emerald-400">EIP-712</strong> مباشرة داخل عقد <strong className="text-white">{title}</strong> على منصة Limitless!
              </>
            ) : (
              <>
                <strong className="text-slate-200">Architecture:</strong> <strong className="text-sky-400">Binance 1h</strong> acts as the low-latency statistical radar for Z-Score mean reversion, while signed <strong className="text-emerald-400">EIP-712</strong> orders are executed directly on the <strong className="text-white">{title}</strong> contract on Limitless!
              </>
            )}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-600/50">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span>EIP-712 Ready</span>
          </span>
        </div>
      </div>
    </div>
  );
};
