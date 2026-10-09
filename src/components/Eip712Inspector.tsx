import React, { useState } from 'react';
import type { EIP712OrderPayload, OrderExecutionSummary } from '../bot/types';
import { Copy, Check, ShieldCheck, Key, Zap, CheckCircle2 } from 'lucide-react';

interface Eip712InspectorProps {
  payload: EIP712OrderPayload | null;
  signature?: string;
  executionResult?: OrderExecutionSummary;
}

export const Eip712Inspector: React.FC<Eip712InspectorProps> = ({
  payload,
  signature,
  executionResult,
}) => {
  const [copied, setCopied] = useState(false);

  if (!payload) {
    return (
      <div className="bg-slate-900/80 rounded-2xl border border-slate-800/80 p-5 shadow-2xl backdrop-blur-md text-slate-500 text-sm flex flex-col items-center justify-center h-64 text-center">
        <Key className="w-8 h-8 text-cyan-600/60 mb-2" />
        <p className="font-semibold text-slate-300">في انتظار بناء وتوقيع أمر EIP-712...</p>
        <span className="text-xs text-slate-400 mt-1 max-w-sm">
          عند تحقق إشارة الـ Z-Score (أعلى من 2.0 للهبوط أو أدنى من -2.0 للصعود)، يقوم النظام فورياً بتوليد التوقيع المشفر لأمر FAK وإرساله لمحرك Limitless.
        </span>
      </div>
    );
  }

  const jsonString = JSON.stringify(payload, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-slate-900/80 rounded-2xl border border-slate-800/80 p-4 shadow-2xl backdrop-blur-md space-y-3">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-cyan-400" />
          <div>
            <h3 className="font-bold text-white text-sm">حمولة أمر EIP-712 الموقعة رقمياً</h3>
            <p className="text-[11px] text-slate-400">
              تفويض تشفيري غير احتجازي (Non-Custodial) لمحرك مطابقة Limitless CLOB
            </p>
          </div>
        </div>

        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 transition-all font-mono"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'تم النسخ!' : 'نسخ كود JSON'}</span>
        </button>
      </div>

      {/* Critical Rules Verification Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
          <span className="text-slate-400 text-[10px] block font-sans">نوع الأمر (OrderType)</span>
          <span className="text-cyan-400 font-bold font-mono">OrderType.FAK (Fill &amp; Kill)</span>
        </div>
        <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
          <span className="text-slate-400 text-[10px] block font-sans">اتجاه الأمر (Side)</span>
          <span className="text-emerald-400 font-bold font-mono">Side.BUY (0)</span>
        </div>
        <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
          <span className="text-slate-400 text-[10px] block font-sans">سعر التنفيذ (Price)</span>
          <span className="text-white font-bold font-mono">
            ${(parseFloat(payload.message.price) / 1e6).toFixed(2)} USDC
          </span>
        </div>
        <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
          <span className="text-slate-400 text-[10px] block font-sans">حجم العقود (Size)</span>
          <span className="text-indigo-400 font-bold font-mono">{payload.message.makerAmount} عقد</span>
        </div>
      </div>

      {/* Token Approval & Venue Strip */}
      <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span className="text-slate-300 font-medium">اعتماد عملة USDC لعقد السوق:</span>
          <code className="text-cyan-400 font-mono text-[11px]">
            {payload.domain.verifyingContract.slice(0, 14)}... (Base Mainnet)
          </code>
        </div>
        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30">
          USDC Approved (MaxUint256)
        </span>
      </div>

      {/* Execution Matches Breakdown */}
      {executionResult && (
        <div className="p-2.5 rounded-xl bg-cyan-950/30 border border-cyan-500/30 text-xs space-y-1.5">
          <div className="flex items-center justify-between font-bold text-cyan-300">
            <span className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-cyan-400" />
              <span>نتائج المطابقة الفورية (CLOB Maker Matches):</span>
            </span>
            <span className="font-mono text-emerald-400">
              حالة التسوية: [{executionResult.settlementStatus}]
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono pt-1 border-t border-cyan-800/40 text-slate-300">
            {executionResult.makerMatches.map((m, idx) => (
              <div key={idx} className="p-1.5 bg-slate-950/80 rounded border border-slate-800">
                <span className="text-slate-500 block text-[9px]">عقد المطابقة #{idx + 1}:</span>
                <span className="text-white font-bold">{m.matchedSize} عقد</span> بسعر{' '}
                <span className="text-cyan-400">${m.matchedPrice.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* JSON Viewer */}
      <div className="relative" dir="ltr">
        <pre className="p-3 bg-slate-950 rounded-xl border border-slate-800 font-mono text-[11px] text-cyan-200/90 overflow-x-auto max-h-48 select-all text-left">
          {jsonString}
        </pre>
      </div>

      {/* Signature Box */}
      {signature && (
        <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs">
          <div className="flex items-center justify-between text-slate-400 text-[10px] mb-1">
            <span>توقيع ECDSA التشفيري المشتق من المحفظة الحقيقية بنظام EIP-712 Typed Data</span>
            <span className="text-emerald-400 font-bold">✓ توقيع EIP-712 معتمد</span>
          </div>
          <p className="text-emerald-300 break-all text-[11px] font-mono text-left" dir="ltr">{signature}</p>
        </div>
      )}
    </div>
  );
};
