import React, { useState } from 'react';
import { BotConfig } from '../types/bot';
import { Settings, X, RotateCcw, Save, KeyRound, Radio, ShieldCheck, Eye, EyeOff, AlertTriangle, CheckCircle2 } from 'lucide-react';

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
  hasEnvCredentials,
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
      zScoreUpper: 2.5,
      zScoreEntry: 2.3,
      zScoreLower: -2.5,
      zScoreLowerEntry: -2.3,
      maxPriceCents: 0.99,
      maxRiskPercent: 0.04,
      orderType: 'GTC',
      fractionChunks: 1,
      chunkDelayMs: 500,
      winProbability: 0.55,
      initialBalance: 1000,
      binanceRestUrl: 'https://api.binance.com/api/v3/klines',
      binanceWsUrl: 'wss://stream.binance.com/ws/btcusdt@kline_1m',
      limitlessWsUrl: 'wss://ws.limitless.exchange',
      limitlessMarketSlug: 'btc-up-or-down-15-min',
      limitlessApiKey: '',
      limitlessTokenId: '',
      limitlessTokenSecret: '',
      singleTradePerContract: true,
      cooldownMinutes: 15,
    });
  };

  const handleSave = () => {
    onSave(draft);
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
                {isAr ? 'إعدادات استراتيجية التداول (1m Binance · عقود 15 دقيقة)' : 'Trading Strategy Configuration (1m Binance · 15m Contracts)'}
              </h2>
              <div className="text-[11px] text-slate-400">
                {isAr ? '45 شمعة (1m) · تأكيد مزدوج (2.5 ← 2.3) · حجم ثابت 4% لكل عقد 15m · GTC بدون سقف سعر' : '45 Candles (1m) · Dual Confirmation (2.5 -> 2.3) · Fixed 4% per 15m Contract · GTC No Price Cap'}
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
                        ? 'لكي يقوم الروبوت بتوقيع وإرسال أوامر الشراء مباشرة لحسابك في منصة Limitless، يجب توفر المفتاح الخاص (PRIVATE_KEY) وتوثيق HMAC. يمكنك إدخالها أدناه مباشرة أو كتابتها في ملف .env في الخادم.'
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
              <div className="text-[10px] text-slate-400 leading-normal">
                {isAr
                  ? '💡 ملاحظة: عند حفظ المفاتيح هنا، يتم استخدامها لتوقيع صفقات EIP-712 الحية فوراً، أو يمكنك وضعها في ملف .env في الخادم كمتغيرات بيئة ثابتة.'
                  : '💡 Tip: Saved keys are used directly for live EIP-712 order signing, or you can specify them in your server .env file.'}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800">
              <label className="block text-slate-400 mb-1 font-semibold">
                {isAr ? 'رمز سوق التوقع (عقد 15 دقيقة حصراً):' : 'Prediction Market Slug (15-Minute Contract):'}
              </label>
              <input
                type="text"
                placeholder="btc-up-or-down-15-min"
                value={draft.limitlessMarketSlug}
                onChange={(e) => setDraft({ ...draft, limitlessMarketSlug: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-emerald-500"
              />
              <span className="text-[10px] text-emerald-400 mt-1 block">
                {isAr ? '✓ مؤمّن تلقائياً: يتم اكتشاف وتحديث عقد الـ 15 دقيقة النشط فوراً' : '✓ Auto-secured: 15-minute active BTC market is dynamically tracked'}
              </span>
            </div>
          </div>

          {/* Section 2: Market & Timeframe */}
          <div>
            <h3 className="font-semibold text-slate-100 uppercase tracking-wider text-[11px] mb-3 text-sky-400">
              {isAr ? 'السوق وفترة الشموع الحية (Binance 1m · 45 شمعة)' : 'Market & Rolling Window (Binance 1m · 45 Candles)'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">Trading Pair (SYMBOL)</label>
                <input
                  type="text"
                  value={draft.symbol}
                  onChange={(e) => setDraft({ ...draft, symbol: e.target.value.toUpperCase() })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Interval (TIMEFRAME)</label>
                <select
                  value={draft.timeframe}
                  onChange={(e) => setDraft({ ...draft, timeframe: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono"
                >
                  <option value="1m">1m (Default - 1min)</option>
                  <option value="5m">5m</option>
                  <option value="15m">15m</option>
                  <option value="1h">1h</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">{isAr ? 'عدد الشمعات التاريخية (45 شمعة)' : 'Historical Candles (45)'}</label>
                <input
                  type="number"
                  min="5"
                  max="200"
                  value={draft.periods}
                  onChange={(e) => setDraft({ ...draft, periods: parseInt(e.target.value) || 45 })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Bidirectional Z-Score Conditions */}
          <div className="border-t border-slate-800 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-100 uppercase tracking-wider text-[11px] text-sky-400">
                {isAr ? 'عتبات Z-Score: التأكيد الأول (2.5) والتأكيد الثاني (2.3)' : 'Z-Score Thresholds: 1st Confirmation (2.5) & 2nd Confirmation (2.3)'}
              </h3>
              <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                {isAr ? '⚡ تأكيد مزدوج (2.5 → 2.3)' : '⚡ Dual Confirm (2.5 → 2.3)'}
              </span>
            </div>

            {/* Strategy Direction Mode Selector */}
            <div>
              <label className="block text-slate-300 mb-1 font-semibold">
                {isAr ? 'نمط التداول والاتجاهات المسموحة:' : 'Strategy Trading Direction Mode:'}
              </label>
              <select
                value={draft.strategyDirection || 'BOTH'}
                onChange={(e) => setDraft({ ...draft, strategyDirection: e.target.value as any })}
                className="w-full bg-slate-950 border border-emerald-600/70 rounded-lg px-3 py-2 text-emerald-300 font-semibold"
              >
                <option value="BOTH">
                  {isAr ? '⚡ كلا الاتجاهين: صعود وهبوط (موصى به للربح المزدوج)' : '⚡ Both Directions (Long & Short - Recommended)'}
                </option>
                <option value="SHORT_ONLY">
                  {isAr ? '▼ هبوط فقط: ارتداد من القمة (Short / Buy DOWN)' : '▼ Short Only (Bearish Pullback from Peak)'}
                </option>
                <option value="LONG_ONLY">
                  {isAr ? '▲ صعود فقط: ارتداد من القاع (Long / Buy UP)' : '▲ Long Only (Bullish Rebound from Trough)'}
                </option>
              </select>
            </div>

            {/* Quick Sensitivity Presets */}
            <div className="flex flex-wrap items-center gap-2 pt-1 pb-1">
              <span className="text-[11px] text-slate-400">{isAr ? 'قالب الاستراتيجية المعتمد:' : 'Strategy Preset:'}</span>
              <button
                type="button"
                onClick={() => setDraft({
                  ...draft,
                  timeframe: '1m',
                  periods: 45,
                  zScoreUpper: 2.5,
                  zScoreEntry: 2.3,
                  zScoreLower: -2.5,
                  zScoreLowerEntry: -2.3,
                  maxRiskPercent: 0.04,
                  maxPriceCents: 0.99,
                  orderType: 'GTC',
                  cooldownMinutes: 15,
                })}
                className="px-2.5 py-1 rounded text-[11px] font-bold bg-emerald-950/80 hover:bg-emerald-900/90 text-emerald-300 border border-emerald-600/50 cursor-pointer"
              >
                {isAr ? '🎯 الإعدادات المعتمدة (1m · 45 شمعة · تأكيد أول 2.5 وتأكيد ثاني 2.3 · 4% · GTC)' : '🎯 Approved Preset (1m · 45 Candles · 2.5 -> 2.3 · 4% · GTC)'}
              </button>
            </div>

            {/* Thresholds Grid: Upper & Lower (First & Second Confirmation) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Upper Thresholds (Short / DOWN) */}
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-rose-900/40 space-y-2">
                <div className="text-rose-300 font-bold text-[11px]">
                  {isAr ? 'شروط الهبوط (Short / DOWN):' : 'Short / DOWN Confirmations:'}
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 text-[11px]">
                    {isAr ? 'التأكيد الأول (First Confirmation +2.5):' : 'First Confirmation (+2.5):'}
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={draft.zScoreUpper}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 2.5;
                      setDraft({ ...draft, zScoreUpper: val, zScoreLower: -Math.abs(val) });
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 text-[11px]">
                    {isAr ? 'التأكيد الثاني - الدخول (Second Confirmation +2.3):' : 'Second Confirmation - Entry (+2.3):'}
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={draft.zScoreEntry}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 2.3;
                      setDraft({ ...draft, zScoreEntry: val, zScoreLowerEntry: -Math.abs(val) });
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100 font-mono"
                  />
                </div>
              </div>

              {/* Lower Thresholds (Long / UP) */}
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-emerald-900/40 space-y-2">
                <div className="text-emerald-300 font-bold text-[11px]">
                  {isAr ? 'شروط الصعود (Long / UP):' : 'Long / UP Confirmations:'}
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 text-[11px]">
                    {isAr ? 'التأكيد الأول (First Confirmation -2.5):' : 'First Confirmation (-2.5):'}
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={draft.zScoreLower ?? -2.5}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || -2.5;
                      setDraft({ ...draft, zScoreLower: val });
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 text-[11px]">
                    {isAr ? 'التأكيد الثاني - الدخول (Second Confirmation -2.3):' : 'Second Confirmation - Entry (-2.3):'}
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={draft.zScoreLowerEntry ?? -2.3}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || -2.3;
                      setDraft({ ...draft, zScoreLowerEntry: val });
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100 font-mono"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Risk Sizing & Direct Order Execution */}
          <div className="border-t border-slate-800 pt-4">
            <h3 className="font-semibold text-slate-100 uppercase tracking-wider text-[11px] mb-3 text-sky-400">
              {isAr ? 'حجم الصفقة ونوع الأمر (4% ثابت من الرصيد لكل عقد 15m · GTC بدون سقف سعر)' : 'Bet Size & Order Type (Fixed 4% Bankroll per 15m Contract · GTC No Max Price)'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">
                  {isAr ? 'نوع الأمر (Order Type)' : 'Order Type'}
                </label>
                <select
                  value={draft.orderType}
                  onChange={(e) => setDraft({ ...draft, orderType: e.target.value as any })}
                  className="w-full bg-slate-950 border border-emerald-600/60 rounded-lg px-3 py-2 text-emerald-300 font-mono font-bold"
                >
                  <option value="GTC">GTC (Good-Til-Cancelled)</option>
                  <option value="FAK">FAK (Fill-And-Kill)</option>
                  <option value="IOC">IOC (Immediate-Or-Cancel)</option>
                  <option value="FOK">FOK (Fill-Or-Kill)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">
                  {isAr ? 'سقف سعر الدخول (بدون سقف = 0.99)' : 'Max Entry Price (0.99 = No Cap)'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="0.99"
                  value={draft.maxPriceCents}
                  onChange={(e) => setDraft({ ...draft, maxPriceCents: parseFloat(e.target.value) || 0.99 })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">
                  {isAr ? 'حجم الصفقة الثابت (4% كحد أقصى)' : 'Fixed Bet Size (Max 4%)'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.001"
                  max="0.04"
                  value={Math.min(draft.maxRiskPercent || 0.04, 0.04)}
                  onChange={(e) => setDraft({ ...draft, maxRiskPercent: Math.min(parseFloat(e.target.value) || 0.04, 0.04) })}
                  className="w-full bg-slate-950 border border-emerald-500/60 rounded-lg px-3 py-2 text-emerald-300 font-mono font-bold"
                />
              </div>
            </div>

            <div className="mt-2.5 p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-700/50 text-[11px] text-emerald-300 space-y-1.5">
              <div className="font-semibold text-emerald-200">
                {isAr
                  ? '✓ أمر GTC بدون سقف لسعر الدخول: يتم تنفيذ الأمر مباشرة بسعر العرض الحي في دفتر الأوامر (Live Market Ask) دون تقييد بسقف سعر.'
                  : '✓ GTC Order without Max Entry Price: Executes directly at the live market ask price without an entry price ceiling.'}
              </div>
              <div className="text-sky-300">
                {isAr
                  ? '🛡️ حجم الصفقة ثابت بنسبة 4% كحد أقصى من إجمالي رصيد المحفظة لكل عقد 15 دقيقة.'
                  : '🛡️ Bet size is fixed at max 4% of bankroll per 15-minute contract.'}
              </div>
            </div>
          </div>

          {/* Section 5: Anti-Duplicate & Cooldown Protection */}
          <div className="border-t border-slate-800 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-100 uppercase tracking-wider text-[11px] text-amber-400 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                <span>{isAr ? 'حماية منع تكرار الصفقات وقفل عقد الـ 15 دقيقة' : '15-Minute Contract Single-Trade Lock'}</span>
              </h3>
              <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                {isAr ? '🔒 4% لكل عقد 15m' : '🔒 4% Per 15m Contract'}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="singleTradeToggle"
                  checked={draft.singleTradePerContract !== false}
                  onChange={(e) => setDraft({ ...draft, singleTradePerContract: e.target.checked })}
                  className="mt-1 w-4 h-4 text-emerald-500 rounded bg-slate-900 border-slate-700 focus:ring-emerald-500 cursor-pointer"
                />
                <label htmlFor="singleTradeToggle" className="cursor-pointer">
                  <div className="font-bold text-slate-100 text-xs">
                    {isAr
                      ? 'قفل العقد: صفقة واحدة فقط (4% من الرصيد) لكل عقد 15 دقيقة'
                      : 'Lock Contract: Maximum 1 Trade (4% Bankroll) Per 15-Minute Contract'}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                    {isAr
                      ? 'يمنع الروبوت من فتح أكثر من صفقة واحدة على نفس عقد الـ 15 دقيقة، وينتقل تلقائياً للعقد الجديد فور بدايته.'
                      : 'Ensures max 4% of bankroll is risked per 15m contract and auto-unlocks when the next 15m contract begins.'}
                  </div>
                </label>
              </div>

              <div className="pt-2.5 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 gap-2 items-center">
                <div>
                  <label className="block text-slate-400 text-[11px] mb-1 font-semibold">
                    {isAr ? 'فترة عقد التوقع (دقائق):' : 'Contract Cooldown Period (Minutes):'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={draft.cooldownMinutes ?? 15}
                    onChange={(e) => setDraft({ ...draft, cooldownMinutes: Math.max(1, parseInt(e.target.value) || 15) })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100 font-mono text-xs focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="text-[10px] text-slate-400 leading-normal">
                  {isAr
                    ? '💡 القيمة الافتراضية 15 دقيقة مطابقة لعقد التوقع (15m Contract).'
                    : '💡 Default 15m matches the 15-minute prediction contract lifecycle.'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-950/60">
          <button
            onClick={handleResetDefaults}
            className="flex items-center gap-1.5 px-3 py-2 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{isAr ? 'استعادة إعدادات الكود' : 'Reset to Script Defaults'}</span>
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg shadow-sm transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isAr ? 'حفظ وتطبيق إعدادات التداول الحي' : 'Save Live Settings'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
