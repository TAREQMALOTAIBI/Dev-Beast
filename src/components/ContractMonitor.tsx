import React, { useState } from 'react';
import {
  Coins,
  ShieldCheck,
  ArrowUpRight,
  ArrowDownRight,
  Crosshair,
  Lock,
  Play,
  Check,
  AlertCircle,
} from 'lucide-react';
import { LimitlessContract, BotConfig } from '../types';

interface ContractMonitorProps {
  contract: LimitlessContract;
  config: BotConfig;
  walletBalance: number;
  currentBtcPrice: number;
  onManualTrigger: (side: 'YES' | 'NO', bypassWindow: boolean, bypassPriceFilter: boolean) => Promise<void>;
}

export const ContractMonitor: React.FC<ContractMonitorProps> = ({
  contract,
  config,
  walletBalance,
  currentBtcPrice,
  onManualTrigger,
}) => {
  const [isTriggering, setIsTriggering] = useState(false);
  const [bypassWindow, setBypassWindow] = useState(true);
  const [bypassPriceFilter, setBypassPriceFilter] = useState(false);
  const [selectedSide, setSelectedSide] = useState<'YES' | 'NO'>('YES');

  // Risk budget = 10% of balance
  const riskBudget = parseFloat((walletBalance * config.riskPercentage).toFixed(2));
  
  // Calculate shares for YES and NO
  const yesShares = contract.yesPrice > 0 ? Math.floor(riskBudget / contract.yesPrice) : 0;
  const noShares = contract.noPrice > 0 ? Math.floor(riskBudget / contract.noPrice) : 0;

  const handleTrigger = async (side: 'YES' | 'NO') => {
    setIsTriggering(true);
    try {
      await onManualTrigger(side, bypassWindow, bypassPriceFilter);
    } finally {
      setIsTriggering(false);
    }
  };

  return (
    <div
      id="limitless-contract-monitor"
      className="bg-[#0a0a0a] border border-[#222] p-5 sm:p-6 space-y-4"
    >
      {/* Title & Target Strike Price Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#222]">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono font-bold">
              مراقب عقود Limitless
            </h2>
            <span className="text-[10px] font-mono px-1.5 py-0.5 border border-[#333] bg-[#111] text-zinc-400">
              {contract.network}
            </span>
            {contract.spread !== undefined && (
              <span className={`text-[10px] font-mono px-1.5 py-0.5 border ${
                contract.isIlliquid
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
                  : 'border-[#00ff9d]/30 bg-[#00ff9d]/10 text-[#00ff9d]'
              }`}>
                السبريد: ${contract.spread.toFixed(3)}
              </span>
            )}
            {contract.isIlliquid && (
              <span className="text-[9px] font-mono px-1.5 py-0.5 border border-[#ff4d4d]/40 bg-[#ff4d4d]/10 text-[#ff4d4d]">
                سيولة دفتر أوامر منخفضة
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-300 font-mono mt-1 flex items-center gap-2">
            <span>{contract.title}</span>
            {contract.venueExchange && (
              <span className="text-[9px] text-zinc-500 font-mono">
                [CLOB: {contract.venueExchange.substring(0, 6)}...{contract.venueExchange.substring(contract.venueExchange.length - 4)}]
              </span>
            )}
          </p>
        </div>

        {/* Target Strike Price Metric */}
        <div className="bg-[#111] border border-[#222] px-4 py-2.5 flex items-center justify-between sm:justify-end gap-5">
          <div>
            <div className="text-[10px] text-zinc-500 font-mono uppercase tracking-tight">
              سعر الإضراب (Strike)
            </div>
            <div className="text-base font-bold font-mono text-white">
              ${contract.targetStrikePrice.toLocaleString()}
            </div>
          </div>
          <div className="text-left rtl:text-left">
            <div className="text-[10px] text-zinc-500 font-mono uppercase tracking-tight">
              الفارق عن الإضراب
            </div>
            <div
              className={`text-xs font-mono font-bold ${
                currentBtcPrice >= contract.targetStrikePrice ? 'text-[#00ff9d]' : 'text-[#ff4d4d]'
              }`}
            >
              {currentBtcPrice >= contract.targetStrikePrice ? '+' : ''}$
              {(currentBtcPrice - contract.targetStrikePrice).toFixed(1)}
            </div>
          </div>
        </div>
      </div>

      {/* YES / NO Prediction Tokens Price Cards with Geometric Split */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-[#222] border border-[#222]">
        {/* YES Token Card */}
        <div
          id="contract-token-yes"
          className="bg-[#0a0a0a] p-5 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-sm text-[#00ff9d] flex items-center gap-1">
                <ArrowUpRight className="h-4 w-4" />
                شراء صعود YES
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">
                (&gt; ${contract.targetStrikePrice.toLocaleString()})
              </span>
            </div>
            <span
              className={`text-[9px] font-mono px-2 py-0.5 border font-bold tracking-wider ${
                contract.isPriceInRangeYes
                  ? 'bg-[#00ff9d]/15 border-[#00ff9d]/40 text-[#00ff9d]'
                  : 'bg-[#111] border-[#222] text-zinc-500'
              }`}
            >
              {contract.isPriceInRangeYes ? 'ضمن النطاق المربح [≤$0.25]' : 'خارج النطاق'}
            </span>
          </div>

          <div className="flex items-baseline justify-between mt-3">
            <div>
              <div className="text-[10px] uppercase text-zinc-500 mb-0.5 font-bold font-mono">سعر صعود YES</div>
              <span className="text-3xl sm:text-4xl font-mono font-bold text-[#00ff9d]">
                ${contract.yesPrice.toFixed(2)}
              </span>
              <span className="text-xs text-zinc-500 font-mono mr-1.5">USDC</span>
            </div>
            <div className="text-left rtl:text-left text-[10px] font-mono text-zinc-500">
              <div>طلب (Ask): ${contract.bestYesAsk?.toFixed(2)}</div>
              <div>عرض (Bid): ${contract.bestYesBid?.toFixed(2)}</div>
            </div>
          </div>

          {/* Allocation details */}
          <div className="mt-4 pt-3 border-t border-[#222] flex items-center justify-between text-xs font-mono">
            <span className="text-zinc-500 text-[11px]">تخصيص 10% (${riskBudget > 0 ? riskBudget.toFixed(0) : '0'}):</span>
            <span className="font-bold text-[#00ff9d]">
              {yesShares} حصة (عائد متوقع: ${yesShares * 1.0})
            </span>
          </div>
        </div>

        {/* NO Token Card */}
        <div
          id="contract-token-no"
          className="bg-[#0a0a0a] p-5 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-sm text-[#ff4d4d] flex items-center gap-1">
                <ArrowDownRight className="h-4 w-4" />
                شراء هبوط NO
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">
                (≤ ${contract.targetStrikePrice.toLocaleString()})
              </span>
            </div>
            <span
              className={`text-[9px] font-mono px-2 py-0.5 border font-bold tracking-wider ${
                contract.isPriceInRangeNo
                  ? 'bg-[#ff4d4d]/15 border-[#ff4d4d]/40 text-[#ff4d4d]'
                  : 'bg-[#111] border-[#222] text-zinc-500'
              }`}
            >
              {contract.isPriceInRangeNo ? 'ضمن النطاق المربح [≤$0.25]' : 'خارج النطاق'}
            </span>
          </div>

          <div className="flex items-baseline justify-between mt-3">
            <div>
              <div className="text-[10px] uppercase text-zinc-500 mb-0.5 font-bold font-mono">سعر هبوط NO</div>
              <span className="text-3xl sm:text-4xl font-mono font-bold text-[#ff4d4d]">
                ${contract.noPrice.toFixed(2)}
              </span>
              <span className="text-xs text-zinc-500 font-mono mr-1.5">USDC</span>
            </div>
            <div className="text-left rtl:text-left text-[10px] font-mono text-zinc-500">
              <div>طلب (Ask): ${contract.bestNoAsk?.toFixed(2)}</div>
              <div>عرض (Bid): ${contract.bestNoBid?.toFixed(2)}</div>
            </div>
          </div>

          {/* Allocation details */}
          <div className="mt-4 pt-3 border-t border-[#222] flex items-center justify-between text-xs font-mono">
            <span className="text-zinc-500 text-[11px]">تخصيص 10% (${riskBudget > 0 ? riskBudget.toFixed(0) : '0'}):</span>
            <span className="font-bold text-[#ff4d4d]">
              {noShares} حصة (عائد متوقع: ${noShares * 1.0})
            </span>
          </div>
        </div>
      </div>

      {/* Execution Risk & Rule Box (Geometric Balance Style) */}
      <div className="p-3 bg-[#1a1a1a] border border-dashed border-zinc-700 text-center font-mono">
        <div className="text-[10px] uppercase text-zinc-400 tracking-wider font-bold">
          فحص المخاطرة: {walletBalance >= 5.0 ? 'اجتياز تام' : 'رصيد غير كافٍ'} • ميزانية المحفظة 10% (${riskBudget.toFixed(2)} USDC)
        </div>
        <div className="text-[9px] text-zinc-500 mt-1">
          القاعدة المؤسسية: أمر FAK (تنفيذ فوري أو إلغاء) • نطاق القيمة [$0.01 - $0.25] • الاحتفاظ الصارم حتى انتهاء الدقيقة 15:00
        </div>
      </div>

      {/* Operator Test Trigger Panel */}
      <div className="bg-[#111] border border-[#222] p-3.5 space-y-3 font-mono">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
              <Play className="h-3.5 w-3.5 text-[#00ff9d]" />
              لوحة اختبار المشغل والتحقق المباشر
            </span>
            <p className="text-[10px] text-zinc-500 mt-0.5">
              اختبار توقيع HMAC، وتنفيذ FAK السريع، وتسوية المراكز على محفظة Limitless.
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <label className="flex items-center gap-1.5 text-zinc-400 cursor-pointer">
              <input
                type="checkbox"
                checked={bypassWindow}
                onChange={(e) => setBypassWindow(e.target.checked)}
                className="border-[#333] bg-[#0a0a0a] text-[#00ff9d] focus:ring-0"
              />
              <span className="text-[11px]">تجاوز النافذة</span>
            </label>
            <label className="flex items-center gap-1.5 text-zinc-400 cursor-pointer">
              <input
                type="checkbox"
                checked={bypassPriceFilter}
                onChange={(e) => setBypassPriceFilter(e.target.checked)}
                className="border-[#333] bg-[#0a0a0a] text-[#00ff9d] focus:ring-0"
              />
              <span className="text-[11px]">تجاوز سقف 0.25$</span>
            </label>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            id="btn-test-trigger-yes"
            type="button"
            disabled={isTriggering}
            onClick={() => handleTrigger('YES')}
            className="flex-1 py-2 px-3 bg-[#00ff9d]/10 hover:bg-[#00ff9d]/20 border border-[#00ff9d]/40 text-[#00ff9d] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
            <span>تنفيذ تجربة (صعود YES @ ${contract.yesPrice.toFixed(2)})</span>
          </button>

          <button
            id="btn-test-trigger-no"
            type="button"
            disabled={isTriggering}
            onClick={() => handleTrigger('NO')}
            className="flex-1 py-2 px-3 bg-[#ff4d4d]/10 hover:bg-[#ff4d4d]/20 border border-[#ff4d4d]/40 text-[#ff4d4d] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <ArrowDownRight className="h-3.5 w-3.5" />
            <span>تنفيذ تجربة (هبوط NO @ ${contract.noPrice.toFixed(2)})</span>
          </button>
        </div>
      </div>
    </div>
  );
};
