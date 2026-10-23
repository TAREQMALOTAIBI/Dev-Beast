import React, { useState } from 'react';
import { ExecutedChunk, WsMessageLog, TradeOrder } from '../types/bot';
import { formatUsd } from '../utils/math';
import { Terminal, CheckCircle2, Code, Activity, ShieldCheck, AlertTriangle } from 'lucide-react';
import { LimitlessStatus } from '../services/limitlessService';

interface ExecutionConsoleProps {
  currentChunks: ExecutedChunk[];
  activeTrade: TradeOrder | null;
  tradeHistory: TradeOrder[];
  wsLogs: WsMessageLog[];
  isExecuting: boolean;
  limitlessStatus: LimitlessStatus;
  onOpenConfig: () => void;
  lang: 'en' | 'ar';
}

export const ExecutionConsole: React.FC<ExecutionConsoleProps> = ({
  currentChunks,
  activeTrade,
  tradeHistory,
  wsLogs,
  isExecuting,
  limitlessStatus,
  onOpenConfig,
  lang,
}) => {
  const isAr = lang === 'ar';
  const [selectedPayload, setSelectedPayload] = useState<Record<string, unknown> | null>(null);
  const [activeTab, setActiveTab] = useState<'chunks' | 'wsLogs' | 'history'>('chunks');

  const isConnected = limitlessStatus === 'CONNECTED' || limitlessStatus === 'AUTHENTICATED';

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/90 backdrop-blur-sm overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/40 gap-3">
        <div className="flex items-center gap-3">
          <Terminal className="w-4 h-4 text-sky-400" />
          <h3 className="font-bold text-slate-100 text-sm tracking-wide">
            {isAr ? 'منصة التنفيذ الحي (Limitless WebSocket)' : 'Live Order Execution & Dispatcher'}
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
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-xs">
            <button
              onClick={() => setActiveTab('chunks')}
              className={`px-3 py-1 rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'chunks'
                  ? 'bg-slate-800 text-slate-100 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {isAr ? 'تجزئة العقود الحية (4 أجزاء)' : 'Live Chunks (4)'}
            </button>
            <button
              onClick={() => setActiveTab('wsLogs')}
              className={`px-3 py-1 rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'wsLogs'
                  ? 'bg-slate-800 text-slate-100 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {isAr ? 'بث WebSocket الحي' : 'Live WS Stream'}
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1 rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'history'
                  ? 'bg-slate-800 text-slate-100 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {isAr ? 'الأوامر المرسلة' : 'Sent Orders'} ({tradeHistory.length})
            </button>
          </div>

          {!isConnected && (
            <button
              onClick={onOpenConfig}
              className="text-xs text-amber-300 bg-amber-950/60 border border-amber-800/80 px-2.5 py-1 rounded-lg hover:bg-amber-900/60 transition-colors"
            >
              {isAr ? 'ضبط مفتاح API والاتصال' : 'Configure WS'}
            </button>
          )}
        </div>
      </div>

      {/* Disconnection Notice if not connected */}
      {!isConnected && (
        <div className="px-4 py-2.5 bg-amber-950/30 border-b border-amber-800/40 text-xs text-amber-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              {isAr
                ? 'اتصال Limitless WebSocket غير نشط حالياً. الروبوت في وضع التداول الحي وسينفذ الأوامر بمجرد الاتصال وتحقق شروط الاستراتيجية.'
                : 'Limitless WebSocket is currently disconnected. In pure live mode, orders will only be sent when the socket is connected and strategy triggers.'}
            </span>
          </div>
          <button
            onClick={onOpenConfig}
            className="font-semibold underline hover:text-white shrink-0 ml-4"
          >
            {isAr ? 'إعدادات الاتصال' : 'Connection Settings'}
          </button>
        </div>
      )}

      {/* Tab 1: Live Chunks */}
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
                      <span>{isAr ? 'فحص حمولة JSON المرسلة' : 'Inspect JSON Payload'}</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 2: WebSocket Log Viewer */}
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

      {/* Tab 3: Sent Orders */}
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
                <th className="px-4 py-2.5 text-right">Order State</th>
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
            <div className="text-[11px] text-slate-500 mt-2">
              Sent via <span className="font-mono text-slate-400">limitlessWs.send(JSON.stringify(orderPayload))</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
