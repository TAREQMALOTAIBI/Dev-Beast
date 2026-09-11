import React from 'react';
import { BookOpen, Zap, Target, ShieldCheck, Cpu, Code2, ArrowRight, Server, Terminal, CheckCircle2 } from 'lucide-react';

export const ArchitectureGuide: React.FC = () => {
  return (
    <div className="space-y-6 text-zinc-300 font-mono text-xs">
      {/* Title */}
      <div className="p-6 rounded-2xl bg-zinc-900/90 border border-zinc-800">
        <div className="flex items-center space-x-3 rtl:space-x-reverse mb-2">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">
              الدليل المعماري والكمي لاستراتيجية Micro-Momentum Lead-Lag (MML)
            </h2>
            <p className="text-xs text-zinc-400">
              الهندسة الكمية وآليات التنفيذ اللحظي لأسواق تنبؤات منصة Limitless على شبكة Base L2
            </p>
          </div>
        </div>
      </div>

      {/* Grid of Sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Section 1: Lead-Lag Theory */}
        <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-3">
          <div className="flex items-center space-x-2 text-emerald-400 font-bold text-sm border-b border-zinc-800 pb-2">
            <Zap className="w-4 h-4" />
            <span>1. الفلسفة الكمية وفجوة التأخير (Lead-Lag Alpha)</span>
          </div>
          <p className="leading-relaxed text-zinc-300 text-right font-sans">
            تعتبر عقود البيتكوين الدائمة على منصة <strong>Binance Futures</strong> هي المصدر الأساسي لاكتشاف الأسعار (Price Discovery) عالمياً، حيث تنفذ مئات الصفقات في الجزء من الثانية.
          </p>
          <p className="leading-relaxed text-zinc-300 text-right font-sans">
            في المقابل، تعمل منصة <strong>Limitless</strong> على شبكة <strong>Base (Layer 2)</strong> كصانع سوق آلي لأسواق التنبؤات (FPMM). عندما يحدث مسح شرائي أو بيعي عنيف (Taker Sweep) على Binance، يستغرق الأمر بين <strong>500 إلى 2,500 ملي ثانية</strong> حتى ينعكس التحرك في أسعار عقود Limitless اللامركزية.
          </p>
          <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-[11px] text-emerald-400">
            <strong>قيمة الألفا:</strong> شراء العقود الرخيصة (OTM &le; $0.10) قبل أن يعيد صانع السوق الآلي تسعيرها، ثم بيعها فوراً عند تحقيق قفزة سعرية (+300%).
          </div>
        </div>

        {/* Section 2: Mathematical Formulation */}
        <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-3">
          <div className="flex items-center space-x-2 text-cyan-400 font-bold text-sm border-b border-zinc-800 pb-2">
            <Cpu className="w-4 h-4" />
            <span>2. المعادلات الرياضية ورصد طفرة 2.5 Sigma</span>
          </div>
          <div className="space-y-2">
            <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800">
              <span className="text-zinc-400 text-[10px] block">1. حساب الدلتا التراكمية (CVD):</span>
              <code className="text-cyan-300 text-xs font-mono">
                ΔV = -qty (إذا كان المشتري Maker) | +qty (إذا كان المشتري Taker)
              </code>
            </div>

            <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800">
              <span className="text-zinc-400 text-[10px] block">2. سرعة الحجم اللحظية (Volume Velocity):</span>
              <code className="text-cyan-300 text-xs font-mono">V_velocity = ΔV / Δt</code>
            </div>

            <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800">
              <span className="text-zinc-400 text-[10px] block">3. درجة الانحراف المعياري (Rolling Z-Score):</span>
              <code className="text-amber-300 text-xs font-mono">Z = (ΔV - μ) / σ &ge; 2.5σ</code>
            </div>
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed font-sans text-right">
            القيمة 2.5 انحراف معياري تعزل أكثر من 98.7% من الضوضاء اليومية المعتادة، وتضمن أن إشارة الشراء لا تُطلق إلا عند دخول تدفق سيولة مؤسساتي ضخم.
          </p>
        </div>

        {/* Section 3: Web3 & Smart Contract Execution */}
        <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-3">
          <div className="flex items-center space-x-2 text-blue-400 font-bold text-sm border-b border-zinc-800 pb-2">
            <Code2 className="w-4 h-4" />
            <span>3. التفاعل التقني مع شبكة Base ومنصة Limitless</span>
          </div>
          <ul className="space-y-2 text-right font-sans">
            <li className="flex items-start justify-end space-x-2 rtl:space-x-reverse">
              <span><strong>تصفية العقود (OTM Filter):</strong> يفحص البوت العقود ذات إطار 5 دقائق ويستبعد أي عقد يتجاوز 0.10$. يتم استهداف العقود الرخيصة فقط ذات العائد غير المتناظر.</span>
              <Target className="w-4 h-4 text-blue-400 mt-1 shrink-0" />
            </li>
            <li className="flex items-start justify-end space-x-2 rtl:space-x-reverse">
              <span><strong>التوقيع المحلي للمعاملات:</strong> يتم بناء معاملة الشراء السريع `market.buy(investmentAmount, outcomeIndex, minTokens)` وتوقيعها محلياً بالمفتاح الخاص لتفادي أي تأخير زمني.</span>
              <ShieldCheck className="w-4 h-4 text-blue-400 mt-1 shrink-0" />
            </li>
            <li className="flex items-start justify-end space-x-2 rtl:space-x-reverse">
              <span><strong>رسوم الغاز الفائقة (EIP-1559):</strong> يتم وضع `maxPriorityFeePerGas` لضمان أولوية التضمين في أول بلوك على شبكة Base L2.</span>
              <Zap className="w-4 h-4 text-blue-400 mt-1 shrink-0" />
            </li>
          </ul>
        </div>

        {/* Section 4: Dynamic Flip & Risk Management */}
        <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-3">
          <div className="flex items-center space-x-2 text-amber-400 font-bold text-sm border-b border-zinc-800 pb-2">
            <Target className="w-4 h-4" />
            <span>4. إدارة المخاطر والخروج التلقائي (Dynamic Flip)</span>
          </div>
          <div className="space-y-2 font-sans text-right">
            <p className="leading-relaxed">
              <strong>حجم الصفقة 0.50% فقط:</strong> مهما بلغ حجم السيولة المتاحة في المحفظة، لا يتجاوز رأس المال المخاطر به في أي صفقة مفردة 0.50% لحماية الحساب من أي تقلبات معاكسة.
            </p>
            <p className="leading-relaxed">
              <strong>حماية الانزلاق السعري (Max Slippage &le; $0.10):</strong> العقد لن ينفذ إذا ارتفع السعر المطلوب فوق سقف الدخول الأقصى.
            </p>
            <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-300 text-xs">
              <strong>الخروج التلقائي السريع (Dynamic Flip &ge; 300%):</strong> بمجرد أن يقفز سعر العقد المشترى عند 0.07$ مثلاً إلى 0.28$ أو أكثر نتيجة لحاق سوق التنبؤات بحركة البيتكوين، يقوم البوت فوراً بطلب أمر البيع `market.sell` لجني الأرباح واستعادة عملة USDC إلى المحفظة مباشرة.
            </div>
          </div>
        </div>
      </div>

      {/* Section 5: Google Compute Engine (GCE) VM Deployment Guide */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-zinc-900 via-zinc-900/90 to-zinc-950 border border-emerald-500/30 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center space-x-2 rtl:space-x-reverse text-emerald-400 font-bold text-sm">
            <Server className="w-5 h-5" />
            <span>5. دليل تشغيل ونشر البوت على Google Compute Engine (GCE VM) مع Python SDK</span>
          </div>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            أعلى استقرار &bull; تشغيل 24/7 دون انقطاع
          </span>
        </div>

        <p className="leading-relaxed font-sans text-right text-zinc-300">
          تعتبر بيئة <strong>Google Compute Engine (GCE VM)</strong> بنظام Linux (Ubuntu 22.04 LTS) هي البيئة النموذجية والأقوى عالمياً لتشغيل بوتات الـ HFT ومحركات المراجحة بلغة <strong>Python</strong>، بفضل شبكة Google Cloud العالمية فائقة السرعة (Tier-1 Premium Network) وزمن الوصول المنخفض جداً إلى خوادم Binance وشبكة Base.
        </p>

        {/* Step-by-step setup cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
            <span className="text-xs font-bold text-cyan-400 flex items-center space-x-1.5 rtl:space-x-reverse">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>أ. إعداد الخادم في Google Cloud</span>
            </span>
            <ul className="text-[11px] text-zinc-400 space-y-1 font-sans list-disc list-inside">
              <li>النوع الموصى به: <code className="text-zinc-200">e2-standard-2</code> (2 vCPU, 8GB RAM).</li>
              <li>نظام التشغيل: <strong>Ubuntu 22.04 LTS</strong>.</li>
              <li>المنطقة (Region): <code className="text-zinc-200">europe-west3</code> (فرانكفورت) أو <code className="text-zinc-200">asia-northeast1</code> (طوكيو) للاتصال المباشر بـ Binance بدون حظر إقليمي.</li>
            </ul>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
            <span className="text-xs font-bold text-emerald-400 flex items-center space-x-1.5 rtl:space-x-reverse">
              <Terminal className="w-3.5 h-3.5" />
              <span>ب. أوامر التثبيت في الطرفية (SSH)</span>
            </span>
            <div className="p-2 rounded bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-300 overflow-x-auto space-y-1 dir-ltr text-left">
              <div>sudo apt update &amp;&amp; sudo apt install -y python3-pip python3-venv git</div>
              <div>python3 -m venv venv</div>
              <div>source venv/bin/activate</div>
              <div>pip install web3 websockets aiohttp python-dotenv eth-account</div>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
            <span className="text-xs font-bold text-amber-400 flex items-center space-x-1.5 rtl:space-x-reverse">
              <Zap className="w-3.5 h-3.5" />
              <span>ج. التشغيل كخدمة دائمة (Systemd)</span>
            </span>
            <p className="text-[11px] text-zinc-400 font-sans">
              إنشاء خدمة <code className="text-zinc-200">/etc/systemd/system/limitless-bot.service</code> مع <code className="text-amber-300">Restart=always</code>، مما يضمن استمرار البوت على مدار الساعة وإعادة تشغيله ذاتياً فوراً في حال حدوث أي طارئ.
            </p>
          </div>
        </div>
      </div>

      {/* Section 6: Official Error Handling, Retry Logic & Resilience */}
      <div className="p-6 rounded-2xl bg-zinc-900/90 border border-purple-800/40 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center space-x-2 rtl:space-x-reverse text-purple-400 font-bold text-sm">
            <ShieldCheck className="w-5 h-5" />
            <span>6. هندسة معالجة الأخطاء وإعادة المحاولة التلقائية (Official Error Handling &amp; Retry)</span>
          </div>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-purple-500/20 text-purple-300 border border-purple-500/40">
            Limitless SDK Resilience Standard
          </span>
        </div>

        <p className="leading-relaxed font-sans text-right text-zinc-300">
          تم تزويد البوت بهندسة دفاعية متكاملة وفق أحدث ممارسات التوثيق الرسمي لـ <strong>Limitless Exchange</strong> لحماية رأس المال وضمان استمرارية التداول دون انقطاع:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
            <div className="text-xs font-bold text-purple-300 flex items-center justify-between">
              <span>تغليف العميل بكائن RetryableClient</span>
              <code className="text-[10px] text-zinc-400">RetryConfig</code>
            </div>
            <p className="text-[11px] text-zinc-400 font-sans leading-relaxed text-right">
              بدلاً من تكرار محاولات الاتصال يدوياً، يتم تغليف عميل الـ HTTP بـ <code className="text-emerald-300">RetryableClient</code> ليطبق تراجعاً أسياً (<code className="text-zinc-300">[1s, 2s, 4s]</code>) تلقائياً عند تلقي <code className="text-amber-300">429 (Rate Limit)</code> أو أخطاء الخادم <code className="text-amber-300">500, 502, 503</code>.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
            <div className="text-xs font-bold text-cyan-300 flex items-center justify-between">
              <span>فحص الاستجابة الخام ومعدل الطلبات</span>
              <code className="text-[10px] text-zinc-400">with_raw_response=True</code>
            </div>
            <p className="text-[11px] text-zinc-400 font-sans leading-relaxed text-right">
              قراءة ترويسات <code className="text-cyan-300">x-ratelimit-remaining</code> عبر كائن <code className="text-zinc-200">HttpRawResponse</code> لمراقبة استهلاك الحصة السوقية بدقة لحظية وتفادي تجاوز السقف المسموح.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
            <div className="text-xs font-bold text-amber-300 flex items-center justify-between">
              <span>تصنيف استثناءات APIError الدقيقة</span>
              <code className="text-[10px] text-zinc-400">HTTP Status Codes</code>
            </div>
            <ul className="text-[11px] text-zinc-400 space-y-1 font-sans text-right">
              <li><strong className="text-zinc-200">400 Bad Request:</strong> معاملات أمر خاطئة أو انتهاء السوق.</li>
              <li><strong className="text-zinc-200">401/403 Auth:</strong> خطأ في بيانات HMAC أو قيود جغرافية.</li>
              <li><strong className="text-zinc-200">425 Too Early:</strong> خطأ في نافذة الاستقبال (Receive-window).</li>
              <li><strong className="text-emerald-300">Fallback On-chain:</strong> تحويل فوري للتنفيذ عبر عقود Base الذكية.</li>
            </ul>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
            <div className="text-xs font-bold text-emerald-300 flex items-center justify-between">
              <span>ترقيع عيب الـ SDK الرسمي (NoOpLogger Patch)</span>
              <code className="text-[10px] text-zinc-400">NoOpLogger.warning Bug</code>
            </div>
            <p className="text-[11px] text-zinc-400 font-sans leading-relaxed text-right">
              تطبيق ترقيع برمجي استباقي لمنع تعطل المحرك بسبب استدعاء الـ SDK الرسمي للدالة <code className="text-red-300">.warning()</code> غير المعرفة في واجهة التسجيل الأصلية:
            </p>
            <div className="p-1.5 rounded bg-zinc-900 text-[10px] font-mono text-emerald-400 dir-ltr text-left">
              NoOpLogger.warning = lambda self, msg, context=None: None
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
