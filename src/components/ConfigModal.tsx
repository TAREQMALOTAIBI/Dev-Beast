import React, { useState } from 'react';
import { BotConfig } from '../types/bot';
import { Settings, X, RotateCcw, Save, KeyRound, Radio, ShieldCheck } from 'lucide-react';

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

  if (!isOpen) return null;

  const handleResetDefaults = () => {
    setDraft({
      symbol: 'BTCUSDT',
      timeframe: '15m',
      periods: 14,
      strategyDirection: 'BOTH',
      zScoreUpper: 2.0,
      zScoreEntry: 1.9,
      zScoreLower: -2.0,
      zScoreLowerEntry: -1.9,
      maxPriceCents: 0.2,
      maxRiskPercent: 0.05,
      orderType: 'FAK',
      fractionChunks: 1,
      chunkDelayMs: 500,
      winProbability: 0.55,
      initialBalance: 1000,
      binanceRestUrl: 'https://api.binance.com/api/v3/klines',
      binanceWsUrl: 'wss://stream.binance.com/ws/btcusdt@kline_15m',
      limitlessWsUrl: 'wss://ws.limitless.exchange',
      limitlessMarketSlug: 'btc-100k-weekly',
      limitlessApiKey: '',
      limitlessTokenId: '',
      limitlessTokenSecret: '',
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
                {isAr ? 'إعدادات استراتيجية التداول (15 Min BTC)' : 'Trading Strategy Configuration (15m BTC)'}
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
          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-emerald-800/40 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-emerald-400 text-xs uppercase tracking-wider">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>{isAr ? 'حالة المحفظة وبيانات التوثيق (Environment Secrets)' : 'Wallet & Environment Secrets Status'}</span>
              </div>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-600/60 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                {isAr ? 'المفاتيح مربوطة ومؤمنة' : 'Connected via Secrets'}
              </span>
            </div>

            <div className="text-[11px] text-slate-300 leading-relaxed bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
              {isAr ? (
                <>
                  <p className="text-emerald-300 font-semibold mb-1">
                    ✓ الربط المباشر مؤمن بالكامل من بيئة النظام (Google AI Studio Secrets):
                  </p>
                  <p className="text-slate-400">
                    تم إخفاء وتأمين حقول المفاتيح الخاصة. الخادم يقرأ تلقائياً مفتاحك الخاص <code>PRIVATE_KEY</code> ومفاتيح <code>LMTS_TOKEN_ID</code> و <code>LMTS_TOKEN_SECRET</code> ورابط <code>BASE_RPC_URL</code> دون الحاجة لإدخالها في المتصفح.
                  </p>
                </>
              ) : (
                <p className="text-slate-300">
                  Wallet and API credentials are automatically read from the platform Environment Secrets. No sensitive private keys are exposed or required in the UI.
                </p>
              )}
            </div>

            {liveWallet && (
              <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-700/30 flex flex-wrap items-center justify-between gap-3 shadow-sm">
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
            )}

            <div>
              <label className="block text-slate-400 mb-1 font-semibold">
                {isAr ? 'رمز سوق التوقع (15 دقيقة حصراً):' : 'Prediction Market Slug (15m Only):'}
              </label>
              <input
                type="text"
                placeholder="btc-up-or-down-15-min"
                value={draft.limitlessMarketSlug}
                onChange={(e) => setDraft({ ...draft, limitlessMarketSlug: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-emerald-500"
              />
              <span className="text-[10px] text-emerald-400 mt-1 block">
                {isAr ? '✓ مؤمّن تلقائياً: يتم اكتشاف وتحديث عقد الـ 15 دقيقة النشط فوراً' : '✓ Auto-secured: 15-minute active market is dynamically tracked'}
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
                  <option value="15m">15m (Default)</option>
                  <option value="1h">1h</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Rolling Periods (N)</label>
                <input
                  type="number"
                  min="5"
                  max="50"
                  value={draft.periods}
                  onChange={(e) => setDraft({ ...draft, periods: parseInt(e.target.value) || 14 })}
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

            {/* Thresholds Grid: Upper & Lower */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Upper Arm */}
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-rose-900/40">
                <label className="block text-rose-300 mb-1 font-semibold">
                  {isAr ? 'عتبة التأهب للقمة (Upper Arm):' : 'Upper Arm (Z_SCORE_UPPER):'}
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={draft.zScoreUpper}
                  onChange={(e) => setDraft({ ...draft, zScoreUpper: parseFloat(e.target.value) || 2.0 })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  {isAr ? 'التأهب لصفقة هبوط عند تجاوز +2.0σ' : 'Arms Short when Z crosses above upper bound'}
                </span>
              </div>

              {/* Upper Trigger */}
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-amber-900/40">
                <label className="block text-amber-300 mb-1 font-semibold">
                  {isAr ? 'عتبة دخول الهبوط (Short Trigger):' : 'Short Trigger (Z_SCORE_ENTRY):'}
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={draft.zScoreEntry}
                  onChange={(e) => setDraft({ ...draft, zScoreEntry: parseFloat(e.target.value) || 1.9 })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  {isAr ? 'تنفيذ صفقة DOWN فور ارتداد السعر دون +1.9σ' : 'Fires Short / DOWN order when price pulls back below entry'}
                </span>
              </div>

              {/* Lower Arm */}
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-emerald-900/40">
                <label className="block text-emerald-300 mb-1 font-semibold">
                  {isAr ? 'عتبة التأهب للقاع (Lower Arm):' : 'Lower Arm (Z_SCORE_LOWER):'}
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={draft.zScoreLower ?? -2.0}
                  onChange={(e) => setDraft({ ...draft, zScoreLower: parseFloat(e.target.value) || -2.0 })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  {isAr ? 'التأهب لصفقة صعود عند انخفاض السعر دون -2.0σ' : 'Arms Long when Z drops below lower oversold bound'}
                </span>
              </div>

              {/* Lower Trigger */}
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-teal-900/40">
                <label className="block text-teal-300 mb-1 font-semibold">
                  {isAr ? 'عتبة دخول الصعود (Long Trigger):' : 'Long Trigger (Z_SCORE_LOWER_ENTRY):'}
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={draft.zScoreLowerEntry ?? -1.9}
                  onChange={(e) => setDraft({ ...draft, zScoreLowerEntry: parseFloat(e.target.value) || -1.9 })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  {isAr ? 'تنفيذ صفقة UP فور ارتداد السعر للأعلى فوق -1.9σ' : 'Fires Long / UP order when price bounces back above entry'}
                </span>
              </div>
            </div>
          </div>

          {/* Section 4: Risk Sizing & Direct Order Execution */}
          <div className="border-t border-slate-800 pt-4">
            <h3 className="font-semibold text-slate-100 uppercase tracking-wider text-[11px] mb-3 text-sky-400">
              {isAr ? 'إدارة المخاطر والتنفيذ المباشر (سقف 5% أقصى)' : 'Risk Management & Direct Execution (5% Max Cap)'}
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
                  {isAr ? 'أقصى سعر للعقد ($)' : 'Max Price Cents ($)'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={draft.maxPriceCents}
                  onChange={(e) => setDraft({ ...draft, maxPriceCents: parseFloat(e.target.value) || 0.2 })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">
                  {isAr ? 'سقف المخاطرة المعتمد (5% كحد أقصى)' : 'Enforced Risk Cap (5% Max)'}
                </label>
                <input
                  type="number"
                  step="0.005"
                  min="0.01"
                  max="0.05"
                  value={Math.min(draft.maxRiskPercent || 0.05, 0.05)}
                  onChange={(e) => setDraft({ ...draft, maxRiskPercent: Math.min(parseFloat(e.target.value) || 0.05, 0.05) })}
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
                  ? '🛡️ سقف المخاطرة محدد ومعتمد بنسبة 5% كحد أقصى من رصيد المحفظة لحماية رأس المال وفق نموذج كيلي الحذر.'
                  : '🛡️ Risk cap is locked at 5% maximum of account balance for capital preservation under the Kelly Criterion.'}
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
