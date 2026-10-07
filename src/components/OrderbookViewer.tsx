import React from 'react';
import type { OrderBook, ContractTokenType } from '../bot/types';

interface OrderbookViewerProps {
  orderbook: OrderBook;
  targetedToken: ContractTokenType;
  maxEntryPrice: number;
  onSelectToken: (token: ContractTokenType) => void;
}

export const OrderbookViewer: React.FC<OrderbookViewerProps> = ({
  orderbook,
  targetedToken,
  maxEntryPrice,
  onSelectToken,
}) => {
  const asks = [...orderbook.asks].sort((a, b) => b.price - a.price); // من الأعلى للأدنى
  const bids = [...orderbook.bids].sort((a, b) => b.price - a.price); // من الأعلى للأدنى

  const bestAsk = orderbook.asks.length > 0 ? orderbook.asks[0] : null;
  const bestBid = orderbook.bids.length > 0 ? orderbook.bids[0] : null;
  const isBestAskUnderThreshold = bestAsk ? bestAsk.price <= maxEntryPrice : false;
  const spread = bestAsk && bestBid ? Number((bestAsk.price - bestBid.price).toFixed(4)) : 0;

  return (
    <div className="bg-slate-900/80 rounded-2xl border border-slate-800/80 p-4 shadow-2xl backdrop-blur-md flex flex-col h-full">
      {/* Header with Token Switcher */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
        <div>
          <h3 className="font-bold text-white text-sm flex items-center gap-2">
            <span>دفتر أوامر Limitless CLOB</span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/50">
              عقد BTC 15m
            </span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            تسوية ثنائية: إما 1.00$ USDC أو 0.00$ USDC
          </p>
        </div>

        {/* Token Switcher Buttons */}
        <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800 text-xs">
          <button
            onClick={() => onSelectToken('YES')}
            className={`px-3 py-1 font-bold rounded-md transition-all ${
              targetedToken === 'YES'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            رمز YES (صعود)
          </button>
          <button
            onClick={() => onSelectToken('NO')}
            className={`px-3 py-1 font-bold rounded-md transition-all ${
              targetedToken === 'NO'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            رمز NO (هبوط)
          </button>
        </div>
      </div>

      {/* Asymmetric Filter Status Banner */}
      <div
        className={`mt-3 p-2.5 rounded-xl border text-xs flex items-center justify-between ${
          isBestAskUnderThreshold
            ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
            : 'bg-amber-950/40 border-amber-500/30 text-amber-300'
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="text-base">{isBestAskUnderThreshold ? '🎯' : '⚠️'}</span>
          <div>
            <span className="font-bold">
              {isBestAskUnderThreshold
                ? `فرصة دخول لامتماثلة مؤهلة (أفضل عرض: $${bestAsk?.price.toFixed(2)})`
                : `أفضل عرض بيع ($${bestAsk?.price.toFixed(2) || 'N/A'}) يتجاوز الحد الأقصى $${maxEntryPrice.toFixed(2)}`}
            </span>
            <p className="text-[11px] text-slate-400">
              شرط السعر: يتم التنفيذ فقط عندما يكون سعر الشراء &le; ${maxEntryPrice.toFixed(2)} لحماية رأس المال.
            </p>
          </div>
        </div>
        {bestAsk && isBestAskUnderThreshold && (
          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40 text-[11px]">
            عائد +{(Math.round(((1 - bestAsk.price) / bestAsk.price) * 100))}% (مضاعف {(1 / bestAsk.price).toFixed(1)}x)
          </span>
        )}
      </div>

      {/* Market Metrics Strip from MarketFetcher */}
      <div className="grid grid-cols-3 gap-2 mt-3 text-[11px] font-mono text-center">
        <div className="p-1.5 rounded-lg bg-slate-950 border border-slate-800">
          <span className="text-slate-500 text-[10px] block font-sans">نقطة المنتصف (Midpoint)</span>
          <span className="text-cyan-400 font-bold">${orderbook.midpoint.toFixed(4)}</span>
        </div>
        <div className="p-1.5 rounded-lg bg-slate-950 border border-slate-800">
          <span className="text-slate-500 text-[10px] block font-sans">فارق السبريد (Spread)</span>
          <span className={`${spread > 0.20 ? 'text-amber-400' : 'text-emerald-400'} font-bold`}>
            ${spread.toFixed(4)}
          </span>
        </div>
        <div className="p-1.5 rounded-lg bg-slate-950 border border-slate-800">
          <span className="text-slate-500 text-[10px] block font-sans">أقصى سبريد مسموح</span>
          <span className="text-slate-300 font-bold">{orderbook.maxSpread}</span>
        </div>
      </div>

      {/* Orderbook Depth Table */}
      <div className="mt-3 flex-1 flex flex-col justify-between">
        <div className="text-[11px] text-slate-400 grid grid-cols-3 pb-1 border-b border-slate-800">
          <span>السعر (USDC)</span>
          <span className="text-center">الكمية (عقود)</span>
          <span className="text-left font-mono">العائد اللامتماثل</span>
        </div>

        {/* Asks (Sell Orders) */}
        <div className="space-y-1 my-2">
          <div className="text-[10px] text-rose-400/80 font-bold tracking-wider">
            عروض البيع (ASKS)
          </div>
          {asks.map((ask, idx) => {
            const isAsymmetric = ask.price <= maxEntryPrice;
            const payoutMultiplier = (1 / ask.price).toFixed(1);

            return (
              <div
                key={`ask-${idx}`}
                className={`grid grid-cols-3 py-1 px-2 rounded text-xs items-center transition-all ${
                  isAsymmetric
                    ? 'bg-emerald-500/10 border border-emerald-500/30 text-white font-semibold'
                    : 'bg-slate-950/40 text-slate-300 hover:bg-slate-800/40'
                }`}
              >
                <span className="flex items-center gap-1.5 font-mono">
                  <span className="text-rose-400 font-bold">${ask.price.toFixed(2)}</span>
                  {isAsymmetric && (
                    <span className="text-[10px] px-1 py-0.2 rounded bg-emerald-500 text-slate-950 font-bold font-sans">
                      شراء FAK
                    </span>
                  )}
                </span>
                <span className="text-center text-slate-300 font-mono">{ask.size.toLocaleString()}</span>
                <span
                  className={`text-left font-mono ${
                    isAsymmetric ? 'text-emerald-400 font-bold' : 'text-slate-400'
                  }`}
                >
                  {payoutMultiplier}x ($1.00)
                </span>
              </div>
            );
          })}
        </div>

        {/* Spread Separator */}
        <div className="py-1 px-3 bg-slate-950/90 rounded-lg border border-slate-800 flex items-center justify-between text-xs my-1">
          <span className="text-slate-400">سعر آخر صفقة (Last Trade):</span>
          <span className="text-cyan-400 font-bold font-mono">
            ${orderbook.lastTradePrice?.toFixed(2) || '0.19'} USDC
          </span>
        </div>

        {/* Bids (Buy Orders) */}
        <div className="space-y-1 my-2">
          <div className="text-[10px] text-emerald-400/80 font-bold tracking-wider">
            طلبات الشراء (BIDS)
          </div>
          {bids.map((bid, idx) => (
            <div
              key={`bid-${idx}`}
              className="grid grid-cols-3 py-1 px-2 rounded bg-slate-950/30 text-slate-300 text-xs items-center hover:bg-slate-800/40"
            >
              <span className="text-emerald-400 font-bold font-mono">${bid.price.toFixed(2)}</span>
              <span className="text-center text-slate-300 font-mono">{bid.size.toLocaleString()}</span>
              <span className="text-left text-slate-400 font-mono">
                ${(bid.totalCost || bid.price * bid.size).toFixed(1)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
