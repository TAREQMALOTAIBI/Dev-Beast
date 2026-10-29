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
      timeframe: '1h',
      periods: 30,
      strategyDirection: 'BOTH',
      zScoreUpper: 2.0,
      zScoreEntry: 2.0,
      zScoreLower: -2.0,
      zScoreLowerEntry: -2.0,
      maxPriceCents: 0.85,
      maxRiskPercent: 0.01,
      orderType: 'FAK',
      fractionChunks: 1,
      chunkDelayMs: 500,
      winProbability: 0.55,
      initialBalance: 1000,
      binanceRestUrl: 'https://api.binance.com/api/v3/klines',
      binanceWsUrl: 'wss://stream.binance.com/ws/btcusdt@kline_1h',
      limitlessWsUrl: 'wss://ws.limitless.exchange',
      limitlessMarketSlug: 'btc-up-or-down-hourly',
      limitlessApiKey: '',
      limitlessTokenId: '',
      limitlessTokenSecret: '',
      singleTradePerContract: true,
      cooldownMinutes: 60,
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
                {isAr ? 'إعدادات استراتيجية التداول (1-Hour BTC)' : 'Trading Strategy Configuration (1h BTC)'}
              </h2>
              <div className="text-[11px] text-slate-400">
                {isAr ? 'ضبط معايير Z-Score ونموذج كيلي للأحجام الجزئية وسوق العقود' : 'Z-Score Thresholds, Fractional Kelly Sizing & Market Settings'}
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
                {isAr ? 'رمز سوق التوقع (عقد الساعة حصراً):' : 'Prediction Market Slug (Hourly Only):'}
              </label>
              <input
                type="text"
                placeholder="btc-up-or-down-hourly"
                value={draft.limitlessMarketSlug}
                onChange={(e) => setDraft({ ...draft, limitlessMarketSlug: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-emerald-500"
              />
              <span className="text-[10px] text-emerald-400 mt-1 block">
                {isAr ? '✓ مؤمّن تلقائياً: يتم اكتشاف وتحديث عقد الساعة النشط فوراً' : '✓ Auto-secured: 1-hour active market is dynamically tracked'}
              </span>
            </div>
          </div>

          {/* Section 2: Market & Timeframe */}
          <div>
            <h3 className="font-semibold text-slate-100 uppercase tracking-wider text-[11px] mb-3 text-sky-400">
              {isAr ? 'السوق وفترة الشموع الحية (Binance)' : 'Market & Rolling Window'}
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
                  <option value="1m">1m</option>
                  <option value="5m">5m</option>
                  <option value="15m">15m</option>
                  <option value="1h">1h (Default - عقود الساعة)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">{isAr ? 'عدد الشمعات التاريخية (N)' : 'Rolling Periods (N)'}</label>
                <input
                  type="number"
                  min="5"
                  max="100"
                  value={draft.periods}
                  onChange={(e) => setDraft({ ...draft, periods: parseInt(e.target.value) || 30 })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Bidirectional Z-Score Conditions */}
          <div className="border-t border-slate-800 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-100 uppercase tracking-wider text-[11px] text-sky-400">
                {isAr ? 'عتبات واستراتيجية Z-Score ثنائية الاتجاه' : 'Bidirectional Z-Score Strategy Settings'}
              </h3>
              <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                {isAr ? '⚡ ربح في الصعود والهبوط' : '⚡ Long & Short Reversion'}
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
              <span className="text-[10px] text-slate-400 mt-1 block">
                {isAr
                  ? 'عند اختيار كلا الاتجاهين، يفتح الروبوت صفقات هبوط (DOWN) عند تراجع السعر من ذروة الشراء، وصفقات صعود (UP) عند ارتداد السعر من ذروة البيع.'
                  : 'In BOTH mode, the bot trades Bearish Reversions (DOWN) from overbought peaks, and Bullish Reversions (UP) from oversold troughs.'}
              </span>
            </div>

            {/* Quick Sensitivity Presets */}
            {/* Quick Sensitivity Presets */}
            <div className="flex flex-wrap items-center gap-2 pt-1 pb-1">
              <span className="text-[11px] text-slate-400">{isAr ? 'قالب الاستراتيجية المعتمد:' : 'Strategy Preset:'}</span>
              <button
                type="button"
                onClick={() => setDraft({
                  ...draft,
                  zScoreUpper: 2.0,
                  zScoreEntry: 2.0,
                  zScoreLower: -2.0,
                  zScoreLowerEntry: -2.0,
                })}
                className="px-2.5 py-1 rounded text-[11px] font-bold bg-emerald-950/80 hover:bg-emerald-900/90 text-emerald-300 border border-emerald-600/50 cursor-pointer"
              >
                {isAr ? '🎯 العتبة المعتمدة (±2.0σ) - شرط الدخول فور تجاوز العتبة 2' : '🎯 Approved (±2.0σ) - Entry on Exceeding 2'}
              </button>
            </div>

            {/* Thresholds Grid: Upper & Lower */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Upper Threshold (Rise) */}
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-rose-900/40">
                <label className="block text-rose-300 mb-1 font-semibold">
                  {isAr ? 'عتبة شرط الدخول في الصعود (Z_SCORE_UPPER):' : 'Upper Entry Threshold (Z_SCORE_UPPER):'}
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={draft.zScoreUpper}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 2.0;
                    setDraft({ ...draft, zScoreUpper: val, zScoreEntry: val });
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  {isAr ? 'تنفيذ فوري لصفقة هبوط (DOWN) بمجرد تجاوز +2.0σ' : 'Fires Short / DOWN order when Z exceeds +2.0σ'}
                </span>
              </div>

              {/* Lower Threshold (Decline) */}
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-emerald-900/40">
                <label className="block text-emerald-300 mb-1 font-semibold">
                  {isAr ? 'عتبة شرط الدخول في الهبوط (Z_SCORE_LOWER):' : 'Lower Entry Threshold (Z_SCORE_LOWER):'}
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={draft.zScoreLower ?? -2.0}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || -2.0;
                    setDraft({ ...draft, zScoreLower: val, zScoreLowerEntry: val });
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  {isAr ? 'تنفيذ فوري لصفقة صعود (UP) بمجرد تجاوز -2.0σ' : 'Fires Long / UP order when Z drops below -2.0σ'}
                </span>
              </div>
            </div>
          </div>

          {/* Section 4: Risk Sizing & Direct Order Execution */}
          <div className="border-t border-slate-800 pt-4">
            <h3 className="font-semibold text-slate-100 uppercase tracking-wider text-[11px] mb-3 text-sky-400">
              {isAr ? 'إدارة المخاطر والتنفيذ المباشر (سقف أمان المحفظة 1% أقصى)' : 'Risk Management & Direct Execution (1% Max Safety Cap)'}
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
                  <option value="FAK">FAK (Fill-And-Kill)</option>
                  <option value="IOC">IOC (Immediate-Or-Cancel)</option>
                  <option value="GTC">GTC (Good-Til-Cancelled)</option>
                  <option value="FOK">FOK (Fill-Or-Kill)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">
                  {isAr ? 'سقف سعر الشراء الأقصى للعقد ($)' : 'Max Price Ceiling ($)'}
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={draft.maxPriceCents}
                  onChange={(e) => setDraft({ ...draft, maxPriceCents: parseFloat(e.target.value) || 0.85 })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">
                  {isAr ? 'سقف المخاطرة المعتمد (1% كحد أقصى)' : 'Enforced Risk Cap (1% Max)'}
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  max="0.01"
                  value={Math.min(draft.maxRiskPercent || 0.01, 0.01)}
                  onChange={(e) => setDraft({ ...draft, maxRiskPercent: Math.min(parseFloat(e.target.value) || 0.01, 0.01) })}
                  className="w-full bg-slate-950 border border-emerald-500/60 rounded-lg px-3 py-2 text-emerald-300 font-mono font-bold"
                />
              </div>
            </div>

            <div className="mt-2.5 p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-700/50 text-[11px] text-emerald-300 space-y-1.5">
              <div className="font-semibold text-emerald-200">
                {isAr
                  ? '✓ تم إلغاء تجزئة العقود: يتم تنفيذ الصفقة مباشرة كأمر موحد كامل دفعة واحدة بنوع FAK دون تقسيم.'
                  : '✓ Contract Chunking Removed: Trade is executed directly as a single unified order via FAK without chunk splits.'}
              </div>
              <div className="text-sky-300">
                {isAr
                  ? '🛡️ سقف المخاطرة محدد ومعتمد بنسبة 1% كحد أقصى من رصيد المحفظة لحماية رأس المال وفق نموذج كيلي فائق الأمان.'
                  : '🛡️ Risk cap is locked at 1% maximum of account balance for capital preservation under conservative Kelly Criterion.'}
              </div>
            </div>
          </div>

          {/* Section 5: Anti-Duplicate & Cooldown Protection */}
          <div className="border-t border-slate-800 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-100 uppercase tracking-wider text-[11px] text-amber-400 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                <span>{isAr ? 'حماية منع تكرار الصفقات وقفل العقد (Anti-Duplicate Guard)' : 'Anti-Duplicate & Single-Trade Lock'}</span>
              </h3>
              <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                {isAr ? '🔒 حماية المحفظة' : '🔒 Capital Shield'}
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
                      ? 'قفل العقد: صفقة واحدة فقط كحد أقصى لكل عقد ساعة (موصى به)'
                      : 'Lock Contract: Maximum 1 Trade Per 1-Hour Contract (Recommended)'}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                    {isAr
                      ? 'يمنع الروبوت تماماً من فتح صفقة ثانية على نفس العقد حتى لو استمرت إشارة Z-Score أو تم تحديث الصفحة (Refresh). ينتظر الروبوت انتهاء الساعة وبدء العقد التالي.'
                      : 'Strictly blocks opening duplicate trades on the active contract even across page reloads. The bot waits for the 1-hour expiration before considering new setups.'}
                  </div>
                </label>
              </div>

              <div className="pt-2.5 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 gap-2 items-center">
                <div>
                  <label className="block text-slate-400 text-[11px] mb-1 font-semibold">
                    {isAr ? 'فترة التهدئة الإجبارية بين الصفقات (دقائق):' : 'Mandatory Cooldown Period (Minutes):'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="120"
                    value={draft.cooldownMinutes ?? 60}
                    onChange={(e) => setDraft({ ...draft, cooldownMinutes: Math.max(1, parseInt(e.target.value) || 60) })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100 font-mono text-xs focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="text-[10px] text-slate-400 leading-normal">
                  {isAr
                    ? '💡 القيمة الافتراضية 60 دقيقة مطابقة لزمن شمعة التوقع لمنع تراكم الصفقات المتزامنة.'
                    : '💡 Default 60m matches the candle duration to prevent over-trading in prediction markets.'}
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
