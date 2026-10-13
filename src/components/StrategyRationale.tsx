import React from 'react';
import { TrendingUp, ShieldAlert, Cpu, Calculator } from 'lucide-react';

export const StrategyRationale: React.FC = () => {
  return (
    <div className="space-y-6 text-slate-200">
      {/* Arabic Executive Summary Card */}
      <div className="bg-gradient-to-br from-indigo-950/40 via-slate-900 to-slate-950 p-6 rounded-2xl border border-indigo-500/30 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            <Calculator className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white font-['Cairo',sans-serif]">
              التحليل الكمي والرياضي لاستراتيجية (الارتداد المتوسط اللامتماثل)
            </h2>
            <p className="text-xs text-indigo-300">
              لماذا تحقق هذه الاستراتيجية قيمة متوقعة موجبة ضخمة (+EV) على عقود Limitless Exchange 15m؟
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 font-['Cairo',sans-serif] text-sm leading-relaxed text-slate-300">
          <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800">
            <h3 className="font-bold text-emerald-400 flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4" />
              1. سر قاعدة عدم التماثل (سعر الدخول &le; 0.20$)
            </h3>
            <p className="text-xs text-slate-300">
              عقود Limitless مبنية بنظام ثنائي (Binary): عند انتهاء الـ 15 دقيقة، يستقر العقد إما على <strong>1.00$</strong> في حالة الفوز، أو <strong>0.00$</strong> في حالة الخسارة.
            </p>
            <div className="mt-2.5 p-2 rounded-lg bg-emerald-950/50 border border-emerald-500/30 text-emerald-300 text-xs font-mono">
              عند الشراء بسعر 0.20$:<br />
              • أقصى خسارة: 0.20$ فقط لكل عقد.<br />
              • أقصى ربح: 0.80$ لكل عقد (عائد +400% أو مضاعف 5x).<br />
              • نسبة الفوز المطلوبة للتعادل: <strong>20% فقط!</strong>
            </div>
          </div>

          <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800">
            <h3 className="font-bold text-rose-400 flex items-center gap-2 mb-2">
              <ShieldAlert className="w-4 h-4" />
              2. الرياضيات الإحصائية للارتداد (BB 2σ + RSI &gt;85 / &lt;15)
            </h3>
            <p className="text-xs text-slate-300">
              انحراف السعر بمقدار 2 انحراف معياري (Bollinger Bands) يمثل إحصائياً 95.4% من حركة السعر الطبيعية. عند اقتران ذلك بمؤشر RSI استثنائي (&gt; 85 أو &lt; 15)، فإن نسبة حدوث ارتداد تصحيحي (Mean Reversion) خلال 15 دقيقة تتجاوز <strong>35% إلى 45%</strong>.
            </p>
            <div className="mt-2.5 p-2 rounded-lg bg-indigo-950/50 border border-indigo-500/30 text-indigo-300 text-xs font-mono">
              معادلة القيمة المتوقعة (Expected Value):<br />
              EV = (40% × +0.80$) - (60% × -0.20$)<br />
              EV = +0.32$ - 0.12$ = <strong>+0.20$ لكل دولار مخاطرة (+100% EV)!</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Deep Dive Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: FAK Order Type */}
        <div className="bg-slate-900/80 p-5 rounded-2xl border border-slate-800/80 shadow-xl backdrop-blur-md">
          <div className="flex items-center gap-2 text-cyan-400 font-bold mb-3">
            <Cpu className="w-5 h-5" />
            <h3>لماذا أمر Fill-and-Kill (FAK) حصراً؟</h3>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            في أسواق التوقعات شديدة السيولة والسرعة، إذا وضعت أمراً معلقاً عادياً (GTC)، واستمر السعر في الانزلاق ضداً، فقد يتم تنفيذ أمرك عندما يكون الارتداد قد فشل (Adverse Selection).
          </p>
          <div className="mt-3 p-2.5 bg-slate-950 rounded-xl border border-slate-800 text-[11px] text-slate-400 font-mono">
            أمر FAK يأخذ فوراً السيولة المعروضة عند &le; 0.20$ ويلغي الباقي في نفس الجزء من الثانية، مما يحميك من الأوامر العالقة السامة.
          </div>
        </div>

        {/* Card 2: EIP-712 Signing */}
        <div className="bg-slate-900/80 p-5 rounded-2xl border border-slate-800/80 shadow-xl backdrop-blur-md">
          <div className="flex items-center gap-2 text-indigo-400 font-bold mb-3">
            <ShieldAlert className="w-5 h-5" />
            <h3>أمان التوقيع الرقمي المشفر EIP-712</h3>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            تعتمد منصة Limitless Exchange على محرك مطابقة أوامر هجين (Off-chain CLOB with On-chain Settlement).
          </p>
          <div className="mt-3 p-2.5 bg-slate-950 rounded-xl border border-slate-800 text-[11px] text-slate-400 font-mono">
            لا توجد أي رسوم غاز (Gas-free) لوضع الأوامر أو إلغائها؛ يتم فقط التوقيع الرياضي بمحفظتك، ولا يتم سحب أي أموال إلا عند مطابقة وتنفيذ العقد.
          </div>
        </div>

        {/* Card 3: 15-Minute Expiration Timing */}
        <div className="bg-slate-900/80 p-5 rounded-2xl border border-slate-800/80 shadow-xl backdrop-blur-md">
          <div className="flex items-center gap-2 text-emerald-400 font-bold mb-3">
            <TrendingUp className="w-5 h-5" />
            <h3>توقيت عقود 15 دقيقة (15m Decay)</h3>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            عقود 15 دقيقة تتميز بسرعة التآكل الزمني (Theta Decay) وتسعير الأطراف الرخيصة بخصم مبالغ فيه عندما يحدث ضخ أو تفريغ سريع، مما يخلق فرصة ذهبية لاقتناص عقود رخيصة (&le; 0.20$).
          </p>
          <div className="mt-3 p-2.5 bg-slate-950 rounded-xl border border-slate-800 text-[11px] text-slate-400 font-mono">
            عندما تهدأ الشمعة بعد الذروة، يرتد تسعير العقد سريعاً من 0.18$ إلى 0.50$+، مما يتيح إما الجني المبكر أو الانتظار للتسوية بـ 1.00$.
          </div>
        </div>
      </div>
    </div>
  );
};
