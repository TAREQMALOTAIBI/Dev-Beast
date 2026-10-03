import React from 'react';
import { BookOpen, Zap, Target, ShieldCheck, Cpu, Code2, Server, Terminal, CheckCircle2 } from 'lucide-react';

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
              <span><strong>التوقيع المحلي للمعاملات:</strong> يتم بناء معاملة الشراء السريع `market.buy(investmentAmount, outcomeIndex, minTokens)` وتوقيعها محلياً لتفادي أي تأخير زمني.</span>
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

      {/* Section 5: Real-Time Web Engine Architecture */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-zinc-900 via-zinc-900/90 to-zinc-950 border border-emerald-500/30 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center space-x-2 rtl:space-x-reverse text-emerald-400 font-bold text-sm">
            <Server className="w-5 h-5" />
            <span>5. معمارية محرك التداول الآلي على الويب (Web Real-Time Engine)</span>
          </div>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            تداول فوري متكامل 100% من المتصفح
          </span>
        </div>

        <p className="leading-relaxed font-sans text-right text-zinc-300">
          يعمل التطبيق بمحرك كمي متكامل مبني بلغة <strong>TypeScript &amp; React</strong> مع خادم <strong>Node.js</strong>، ليتيح لك تشغيل وإدارة ومراقبة التداول الآلي واليدوي لعقود الـ 5 دقائق مباشرة من المتصفح دون الحاجة لتثبيت أي برمجيات أو سكريبتات إضافية.
        </p>

        {/* Step-by-step setup cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
            <span className="text-xs font-bold text-cyan-400 flex items-center space-x-1.5 rtl:space-x-reverse">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>أ. البث المباشر (Direct WebSockets)</span>
            </span>
            <p className="text-[11px] text-zinc-400 font-sans leading-relaxed text-right">
              اتصال حي ودائم بقنوات Binance Aggregated Trades وبث أسعار Limitless لضمان تحديث الـ CVD في أجزاء من الميلي ثانية.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
            <span className="text-xs font-bold text-emerald-400 flex items-center space-x-1.5 rtl:space-x-reverse">
              <Terminal className="w-3.5 h-3.5" />
              <span>ب. التنفيذ الآلي بنقرة واحدة</span>
            </span>
            <p className="text-[11px] text-zinc-400 font-sans leading-relaxed text-right">
              تفعيل زر <strong>[ تشغيل الروبوت ]</strong> يطلق خوارزمية المسح التلقائي لعقود الـ 5 دقائق واقتناص طفرات 2.5σ فوراً.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
            <span className="text-xs font-bold text-amber-400 flex items-center space-x-1.5 rtl:space-x-reverse">
              <Zap className="w-3.5 h-3.5" />
              <span>ج. إدارة المراكز والخروج التلقائي</span>
            </span>
            <p className="text-[11px] text-zinc-400 font-sans leading-relaxed text-right">
              لوحة حية لمتابعة الصفقات المفتوحة مع خاصية Dynamic Flip للخروج السريع فور تحقيق مستهدف الأرباح (+300%).
            </p>
          </div>
        </div>
      </div>

      {/* Section 6: Official Error Handling, Retry Logic & Resilience */}
      <div className="p-6 rounded-2xl bg-zinc-900/90 border border-purple-800/40 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center space-x-2 rtl:space-x-reverse text-purple-400 font-bold text-sm">
            <ShieldCheck className="w-5 h-5" />
            <span>6. هندسة معالجة الأخطاء وإعادة المحاولة التلقائية (Web Resilience Standard)</span>
          </div>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-purple-500/20 text-purple-300 border border-purple-500/40">
            مستقر 24/7
          </span>
        </div>

        <p className="leading-relaxed font-sans text-right text-zinc-300">
          تم تزويد محرك الويب بهندسة دفاعية متكاملة وفق أحدث ممارسات التوثيق الرسمي لـ <strong>Limitless Exchange</strong> لحماية رأس المال وضمان استمرارية التداول دون انقطاع:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
            <div className="text-xs font-bold text-purple-300 flex items-center justify-between">
              <span>إعادة الاتصال التلقائي بـ WebSockets</span>
              <code className="text-[10px] text-zinc-400">Auto-Reconnect</code>
            </div>
            <p className="text-[11px] text-zinc-400 font-sans leading-relaxed text-right">
              إعادة بناء الاتصال ببث بينانس وLimitless تلقائياً في حال حدوث أي انقطاع مؤقت في الشبكة.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
            <div className="text-xs font-bold text-cyan-300 flex items-center justify-between">
              <span>حماية وتصفية العقود منتهية الصلاحية</span>
              <code className="text-[10px] text-zinc-400">Expiry Guard</code>
            </div>
            <p className="text-[11px] text-zinc-400 font-sans leading-relaxed text-right">
              فحص لحظي لوقت شمعة الـ 5 دقائق لمنع الدخول في الثواني الأخيرة قبل التسوية لضمان اكتمال حركة السعر.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
            <div className="text-xs font-bold text-amber-300 flex items-center justify-between">
              <span>سقف الانزلاق السعري الصارم</span>
              <code className="text-[10px] text-zinc-400">Max Slippage</code>
            </div>
            <p className="text-[11px] text-zinc-400 font-sans leading-relaxed text-right">
              إلغاء تنفيذ أي صفقة إذا قفز سعر العقد فوق سقف الـ OTM المسموح ($0.10).
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
            <div className="text-xs font-bold text-emerald-300 flex items-center justify-between">
              <span>حماية إدارة رأس المال (0.50% Max Risk)</span>
              <code className="text-[10px] text-zinc-400">Risk Perimeter</code>
            </div>
            <p className="text-[11px] text-zinc-400 font-sans leading-relaxed text-right">
              حساب حجم الصفقات تلقائياً بما يضمن عدم تجاوز نسبة المخاطرة المحددة في الإعدادات.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
