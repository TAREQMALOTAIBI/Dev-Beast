import React, { useState } from 'react';
import { SlidersHorizontal, RotateCcw, ShieldCheck, Key, Cpu, Copy, Check, FileText, Eye, EyeOff } from 'lucide-react';
import { BotConfigState } from '../types';

interface ConfigPanelProps {
  config: BotConfigState;
  setConfig: React.Dispatch<React.SetStateAction<BotConfigState>>;
  onResetDefaults: () => void;
}

export const ConfigPanel: React.FC<ConfigPanelProps> = ({ config, setConfig, onResetDefaults }) => {
  const [copiedEnv, setCopiedEnv] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);

  const handleChange = (field: keyof BotConfigState, value: any) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  const handleCopyEnv = () => {
    const envContent = `# ==============================================================================
# Limitless MML Quantitative Trading Bot Configuration (.env)
# ==============================================================================
RPC_URL=${config.rpcUrl}
WALLET_ADDRESS=${config.walletAddress}
PRIVATE_KEY=${config.privateKey || '0xYOUR_PRIVATE_KEY'}

# Risk Management
RISK_PER_TRADE=${config.riskPerTrade}
MAX_ENTRY_PRICE=${config.maxEntryPrice}
MAX_SLIPPAGE=${config.maxSlippage}
DYNAMIC_FLIP_PROFIT=${config.dynamicFlipProfit}

# Momentum Engine (2.5 Sigma Threshold)
SIGMA_THRESHOLD=${config.sigmaThreshold}
ROLLING_WINDOW_SIZE=${config.rollingWindowSize}

# Smart Contract Addresses on Base Mainnet
USDC_ADDRESS=${config.usdcAddress}
LIMITLESS_ROUTER=${config.limitlessRouter}
BTC_5M_MARKET_ADDRESS=${config.btc5mMarketAddress}

# Limitless Official Python SDK (HMAC-SHA256 Auth)
LMTS_TOKEN_ID=${config.lmtsTokenId || ''}
LMTS_TOKEN_SECRET=${config.lmtsTokenSecret || ''}
BTC_MARKET_SLUG=${config.btcMarketSlug || ''}

# Optional Proxy
PROXY_URL=${config.proxyUrl || ''}
`;
    navigator.clipboard.writeText(envContent);
    setCopiedEnv(true);
    setTimeout(() => setCopiedEnv(false), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 flex items-center justify-between">
        <div className="flex items-center space-x-3 rtl:space-x-reverse">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <SlidersHorizontal className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">مصفوفة إعدادات وإدارة مخاطر البوت</h2>
            <p className="text-xs text-zinc-400">
              التحكم في معلمات استراتيجية MML وتحديث كود بايثون البرمجي تلقائياً
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 rtl:space-x-reverse">
          <button
            onClick={handleCopyEnv}
            className="px-3 py-1.5 rounded-lg bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/40 text-xs font-medium transition-colors flex items-center space-x-1.5 rtl:space-x-reverse cursor-pointer"
            title="نسخ ملف .env الكامل المجهز لتشغيله على Google Cloud VM"
          >
            {copiedEnv ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <FileText className="w-3.5 h-3.5" />}
            <span>{copiedEnv ? 'تم نسخ ملف .env بنجاح!' : 'نسخ ملف .env للـ VM'}</span>
          </button>

          <button
            onClick={onResetDefaults}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors flex items-center space-x-1.5 rtl:space-x-reverse cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>استعادة الافتراضيات</span>
          </button>
        </div>
      </div>

      {/* Grid Settings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Risk & Execution Management */}
        <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-5">
          <div className="flex items-center space-x-2 rtl:space-x-reverse text-xs font-bold text-emerald-400 border-b border-zinc-800 pb-2">
            <ShieldCheck className="w-4 h-4" />
            <span>إدارة المخاطر وقواعد الاستغلال اللحظي</span>
          </div>

          {/* Bot Master Execution Switch */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-950 border border-zinc-800">
            <div>
              <span className="text-xs font-semibold text-white block">مفتاح تشغيل الروبوت الرئيسي (Bot Master Switch)</span>
              <span className="text-[11px] text-zinc-400 block">
                تفعيل أو تعليق تنفيذ الصفقات الآلية عند رصد طفرات السيولة 2.5σ
              </span>
            </div>
            <button
              onClick={() => handleChange('isBotRunning', !config.isBotRunning)}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all flex items-center space-x-1.5 rtl:space-x-reverse cursor-pointer ${
                config.isBotRunning
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/50'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${config.isBotRunning ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
              <span>{config.isBotRunning ? 'قيد التشغيل (نشط)' : 'إيقاف مؤقت (معطّل)'}</span>
            </button>
          </div>

          {/* Risk Per Trade (0.50%) */}
          <div>
            <div className="flex items-center justify-between text-xs font-mono mb-1">
              <span className="text-zinc-300">نسبة المخاطرة لكل صفقة:</span>
              <span className="text-emerald-400 font-bold">{(config.riskPerTrade * 100).toFixed(2)}% من المحفظة</span>
            </div>
            <input
              type="range"
              min="0.001"
              max="0.05"
              step="0.001"
              value={config.riskPerTrade}
              onChange={(e) => handleChange('riskPerTrade', parseFloat(e.target.value))}
              className="w-full accent-emerald-500 bg-zinc-800 h-2 rounded-lg cursor-pointer"
            />
            <span className="text-[10px] text-zinc-400 block mt-1">
              حماية رأس المال من تقلبات السوق (المعيار المطلوب: 0.50% محددة بدقة)
            </span>
          </div>

          {/* Max Entry Price (OTM <= 0.10$) */}
          <div>
            <div className="flex items-center justify-between text-xs font-mono mb-1">
              <span className="text-zinc-300">سقف سعر الدخول (فلتر OTM):</span>
              <span className="text-emerald-400 font-bold">${config.maxEntryPrice.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.02"
              max="0.25"
              step="0.01"
              value={config.maxEntryPrice}
              onChange={(e) => handleChange('maxEntryPrice', parseFloat(e.target.value))}
              className="w-full accent-emerald-500 bg-zinc-800 h-2 rounded-lg cursor-pointer"
            />
            <span className="text-[10px] text-zinc-400 block mt-1">
              تصفية العقود لشراء الأسهم الرخيصة خارج نطاق السعر فقط عند &le; 0.10$
            </span>
          </div>

          {/* Max Slippage (<= 0.10$) */}
          <div>
            <div className="flex items-center justify-between text-xs font-mono mb-1">
              <span className="text-zinc-300">الحد الأقصى للانزلاق السعري:</span>
              <span className="text-emerald-400 font-bold">${config.maxSlippage.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.01"
              max="0.20"
              step="0.01"
              value={config.maxSlippage}
              onChange={(e) => handleChange('maxSlippage', parseFloat(e.target.value))}
              className="w-full accent-emerald-500 bg-zinc-800 h-2 rounded-lg cursor-pointer"
            />
            <span className="text-[10px] text-zinc-400 block mt-1">
              تحديد أقصى تأثير سعري مسموح به على صانع سوق Limitless عند 0.10$
            </span>
          </div>

          {/* Dynamic Flip Profit Target (300%) */}
          <div>
            <div className="flex items-center justify-between text-xs font-mono mb-1">
              <span className="text-zinc-300">هدف الخروج السريع (Dynamic Flip):</span>
              <span className="text-amber-400 font-bold">+{(config.dynamicFlipProfit * 100).toFixed(0)}% ربح</span>
            </div>
            <input
              type="range"
              min="1.00"
              max="5.00"
              step="0.50"
              value={config.dynamicFlipProfit}
              onChange={(e) => handleChange('dynamicFlipProfit', parseFloat(e.target.value))}
              className="w-full accent-amber-500 bg-zinc-800 h-2 rounded-lg cursor-pointer"
            />
            <span className="text-[10px] text-zinc-400 block mt-1">
              أمر بيع آلي فوري عند ارتفاع السعر بمقدار 4 أضعاف سعر الدخول (+300%)
            </span>
          </div>
        </div>

        {/* Quant Engine & Web3 Base RPC Settings */}
        <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-5">
          <div className="flex items-center space-x-2 rtl:space-x-reverse text-xs font-bold text-blue-400 border-b border-zinc-800 pb-2">
            <Cpu className="w-4 h-4" />
            <span>المحرك الكمي والاتصال بشبكة Base عبر Web3</span>
          </div>

          {/* Sigma Anomaly Threshold */}
          <div>
            <div className="flex items-center justify-between text-xs font-mono mb-1">
              <span className="text-zinc-300">عتبة انحراف طفرة الحجم (سيغما Sigma):</span>
              <span className="text-blue-400 font-bold">{config.sigmaThreshold.toFixed(1)}σ</span>
            </div>
            <input
              type="range"
              min="1.5"
              max="4.0"
              step="0.1"
              value={config.sigmaThreshold}
              onChange={(e) => handleChange('sigmaThreshold', parseFloat(e.target.value))}
              className="w-full accent-blue-500 bg-zinc-800 h-2 rounded-lg cursor-pointer"
            />
            <span className="text-[10px] text-zinc-400 block mt-1">
              مستوى تفعيل انحراف سرعة الحجم اللحظية (المعيار المطلوب: 2.5 سيغما)
            </span>
          </div>

          {/* Base RPC URL */}
          <div>
            <label className="text-xs text-zinc-300 block mb-1">رابط عقدة Base RPC URL</label>
            <input
              type="text"
              value={config.rpcUrl}
              onChange={(e) => handleChange('rpcUrl', e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200 focus:border-emerald-500 focus:outline-none"
              placeholder="https://mainnet.base.org"
            />
          </div>

          {/* Trader Wallet Address */}
          <div>
            <label className="text-xs text-zinc-300 block mb-1">عنوان محفظة المتداول (0x...)</label>
            <input
              type="text"
              value={config.walletAddress}
              onChange={(e) => handleChange('walletAddress', e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200 focus:border-emerald-500 focus:outline-none"
              placeholder="0xYourWalletAddressOnBase..."
            />
          </div>

          {/* Private Key Input */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-zinc-300">المفتاح الخاص للمحفظة (Private Key)</label>
              <button
                type="button"
                onClick={() => setShowPrivateKey(!showPrivateKey)}
                className="text-[10px] text-zinc-400 hover:text-zinc-200 flex items-center space-x-1 rtl:space-x-reverse cursor-pointer"
              >
                {showPrivateKey ? <EyeOff className="w-3 h-3 text-amber-400" /> : <Eye className="w-3 h-3 text-zinc-400" />}
                <span>{showPrivateKey ? 'إخفاء' : 'إظهار'}</span>
              </button>
            </div>
            <div className="relative">
              <input
                type={showPrivateKey ? 'text' : 'password'}
                value={config.privateKey || ''}
                onChange={(e) => handleChange('privateKey', e.target.value)}
                className="w-full px-3 py-2 pl-10 rtl:pl-10 rtl:pr-3 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200 focus:border-emerald-500 focus:outline-none"
                placeholder="0x... (المفتاح الخاص بمحفظة التداول)"
              />
              <Key className="w-4 h-4 text-zinc-400 absolute left-3 rtl:left-3 rtl:right-auto top-2.5" />
            </div>
            <span className="text-[10px] text-zinc-400 block mt-1">
              يُستخدم للتوقيع المحلي على المعاملات. يتم تضمينه تلقائياً عند الضغط على &quot;نسخ ملف .env للـ VM&quot;.
            </span>
          </div>

          {/* Limitless Official Python SDK Credentials */}
          <div className="p-4 rounded-xl bg-purple-950/20 border border-purple-800/40 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-purple-300 flex items-center space-x-1.5 rtl:space-x-reverse">
                <span>🔐 بيانات اعتماد Limitless Official Python SDK (HMAC-SHA256)</span>
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-purple-900/60 text-purple-200 border border-purple-700/50">
                Official SDK
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              تُستخدم لتفويض التداول عبر الـ SDK الرسمي مع التوقيع التلقائي لـ EIP-712 وتخزين العقود المؤقت (Venue Caching).
            </p>

            <div>
              <label className="text-xs text-zinc-300 block mb-1">
                Limitless Token ID (LMTS_TOKEN_ID)
              </label>
              <input
                type="text"
                value={config.lmtsTokenId || ''}
                onChange={(e) => handleChange('lmtsTokenId', e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200 focus:border-purple-500 focus:outline-none"
                placeholder="0192d4b2-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              />
            </div>

            <div>
              <label className="text-xs text-zinc-300 block mb-1">
                Limitless Token Secret (LMTS_TOKEN_SECRET)
              </label>
              <input
                type="password"
                value={config.lmtsTokenSecret || ''}
                onChange={(e) => handleChange('lmtsTokenSecret', e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200 focus:border-purple-500 focus:outline-none"
                placeholder="4f8a9b2c... (HMAC-SHA256 Secret)"
              />
            </div>

            <div>
              <label className="text-xs text-zinc-300 block mb-1">
                معرف السوق المستهدف (BTC_MARKET_SLUG)
              </label>
              <input
                type="text"
                value={config.btcMarketSlug || ''}
                onChange={(e) => handleChange('btcMarketSlug', e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200 focus:border-purple-500 focus:outline-none"
                placeholder="اتركه فارغاً للاكتشاف التلقائي لأسواق BTC النشطة"
              />
            </div>
          </div>

          {/* Proxy config */}
          <div>
            <label className="text-xs text-zinc-300 block mb-1">
              بروكسي اختياري (لتجاوز حظر Binance في الولايات المتحدة)
            </label>
            <input
              type="text"
              value={config.proxyUrl}
              onChange={(e) => handleChange('proxyUrl', e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200 focus:border-emerald-500 focus:outline-none"
              placeholder="socks5://user:pass@host:port (اختياري)"
            />
          </div>

          {/* Remote GCE VM Control API Endpoint */}
          <div>
            <label className="text-xs text-zinc-300 block mb-1">
              رابط التحكم عن بُعد في سيرفر الـ GCE VM (Remote Bot Control API)
            </label>
            <input
              type="text"
              value={config.remoteBotApiUrl || ''}
              onChange={(e) => handleChange('remoteBotApiUrl', e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200 focus:border-emerald-500 focus:outline-none"
              placeholder="http://YOUR_VM_IP:8080 (أو http://localhost:8080)"
            />
            <span className="text-[10px] text-zinc-400 block mt-1">
              يربط زر تشغيل/إيقاف الروبوت في واجهة المستخدم مباشرة مع خادم Python في Google Cloud لتفعيل وتعليق الأوامر فورياً.
            </span>
          </div>
        </div>
      </div>

      {/* Memory & Bottleneck Prevention Architecture Info Card */}
      <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 shadow-lg space-y-3">
        <div className="flex items-center space-x-2 rtl:space-x-reverse text-xs font-bold text-cyan-400">
          <Cpu className="w-4 h-4" />
          <span>آليات الفرمتة والتدوير التلقائي لمنع الاختناق (Anti-Bottleneck & Zero-Latency Engine)</span>
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed">
          تم تصميم النظام بالكامل بمعايير التداول عالي التردد (HFT) لضمان عدم حدوث أي اختناق (Bottleneck) أو تسريب ذاكرة (Memory Leak) حتى مع معالجة مئات التكات بالثانية:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
          <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800/80">
            <span className="text-xs font-bold text-emerald-400 block mb-1">1. تدوير الذاكرة الحلقي (Ring Buffer)</span>
            <p className="text-[11px] text-zinc-400 leading-normal">
              استخدام <code className="text-emerald-300 font-mono">deque(maxlen=120)</code> في بايثون: إخراج الصفقات القديمة آلياً في زمن <code className="text-zinc-300 font-mono">O(1)</code> فور وصول صفقة جديدة بدون أي تراكم في الذاكرة.
            </p>
          </div>
          <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800/80">
            <span className="text-xs font-bold text-blue-400 block mb-1">2. منع ضغط الطابور (Backpressure)</span>
            <p className="text-[11px] text-zinc-400 leading-normal">
              معالجة تيار WebSocket بشكل غير متزامن بدون حجز مصفوفات عريضة، مع تفريغ دوري واستدعاء لمجمع النفايات (Garbage Collector) لتفادي تجمّد حلقة الأحداث.
            </p>
          </div>
          <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800/80">
            <span className="text-xs font-bold text-amber-400 block mb-1">3. تقليم السجلات اللحظية (Auto-Prune)</span>
            <p className="text-[11px] text-zinc-400 leading-normal">
              يتم في واجهة الويب الاحتفاظ بأحدث 50 سجلاً و30 نقطة بيانية فقط، مما يمنع بطء المتصفح ويحافظ على سرعة استجابة فائقة بمعدل 60 إطار بالثانية.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
