import React, { useState, useEffect } from 'react';
import {
  Compass,
  FolderTree,
  Filter,
  ArrowUpDown,
  Search,
  ExternalLink,
  ChevronRight,
  Layers,
  Sparkles,
} from 'lucide-react';
import type { NavigationNode, MarketPage, Market } from '../bot/types';
import { LimitlessExchangeSDK } from '../bot/limitlessSdk';

interface MarketPageExplorerProps {
  sdk: LimitlessExchangeSDK;
  onSelectMarketSlug: (slug: string) => void;
  activeMarketSlug: string;
}

export const MarketPageExplorer: React.FC<MarketPageExplorerProps> = ({
  sdk,
  onSelectMarketSlug,
  activeMarketSlug,
}) => {
  const [navigation, setNavigation] = useState<NavigationNode[]>([]);
  const [selectedPath, setSelectedPath] = useState<string>('/crypto');
  const [marketPage, setMarketPage] = useState<MarketPage | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedTicker, setSelectedTicker] = useState<string>('btc');
  const [sortBy, setSortBy] = useState<string>('-updatedAt');

  // تحميل شجرة التصفح Navigation Tree
  useEffect(() => {
    let mounted = true;
    sdk.getNavigation().then((tree) => {
      if (mounted) setNavigation(tree);
    });
    return () => {
      mounted = false;
    };
  }, [sdk]);

  // تحميل الصفحة والفلاتر عند تغيير المسار
  useEffect(() => {
    let mounted = true;
    setLoading(true);

    sdk
      .getMarketPageByPath(selectedPath)
      .then(async (page) => {
        if (!mounted) return;
        setMarketPage(page);

        // استعلام الأسواق التابعة للصفحة مع الفلاتر
        const res = await sdk.getMarketsByPage(page.id, {
          limit: 10,
          sort: sortBy as any,
          filters: selectedTicker ? { ticker: selectedTicker } : undefined,
        });

        if (mounted) {
          setMarkets(res.data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [sdk, selectedPath, selectedTicker, sortBy]);

  return (
    <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-6 shadow-2xl backdrop-blur-md space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>مستكشف صفحات وأقسام الأسواق (MarketPageFetcher)</span>
              <span className="px-2 py-0.5 rounded text-[10px] bg-cyan-950 text-cyan-300 border border-cyan-800/50">
                Limitless SDK Navigation API
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              تصفح تصنيفات عقود التنبؤ هرمياً، حل مسارات URL، وفلترة الأسواق النشطة حسب الأصل (BTC) والمدة.
            </p>
          </div>
        </div>

        {/* Dynamic Breadcrumb */}
        {marketPage && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 overflow-x-auto">
            <span className="text-slate-500">المسار:</span>
            {marketPage.breadcrumb.map((item, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <ChevronRight className="w-3 h-3 text-slate-600" />}
                <span
                  className={
                    idx === marketPage.breadcrumb.length - 1
                      ? 'text-cyan-400 font-bold'
                      : 'text-slate-400'
                  }
                >
                  {item.name}
                </span>
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      {/* Main Grid: Category Tree & Market Results */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Navigation Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
            <span className="text-xs font-bold text-slate-300 flex items-center gap-2">
              <FolderTree className="w-4 h-4 text-cyan-400" />
              <span>أشجار التصنيف (Navigation Tree)</span>
            </span>

            <div className="space-y-1 pt-1">
              {navigation.map((node) => (
                <div key={node.id} className="space-y-1">
                  <button
                    onClick={() => setSelectedPath(node.path)}
                    className={`w-full text-right px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-between ${
                      selectedPath.startsWith(node.path)
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-900'
                    }`}
                  >
                    <span>{node.name}</span>
                    <span className="text-[10px] font-mono text-slate-500">{node.path}</span>
                  </button>

                  {/* Children categories */}
                  {node.children && node.children.length > 0 && (
                    <div className="mr-3 pr-2 border-r border-slate-800/80 space-y-1">
                      {node.children.map((child) => (
                        <button
                          key={child.id}
                          onClick={() => setSelectedPath(child.path)}
                          className={`w-full text-right px-2.5 py-1.5 rounded-md text-[11px] transition-all flex items-center justify-between ${
                            selectedPath === child.path
                              ? 'bg-cyan-500/30 text-cyan-200 font-bold'
                              : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
                          }`}
                        >
                          <span>{child.name}</span>
                          <span className="text-[9px] font-mono text-slate-500">{child.path}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Quick Filters */}
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-3 text-xs">
            <span className="font-bold text-slate-300 flex items-center gap-2">
              <Filter className="w-4 h-4 text-cyan-400" />
              <span>فلاتر البحث (Dynamic Filters)</span>
            </span>

            {/* Ticker Filter */}
            <div className="space-y-1">
              <label className="text-[11px] text-slate-400">رمز الأصل (Ticker)</label>
              <div className="grid grid-cols-3 gap-1">
                {['btc', 'eth', 'sol'].map((t) => (
                  <button
                    key={t}
                    onClick={() => setSelectedTicker(t)}
                    className={`py-1 rounded font-mono text-xs transition-all uppercase ${
                      selectedTicker === t
                        ? 'bg-cyan-500 text-slate-950 font-bold'
                        : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Sort Order */}
            <div className="space-y-1">
              <label className="text-[11px] text-slate-400 flex items-center gap-1">
                <ArrowUpDown className="w-3 h-3 text-slate-500" />
                <span>الترتيب (Sort Field)</span>
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-500 font-mono"
              >
                <option value="-updatedAt">الأحدث تحديثاً (-updatedAt)</option>
                <option value="-deadline">الأقرب انتهاءً (-deadline)</option>
                <option value="-createdAt">الأحدث إنشاءً (-createdAt)</option>
                <option value="id">معرف السوق (id)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Markets List Result */}
        <div className="lg:col-span-3 space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400 pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              <span>
                الأسواق المسترجعة عبر{' '}
                <code className="text-cyan-300 font-mono">pageFetcher.getMarkets()</code>:
              </span>
            </div>
            <span className="font-mono text-slate-300">
              {markets.length} سوق متاح في قسم ({selectedPath})
            </span>
          </div>

          {loading ? (
            <div className="p-12 text-center text-slate-400 text-sm flex flex-col items-center gap-3">
              <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
              <span>جاري استعلام الأسواق عبر Limitless Page API...</span>
            </div>
          ) : markets.length === 0 ? (
            <div className="p-8 text-center bg-slate-950 rounded-xl border border-slate-800 text-slate-400 text-xs">
              لم يتم العثور على عقود نشطة تطابق الفلتر المحدد.
            </div>
          ) : (
            <div className="space-y-3">
              {markets.map((m) => {
                const isCurrent = m.slug === activeMarketSlug;
                return (
                  <div
                    key={m.slug}
                    className={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                      isCurrent
                        ? 'bg-cyan-950/40 border-cyan-500/50 shadow-lg'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">{m.title}</span>
                        {isCurrent && (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-cyan-500 text-slate-950 font-bold flex items-center gap-1">
                            <Sparkles className="w-3 h-3" />
                            السوق النشط للبوت
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
                        <span className="text-cyan-400">{m.slug}</span>
                        <span>•</span>
                        <span>فترة العقد: 15 دقيقة</span>
                        <span>•</span>
                        <span className="text-emerald-400">سيولة: ${m.liquidity || '125K'}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-3 pt-1">
                        <span>
                          عقد التحقق: <code className="text-slate-400">{m.venue.exchange.slice(0, 14)}...</code>
                        </span>
                        <span>
                          رمز YES: <code className="text-emerald-400">{m.tokens.yes.slice(0, 10)}...</code>
                        </span>
                        <span>
                          رمز NO: <code className="text-rose-400">{m.tokens.no.slice(0, 10)}...</code>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => onSelectMarketSlug(m.slug)}
                        disabled={isCurrent}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          isCurrent
                            ? 'bg-slate-800 text-slate-500 cursor-default'
                            : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-md'
                        }`}
                      >
                        {isCurrent ? 'محدد حالياً' : 'توجيه البوت لهذا السوق'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
