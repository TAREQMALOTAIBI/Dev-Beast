import React, { useState } from 'react';
import { X, Key, Sliders, Shield, Wallet, Save, ExternalLink } from 'lucide-react';
import { BotConfig } from '../types';

interface ConfigModalProps {
  config: BotConfig;
  walletBalance: number;
  onClose: () => void;
  onSaveConfig: (updated: Partial<BotConfig>) => Promise<void>;
  onUpdateWalletBalance: (balance: number) => Promise<void>;
}

export const ConfigModal: React.FC<ConfigModalProps> = ({
  config,
  walletBalance,
  onClose,
  onSaveConfig,
  onUpdateWalletBalance,
}) => {
  const [zScoreThreshold, setZScoreThreshold] = useState(config.zScoreThreshold);
  const [momentumThreshold, setMomentumThreshold] = useState(config.momentumThreshold);
  const [oiDropThreshold, setOiDropThreshold] = useState(config.oiDropThreshold);
  const [liveMode, setLiveMode] = useState(config.liveMode);
  const [tokenId, setTokenId] = useState(config.limitlessTokenId);
  const [tokenSecret, setTokenSecret] = useState(config.limitlessTokenSecret);
  const [walletAddress, setWalletAddress] = useState(config.limitlessWalletAddress);
  const [balance, setBalance] = useState(walletBalance);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSaveConfig({
        zScoreThreshold: Number(zScoreThreshold),
        momentumThreshold: Number(momentumThreshold),
        oiDropThreshold: Number(oiDropThreshold),
        liveMode,
        limitlessTokenId: tokenId,
        limitlessTokenSecret: tokenSecret,
        limitlessWalletAddress: walletAddress,
      });

      if (balance !== walletBalance) {
        await onUpdateWalletBalance(Number(balance));
      }
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
              الإعدادات وتهيئة واجهات API
            </h2>
            <div className="text-sm font-bold text-white mt-0.5">
              المعايير الكمية وإعداد محفظة Limitless المضمنة
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
          {/* Section 1: Quantitative Trigger Rules */}
          <div className="space-y-3">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-[#00ff9d]"></span>
              <span>1. معايير الإشارات الكمية المشغلة</span>
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
                  المعيار: 1.5σ إلى 1.8σ (20 فترة)
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
                  المعيار: |P - P_open| ≥ 25.0$ دولار
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
                  المعيار: هبوط ≥ 0.5% (تصفية سريعة)
                </p>
              </div>
            </div>
          </div>

          {/* Section 2: Limitless Exchange Derived API Token (HMAC-SHA256) */}
          <div className="space-y-3 pt-3 border-t border-[#222]">
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-blue-500"></span>
                <span>2. رمز واجهة Limitless المشتق عبر HMAC-SHA256</span>
              </div>
              <span className="text-[10px] text-zinc-600">
                Privy Profile ← API Tokens ← Derive
              </span>
            </div>

            <div className="bg-[#111] p-4 border border-[#222] space-y-3">
              <div>
                <label className="block text-zinc-400 mb-1 text-[10px] uppercase tracking-tight">
                  معرّف الرمز (Token ID)
                </label>
                <input
                  type="text"
                  placeholder="مثال: tok_live_4a8b29f01c..."
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
                  placeholder="مثال: sec_live_9f02a819b..."
                  value={tokenSecret}
                  onChange={(e) => setTokenSecret(e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-[#333] px-2.5 py-1.5 text-white focus:outline-none focus:border-[#00ff9d] text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1 text-[10px] uppercase tracking-tight">
                  عنوان محفظة Limitless المضمنة (Base Mainnet)
                </label>
                <input
                  type="text"
                  placeholder="0x..."
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-[#333] px-2.5 py-1.5 text-white focus:outline-none focus:border-[#00ff9d] text-xs font-mono"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Wallet Balance & Execution Mode */}
          <div className="space-y-3 pt-3 border-t border-[#222]">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-[#00ff9d]"></span>
              <span>3. حجم الرصيد ونمط التنفيذ</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-[#111] p-3.5 border border-[#222]">
                <label className="block text-zinc-400 mb-1 text-[10px] uppercase tracking-tight">
                  رصيد المحفظة المضمنة (USDC)
                </label>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-zinc-500">$</span>
                  <input
                    type="number"
                    step="10"
                    min="10"
                    value={balance}
                    onChange={(e) => setBalance(parseFloat(e.target.value))}
                    className="w-full bg-[#0a0a0a] border border-[#333] px-2.5 py-1.5 text-white focus:outline-none focus:border-[#00ff9d]"
                  />
                </div>
                <p className="text-[10px] text-zinc-600 mt-1.5">
                  ميزانية الأمر (10%): ${(balance * 0.1).toFixed(2)} USDC لكل صفقة
                </p>
              </div>

              <div className="bg-[#111] p-3.5 border border-[#222] flex flex-col justify-between">
                <div>
                  <label className="block text-zinc-400 mb-1 text-[10px] uppercase tracking-tight">
                    نمط التنفيذ
                  </label>
                  <div className="flex items-center gap-4 mt-2">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="mode"
                        checked={!liveMode}
                        onChange={() => setLiveMode(false)}
                        className="text-[#00ff9d] focus:ring-0"
                      />
                      <span className="text-zinc-300 text-xs">تجريبي (Dry-Run)</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="mode"
                        checked={liveMode}
                        onChange={() => setLiveMode(true)}
                        className="text-[#ff4d4d] focus:ring-0"
                      />
                      <span className="text-[#ff4d4d] font-bold text-xs">تداول حقيقي (Live)</span>
                    </label>
                  </div>
                </div>
                <p className="text-[10px] text-zinc-600 mt-2">
                  {liveMode
                    ? 'يتم إرسال الأوامر مباشرة إلى عقد Limitless Exchange الذكي على شبكة Base'
                    : 'محاكاة بدون مخاطرة بأموال حقيقية مع متابعة سجل الأوامر المباشر'}
                </p>
              </div>
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
              <span>حفظ الإعدادات</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
