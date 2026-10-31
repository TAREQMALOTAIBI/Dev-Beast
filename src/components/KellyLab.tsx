import React from 'react';
import { BotConfig, KellyMath } from '../types/bot';
import { formatUsd } from '../utils/math';
import { ShieldCheck, Percent, TrendingUp, Zap } from 'lucide-react';

interface KellyLabProps {
  balance: number;
  config: BotConfig;
  kelly: KellyMath;
  onUpdateConfig: (partial: Partial<BotConfig>) => void;
  lang: 'en' | 'ar';
  isLiveBalance?: boolean;
}

export const KellyLab: React.FC<KellyLabProps> = ({
  balance,
  config,
  kelly,
  onUpdateConfig,
  lang,
  isLiveBalance,
}) => {
  const isAr = lang === 'ar';

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/90 backdrop-blur-sm p-5 flex flex-col gap-5">
      {/* Title & Concept */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <h2 className="font-bold text-slate-100 text-sm tracking-wide">
            {isAr ? 'إدارة المخاطر وحجم الصفقة (حجم ثابت 4% من الرصيد لكل عقد 15 دقيقة)' : 'Bankroll Sizing (Fixed Max 4% per 15m Contract)'}
          </h2>
        </div>
        <div className="text-xs font-mono text-slate-400">
          Fixed Bet Size: <span className="text-emerald-400 font-bold">4.0% / 15m Contract</span>
        </div>
      </div>

      {/* Mathematical Breakdown Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
          <div className="text-slate-400 mb-1 flex items-center justify-between">
            <span>{isAr ? 'نسبة العائد (b)' : 'Payout Odds (b)'}</span>
            <span className="font-mono text-slate-500">(1-c)/c</span>
          </div>
          <div className="text-lg font-mono font-bold text-slate-100">
            {kelly.b.toFixed(2)}:1
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            {isAr
              ? 'أمر GTC بسعر العرض الحي بدون سقف سعر دخول'
              : 'GTC Order at live market ask (No max entry price)'}
          </p>
        </div>

        <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
          <div className="text-slate-400 mb-1 flex items-center justify-between">
            <span>{isAr ? 'نسبة النجاح المتوقعة (p)' : 'Win Probability (p)'}</span>
            <TrendingUp className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div className="text-lg font-mono font-bold text-sky-400">
            {(kelly.p * 100).toFixed(0)}%
          </div>
          <p className="text-[10px] text-slate-500 mt-1 font-mono">
            q = 1 - p = {(kelly.q * 100).toFixed(0)}%
          </p>
        </div>

        <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
          <div className="text-slate-400 mb-1 flex items-center justify-between">
            <span>{isAr ? 'نوع الأمر وسقف السعر' : 'Order Type & Price Cap'}</span>
            <Percent className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-lg font-mono font-bold text-amber-400">
            GTC (No Cap)
          </div>
          <p className="text-[10px] text-slate-500 mt-1 font-mono">
            {isAr ? 'بدون سقف سعر دخول' : 'Without max entry price'}
          </p>
        </div>

        <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-800/40">
          <div className="text-emerald-300 mb-1 flex items-center justify-between font-medium">
            <span>{isAr ? 'حجم الصفقة الثابت المطبق' : 'Enforced Bet Size'}</span>
            <span className="text-[10px] bg-emerald-900/60 text-emerald-300 px-1 rounded">Fixed 4%</span>
          </div>
          <div className="text-lg font-mono font-bold text-emerald-400">
            {(kelly.riskToTake * 100).toFixed(2)}%
          </div>
          <p className="text-[10px] text-emerald-500/80 mt-1">
            {isAr ? 'حجم ثابت 4% كحد أقصى من الرصيد لكل عقد 15 دقيقة' : 'Max Fixed 4% of bankroll per 15m contract'}
          </p>
        </div>
      </div>

      {/* Sizing & Single Order Result (No Chunks) */}
      <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
            {isAr ? 'حجم الصفقة الإجمالي (4% من الرصيد لكل عقد 15m)' : 'Allocated Bet Size (4% Bankroll per 15m Contract)'}
          </div>
          <div className="text-2xl font-mono font-bold text-slate-100 mt-0.5">
            {formatUsd(kelly.positionSizeUsd)}
          </div>
          <div className="text-xs text-slate-400 mt-0.5 flex flex-wrap items-center gap-1.5">
            <span>
              {isAr ? 'من إجمالي الرصيد الفعلي ' : 'From current live account balance '}
            </span>
            <span className="font-mono text-emerald-300 font-bold">{formatUsd(balance)}</span>
            {isLiveBalance && (
              <span className="text-[10px] text-emerald-400 bg-emerald-950 px-1.5 py-0.5 rounded border border-emerald-700/60 font-sans font-medium">
                {isAr ? 'محفظة Base الحقيقية' : 'Base Mainnet'}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-6 text-sm border-t md:border-t-0 md:border-l border-slate-800 pt-3 md:pt-0 md:pl-6">
          <div>
            <div className="text-xs text-slate-400">
              {isAr ? 'عدد العقود التقديري' : 'Estimated Contracts'}
            </div>
            <div className="text-xl font-mono font-bold text-sky-400">
              {kelly.numberOfContracts}{' '}
              <span className="text-xs text-slate-400 font-normal">
                ({isAr ? 'بسعر السوق الحي' : '@ Live Market Price'})
              </span>
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-400 flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              <span>{isAr ? 'نوع الأمر المعتمد' : 'Order Execution'}</span>
            </div>
            <div className="text-xs font-mono text-emerald-300 font-semibold mt-1">
              {isAr ? 'GTC بدون سقف سعر دخول' : 'GTC Without Max Entry Price'}
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Parameter Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-800/80 text-xs">
        <div>
          <div className="flex justify-between text-slate-300 mb-1 font-medium">
            <span>{isAr ? 'نسبة فوز الاستراتيجية' : 'Estimated Win Rate'}</span>
            <span className="font-mono text-sky-400">{(config.winProbability * 100).toFixed(0)}%</span>
          </div>
          <input
            type="range"
            min="0.30"
            max="0.80"
            step="0.01"
            value={config.winProbability}
            onChange={(e) => onUpdateConfig({ winProbability: parseFloat(e.target.value) })}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500"
          />
          <div className="flex justify-between text-[10px] text-slate-500 mt-1">
            <span>30%</span>
            <span>55% (Default)</span>
            <span>80%</span>
          </div>
        </div>

        <div>
          <div className="flex justify-between text-slate-300 mb-1 font-medium">
            <span>{isAr ? 'حجم الصفقة المعتمد (4% كحد أقصى لكل عقد 15m)' : 'Fixed Bet Size Cap (Max 4% per 15m Contract)'}</span>
            <span className="font-mono text-emerald-400">{(Math.min(config.maxRiskPercent || 0.04, 0.04) * 100).toFixed(1)}%</span>
          </div>
          <input
            type="range"
            min="0.005"
            max="0.04"
            step="0.005"
            value={Math.min(config.maxRiskPercent || 0.04, 0.04)}
            onChange={(e) => onUpdateConfig({ maxRiskPercent: Math.min(parseFloat(e.target.value), 0.04) })}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
          />
          <div className="flex justify-between text-[10px] text-slate-500 mt-1">
            <span>1%</span>
            <span>2%</span>
            <span className="text-emerald-400 font-bold">4% (Max Fixed per 15m Contract)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
