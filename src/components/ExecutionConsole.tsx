import React, { useState } from 'react';
import {
  ExecutedChunk,
  WsMessageLog,
  TradeOrder,
  OrderbookUpdate,
  OraclePriceData,
  PositionItem,
} from '../types/bot';
import { formatUsd } from '../utils/math';
import { Terminal, Code, AlertTriangle, BookOpen, Layers, UserCheck } from 'lucide-react';
import { LimitlessStatus } from '../services/limitlessService';

interface ExecutionConsoleProps {
  currentChunks: ExecutedChunk[];
  activeTrade: TradeOrder | null;
  tradeHistory: TradeOrder[];
  wsLogs: WsMessageLog[];
  orderbook: OrderbookUpdate | null;
  oracle: OraclePriceData | null;
  positions: PositionItem[];
  isExecuting: boolean;
  limitlessStatus: LimitlessStatus;
  marketSlug: string;
  onOpenConfig: () => void;
  lang: 'en' | 'ar';
}

export const ExecutionConsole: React.FC<ExecutionConsoleProps> = ({
  currentChunks,
  activeTrade,
  tradeHistory,
  wsLogs,
  orderbook,
  oracle,
  positions,
  isExecuting,
  limitlessStatus,
  marketSlug,
  onOpenConfig,
  lang,
}) => {
  const isAr = lang === 'ar';
  const [selectedPayload, setSelectedPayload] = useState<Record<string, unknown> | null>(null);
  const [activeTab, setActiveTab] = useState<'chunks' | 'orderbook' | 'positions' | 'wsLogs' | 'history'>('chunks');

  const isConnected = limitlessStatus === 'CONNECTED' || limitlessStatus === 'AUTHENTICATED';

  // Compute best bid, ask, and spread from real CLOB orderbook
  const bestBid = orderbook?.orderbook?.bids?.[0];
  const bestAsk = orderbook?.orderbook?.asks?.[0];
  const spread = bestAsk && bestBid ? bestAsk.price - bestBid.price : null;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/90 backdrop-blur-sm overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/40 gap-3">
        <div className="flex items-center gap-3">
          <Terminal className="w-4 h-4 text-sky-400" />
          <h3 className="font-bold text-slate-100 text-sm tracking-wide">
            {isAr ? 'منصة التنفيذ الحي (Limitless WebSocket SDK)' : 'Limitless Real-Time Execution & Orderbook'}
          </h3>
          <span className="text-slate-600">·</span>
          <div className="flex items-center gap-1.5 text-xs font-mono">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected
                  ? 'bg-emerald-400'
                  : limitlessStatus === 'CONNECTING'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-rose-500'
              }`}
            />
            <span
              className={
                isConnected
                  ? 'text-emerald-400 font-semibold'
                  : 'text-rose-400 font-semibold'
              }
            >
              {limitlessStatus}
            </span>
            <span className="text-slate-500">({marketSlug})</span>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-xs overflow-x-auto">
            <button
              onClick={() => setActiveTab('chunks')}
              className={`px-3 py-1 rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'chunks'
                  ? 'bg-slate-800 text-slate-100 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {isAr ? 'تجزئة العقود الحية (4)' : 'Live Chunks (4)'}
            </button>
            <button
              onClick={() => setActiveTab('orderbook')}
              className={`px-3 py-1 rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'orderbook'
                  ? 'bg-slate-800 text-slate-100 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BookOpen className="w-3 h-3 text-sky-400" />
              <span>{isAr ? 'دفتر الأوامر الحي (CLOB)' : 'Orderbook'}</span>
            </button>
            <button
              onClick={() => setActiveTab('positions')}
              className={`px-3 py-1 rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'positions'
                  ? 'bg-slate-800 text-slate-100 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <UserCheck className="w-3 h-3 text-emerald-400" />
              <span>{isAr ? 'المراكز المفتوحة' : 'Positions'} ({positions.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('wsLogs')}
              className={`px-3 py-1 rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'wsLogs'
                  ? 'bg-slate-800 text-slate-100 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {isAr ? 'سجل بث WebSocket' : 'WS Stream'}
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1 rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'history'
                  ? 'bg-slate-800 text-slate-100 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {isAr ? 'الأوامر المنفذة' : 'Sent Orders'} ({tradeHistory.length})
            </button>
          </div>

          {!isConnected && (
            <button
              onClick={onOpenConfig}
              className="text-xs text-amber-300 bg-amber-950/60 border border-amber-800/80 px-2.5 py-1 rounded-lg hover:bg-amber-900/60 transition-colors whitespace-nowrap"
            >
              {isAr ? 'ضبط الاتصال' : 'Configure WS'}
            </button>
          )}
        </div>
      </div>

      {/* Disconnection Warning */}
      {!isConnected && (
        <div className="px-4 py-2.5 bg-amber-950/30 border-b border-amber-800/40 text-xs text-amber-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              {isAr
                ? 'جارِ الاتصال بخادم Limitless WebSocket (wss://ws.limitless.exchange). يتم استلام أسعار السوق علنياً، وتتطلب الأوامر والمراكز بيانات التوثيق.'
                : 'Connecting to Limitless WebSocket (wss://ws.limitless.exchange). Public orderbooks stream automatically; positions require credentials.'}
            </span>
          </div>
          <button
            onClick={onOpenConfig}
            className="font-semibold underline hover:text-white shrink-0 ml-4"
          >
            {isAr ? 'إعدادات HMAC و API' : 'HMAC & API Settings'}
          </button>
        </div>
      )}

      {/* Tab 1: Live Order Chunks */}
      {activeTab === 'chunks' && (
        <div className="p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <div>
              {isAr
                ? 'تجزئة العقد إلى 4 أجزاء متتالية مع فارق زمني 500ms لتفادي قيود سرعة المنصة (Rate Limit)'
                : 'Live fractionalization into 4 chunks with 500ms spacing to prevent exchange rate limits'}
            </div>
            {activeTrade && (
              <div className="text-slate-300 font-mono">
                Order in Progress:{' '}
                <span className="text-sky-400 font-bold">{activeTrade.totalContracts} Contracts</span> (
                {formatUsd(activeTrade.totalInvestmentUsd)})
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((chunkIndex) => {
              const chunk = currentChunks.find((c) => c.chunkId === chunkIndex);
              const isSent = chunk?.status === 'SENT';
              const isSending = chunk?.status === 'SENDING';
              const isQueued = chunk?.status === 'QUEUED';
              const isFailed = chunk?.status === 'FAILED';

              return (
                <div
                  key={chunkIndex}
                  className={`p-3 rounded-lg border transition-all ${
                    isSent
                      ? 'bg-emerald-950/20 border-emerald-800/50'
                      : isSending
                      ? 'bg-sky-950/30 border-sky-500/60 ring-1 ring-sky-500/50'
                      : isFailed
                      ? 'bg-rose-950/30 border-rose-800/60'
                      : isQueued
                      ? 'bg-slate-950/60 border-slate-800'
                      : 'bg-slate-950/30 border-slate-900 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="font-bold text-slate-300">
                      {isAr ? `الجزء ${chunkIndex} من 4` : `Chunk ${chunkIndex} of 4`}
                    </span>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                        isSent
                          ? 'bg-emerald-900/60 text-emerald-300'
                          : isSending
                          ? 'bg-sky-900/60 text-sky-300 animate-pulse'
                          : isFailed
                          ? 'bg-rose-900/60 text-rose-300'
                          : isQueued
                          ? 'bg-slate-800 text-slate-400'
                          : 'bg-slate-900 text-slate-500'
                      }`}
                    >
                      {chunk?.status || 'IDLE'}
                    </span>
                  </div>

                  <div className="space-y-1 text-xs font-mono">
                    <div className="flex justify-between text-slate-400">
                      <span>{isAr ? 'الكمية:' : 'Size:'}</span>
                      <span className="text-slate-200 font-bold">
                        {chunk ? `${chunk.contracts} contracts` : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>{isAr ? 'السعر (GTC):' : 'Price (GTC):'}</span>
                      <span className="text-slate-200">
                        {chunk ? `$${chunk.price.toFixed(2)}` : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>{isAr ? 'فارق التوقيت:' : 'Delay:'}</span>
                      <span className="text-slate-400">
                        {chunk ? `+${chunk.delayMs}ms` : `${(chunkIndex - 1) * 500}ms`}
                      </span>
                    </div>
                  </div>

                  {chunk && (
                    <button
                      onClick={() => setSelectedPayload(chunk.payload)}
                      className="mt-3 w-full py-1 text-[11px] text-slate-400 hover:text-sky-300 bg-slate-900/90 rounded border border-slate-800/80 flex items-center justify-center gap-1 transition-colors"
                    >
                      <Code className="w-3 h-3" />
                      <span>{isAr ? 'فحص حمولة JSON' : 'Inspect JSON Payload'}</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 2: Live CLOB Orderbook */}
      {activeTab === 'orderbook' && (
        <div className="p-4 space-y-4">
          {/* Orderbook Meta Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
            <div className="p-2.5 bg-slate-950/60 rounded-lg border border-slate-800">
              <div className="text-slate-500 text-[10px]">Best Bid</div>
              <div className="text-emerald-400 font-bold text-sm">
                {bestBid ? `$${bestBid.price.toFixed(4)}` : '—'}
              </div>
              <div className="text-[10px] text-slate-500">
                {bestBid ? `${(bestBid.size / 1000000).toFixed(0)} shares` : ''}
              </div>
            </div>

            <div className="p-2.5 bg-slate-950/60 rounded-lg border border-slate-800">
              <div className="text-slate-500 text-[10px]">Best Ask</div>
              <div className="text-rose-400 font-bold text-sm">
                {bestAsk ? `$${bestAsk.price.toFixed(4)}` : '—'}
              </div>
              <div className="text-[10px] text-slate-500">
                {bestAsk ? `${(bestAsk.size / 1000000).toFixed(0)} shares` : ''}
              </div>
            </div>

            <div className="p-2.5 bg-slate-950/60 rounded-lg border border-slate-800">
              <div className="text-slate-500 text-[10px]">Spread</div>
              <div className="text-amber-400 font-bold text-sm">
                {spread !== null ? `$${spread.toFixed(4)}` : '—'}
              </div>
              <div className="text-[10px] text-slate-500">
                Midpoint: {orderbook?.orderbook?.adjustedMidpoint?.toFixed(4) || '—'}
              </div>
            </div>

            <div className="p-2.5 bg-slate-950/60 rounded-lg border border-slate-800">
              <div className="text-slate-500 text-[10px]">Oracle Feed</div>
              <div className="text-sky-400 font-bold text-sm">
                {oracle ? `$${oracle.value.toFixed(2)}` : 'Active'}
              </div>
              <div className="text-[10px] text-slate-500">
                Chainlink / Pyth Live
              </div>
            </div>
          </div>

          {/* Bids & Asks Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Bids Column */}
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 overflow-hidden">
              <div className="px-3 py-1.5 bg-emerald-950/30 border-b border-slate-800 text-[11px] font-bold text-emerald-400 flex justify-between">
                <span>BIDS (BUY)</span>
                <span>SHARES</span>
              </div>
              <div className="p-2 space-y-1 max-h-48 overflow-y-auto font-mono text-xs">
                {orderbook?.orderbook?.bids?.length ? (
                  orderbook.orderbook.bids.slice(0, 10).map((bid, i) => (
                    <div key={i} className="flex justify-between py-0.5 text-slate-300">
                      <span className="text-emerald-400 font-semibold">${bid.price.toFixed(4)}</span>
                      <span className="text-slate-400">{(bid.size / 1000000).toLocaleString()}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-slate-500 text-center py-4 text-xs">Awaiting bids from CLOB...</div>
                )}
              </div>
            </div>

            {/* Asks Column */}
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 overflow-hidden">
              <div className="px-3 py-1.5 bg-rose-950/30 border-b border-slate-800 text-[11px] font-bold text-rose-400 flex justify-between">
                <span>ASKS (SELL)</span>
                <span>SHARES</span>
              </div>
              <div className="p-2 space-y-1 max-h-48 overflow-y-auto font-mono text-xs">
                {orderbook?.orderbook?.asks?.length ? (
                  orderbook.orderbook.asks.slice(0, 10).map((ask, i) => (
                    <div key={i} className="flex justify-between py-0.5 text-slate-300">
                      <span className="text-rose-400 font-semibold">${ask.price.toFixed(4)}</span>
                      <span className="text-slate-400">{(ask.size / 1000000).toLocaleString()}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-slate-500 text-center py-4 text-xs">Awaiting asks from CLOB...</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Positions */}
      {activeTab === 'positions' && (
        <div className="p-4 space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                <tr>
                  <th className="px-3 py-2">Token ID</th>
                  <th className="px-3 py-2 text-right">CTF Shares</th>
                  <th className="px-3 py-2 text-right">Avg Fill Price</th>
                  <th className="px-3 py-2 text-right">Market Value</th>
                  <th className="px-3 py-2 text-right">Cost Basis</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {positions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                      {isAr
                        ? 'لا توجد مراكز مفتوحة مسجلة. قم بتعيين مفاتيح HMAC/API لتفعيل اشتراك subscribe_positions.'
                        : 'No open positions reported. Configure HMAC credentials to subscribe to live positions.'}
                    </td>
                  </tr>
                ) : (
                  positions.map((pos, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/30">
                      <td className="px-3 py-2 text-slate-300 font-semibold">{pos.tokenId}</td>
                      <td className="px-3 py-2 text-right text-emerald-400">
                        {(Number(pos.ctfBalance) / 1000000).toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-300">${pos.averageFillPrice}</td>
                      <td className="px-3 py-2 text-right text-slate-200">${pos.marketValue}</td>
                      <td className="px-3 py-2 text-right text-slate-400">${pos.costBasis}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: WebSocket Log Viewer */}
      {activeTab === 'wsLogs' && (
        <div className="p-3 bg-slate-950 font-mono text-xs max-h-72 overflow-y-auto space-y-1.5 select-text">
          {wsLogs.length === 0 ? (
            <div className="text-slate-500 text-center py-8">
              {isAr ? 'بانتظار ورود أوامر ورسائل WebSocket الحية...' : 'Awaiting live incoming/outgoing WebSocket packets...'}
            </div>
          ) : (
            wsLogs.slice(-35).map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-2 py-1 px-2 rounded hover:bg-slate-900/60 transition-colors border-l-2"
                style={{
                  borderColor:
                    log.direction === 'OUTGOING'
                      ? '#38bdf8'
                      : log.direction === 'INCOMING'
                      ? '#34d399'
                      : '#94a3b8',
                }}
              >
                <span className="text-slate-500 shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span
                  className={`text-[10px] px-1 rounded shrink-0 font-bold ${
                    log.direction === 'OUTGOING'
                      ? 'bg-sky-950 text-sky-400'
                      : log.direction === 'INCOMING'
                      ? 'bg-emerald-950 text-emerald-400'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {log.direction}
                </span>
                <span className="text-slate-300 break-all">
                  {typeof log.data === 'string' ? log.data : JSON.stringify(log.data)}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 5: Sent Orders */}
      {activeTab === 'history' && (
        <div className="overflow-x-auto max-h-72">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] border-b border-slate-800 sticky top-0">
              <tr>
                <th className="px-4 py-2.5">Time</th>
                <th className="px-4 py-2.5">Market</th>
                <th className="px-4 py-2.5">Trigger Z</th>
                <th className="px-4 py-2.5 text-right">Contracts</th>
                <th className="px-4 py-2.5 text-right">Price</th>
                <th className="px-4 py-2.5 text-right">Total USD</th>
                <th className="px-4 py-2.5 text-right">State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {tradeHistory.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    {isAr
                      ? 'لا توجد أوامر منفذة حتى الآن. سينفذ الروبوت الأوامر الحية تلقائياً عند تجاوز Z-Score لـ 2.0σ ثم هبوطه دون 1.90σ.'
                      : 'No live orders executed in this session yet. Bot will place orders automatically upon Z-Score mean reversion.'}
                  </td>
                </tr>
              ) : (
                tradeHistory.map((trade) => (
                  <tr key={trade.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-2 text-slate-400">
                      {new Date(trade.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="px-4 py-2 text-slate-200 font-semibold">{trade.market}</td>
                    <td className="px-4 py-2 text-sky-400">{trade.triggerZScore.toFixed(2)}σ</td>
                    <td className="px-4 py-2 text-right text-slate-100">{trade.totalContracts}</td>
                    <td className="px-4 py-2 text-right text-slate-300">
                      ${trade.contractPrice.toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-right text-slate-300">
                      {formatUsd(trade.totalInvestmentUsd)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className="text-emerald-400 font-semibold">GTC TRANSMITTED</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* JSON Payload Inspector */}
      {selectedPayload && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full p-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
              <div className="flex items-center gap-2">
                <Code className="w-4 h-4 text-sky-400" />
                <h4 className="font-bold text-sm text-slate-100">Live WebSocket Packet</h4>
              </div>
              <button
                onClick={() => setSelectedPayload(null)}
                className="text-slate-400 hover:text-white text-xs px-2 py-1 bg-slate-800 rounded"
              >
                Close
              </button>
            </div>
            <pre className="p-3 bg-slate-950 rounded-lg text-sky-300 font-mono text-xs overflow-x-auto select-all">
              {JSON.stringify(selectedPayload, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
