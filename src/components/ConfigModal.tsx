import React, { useState } from 'react';
import { X, Key, Sliders, Shield, Wallet, Save, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { BotConfig } from '../types';

interface ConfigModalProps {
  config: BotConfig;
  walletBalance: number;
  isWalletConnected?: boolean;
  ethGasBalance?: number;
  onClose: () => void;
  onSaveConfig: (updated: Partial<BotConfig>) => Promise<void>;
  onRefreshBalance?: () => Promise<void>;
}

export const ConfigModal: React.FC<ConfigModalProps> = ({
  config,
  walletBalance,
  isWalletConnected = false,
  ethGasBalance = 0,
  onClose,
  onSaveConfig,
  onRefreshBalance,
}) => {
  const [zScoreThreshold, setZScoreThreshold] = useState(config.zScoreThreshold);
  const [momentumThreshold, setMomentumThreshold] = useState(config.momentumThreshold);
  const [oiDropThreshold, setOiDropThreshold] = useState(config.oiDropThreshold);
  const [liveMode, setLiveMode] = useState(config.liveMode);
  const [tokenId, setTokenId] = useState(config.limitlessTokenId);
  const [tokenSecret, setTokenSecret] = useState(config.limitlessTokenSecret);
  const [walletAddress, setWalletAddress] = useState(config.limitlessWalletAddress);
  const [isSaving, setIsSaving] = useState(false);
  const [isCheckingRpc, setIsCheckingRpc] = useState(false);
  const [rpcStatusMsg, setRpcStatusMsg] = useState<string | null>(null);

  const isValidAddress = /^0x[a-fA-F0-9]{40}$/.test(walletAddress.trim());

  const handleRefreshRpc = async () => {
    if (!isValidAddress) {
      setRpcStatusMsg('⚠️ يرجى إدخال عنوان محفظة Base صحيح أولاً (يبدأ بـ 0x بطول 42 حرف)');
      return;
    }
    setIsCheckingRpc(true);
    setRpcStatusMsg(null);
    try {
      // Save the address first if changed
      await onSaveConfig({
        limitlessWalletAddress: walletAddress.trim(),
        limitlessTokenId: tokenId.trim(),
        limitlessTokenSecret: tokenSecret.trim(),
      });
      if (onRefreshBalance) {
        await onRefreshBalance();
      }
      setRpcStatusMsg('✅ تم جلب الرصيد الحقيقي مباشرة من بلوكشين Base بنجاح!');
    } catch {
      setRpcStatusMsg('❌ تعذر الاتصال ببلوكشين Base، تحقق من الاتصال بالإنترنت.');
    } finally {
      setIsCheckingRpc(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSaveConfig({
        zScoreThreshold: Number(zScoreThreshold),
        momentumThreshold: Number(momentumThreshold),
        oiDropThreshold: Number(oiDropThreshold),
        liveMode,
        limitlessTokenId: tokenId.trim(),
        limitlessTokenSecret: tokenSecret.trim(),
        limitlessWalletAddress: walletAddress.trim(),
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        id="bot-config-modal"
        className="bg-[#0a0a0a] border border-[#222] w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-5 font-mono text-xs"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#222]">
          <div>
            <h2 className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
              إعدادات المحرك الكمي ومحفظة Base الحقيقية
            </h2>
            <div className="text-sm font-bold text-white mt-0.5">
              ربط محفظة Limitless الحقيقية وتفويض التداول
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 border border-[#222] bg-[#111] text-zinc-400 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-5 text-xs">
          {/* Section 1: Real Wallet & API Integration */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-[#00ff9d]"></span>
                <span>1. ربط محفظة Limitless الحقيقية (Base Mainnet)</span>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 border ${
                isValidAddress
                  ? 'bg-[#00ff9d]/10 text-[#00ff9d] border-[#00ff9d]/30'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
              }`}>
                {isValidAddress ? '● المحفظة محددة' : '⚠️ غير مربوطة بعد'}
              </span>
            </div>

            {/* Live On-Chain Balance Display */}
            <div className="bg-[#111] p-4 border border-[#222] space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#0a0a0a] p-3 border border-[#222]">
                <div>
                  <span className="text-[10px] text-zinc-500 uppercase tracking-tight block">
                    الرصيد الحقيقي المقروء من شبكة Base Mainnet
                  </span>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="text-xl font-bold font-mono text-[#00ff9d]">
                      ${walletBalance.toFixed(2)}
                    </span>
                    <span className="text-xs text-zinc-400 font-mono">USDC</span>
                    {ethGasBalance > 0 && (
                      <span className="text-[10px] text-zinc-500 mr-2">
                        (غاز: {ethGasBalance} ETH)
                      </span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleRefreshRpc}
                  disabled={isCheckingRpc}
                  className="px-3 py-1.5 bg-[#1a1a1a] hover:bg-[#222] border border-[#333] text-zinc-300 hover:text-white flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`h-3 w-3 ${isCheckingRpc ? 'animate-spin text-[#00ff9d]' : ''}`} />
                  <span>تحديث الرصيد من البلوكشين</span>
                </button>
              </div>

              {rpcStatusMsg && (
                <div className="text-[11px] font-mono p-2 bg-[#161616] border border-[#333] text-zinc-300">
                  {rpcStatusMsg}
                </div>
              )}

              {/* Wallet Address Input */}
              <div>
                <label className="block text-zinc-400 mb-1 text-[10px] uppercase tracking-tight">
                  عنوان محفظة Limitless المضمنة (Embedded Privy Wallet Address)
                </label>
                <input
                  type="text"
                  placeholder="0x... (الصق عنوان محفظتك من منصة Limitless)"
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-[#333] px-2.5 py-2 text-white focus:outline-none focus:border-[#00ff9d] text-xs font-mono"
                />
                <p className="text-[10px] text-zinc-500 mt-1">
                  * هذا هو عنوان المحفظة الذكية الخاصة بك على شبكة Base Mainnet، يتم قراءة رصيد الـ USDC الحقيقي منها بدون أي محاكاة.
                </p>
              </div>

              {/* Limitless API Token ID */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-zinc-400 mb-1 text-[10px] uppercase tracking-tight">
                    معرّف الرمز (Token ID)
                  </label>
                  <input
                    type="text"
                    placeholder="tok_live_..."
                    value={tokenId}
                    onChange={(e) => setTokenId(e.target.value)}
                    className="w-full bg-[#0a0a0a] border border-[#333] px-2.5 py-1.5 text-white focus:outline-none focus:border-[#00ff9d] text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1 text-[10px] uppercase tracking-tight">
                    سر التوقيع (Token Secret - HMAC Signer)
                  </label>
                  <input
                    type="password"
                    placeholder="sec_live_..."
                    value={tokenSecret}
                    onChange={(e) => setTokenSecret(e.target.value)}
                    className="w-full bg-[#0a0a0a] border border-[#333] px-2.5 py-1.5 text-white focus:outline-none focus:border-[#00ff9d] text-xs font-mono"
                  />
                </div>
              </div>

              {/* Quick instructions guide */}
              <div className="p-2.5 bg-[#141414] border border-[#222] text-[10px] text-zinc-400 space-y-1">
                <div className="text-zinc-300 font-bold">خطوات الحصول على البيانات من Limitless:</div>
                <div>1. افتح منصة <span className="text-[#00ff9d]">limitless.exchange</span> وسجل الدخول بحسابك.</div>
                <div>2. انسخ عنوان محفظتك المضمنة (يبدأ بـ 0x) والصقه في الحقل أعلاه.</div>
                <div>3. توجه إلى Profile ← API Tokens ← واضغط على Derive لاستخراج Token ID و Secret.</div>
              </div>
            </div>
          </div>

          {/* Section 2: Quantitative Trigger Rules */}
          <div className="space-y-3 pt-3 border-t border-[#222]">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-blue-500"></span>
              <span>2. معايير الإشارات الكمية المشغلة</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Z-Score Threshold */}
              <div className="bg-[#111] p-3 border border-[#222]">
                <label className="block text-zinc-400 mb-1 text-[10px] uppercase tracking-tight">
                  عتبة Z-Score (|Z| ≥ σ)
                </label>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="number"
                    step="0.1"
                    min="1.0"
                    max="3.0"
                    value={zScoreThreshold}
                    onChange={(e) => setZScoreThreshold(parseFloat(e.target.value))}
                    className="w-full bg-[#0a0a0a] border border-[#333] px-2.5 py-1.5 text-white focus:outline-none focus:border-[#00ff9d]"
                  />
                  <span className="text-zinc-500">σ</span>
                </div>
                <p className="text-[9px] text-zinc-600 mt-1.5">
                  المعيار: 1.5σ إلى 1.8σ
                </p>
              </div>

              {/* Momentum Delta */}
              <div className="bg-[#111] p-3 border border-[#222]">
                <label className="block text-zinc-400 mb-1 text-[10px] uppercase tracking-tight">
                  فارق الزخم السعري (|Δ| ≥ $)
                </label>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-zinc-500">$</span>
                  <input
                    type="number"
                    step="1"
                    min="5"
                    max="500"
                    value={momentumThreshold}
                    onChange={(e) => setMomentumThreshold(parseFloat(e.target.value))}
                    className="w-full bg-[#0a0a0a] border border-[#333] px-2.5 py-1.5 text-white focus:outline-none focus:border-[#00ff9d]"
                  />
                </div>
                <p className="text-[9px] text-zinc-600 mt-1.5">
                  المعيار: |P - P_open| ≥ 25.0$
                </p>
              </div>

              {/* OI Drop Threshold */}
              <div className="bg-[#111] p-3 border border-[#222]">
                <label className="block text-zinc-400 mb-1 text-[10px] uppercase tracking-tight">
                  هبوط OI (خلال 1m)
                </label>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="10.0"
                    value={oiDropThreshold}
                    onChange={(e) => setOiDropThreshold(parseFloat(e.target.value))}
                    className="w-full bg-[#0a0a0a] border border-[#333] px-2.5 py-1.5 text-white focus:outline-none focus:border-[#00ff9d]"
                  />
                  <span className="text-zinc-500">%</span>
                </div>
                <p className="text-[9px] text-zinc-600 mt-1.5">
                  المعيار: هبوط ≥ 0.5%
                </p>
              </div>
            </div>
          </div>

          {/* Section 3: Execution Mode (Live vs Dry-Run) */}
          <div className="space-y-3 pt-3 border-t border-[#222]">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-purple-500"></span>
              <span>3. نمط التنفيذ</span>
            </div>

            <div className="bg-[#111] p-4 border border-[#222]">
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="mode"
                    checked={!liveMode}
                    onChange={() => setLiveMode(false)}
                    className="text-[#00ff9d] focus:ring-0"
                  />
                  <span className="text-zinc-300 text-xs">وضع المراقبة التجريبي (Dry-Run)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="mode"
                    checked={liveMode}
                    onChange={() => setLiveMode(true)}
                    className="text-[#ff4d4d] focus:ring-0"
                  />
                  <span className="text-[#ff4d4d] font-bold text-xs">● تداول حقيقي بأموال المحفظة (Live)</span>
                </label>
              </div>
              <p className="text-[10px] text-zinc-500 mt-2">
                {liveMode
                  ? '⚠️ تداول حي نشط: ترسل الأوامر مباشرة إلى عقد Limitless Exchange على شبكة Base مع خصم 10% من رصيد USDC الفعلي لكل صفقة مستوفية للشروط.'
                  : 'وضع المراقبة الآمن: تتبع الإشارات وتسجيل الأوامر افتراضياً بدون إرسال معاملات حقيقية.'}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="pt-4 border-t border-[#222] flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-[#333] bg-[#111] text-zinc-400 hover:text-white uppercase tracking-wider text-xs font-bold transition-colors"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 bg-[#00ff9d] text-black font-bold uppercase tracking-wider text-xs hover:bg-[#00ff9d]/90 transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              <span>حفظ وتطبيق الإعدادات</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
