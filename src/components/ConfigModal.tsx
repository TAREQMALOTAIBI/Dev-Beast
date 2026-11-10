import React, { useState } from 'react';
import { BotConfig } from '../types/bot';
import { X, RotateCcw, Save, KeyRound, Radio, ShieldCheck, Eye, EyeOff, AlertTriangle } from 'lucide-react';

interface ConfigModalProps {
  config: BotConfig;
  isOpen: boolean;
  onClose: () => void;
  onSave: (newConfig: BotConfig) => void;
  lang: 'en' | 'ar';
  hasEnvCredentials?: boolean;
  liveWallet?: import('../types/bot').LiveWalletInfo | null;
}

export const ConfigModal: React.FC<ConfigModalProps> = ({
  config,
  isOpen,
  onClose,
  onSave,
  lang,
  liveWallet,
}) => {
  const isAr = lang === 'ar';
  const [draft, setDraft] = useState<BotConfig>({ ...config });
  const [showKeys, setShowKeys] = useState(false);

  if (!isOpen) return null;

  const handleResetDefaults = () => {
    setDraft({
      symbol: 'BTCUSDT',
      timeframe: '1m',
      periods: 45,
      strategyDirection: 'BOTH',
      zScoreUpper: 0,
      zScoreEntry: 0,
      zScoreLower: 0,
      zScoreLowerEntry: 0,
      maxPriceCents: 0.99,
      maxRiskPercent: 0.10,
      orderType: 'FAK',
      fractionChunks: 1,
      chunkDelayMs: 0,
      winProbability: 0.90,
      initialBalance: 1000,
      binanceRestUrl: 'https://api.binance.com/api/v3/klines',
      binanceWsUrl: 'wss://stream.binance.com/ws/btcusdt@kline_1m',
      limitlessWsUrl: 'wss://ws.limitless.exchange',
      limitlessMarketSlug: 'btc-up-or-down-5-min',
      limitlessApiKey: draft.limitlessApiKey || '',
      limitlessTokenId: draft.limitlessTokenId || '',
      limitlessTokenSecret: draft.limitlessTokenSecret || '',
      privateKey: draft.privateKey || '',
      singleTradePerContract: true,
      cooldownMinutes: 5,
      calculateOnCandleClose: false,
      adxThreshold: 100,
      rvMinBp: 0,
      rvMaxBp: 10000,
      entryWindowStartMin: 4,
      entryWindowEndMin: 5,
    });
  };

  const handleSave = () => {
    onSave({
      ...draft,
      orderType: 'FAK',
      maxPriceCents: 0.99,
      limitlessMarketSlug: 'btc-up-or-down-5-min',
      cooldownMinutes: 5,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-2.5">
            <Radio className="w-5 h-5 text-emerald-400 animate-pulse" />
            <div>
              <h2 className="text-base font-bold text-slate-100">
                {isAr
                  ? 'إعدادات قنص الدقيقة الأخيرة (عقود بيتكوين 5 دقائق · بدون مؤشرات أو فلاتر)'
                  : 'Last-Minute 5m BTC Sniper Configuration (No Indicators / No Filters)'}
              </h2>
              <div className="text-[11px] text-slate-400">
                {isAr
                  ? 'دخول آخر دقيقة (≤ 60 ثانية) · العقد المضمون تقريباً · أمر FAK بدون سقف سعري · 10% من رأس المال'
                  : 'Last-Minute Entry (≤ 60s) · Winning Outcome · FAK No Price Cap · 10% Capital'}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-300">
          {/* Live Wallet & Secrets Status Banner */}
          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider">
                <ShieldCheck className={`w-4 h-4 ${liveWallet?.isLive ? 'text-emerald-400' : 'text-amber-400'}`} />
                <span className={liveWallet?.isLive ? 'text-emerald-400' : 'text-amber-300'}>
                  {isAr ? 'حالة محفظة التداول الحي (Limitless EIP-712)' : 'Live Trading Wallet Status (Limitless EIP-712)'}
                </span>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border shadow-sm ${
                  liveWallet?.isLive
                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-600/60'
                    : 'bg-amber-950/80 text-amber-300 border-amber-600/60'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${liveWallet?.isLive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
                {liveWallet?.isLive
                  ? isAr ? 'المحفظة متصلة (تداول حي)' : 'Live Wallet Connected'
                  : isAr ? 'وضع المعاينة (المفاتيح غير مربوطة)' : 'Preview Mode (Keys Missing)'}
              </span>
            </div>

            {liveWallet?.isLive ? (
              <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-700/40 flex flex-wrap items-center justify-between gap-3 shadow-sm">
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                  <div>
                    <div className="font-bold text-slate-100 flex items-center gap-2">
                      <span>{liveWallet.username || 'On-Chain Wallet'}</span>
                      <span className="font-mono text-[11px] text-emerald-300">
                        {liveWallet.address ? `${liveWallet.address.slice(0, 8)}...${liveWallet.address.slice(-6)}` : 'Detecting...'}
                      </span>
                    </div>
                    <div className="text-[10px] text-emerald-400 mt-0.5">
                      {liveWallet.network} · {liveWallet.ethBalance.toFixed(4)} ETH for gas
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-400">{isAr ? 'الرصيد الحي المتاح حالياً' : 'Live Balance'}</div>
                  <div className="text-base font-bold font-mono text-emerald-300">${liveWallet.usdcBalance.toFixed(2)} USDC</div>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-600/50 space-y-2 text-[11px]">
                <div className="flex items-start gap-2 text-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-amber-300 mb-0.5">
                      {isAr
                        ? 'تنبيه: الصفقات لن تنفذ على محفظتك في Limitless حتى تضيف المفاتيح الحية'
                        : 'Notice: Live on-chain orders will not execute until live keys are configured'}
                    </div>
                    <p className="text-amber-200/90 leading-relaxed">
                      {isAr
                        ? 'لكي يقوم الروبوت بتوقيع وإرسال أوامر الشراء مباشرة لحسابك في منصة Limitless، يجب توفر المفتاح الخاص (PRIVATE_KEY) وتوثيق HMAC.'
                        : 'To execute signed EIP-712 orders directly to Limitless, provide your PRIVATE_KEY and HMAC credentials below or in your server .env file.'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Live Credentials Inputs Section */}
            <div className="space-y-3 pt-2 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-sky-400" />
                  <span>{isAr ? 'مفاتيح التداول الحي وتوثيق HMAC:' : 'Live Trading Credentials & HMAC:'}</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowKeys(!showKeys)}
                  className="text-[11px] text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer"
                >
                  {showKeys ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{showKeys ? (isAr ? 'إخفاء المفاتيح' : 'Hide Keys') : (isAr ? 'إظهار / تعديل المفاتيح' : 'Show / Edit Keys')}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                <div>
                  <label className="block text-slate-400 mb-1 text-[11px]">
                    {isAr ? 'المفتاح الخاص للمحفظة (PRIVATE_KEY):' : 'Wallet Private Key (PRIVATE_KEY):'}
                  </label>
                  <input
                    type={showKeys ? 'text' : 'password'}
                    placeholder="0x... أو في ملف .env"
                    value={draft.privateKey || ''}
                    onChange={(e) => setDraft({ ...draft, privateKey: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-400 mb-1 text-[11px]">
                      {isAr ? 'معرف توكن Limitless (LMTS_TOKEN_ID):' : 'Limitless Token ID (LMTS_TOKEN_ID):'}
                    </label>
                    <input
                      type={showKeys ? 'text' : 'password'}
                      placeholder="e.g. 172... أو في .env"
                      value={draft.limitlessTokenId || ''}
                      onChange={(e) => setDraft({ ...draft, limitlessTokenId: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1 text-[11px]">
                      {isAr ? 'الرمز السري لتوكن Limitless (LMTS_TOKEN_SECRET):' : 'Limitless Token Secret (LMTS_TOKEN_SECRET):'}
                    </label>
                    <input
                      type={showKeys ? 'text' : 'password'}
                      placeholder="HMAC Secret أو في .env"
                      value={draft.limitlessTokenSecret || ''}
                      onChange={(e) => setDraft({ ...draft, limitlessTokenSecret: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: 5-Minute Last-Minute Execution Settings */}
          <div className="border-t border-slate-800 pt-4 space-y-3">
            <h3 className="font-semibold text-slate-100 uppercase tracking-wider text-[11px] text-sky-400">
              {isAr
                ? 'إعدادات التنفيذ: عقد بيتكوين 5 دقائق · آخر دقيقة · أمر FAK بدون سقف سعري · 10% من رأس المال'
                : 'Execution Settings: 5-Minute BTC Contract · Last Minute · FAK No Price Cap · 10% Capital'}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">
                  {isAr ? 'نوع العقد المستهدف' : 'Target Contract'}
                </label>
                <input
                  type="text"
                  disabled
                  value="btc-up-or-down-5-min (5m)"
                  className="w-full bg-slate-950 border border-emerald-600/60 rounded-lg px-3 py-2 text-emerald-300 font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">
                  {isAr ? 'نوع الأمر وسقف السعر' : 'Order Type & Price Cap'}
                </label>
                <input
                  type="text"
                  disabled
                  value={isAr ? 'FAK (بدون سقف سعري)' : 'FAK (No Price Cap)'}
                  className="w-full bg-slate-950 border border-sky-600/60 rounded-lg px-3 py-2 text-sky-300 font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">
                  {isAr ? 'نسبة الدخول من رأس المال (0.10 = 10%)' : 'Capital Allocation (0.10 = 10%)'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="1.00"
                  value={draft.maxRiskPercent || 0.10}
                  onChange={(e) => setDraft({ ...draft, maxRiskPercent: Math.min(Math.max(parseFloat(e.target.value) || 0.10, 0.01), 1.0) })}
                  className="w-full bg-slate-950 border border-emerald-500/60 rounded-lg px-3 py-2 text-emerald-300 font-mono font-bold"
                />
              </div>
            </div>

            <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-700/50 text-[11px] text-emerald-200 space-y-1.5">
              <div className="font-bold">
                {isAr
                  ? '✓ تم حذف جميع المؤشرات والفلاتر (Z-Score / ADX / RV) بالكامل.'
                  : '✓ All indicators and filters (Z-Score / ADX / RV) are completely removed.'}
              </div>
              <div className="text-slate-300">
                {isAr
                  ? '🎯 يقوم الروبوت بمراقبة عقد البيتكوين 5 دقائق، وعند دخول الدقيقة الأخيرة (≤ 60 ثانية متبقية للتسوية) يشتري العقد المضمون تقريباً (الأعلى احتمالاً للفوز UP أو DOWN) فوراً بأمر FAK بدون سقف سعري وبنسبة 10% من رأس المال.'
                  : '🎯 The bot monitors the active 5-minute BTC contract and enters during the final 60 seconds into the leading outcome (UP or DOWN) using a FAK order with no price cap and 10% of capital.'}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-950/60">
          <button
            onClick={handleResetDefaults}
            className="flex items-center gap-1.5 px-3 py-2 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{isAr ? 'استعادة الإعدادات الافتراضية (10% · 5m)' : 'Reset Defaults (10% · 5m)'}</span>
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isAr ? 'حفظ وتطبيق الإعدادات' : 'Save Settings'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
