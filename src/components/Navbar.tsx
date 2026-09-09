import React from 'react';
import { Activity, ShieldCheck, Download, Code2, Terminal, Zap, SlidersHorizontal, BookOpen, Play, Square } from 'lucide-react';
import { BotConfigState } from '../types';

interface NavbarProps {
  activeTab: 'terminal' | 'market' | 'code' | 'config' | 'guide';
  setActiveTab: (tab: 'terminal' | 'market' | 'code' | 'config' | 'guide') => void;
  config: BotConfigState;
  wsConnected: boolean;
  onDownloadScript: () => void;
  onToggleBot?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  config,
  wsConnected,
  onDownloadScript,
  onToggleBot,
}) => {
  return (
    <header className="border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Title */}
          <div className="flex items-center space-x-3 rtl:space-x-reverse">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-inner">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2 rtl:space-x-reverse">
                <span className="font-mono font-bold text-white text-lg tracking-tight">
                  بوت <span className="text-emerald-400">Limitless MML</span> الكمي
                </span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
                  فجوة التأخير BTC 5m
                </span>
              </div>
              <p className="text-xs text-zinc-400 hidden sm:block">
                استغلال فجوة التأخير اللحظية &bull; رصد طفرة 2.5σ CVD &bull; ربح الخروج التلقائي 300%+
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden md:flex items-center space-x-1 rtl:space-x-reverse bg-zinc-900/90 p-1 rounded-xl border border-zinc-800">
            <button
              onClick={() => setActiveTab('terminal')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-1.5 rtl:space-x-reverse ${
                activeTab === 'terminal'
                  ? 'bg-zinc-800 text-emerald-400 shadow-sm font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>مؤشر CVD والإشارات</span>
            </button>

            <button
              onClick={() => setActiveTab('market')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-1.5 rtl:space-x-reverse ${
                activeTab === 'market'
                  ? 'bg-zinc-800 text-emerald-400 shadow-sm font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>سوق Limitless 5m</span>
            </button>

            <button
              onClick={() => setActiveTab('code')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-1.5 rtl:space-x-reverse ${
                activeTab === 'code'
                  ? 'bg-zinc-800 text-emerald-400 shadow-sm font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>كود بايثون Python</span>
            </button>

            <button
              onClick={() => setActiveTab('config')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-1.5 rtl:space-x-reverse ${
                activeTab === 'config'
                  ? 'bg-zinc-800 text-emerald-400 shadow-sm font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>الإعدادات والمخاطر</span>
            </button>

            <button
              onClick={() => setActiveTab('guide')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-1.5 rtl:space-x-reverse ${
                activeTab === 'guide'
                  ? 'bg-zinc-800 text-emerald-400 shadow-sm font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>الدليل المعماري</span>
            </button>
          </nav>

          {/* Right Status & Controls CTA */}
          <div className="flex items-center space-x-2.5 rtl:space-x-reverse">
            {/* Live Feed Status */}
            <div className="hidden xl:flex items-center space-x-2 rtl:space-x-reverse text-xs font-mono px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800">
              <span
                className={`w-2 h-2 rounded-full ${
                  wsConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                }`}
              />
              <span className="text-zinc-300">
                {wsConnected ? 'بث بينانس نشط' : 'إعادة الاتصال...'}
              </span>
            </div>

            {/* Bot Active State Pill */}
            <div
              className={`hidden sm:flex items-center space-x-1.5 rtl:space-x-reverse text-xs font-mono px-2.5 py-1 rounded-lg border ${
                config.isBotRunning
                  ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300'
                  : 'bg-rose-950/30 border-rose-900/50 text-rose-300'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  config.isBotRunning ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
                }`}
              />
              <span>{config.isBotRunning ? 'الروبوت: نشط' : 'الروبوت: متوقف'}</span>
            </div>

            {/* BOT START / STOP PRIMARY BUTTON */}
            {onToggleBot && (
              <button
                onClick={onToggleBot}
                className={`inline-flex items-center space-x-1.5 rtl:space-x-reverse px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-md cursor-pointer ${
                  config.isBotRunning
                    ? 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 hover:text-rose-100 border border-rose-500/50'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950 border border-emerald-400'
                }`}
                title={config.isBotRunning ? 'إيقاف تشغيل الروبوت مؤقتاً' : 'تشغيل الروبوت الآن'}
              >
                {config.isBotRunning ? (
                  <>
                    <Square className="w-3.5 h-3.5 fill-rose-400 text-rose-400" />
                    <span>إيقاف الروبوت</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-zinc-950 text-zinc-950" />
                    <span>تشغيل الروبوت</span>
                  </>
                )}
              </button>
            )}

            {/* Download Python File CTA */}
            <button
              onClick={onDownloadScript}
              className="inline-flex items-center space-x-1.5 rtl:space-x-reverse px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white border border-zinc-700 text-xs font-semibold transition-colors shadow-sm"
              title="تحميل ملف البوت limitless_mml_bot.py"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">تحميل كود .py</span>
              <span className="sm:hidden">الكود</span>
            </button>
          </div>
        </div>

        {/* Mobile Nav */}
        <div className="flex md:hidden overflow-x-auto py-2 space-x-1 rtl:space-x-reverse border-t border-zinc-800/80 scrollbar-none">
          <button
            onClick={() => setActiveTab('terminal')}
            className={`px-2.5 py-1 rounded-md text-xs whitespace-nowrap ${
              activeTab === 'terminal' ? 'bg-zinc-800 text-emerald-400 font-semibold' : 'text-zinc-400'
            }`}
          >
            مؤشر CVD والإشارات
          </button>
          <button
            onClick={() => setActiveTab('market')}
            className={`px-2.5 py-1 rounded-md text-xs whitespace-nowrap ${
              activeTab === 'market' ? 'bg-zinc-800 text-emerald-400 font-semibold' : 'text-zinc-400'
            }`}
          >
            سوق Limitless 5m
          </button>
          <button
            onClick={() => setActiveTab('code')}
            className={`px-2.5 py-1 rounded-md text-xs whitespace-nowrap ${
              activeTab === 'code' ? 'bg-zinc-800 text-emerald-400 font-semibold' : 'text-zinc-400'
            }`}
          >
            كود بايثون
          </button>
          <button
            onClick={() => setActiveTab('config')}
            className={`px-2.5 py-1 rounded-md text-xs whitespace-nowrap ${
              activeTab === 'config' ? 'bg-zinc-800 text-emerald-400 font-semibold' : 'text-zinc-400'
            }`}
          >
            الإعدادات
          </button>
          <button
            onClick={() => setActiveTab('guide')}
            className={`px-2.5 py-1 rounded-md text-xs whitespace-nowrap ${
              activeTab === 'guide' ? 'bg-zinc-800 text-emerald-400 font-semibold' : 'text-zinc-400'
            }`}
          >
            الدليل المعماري
          </button>
        </div>
      </div>
    </header>
  );
};
