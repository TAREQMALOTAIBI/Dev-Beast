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
      periods: 180,
      strategyDirection: 'BOTH',
      zScoreUpper: 2.4,
      zScoreEntry: 2.4,
      zScoreLower: -2.2,
      zScoreLowerEntry: -2.2,
      maxPriceCents: 0.46,
      maxRiskPercent: 0.04,
      orderType: 'FAK',
      fractionChunks: 1,
      chunkDelayMs: 0,
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
      calculateOnCandleClose: true,
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
                {isAr ? 'إعدادات استراتيجية التداول (1m Live WS · عقود 15 دقيقة)' : 'Trading Strategy Configuration (1m Live WS · 15m Contracts)'}
              </h2>
              <div className="text-[11px] text-slate-400">
                {isAr
                  ? '180-SMA (1m) · عتبات غير متماثلة (Short +2.4σ / Long -2.2σ) · فلاتر RV و ADX · أمر FAK ≤ 46¢'
                  : '180-SMA (1m) · Asymmetric Z (Short +2.4σ / Long -2.2σ) · RV & ADX Filters · FAK ≤ 46¢'}
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
              {isAr ? 'السوق ومتوسط الشموع وأفق الإشارة (Binance 1m · 180-SMA · K=3m)' : 'Market, Lookback & Horizon (Binance 1m · 180-SMA · K=3m)'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">Trading Pair</label>
                <input
                  type="text"
                  value={draft.symbol}
                  onChange={(e) => setDraft({ ...draft, symbol: e.target.value.toUpperCase() })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Interval (Timeframe)</label>
                <select
                  value={draft.timeframe}
                  onChange={(e) => setDraft({ ...draft, timeframe: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono"
                >
                  <option value="1m">1m (1 min)</option>
                  <option value="5m">5m</option>
                  <option value="15m">15m</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">{isAr ? 'الشموع (180-SMA)' : 'Lookback (180-SMA)'}</label>
                <input
                  type="number"
                  min="5"
                  max="300"
                  value={draft.periods}
                  onChange={(e) => setDraft({ ...draft, periods: parseInt(e.target.value) || 180 })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1" title="Signal Horizon K (دقائق)">
                  {isAr ? 'أفق الإشارة (K دقائق)' : 'Signal Horizon (K)'}
                </label>
                <input
                  type="number"
                  min="1"
                  max="15"
                  value={draft.signalHorizonMinutes || 3}
                  onChange={(e) => setDraft({ ...draft, signalHorizonMinutes: Math.max(1, parseInt(e.target.value) || 3) })}
                  className="w-full bg-slate-950 border border-sky-600/60 rounded-lg px-3 py-2 text-sky-300 font-mono font-bold"
                />
              </div>
            </div>
            <div className="mt-1.5 text-[10px] text-slate-500 font-mono">
              {isAr ? '💡 أفق الإشارة (K=3m): يقيس العائد Return_3m وفلتر التقلب RV_3m على مدى 3 دقائق لاقتناص الارتداد السريع.' : '💡 Signal Horizon (K=3m): Measures Return_3m and Volatility RV_3m over a 3-minute lookback for mean reversion.'}
            </div>
          </div>

          {/* Section 3: Bidirectional Z-Score Conditions */}
          <div className="border-t border-slate-800 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-100 uppercase tracking-wider text-[11px] text-sky-400">
                {isAr ? 'عتبات Z-Score غير المتماثلة (Short: +2.40σ / Long: -2.20σ) وفلاتر Document 6' : 'Asymmetric Z-Score (Short: +2.40σ / Long: -2.20σ) & Document 6 Filters'}
              </h3>
              <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                {isAr ? '⚡ L: -2.2σ / S: +2.4σ' : '⚡ L: -2.2σ / S: +2.4σ'}
              </span>
            </div>

            {/* Strategy Direction Mode Selector */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    {isAr ? '⚡ كلا الاتجاهين: صعود وهبوط' : '⚡ Both Directions (Long & Short)'}
                  </option>
                  <option value="SHORT_ONLY">
                    {isAr ? '▼ هبوط فقط: ارتداد من القمة (Short)' : '▼ Short Only'}
                  </option>
                  <option value="LONG_ONLY">
                    {isAr ? '▲ صعود فقط: ارتداد من القاع (Long)' : '▲ Long Only'}
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">
                  {isAr ? 'توقيت حساب الإشارة والتنفيذ:' : 'Calculation & Trigger Timing:'}
                </label>
                <select
                  value={draft.calculateOnCandleClose !== false ? 'CLOSE' : 'TICK'}
                  onChange={(e) => setDraft({ ...draft, calculateOnCandleClose: e.target.value === 'CLOSE' })}
                  className="w-full bg-slate-950 border border-sky-600/70 rounded-lg px-3 py-2 text-sky-300 font-semibold"
                >
                  <option value="CLOSE">
                    {isAr ? '🎯 بعد إغلاق الشمعة (1m Candle Close)' : '🎯 On Candle Close (1m) — Recommended'}
                  </option>
                  <option value="TICK">
                    {isAr ? '⚡ لحظي مع كل نبضة (Live Intra-Candle Ticks)' : '⚡ Live Intra-Candle Ticks'}
                  </option>
                </select>
              </div>
            </div>

            {/* Quick Sensitivity Presets */}
            <div className="flex flex-wrap items-center gap-2 pt-1 pb-1">
              <span className="text-[11px] text-slate-400">{isAr ? 'قالب الاستراتيجية المعتمد:' : 'Strategy Preset:'}</span>
              <button
                type="button"
                onClick={() => setDraft({
                  ...draft,
                  timeframe: '1m',
                  periods: 180,
                  signalHorizonMinutes: 3,
                  calculateOnCandleClose: true,
                  zScoreUpper: 2.4,
                  zScoreEntry: 2.4,
                  zScoreLower: -2.2,
                  zScoreLowerEntry: -2.2,
                  maxRiskPercent: 0.04,
                  maxPriceCents: 0.46,
                  orderType: 'FAK',
                  singleTradePerContract: true,
                  cooldownMinutes: 15,
                })}
                className="px-2.5 py-1 rounded text-[11px] font-bold bg-emerald-950/80 hover:bg-emerald-900/90 text-emerald-300 border border-emerald-600/50 cursor-pointer"
              >
                {isAr ? '🎯 إعدادات Document 6 (180 شمعة 1m · Short +2.4σ / Long -2.2σ · فلاتر RV و ADX · أمر FAK ≤ 46¢)' : '🎯 Document 6 Preset (180-SMA 1m · Short +2.4σ / Long -2.2σ · RV & ADX · FAK ≤ 46¢)'}
              </button>
            </div>

            {/* Thresholds Grid: Upper & Lower (Asymmetric Document 6) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Upper Threshold (Short / DOWN) */}
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-rose-900/40 space-y-2">
                <div className="text-rose-300 font-bold text-[11px]">
                  {isAr ? 'عتبة الهبوط (Short / DOWN):' : 'Short / DOWN Threshold:'}
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 text-[11px]">
                    {isAr ? 'عتبة الدخول (≥ +2.40σ انحياز الصعود):' : 'Entry Threshold (≥ +2.40σ):'}
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    value={draft.zScoreUpper}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 2.4;
                      setDraft({
                        ...draft,
                        zScoreUpper: val,
                        zScoreEntry: val,
                      });
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100 font-mono"
                  />
                </div>
              </div>

              {/* Lower Threshold (Long / UP) */}
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-emerald-900/40 space-y-2">
                <div className="text-emerald-300 font-bold text-[11px]">
                  {isAr ? 'عتبة الصعود (Long / UP):' : 'Long / UP Threshold:'}
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 text-[11px]">
                    {isAr ? 'عتبة الدخول (≤ -2.20σ):' : 'Entry Threshold (≤ -2.20σ):'}
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    value={draft.zScoreLower ?? -2.2}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || -2.2;
                      setDraft({
                        ...draft,
                        zScoreLower: val,
                        zScoreLowerEntry: val,
                      });
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
              {isAr ? 'حجم الصفقة ونوع الأمر (3-5% ربع-كيلي · أمر FAK بسقف صلب ≤ 46¢)' : 'Bet Size & Order Type (Quarter-Kelly 3-5% · FAK Hard Cap ≤ 46¢)'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">
                  {isAr ? 'نوع الأمر المعتمد' : 'Order Type'}
                </label>
                <select
                  value={draft.orderType || 'FAK'}
                  onChange={(e) => setDraft({ ...draft, orderType: e.target.value as any })}
                  className="w-full bg-slate-950 border border-emerald-600/60 rounded-lg px-3 py-2 text-emerald-300 font-mono font-bold"
                >
                  <option value="FAK">FAK (Fill-And-Kill / IOC)</option>
                  <option value="GTC">GTC (Good-Til-Cancelled)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">
                  {isAr ? 'سقف الدخول الصلب (0.46 = 46¢)' : 'Hard Cap Price (0.46 = 46¢)'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="0.50"
                  value={draft.maxPriceCents}
                  onChange={(e) => setDraft({ ...draft, maxPriceCents: Math.min(parseFloat(e.target.value) || 0.46, 0.50) })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">
                  {isAr ? 'نسبة رأس المال (3-5% كحد أقصى)' : 'Capital Ratio (3-5% Max)'}
                </label>
                <input
                  type="number"
                  step="0.005"
                  min="0.01"
                  max="0.05"
                  value={Math.min(draft.maxRiskPercent || 0.04, 0.05)}
                  onChange={(e) => setDraft({ ...draft, maxRiskPercent: Math.min(parseFloat(e.target.value) || 0.04, 0.05) })}
                  className="w-full bg-slate-950 border border-emerald-500/60 rounded-lg px-3 py-2 text-emerald-300 font-mono font-bold"
                />
              </div>
            </div>

            <div className="mt-2.5 p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-700/50 text-[11px] text-emerald-300 space-y-1.5">
              <div className="font-semibold text-emerald-200">
                {isAr
                  ? '✓ أمر FAK بسقف دخول صلب 46¢ ($0.46): لا تدفع أكثر من 50¢ أبداً، والهدف الفعلي 46¢، مع تنفيذ Fill-And-Kill فوري.'
                  : '✓ FAK Order with ≤ 46¢ ($0.46) Hard Cap: Never pay > 50¢, actual target 46¢ with instant Fill-And-Kill execution.'}
              </div>
              <div className="text-sky-300">
                {isAr
                  ? '🛡️ حجم الصفقة ربع-كيلي (0.25 × Kelly) بحد أقصى 3-5% من رصيد المحفظة مع قفل دخول لصفقة واحدة لكل عقد 15 دقيقة.'
                  : '🛡️ Sizing: 0.25 × Kelly, max 3-5% of bankroll with Single-Entry Lock per 15m Market.'}
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
