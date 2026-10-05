import React, { useState, useEffect } from 'react';
import {
  Wallet,
  TrendingUp,
  History,
  Award,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  Coins,
  ShieldCheck,
} from 'lucide-react';
import type { ClobPosition, TradeHistoryEntry, UserProfile } from '../bot/types';
import { LimitlessExchangeSDK } from '../bot/limitlessSdk';

interface PortfolioViewerProps {
  sdk: LimitlessExchangeSDK;
}

export const PortfolioViewer: React.FC<PortfolioViewerProps> = ({ sdk }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [positions, setPositions] = useState<ClobPosition[]>([]);
  const [history, setHistory] = useState<TradeHistoryEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const loadPortfolioData = async () => {
    setLoading(true);
    try {
      const [prof, pos, hist] = await Promise.all([
        sdk.getProfile(),
        sdk.getCLOBPositions(),
        sdk.getUserHistory(),
      ]);
      setProfile(prof);
      setPositions(pos);
      setHistory(hist.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPortfolioData();
  }, [sdk]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(text);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  // احتساب الإجماليات
  const totalCostBasis = positions.reduce((acc, p) => {
    const yesCost = parseFloat(p.positions.yes.cost || '0');
    const noCost = parseFloat(p.positions.no.cost || '0');
    return acc + yesCost + noCost;
  }, 0);

  const totalMarketValue = positions.reduce((acc, p) => {
    const yesVal = parseFloat(p.positions.yes.marketValue || '0');
    const noVal = parseFloat(p.positions.no.marketValue || '0');
    return acc + yesVal + noVal;
  }, 0);

  const totalUnrealizedPnl = totalMarketValue - totalCostBasis;

  return (
    <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-6 shadow-2xl backdrop-blur-md space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>المحفظة والمراكز وسجل التداول (Portfolio &amp; Positions)</span>
              <span className="px-2 py-0.5 rounded text-[10px] bg-cyan-950 text-cyan-300 border border-cyan-800/50">
                PortfolioFetcher API
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              متابعة المراكز المفتوحة في عقود الـ 15 دقيقة، حساب الأرباح غير المحققة (PnL)، وتتبع سجل الصفقات.
            </p>
          </div>
        </div>

        <button
          onClick={loadPortfolioData}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-300 transition-all self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
          <span>تحديث المحفظة</span>
        </button>
      </div>

      {/* Profile & KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Profile Card */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
          <span className="text-[10px] text-slate-400 font-sans block">معرف الملف الشخصي (Profile)</span>
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-cyan-400 font-bold">
              ID: {profile?.id || '845391'}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30">
              رسوم {profile?.rank?.feeRateBps || 15} bps
            </span>
          </div>
          <span className="text-[11px] font-mono text-slate-400 truncate block">
            {profile?.account || sdk.wallet?.address}
          </span>
        </div>

        {/* Cost Basis */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
          <span className="text-[10px] text-slate-400 font-sans block">رأس المال المستثمر (Cost Basis)</span>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-bold font-mono text-white">
              ${totalCostBasis.toFixed(2)}
            </span>
            <span className="text-xs text-slate-400">USDC</span>
          </div>
          <span className="text-[10px] text-slate-500">إجمالي تكلفة عقود التنبؤ المشتراة</span>
        </div>

        {/* Market Value */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
          <span className="text-[10px] text-slate-400 font-sans block">القيمة السوقية الحالية (Market Value)</span>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-bold font-mono text-cyan-400">
              ${totalMarketValue.toFixed(2)}
            </span>
            <span className="text-xs text-slate-400">USDC</span>
          </div>
          <span className="text-[10px] text-slate-500">محسوبة بأسعار أفضل العروض الحالية</span>
        </div>

        {/* Unrealized PnL */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
          <span className="text-[10px] text-slate-400 font-sans block">الربح/الخسارة غير المحققة (Unrealized PnL)</span>
          <div className="flex items-baseline gap-1">
            <span
              className={`text-lg font-bold font-mono ${
                totalUnrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {totalUnrealizedPnl >= 0 ? `+$${totalUnrealizedPnl.toFixed(2)}` : `-$${Math.abs(totalUnrealizedPnl).toFixed(2)}`}
            </span>
            <span className="text-xs text-slate-400">USDC</span>
          </div>
          <span className="text-[10px] text-emerald-400 font-mono">
            {totalCostBasis > 0 ? `+${((totalUnrealizedPnl / totalCostBasis) * 100).toFixed(1)}%` : '0%'}
          </span>
        </div>
      </div>

      {/* CLOB Positions Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-200 flex items-center gap-2">
            <Coins className="w-4 h-4 text-cyan-400" />
            <span>مراكز CLOB المفتوحة (Active Positions)</span>
          </h3>
          <span className="text-xs font-mono text-slate-500">{positions.length} مركز مفتوح</span>
        </div>

        {positions.length === 0 ? (
          <div className="p-8 text-center bg-slate-950 rounded-xl border border-slate-800 text-slate-500 text-xs">
            لا توجد مراكز تداول مفتوحة حالياً. سيتم تحديث هذا الجدول فور تنفيذ البوت لأي صفقة شراء.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-medium text-[11px]">
                <tr>
                  <th className="py-2.5 px-3">سوق العقد (Market)</th>
                  <th className="py-2.5 px-3">عقود YES</th>
                  <th className="py-2.5 px-3">عقود NO</th>
                  <th className="py-2.5 px-3">تكلفة الدخول (Cost)</th>
                  <th className="py-2.5 px-3">القيمة الحالية (Value)</th>
                  <th className="py-2.5 px-3">الربح غير المحقق (PnL)</th>
                  <th className="py-2.5 px-3">موعد التسوية</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 bg-slate-950/40 font-mono">
                {positions.map((pos, idx) => {
                  const hasNo = parseInt(pos.tokensBalance.no || '0', 10) > 0;
                  const hasYes = parseInt(pos.tokensBalance.yes || '0', 10) > 0;
                  const cost = parseFloat(pos.positions.no.cost || pos.positions.yes.cost || '0');
                  const val = parseFloat(pos.positions.no.marketValue || pos.positions.yes.marketValue || '0');
                  const pnl = val - cost;

                  return (
                    <tr key={idx} className="hover:bg-slate-900/60 transition-colors">
                      <td className="py-2.5 px-3 font-sans">
                        <span className="font-bold text-white block text-xs">{pos.market.title}</span>
                        <span className="text-[10px] text-cyan-400 font-mono">{pos.market.slug}</span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={hasYes ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                          {pos.tokensBalance.yes} عقد
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={hasNo ? 'text-rose-400 font-bold' : 'text-slate-500'}>
                          {pos.tokensBalance.no} عقد
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">
                        ${cost.toFixed(2)} USDC
                      </td>
                      <td className="py-2.5 px-3 text-cyan-400 font-bold">
                        ${val.toFixed(2)} USDC
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={pnl >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                          {pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 text-[10px] font-sans">
                        {new Date(pos.market.deadline).toLocaleTimeString('ar-EG')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Trade History Activity Stream */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-200 flex items-center gap-2">
            <History className="w-4 h-4 text-cyan-400" />
            <span>سجل المعاملات والتنفيذ (User Trade History)</span>
          </h3>
          <span className="text-xs font-mono text-slate-500">{history.length} صفقة مسجلة</span>
        </div>

        {history.length === 0 ? (
          <div className="p-8 text-center bg-slate-950 rounded-xl border border-slate-800 text-slate-500 text-xs">
            لا توجد سجلات تداول بعد.
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((item, idx) => (
              <div
                key={idx}
                className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold text-[10px] font-mono">
                      {item.strategy}
                    </span>
                    <span className="font-bold text-white">{item.market.title}</span>
                    <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">
                      {item.outcomeIndex === 0 ? 'عقد YES' : 'عقد NO'}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-slate-400 text-[11px] font-mono">
                    <span>الكمية: <strong className="text-white">{item.outcomeTokenAmount}</strong> عقد</span>
                    <span>•</span>
                    <span>السعر: <strong className="text-cyan-400">${item.outcomeTokenPrice.toFixed(2)}</strong></span>
                    <span>•</span>
                    <span>المبلغ المدفوع: <strong className="text-emerald-400">${item.collateralAmount} USDC</strong></span>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <span className="text-[10px] text-slate-500 font-mono">
                    {new Date(item.blockTimestamp * 1000).toLocaleTimeString('ar-EG')}
                  </span>
                  <button
                    onClick={() => copyToClipboard(item.transactionHash)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-[10px] font-mono text-slate-300 border border-slate-800 transition-all"
                    title="نسخ هاش المعاملة txHash"
                  >
                    {copiedHash === item.transactionHash ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3 text-slate-400" />
                    )}
                    <span>{item.transactionHash.slice(0, 8)}...</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
