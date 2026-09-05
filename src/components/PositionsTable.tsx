import React from 'react';
import { Shield, Clock, CheckCircle, XCircle, ArrowUpRight, ArrowDownRight, ExternalLink } from 'lucide-react';
import { Position } from '../types';

interface PositionsTableProps {
  positions: Position[];
  currentBtcPrice: number;
}

export const PositionsTable: React.FC<PositionsTableProps> = ({ positions, currentBtcPrice }) => {
  const activePositions = positions.filter((p) => p.status === 'HOLD_TO_EXPIRATION');
  const settledPositions = positions.filter((p) => p.status !== 'HOLD_TO_EXPIRATION');

  const totalPnL = settledPositions.reduce((acc, p) => acc + (p.pnl || 0), 0);

  return (
    <div
      id="positions-and-settlements-panel"
      className="bg-[#0a0a0a] border border-[#222] p-5 sm:p-6 space-y-4 font-mono"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#222]">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
              سجل المراكز وانتهاء الصلاحية
            </h2>
            <span className="text-[10px] px-1.5 py-0.5 border border-[#333] bg-[#111] text-zinc-400">
              {activePositions.length} مفتوحة • {settledPositions.length} مسواة
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            القاعدة: الاحتفاظ الصارم حتى التسوية الثنائية عند الدقيقة 15:00. يمنع الإغلاق المبكر.
          </p>
        </div>

        {settledPositions.length > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-zinc-500 uppercase text-[10px]">الربح/الخسارة المحققة:</span>
            <span
              className={`font-bold px-2 py-0.5 border text-xs ${
                totalPnL >= 0
                  ? 'bg-[#00ff9d]/15 border-[#00ff9d]/40 text-[#00ff9d]'
                  : 'bg-[#ff4d4d]/15 border-[#ff4d4d]/40 text-[#ff4d4d]'
              }`}
            >
              {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)} USDC
            </span>
          </div>
        )}
      </div>

      {/* Active Positions (Hold To Expiration) */}
      <div className="space-y-2">
        <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-[#00ff9d]" />
          المراكز النشطة المحتفظ بها ({activePositions.length})
        </h3>

        {activePositions.length === 0 ? (
          <div className="p-6 text-center border border-[#222] bg-[#111] text-zinc-500 text-xs">
            لا توجد مراكز نشطة محتفظ بها حالياً. يتم فتح المراكز آلياً عند تزامن المؤشرات الثلاثة في النافذة الذهبية [03:30 - 08:30].
          </div>
        ) : (
          <div className="overflow-x-auto border border-[#222]">
            <table className="w-full text-right rtl:text-right text-xs">
              <thead className="bg-[#111] text-zinc-400 border-b border-[#222] text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">النوع</th>
                  <th className="py-2.5 px-3">سعر الإضراب</th>
                  <th className="py-2.5 px-3">سعر الدخول</th>
                  <th className="py-2.5 px-3">الحصص</th>
                  <th className="py-2.5 px-3">التكلفة (10%)</th>
                  <th className="py-2.5 px-3">BTC الحالي</th>
                  <th className="py-2.5 px-3">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#222] bg-[#0a0a0a]">
                {activePositions.map((pos) => {
                  const isWinning =
                    pos.side === 'YES'
                      ? currentBtcPrice >= pos.targetStrike
                      : currentBtcPrice < pos.targetStrike;
                  const estPayout = pos.shares * 1.0;
                  const estPnl = isWinning ? estPayout - pos.totalCost : -pos.totalCost;

                  return (
                    <tr key={pos.id} className="hover:bg-[#151515] transition-colors">
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 border font-bold text-[10px] ${
                            pos.side === 'YES'
                              ? 'bg-[#00ff9d]/15 border-[#00ff9d]/40 text-[#00ff9d]'
                              : 'bg-[#ff4d4d]/15 border-[#ff4d4d]/40 text-[#ff4d4d]'
                          }`}
                        >
                          {pos.side === 'YES' ? (
                            <ArrowUpRight className="h-3 w-3" />
                          ) : (
                            <ArrowDownRight className="h-3 w-3" />
                          )}
                          {pos.side === 'YES' ? 'صعود YES' : 'هبوط NO'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-bold text-white">
                        ${pos.targetStrike.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-zinc-300">
                        ${pos.entryPrice.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-zinc-300">{pos.shares}</td>
                      <td className="py-2.5 px-3 text-zinc-300">
                        ${pos.totalCost.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`font-bold ${
                            currentBtcPrice >= pos.targetStrike
                              ? 'text-[#00ff9d]'
                              : 'text-[#ff4d4d]'
                          }`}
                        >
                          ${currentBtcPrice.toFixed(1)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 border border-[#333] bg-[#111] text-zinc-300 text-[10px] font-bold">
                            احتفاظ حتى الصلاحية
                          </span>
                          <span
                            className={`text-[10px] font-bold ${
                              estPnl >= 0 ? 'text-[#00ff9d]' : 'text-[#ff4d4d]'
                            }`}
                          >
                            (تقديري {estPnl >= 0 ? '+' : ''}${estPnl.toFixed(1)})
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Settled Positions History */}
      {settledPositions.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-[#222]">
          <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold flex items-center gap-1.5">
            <CheckCircle className="h-3.5 w-3.5 text-zinc-400" />
            سجل العقود المسواة ({settledPositions.length})
          </h3>

          <div className="overflow-x-auto border border-[#222]">
            <table className="w-full text-right rtl:text-right text-xs">
              <thead className="bg-[#111] text-zinc-400 border-b border-[#222] text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="py-2 px-3">النتيجة</th>
                  <th className="py-2 px-3">الاتجاه</th>
                  <th className="py-2 px-3">الإضراب مقابل التسوية</th>
                  <th className="py-2 px-3">الدخول</th>
                  <th className="py-2 px-3">الحصص</th>
                  <th className="py-2 px-3">التكلفة</th>
                  <th className="py-2 px-3">الربح/الخسارة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#222] bg-[#0a0a0a]">
                {settledPositions.slice(0, 5).map((pos) => {
                  const won = pos.status === 'EXPIRED_WON';
                  return (
                    <tr key={pos.id} className="hover:bg-[#151515]">
                      <td className="py-2 px-3">
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 border font-bold text-[10px] ${
                            won
                              ? 'bg-[#00ff9d]/15 border-[#00ff9d]/40 text-[#00ff9d]'
                              : 'bg-[#ff4d4d]/15 border-[#ff4d4d]/40 text-[#ff4d4d]'
                          }`}
                        >
                          {won ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                          {won ? 'فوز' : 'خسارة'}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-zinc-300">{pos.side === 'YES' ? 'صعود YES' : 'هبوط NO'}</td>
                      <td className="py-2 px-3 text-zinc-400">
                        ${pos.targetStrike.toLocaleString()} مقابل ${pos.settlementPrice?.toFixed(1) || '-'}
                      </td>
                      <td className="py-2 px-3 text-zinc-400">${pos.entryPrice.toFixed(2)}</td>
                      <td className="py-2 px-3 text-zinc-400">{pos.shares}</td>
                      <td className="py-2 px-3 text-zinc-400">${pos.totalCost.toFixed(2)}</td>
                      <td className="py-2 px-3 font-bold">
                        <span className={won ? 'text-[#00ff9d]' : 'text-[#ff4d4d]'}>
                          {pos.pnl && pos.pnl >= 0 ? '+' : ''}${pos.pnl?.toFixed(2)} USDC
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
