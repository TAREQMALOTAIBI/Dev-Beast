import React, { useState, useEffect, useCallback } from 'react';
import { 
  Layers, ArrowUpRight, ArrowDownRight, CheckCircle2, AlertCircle, Timer, Zap, Wallet, 
  ShieldAlert, RefreshCw, User, Award, Coins, BookOpen, Search, Filter, ExternalLink, 
  TrendingUp, BarChart3, Info, Check, Copy
} from 'lucide-react';
import { BotConfigState, LimitlessPosition, LivePortfolioData } from '../types';

interface MarketVenue {
  exchange: string;
  adapter: string | null;
}

interface MarketTokens {
  yes: string;
  no: string;
}

interface ActiveMarketItem {
  slug: string;
  title: string;
  venue?: MarketVenue;
  tokens?: MarketTokens;
  openInterest?: string;
  liquidity?: string;
  status?: string;
}

interface OrderbookLevel {
  price: number;
  size: number;
  side: 'BUY' | 'SELL';
}

interface OrderbookData {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  tokenId?: string;
  adjustedMidpoint?: number;
  midpoint?: number;
  maxSpread?: string;
  minSize?: string;
  lastTradePrice?: number | null;
  bestBid?: number | null;
  bestAsk?: number | null;
  spread?: number | null;
  isIlliquid?: boolean;
}

interface NavigationNode {
  id: string;
  name: string;
  slug: string;
  path: string;
  icon?: string;
  children?: NavigationNode[];
}

interface LimitlessMarketViewProps {
  config: BotConfigState;
  onExecuteManualTrade: (outcomeIndex: number, outcomeLabel: string, entryPrice: number) => void;
  positions: LimitlessPosition[];
  onDynamicFlip: (positionId: string) => void;
  onSelectMarket?: (slug: string) => void;
}

export const LimitlessMarketView: React.FC<LimitlessMarketViewProps> = ({
  config,
  onExecuteManualTrade,
  positions,
  onDynamicFlip,
  onSelectMarket,
}) => {
  // Real market pricing state for Limitless contracts
  const [yesPrice, setYesPrice] = useState<number>(0.07);
  const [noPrice, setNoPrice] = useState<number>(0.93);
  
  // Orderbook state
  const [selectedSlug, setSelectedSlug] = useState<string>(config.btcMarketSlug || 'btc-up-or-down-5-min-1791033000');
  const [selectedMarketDetail, setSelectedMarketDetail] = useState<ActiveMarketItem | null>(null);
  
  // Real time synchronization with 5-minute candle boundary
  const getSecondsToNext5mCandle = () => 300 - (Math.floor(Date.now() / 1000) % 300);
  const [expiryCountdown, setExpiryCountdown] = useState<number>(getSecondsToNext5mCandle());

  useEffect(() => {
    setExpiryCountdown(getSecondsToNext5mCandle());
    const timer = setInterval(() => {
      setExpiryCountdown(getSecondsToNext5mCandle());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const walletUsdc = config.walletBalance || 0.0;
  const [positionsTab, setPositionsTab] = useState<'orderbook' | 'active_markets' | 'local' | 'sdk_portfolio'>('orderbook');
  const [isSyncingPortfolio, setIsSyncingPortfolio] = useState<boolean>(false);

  // Active markets state from Limitless MarketFetcher & MarketPageFetcher
  const [activeMarkets, setActiveMarkets] = useState<ActiveMarketItem[]>([]);
  const [totalMarketsCount, setTotalMarketsCount] = useState<number>(0);
  const [isLoadingMarkets, setIsLoadingMarkets] = useState<boolean>(false);
  const [marketFilter, setMarketFilter] = useState<'btc_5m' | 'btc' | 'all'>('btc_5m');
  const [marketSortBy, setMarketSortBy] = useState<'newest' | 'ending_soon' | 'high_value' | 'lp_rewards'>('ending_soon');
  const [navNodes, setNavNodes] = useState<NavigationNode[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('Crypto');

  const [orderbook, setOrderbook] = useState<OrderbookData | null>(null);
  const [isLoadingOrderbook, setIsLoadingOrderbook] = useState<boolean>(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Real live portfolio state (Zero Mock Data)
  const [portfolioData, setPortfolioData] = useState<LivePortfolioData>({
    profile: {
      id: config.walletAddress ? `${config.walletAddress.substring(0, 6)}...${config.walletAddress.substring(38)}` : 'المحفظة النشطة',
      account: config.walletAddress || 'غير محدد في .env',
      rank: { feeRateBps: 15 },
    },
    clob: [],
    amm: [],
    accumulativePoints: {
      totalPoints: 0,
      tier: 'حساب حقيقي مباشر',
      volumeUsd: 0,
    },
  });

  // Fetch active markets from Limitless API (focused on BTC 5m and 15m)
  const fetchActiveMarkets = useCallback(async () => {
    setIsLoadingMarkets(true);
    try {
      let filterQuery = 'btc';
      if (marketFilter === 'all') {
        filterQuery = '';
      } else if (marketFilter === 'eth') {
        filterQuery = 'eth';
      } else if (marketFilter === 'sol') {
        filterQuery = 'sol';
      }

      const res = await fetch(`/api/limitless/markets?limit=25&page=1&sortBy=${marketSortBy}&filter=${filterQuery}`);
      if (res.ok) {
        const json = await res.json();
        let rawMarkets: ActiveMarketItem[] = json.data || [];

        // Precise client-side filtering for 5m vs 15m BTC contracts
        const is5m = (m: ActiveMarketItem) => {
          const s = m.slug.toLowerCase();
          const t = m.title.toLowerCase();
          return (s.includes('5-min') || t.includes('5 min') || s.includes('5min')) && !s.includes('15-min') && !t.includes('15 min');
        };
        const is15m = (m: ActiveMarketItem) => {
          const s = m.slug.toLowerCase();
          const t = m.title.toLowerCase();
          return s.includes('15-min') || t.includes('15 min') || s.includes('15min');
        };

        if (marketFilter === 'btc_5m') {
          const m5 = rawMarkets.filter(is5m);
          if (m5.length > 0) rawMarkets = m5;
        } else if (marketFilter === 'btc_15m') {
          const m15 = rawMarkets.filter(is15m);
          if (m15.length > 0) rawMarkets = m15;
        }

        setActiveMarkets(rawMarkets);
        setTotalMarketsCount(json.totalMarketsCount || rawMarkets.length);
        
        // Auto-select preferred contract if current is default
        if (rawMarkets.length > 0 && (!selectedSlug || selectedSlug === 'btc-up-or-down-5-min-1791033000')) {
          setSelectedSlug(rawMarkets[0].slug);
        }
      }
    } catch (e) {
      console.warn('Failed to fetch active markets:', e);
    } finally {
      setIsLoadingMarkets(false);
    }
  }, [marketFilter, marketSortBy, selectedSlug]);

  // Quick 1-click switcher between Bitcoin 5m and 15m contracts
  const handleSelectBtcTimeframe = useCallback((tf: '5m' | '15m') => {
    const isTarget = (m: ActiveMarketItem) => {
      const s = m.slug.toLowerCase();
      const t = m.title.toLowerCase();
      const isBtc = s.includes('btc') || t.includes('btc') || t.includes('bitcoin');
      if (!isBtc) return false;
      if (tf === '5m') {
        return (s.includes('5-min') || t.includes('5 min') || s.includes('5min')) && !s.includes('15-min') && !t.includes('15 min');
      } else {
        return s.includes('15-min') || t.includes('15 min') || s.includes('15min');
      }
    };

    const found = activeMarkets.find(isTarget);

    if (found) {
      setSelectedSlug(found.slug);
      if (onSelectMarket) onSelectMarket(found.slug);
      return;
    }

    fetch(`/api/limitless/markets?limit=25&sortBy=ending_soon&filter=btc`)
      .then((res) => res.json())
      .then((json) => {
        const mList: ActiveMarketItem[] = json.data || [];
        const mFound = mList.find(isTarget);
        if (mFound) {
          setSelectedSlug(mFound.slug);
          if (onSelectMarket) onSelectMarket(mFound.slug);
        }
      })
      .catch((e) => console.warn('Failed to switch BTC timeframe:', e));
  }, [activeMarkets, onSelectMarket]);

  // Fetch live orderbook for selected slug
  const fetchOrderbook = useCallback(async (slug: string) => {
    if (!slug) return;
    setIsLoadingOrderbook(true);
    try {
      const [obRes, marketRes] = await Promise.all([
        fetch(`/api/limitless/orderbook/${slug}`),
        fetch(`/api/limitless/market/${slug}`).catch(() => null),
      ]);

      if (obRes.ok) {
        const obData: OrderbookData = await obRes.json();
        setOrderbook(obData);

        // Update yesPrice and noPrice from real best asks if available
        if (obData.bestAsk) {
          setYesPrice(obData.bestAsk);
          setNoPrice(+(1 - obData.bestAsk).toFixed(4));
        } else if (obData.midpoint) {
          setYesPrice(obData.midpoint);
          setNoPrice(+(1 - obData.midpoint).toFixed(4));
        }
      }

      if (marketRes && marketRes.ok) {
        const mData: ActiveMarketItem = await marketRes.json();
        setSelectedMarketDetail(mData);
      }
    } catch (e) {
      console.warn('Failed to fetch orderbook for', slug, e);
    } finally {
      setIsLoadingOrderbook(false);
    }
  }, []);

  // Sync markets on mount and filter/sort changes
  useEffect(() => {
    fetchActiveMarkets();
  }, [fetchActiveMarkets]);

  // Fetch navigation categories on mount
  useEffect(() => {
    fetch('/api/limitless/navigation')
      .then((res) => res.json())
      .then((nodes) => {
        if (Array.isArray(nodes) && nodes.length > 0) {
          setNavNodes(nodes);
        }
      })
      .catch((err) => console.warn('Navigation categories notice:', err));
  }, []);

  // Sync orderbook when selectedSlug changes
  useEffect(() => {
    if (selectedSlug) {
      fetchOrderbook(selectedSlug);
    }
  }, [selectedSlug, fetchOrderbook]);

  const handleSyncPortfolio = async () => {
    setIsSyncingPortfolio(true);
    try {
      const res = await fetch('/api/portfolio', { method: 'GET' });
      if (res.ok) {
        const data = await res.json();
        if (data && data.success) {
          setPortfolioData({
            profile: data.profile || {
              id: config.walletAddress ? `${config.walletAddress.substring(0, 6)}...${config.walletAddress.substring(38)}` : 'المحفظة النشطة',
              account: config.walletAddress || '',
              rank: { feeRateBps: 15 },
            },
            clob: data.clob || [],
            amm: data.amm || [],
            accumulativePoints: data.accumulativePoints || {
              totalPoints: 0,
              tier: 'حساب حقيقي مباشر',
              volumeUsd: 0,
            },
          });
        }
      }
    } catch {
      // Keep real empty state
    } finally {
      setIsSyncingPortfolio(false);
    }
  };

  useEffect(() => {
    handleSyncPortfolio();
  }, [config.walletAddress]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const copyToClipboard = (text: string, label: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedToken(label);
      setTimeout(() => setCopiedToken(null), 2000);
    }
  };

  // Trade calculation
  const riskAmount = (walletUsdc * config.riskPerTrade).toFixed(2);
  const isYesOtm = yesPrice <= config.maxEntryPrice;
  const isNoOtm = noPrice <= config.maxEntryPrice;

  return (
    <div className="space-y-6">
      {/* Header Info & Market Countdown */}
      <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 rtl:space-x-reverse mb-1 flex-wrap gap-y-1">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-950 text-blue-400 border border-blue-800/60">
              شبكة Base Mainnet (8453)
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-950 text-purple-400 border border-purple-800/60">
              Limitless CLOB SDK
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono bg-zinc-800 text-zinc-300">
              {selectedSlug}
            </span>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
              ⚡ تركيز حصري: عقد 5 دقائق (5-Min BTC)
            </span>
          </div>
          <h2 className="text-lg font-bold text-white">
            {selectedMarketDetail?.title || 'سوق تنبؤات BTC / USD إطار 5 دقائق'}
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            تكامل رسمي مع Limitless TypeScript SDK &bull; سجل أوامر CLOB &bull; تسوية مؤكدة عبر أوراكل Pyth/UMA
          </p>

          <div className="flex items-center space-x-2 rtl:space-x-reverse mt-2.5">
            <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30 flex items-center space-x-1.5 rtl:space-x-reverse">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span>نظام التداول مقفل حصرياً على عقود الـ 5 دقائق (5-Minute Binary Options Locked)</span>
            </span>
          </div>
        </div>

        {/* Expiry and Wallet Balance */}
        <div className="flex items-center space-x-4 rtl:space-x-reverse">
          <div className="px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-left rtl:text-right">
            <span className="text-[10px] text-zinc-400 block">
              الوقت المتبقي لشمعة 5M
            </span>
            <div className="flex items-center space-x-1.5 rtl:space-x-reverse text-amber-400 font-mono font-bold text-base">
              <Timer className="w-4 h-4" />
              <span>{formatTime(expiryCountdown)}</span>
            </div>
          </div>

          <div className="px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-left rtl:text-right">
            <span className="text-[10px] text-zinc-400 block">رصيد المحفظة المتوفر</span>
            <div className="flex items-center space-x-1.5 rtl:space-x-reverse text-emerald-400 font-mono font-bold text-base">
              <Wallet className="w-4 h-4" />
              <span>${walletUsdc.toFixed(2)} USDC</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Trade Outcomes (YES / NO) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Outcome 0: UP / YES */}
        <div
          className={`p-6 rounded-2xl border transition-all ${
            isYesOtm
              ? 'bg-emerald-950/20 border-emerald-500/40 ring-1 ring-emerald-500/20'
              : 'bg-zinc-900/90 border-zinc-800'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2 rtl:space-x-reverse">
              <span className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center font-mono font-bold">
                ▲
              </span>
              <div>
                <h3 className="font-bold text-white text-base">عقد الصعود (نعم / YES)</h3>
                <span className="text-[11px] text-zinc-400 font-mono">المؤشر: [0] &bull; خيار الشراء الصاعد</span>
              </div>
            </div>

            {isYesOtm ? (
              <span className="flex items-center space-x-1 rtl:space-x-reverse text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>عقد مؤهل (&le; ${config.maxEntryPrice.toFixed(2)})</span>
              </span>
            ) : (
              <span className="text-[11px] text-zinc-400 px-2 py-0.5 rounded bg-zinc-800">
                أعلى من سقف ${config.maxEntryPrice.toFixed(2)}
              </span>
            )}
          </div>

          <div className="my-5 p-4 rounded-xl bg-zinc-950 border border-zinc-800/80">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-xs text-zinc-400">سعر السهم الحالي:</span>
              <div className="flex items-baseline space-x-1.5 rtl:space-x-reverse">
                <span className="text-3xl font-mono font-bold text-emerald-400">${yesPrice.toFixed(4)}</span>
                <span className="text-xs text-zinc-400">/ سهم</span>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-zinc-400 pt-2 border-t border-zinc-800">
              <span>الاحتمالية الضمنية:</span>
              <span className="text-zinc-200 font-mono">{(yesPrice * 100).toFixed(1)}%</span>
            </div>
            <div className="flex items-center justify-between text-xs text-zinc-400 pt-1">
              <span>هدف الخروج السريع (+{config.dynamicFlipProfit * 100}%):</span>
              <span className="text-amber-400 font-mono font-bold">
                ${(yesPrice * (1 + config.dynamicFlipProfit)).toFixed(4)}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <button
              onClick={() => onExecuteManualTrade(0, 'BTC_UP_5M', yesPrice)}
              disabled={!isYesOtm}
              className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 rtl:space-x-reverse cursor-pointer ${
                isYesOtm
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-md shadow-emerald-500/10'
                  : 'bg-zinc-800 text-zinc-400 cursor-not-allowed'
              }`}
            >
              <Zap className="w-4 h-4" />
              <span>
                {isYesOtm
                  ? `تنفيذ الشراء السريع ماركت ($${riskAmount} USDC &bull; مخاطرة ${(config.riskPerTrade * 100).toFixed(2)}%)`
                  : `السعر يتجاوز سقف الدخول ($${config.maxEntryPrice.toFixed(2)})`}
              </span>
            </button>
            <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 px-1">
              <span>أقصى انزلاق: ${config.maxSlippage.toFixed(2)}</span>
              <span>سجل الأوامر: Limitless CLOB</span>
            </div>
          </div>
        </div>

        {/* Outcome 1: DOWN / NO */}
        <div
          className={`p-6 rounded-2xl border transition-all ${
            isNoOtm
              ? 'bg-rose-950/20 border-rose-500/40 ring-1 ring-rose-500/20'
              : 'bg-zinc-900/90 border-zinc-800'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2 rtl:space-x-reverse">
              <span className="w-8 h-8 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center font-mono font-bold">
                ▼
              </span>
              <div>
                <h3 className="font-bold text-white text-base">عقد الهبوط (لا / NO)</h3>
                <span className="text-[11px] text-zinc-400 font-mono">المؤشر: [1] &bull; خيار الشراء الهابط</span>
              </div>
            </div>

            {isNoOtm ? (
              <span className="flex items-center space-x-1 rtl:space-x-reverse text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>عقد مؤهل (&le; ${config.maxEntryPrice.toFixed(2)})</span>
              </span>
            ) : (
              <span className="text-[11px] text-zinc-400 px-2 py-0.5 rounded bg-zinc-800">
                أعلى من سقف ${config.maxEntryPrice.toFixed(2)}
              </span>
            )}
          </div>

          <div className="my-5 p-4 rounded-xl bg-zinc-950 border border-zinc-800/80">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-xs text-zinc-400">سعر السهم الحالي:</span>
              <div className="flex items-baseline space-x-1.5 rtl:space-x-reverse">
                <span className="text-3xl font-mono font-bold text-zinc-200">${noPrice.toFixed(4)}</span>
                <span className="text-xs text-zinc-400">/ سهم</span>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-zinc-400 pt-2 border-t border-zinc-800">
              <span>الاحتمالية الضمنية:</span>
              <span className="text-zinc-200 font-mono">{(noPrice * 100).toFixed(1)}%</span>
            </div>
            <div className="flex items-center justify-between text-xs text-zinc-400 pt-1">
              <span>هدف الخروج السريع (+{config.dynamicFlipProfit * 100}%):</span>
              <span className="text-amber-400 font-mono font-bold">
                ${(noPrice * (1 + config.dynamicFlipProfit)).toFixed(4)}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <button
              onClick={() => onExecuteManualTrade(1, 'BTC_DOWN_5M', noPrice)}
              disabled={!isNoOtm}
              className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 rtl:space-x-reverse cursor-pointer ${
                isNoOtm
                  ? 'bg-rose-500 hover:bg-rose-400 text-white shadow-md shadow-rose-500/10'
                  : 'bg-zinc-800 text-zinc-400 cursor-not-allowed'
              }`}
            >
              <Zap className="w-4 h-4" />
              <span>
                {isNoOtm
                  ? `تنفيذ الشراء السريع ماركت ($${riskAmount} USDC &bull; مخاطرة ${(config.riskPerTrade * 100).toFixed(2)}%)`
                  : `السعر يتجاوز سقف الدخول ($${config.maxEntryPrice.toFixed(2)})`}
              </span>
            </button>
            <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 px-1">
              <span>أقصى انزلاق: ${config.maxSlippage.toFixed(2)}</span>
              <span>سجل الأوامر: Limitless CLOB</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Tabbed Container: Orderbook | Active Markets | Positions | Portfolio */}
      <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
          <div className="flex items-center space-x-1 rtl:space-x-reverse bg-zinc-950 p-1 rounded-xl border border-zinc-800 flex-wrap gap-1">
            <button
              onClick={() => setPositionsTab('orderbook')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 rtl:space-x-reverse cursor-pointer ${
                positionsTab === 'orderbook'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>سجل الأوامر الحي (CLOB Orderbook)</span>
            </button>

            <button
              onClick={() => setPositionsTab('active_markets')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 rtl:space-x-reverse cursor-pointer ${
                positionsTab === 'active_markets'
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              <span>اكتشاف الأسواق النشطة ({totalMarketsCount})</span>
            </button>

            <button
              onClick={() => setPositionsTab('local')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 rtl:space-x-reverse cursor-pointer ${
                positionsTab === 'local'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>المراكز المحلية ({positions.length})</span>
            </button>

            <button
              onClick={() => setPositionsTab('sdk_portfolio')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 rtl:space-x-reverse cursor-pointer ${
                positionsTab === 'sdk_portfolio'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>محفظة SDK الرسمية ({portfolioData.clob.length})</span>
            </button>
          </div>

          <div className="flex items-center space-x-2 rtl:space-x-reverse">
            {positionsTab === 'orderbook' && (
              <button
                onClick={() => fetchOrderbook(selectedSlug)}
                disabled={isLoadingOrderbook}
                className="px-2.5 py-1 rounded-md bg-cyan-900/40 hover:bg-cyan-900/60 text-cyan-200 border border-cyan-700/50 text-xs font-mono flex items-center space-x-1.5 rtl:space-x-reverse transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingOrderbook ? 'animate-spin' : ''}`} />
                <span>{isLoadingOrderbook ? 'جاري التحديث...' : 'تحديث سجل الأوامر'}</span>
              </button>
            )}

            {positionsTab === 'active_markets' && (
              <button
                onClick={fetchActiveMarkets}
                disabled={isLoadingMarkets}
                className="px-2.5 py-1 rounded-md bg-blue-900/40 hover:bg-blue-900/60 text-blue-200 border border-blue-700/50 text-xs font-mono flex items-center space-x-1.5 rtl:space-x-reverse transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingMarkets ? 'animate-spin' : ''}`} />
                <span>{isLoadingMarkets ? 'جاري الجلب...' : 'تحديث الأسواق'}</span>
              </button>
            )}

            {positionsTab === 'sdk_portfolio' && (
              <button
                onClick={handleSyncPortfolio}
                disabled={isSyncingPortfolio}
                className="px-2.5 py-1 rounded-md bg-purple-900/40 hover:bg-purple-900/60 text-purple-200 border border-purple-700/50 text-xs font-mono flex items-center space-x-1.5 rtl:space-x-reverse transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingPortfolio ? 'animate-spin' : ''}`} />
                <span>{isSyncingPortfolio ? 'جاري المزامنة...' : 'تحديث من السيرفر'}</span>
              </button>
            )}
          </div>
        </div>

        {/* TAB 1: Real Live CLOB Orderbook Viewer */}
        {positionsTab === 'orderbook' && (
          <div className="space-y-4">
            {/* Market & Venue Signing Contract Info */}
            <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div>
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wider block font-mono">السوق النشط حالياً</span>
                  <div className="text-sm font-bold text-white flex items-center space-x-2 rtl:space-x-reverse">
                    <span>{selectedMarketDetail?.title || selectedSlug}</span>
                    <span className="text-xs text-zinc-400 font-mono">({selectedSlug})</span>
                  </div>
                </div>

                <div className="flex items-center space-x-2 rtl:space-x-reverse">
                  {onSelectMarket && (
                    <button
                      onClick={() => {
                        onSelectMarket(selectedSlug);
                      }}
                      className="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold hover:bg-emerald-500/30 transition-colors flex items-center space-x-1 rtl:space-x-reverse cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>تثبيت لسوق البوت النشط</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Venue contract details (EIP-712 Verifying Contract) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-mono">
                <div className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800">
                  <div className="text-[10px] text-zinc-400 mb-0.5">عقد التداول (Venue Exchange):</div>
                  <div className="text-cyan-300 text-[11px] truncate" title={selectedMarketDetail?.venue?.exchange || 'جاري الجلب...'}>
                    {selectedMarketDetail?.venue?.exchange || '0x05c748E2f4DcDe0ec9Fa8DDc40DE6b867f923fa5'}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800">
                  <div className="text-[10px] text-zinc-400 mb-0.5 flex justify-between">
                    <span>YES Token ID:</span>
                    <button 
                      onClick={() => copyToClipboard(selectedMarketDetail?.tokens?.yes || '', 'yes')}
                      className="text-zinc-500 hover:text-white text-[10px] cursor-pointer"
                    >
                      {copiedToken === 'yes' ? 'تم النسخ!' : 'نسخ'}
                    </button>
                  </div>
                  <div className="text-emerald-300 text-[11px] truncate">
                    {selectedMarketDetail?.tokens?.yes || '—'}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800">
                  <div className="text-[10px] text-zinc-400 mb-0.5 flex justify-between">
                    <span>NO Token ID:</span>
                    <button 
                      onClick={() => copyToClipboard(selectedMarketDetail?.tokens?.no || '', 'no')}
                      className="text-zinc-500 hover:text-white text-[10px] cursor-pointer"
                    >
                      {copiedToken === 'no' ? 'تم النسخ!' : 'نسخ'}
                    </button>
                  </div>
                  <div className="text-rose-300 text-[11px] truncate">
                    {selectedMarketDetail?.tokens?.no || '—'}
                  </div>
                </div>
              </div>
            </div>

            {/* Orderbook Metrics: Spread, Midpoint, Adjusted Midpoint, Min Size, Last Trade */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-xs">
              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                <span className="text-[10px] text-zinc-400 block mb-0.5">أفضل طلب (Best Bid)</span>
                <span className="text-emerald-400 font-mono font-bold text-sm">
                  {orderbook?.bestBid !== null && orderbook?.bestBid !== undefined ? `$${orderbook.bestBid.toFixed(4)}` : '—'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                <span className="text-[10px] text-zinc-400 block mb-0.5">أفضل عرض (Best Ask)</span>
                <span className="text-rose-400 font-mono font-bold text-sm">
                  {orderbook?.bestAsk !== null && orderbook?.bestAsk !== undefined ? `$${orderbook.bestAsk.toFixed(4)}` : '—'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                <span className="text-[10px] text-zinc-400 block mb-0.5">الفارق (Spread)</span>
                <span className="text-amber-400 font-mono font-bold text-sm">
                  {orderbook?.spread !== null && orderbook?.spread !== undefined ? `$${orderbook.spread.toFixed(4)}` : '—'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                <span className="text-[10px] text-zinc-400 block mb-0.5">المتوسط المعروض (Midpoint)</span>
                <span className="text-cyan-400 font-mono font-bold text-sm">
                  {orderbook?.midpoint !== null && orderbook?.midpoint !== undefined ? `$${orderbook.midpoint.toFixed(4)}` : '—'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                <span className="text-[10px] text-zinc-400 block mb-0.5">المتوسط المعدل (Adjusted)</span>
                <span className="text-blue-400 font-mono font-bold text-sm" title="السعر المتوسط بعد استبعاد الطلبات الأقل من الحد الأدنى للحجم">
                  {orderbook?.adjustedMidpoint !== null && orderbook?.adjustedMidpoint !== undefined ? `$${orderbook.adjustedMidpoint.toFixed(4)}` : (orderbook?.midpoint ? `$${orderbook.midpoint.toFixed(4)}` : '—')}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                <span className="text-[10px] text-zinc-400 block mb-0.5">أدنى كمية (Min Size)</span>
                <span className="text-purple-300 font-mono font-bold text-sm">
                  {orderbook?.minSize ? `${parseInt(orderbook.minSize, 10) / 1e6} سهم` : '50 سهم'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 col-span-2 sm:col-span-1">
                <span className="text-[10px] text-zinc-400 block mb-0.5">آخر صفقة (Last Trade)</span>
                <span className="text-emerald-300 font-mono font-bold text-sm">
                  {orderbook?.lastTradePrice !== null && orderbook?.lastTradePrice !== undefined ? `$${orderbook.lastTradePrice.toFixed(4)}` : '—'}
                </span>
              </div>
            </div>

            {/* Illiquidity Detection Alert (From Limitless Documentation) */}
            {orderbook && (
              <div>
                {orderbook.isIlliquid ? (
                  <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-800/60 flex items-start space-x-2.5 rtl:space-x-reverse text-amber-200 text-xs">
                    <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold mb-0.5">⚠️ تحذير سيولة منخفضة (Illiquid Market Detection)</div>
                      <p className="text-zinc-300 leading-relaxed text-[11px]">
                        وفقاً لتوثيق Limitless الرسمي: عندما يكون الفارق السعري (Spread &gt; 0.20$) أو يكون أحد طرفي سجل الأوامر فارغاً، فإن السعر المتوسط (Midpoint) قد يكون غير دقيق (يُظهر 50% افتراضياً). ينصح بتجنب أوامر الماركت الكبيرة في هذا العقد.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-800/50 flex items-center space-x-2 rtl:space-x-reverse text-emerald-300 text-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>سوق سائل ذو اتجاهين (Two-Sided Liquid Market): فروقات الأسعار ممتازة وجاهزة للتنفيذ التلقائي عبر EIP-712.</span>
                  </div>
                )}
              </div>
            )}

            {/* Orderbook Depth Columns (Bids & Asks) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* BIDS Column */}
              <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950/80">
                <div className="p-2.5 bg-emerald-950/40 border-b border-zinc-800 flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-300 flex items-center space-x-1.5 rtl:space-x-reverse">
                    <span>طلبات الشراء (BIDS)</span>
                    <span className="text-[10px] text-zinc-400 font-mono">({orderbook?.bids?.length || 0})</span>
                  </span>
                  <span className="text-[10px] text-zinc-400 font-mono">ترتيب تنازلي (الأعلى سعراً أولاً)</span>
                </div>
                <div className="max-h-60 overflow-y-auto">
                  <table className="w-full text-right font-mono text-xs">
                    <thead className="text-[11px] text-zinc-400 bg-zinc-900/60 sticky top-0">
                      <tr>
                        <th className="p-2">السعر (Price)</th>
                        <th className="p-2">الكمية (Shares)</th>
                        <th className="p-2 text-left rtl:text-left">القيمة (USD)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/40">
                      {orderbook?.bids?.map((bid, i) => {
                        const shares = bid.size / 1e6;
                        const totalUsd = shares * bid.price;
                        return (
                          <tr key={i} className="hover:bg-emerald-950/20">
                            <td className="p-2 font-bold text-emerald-400">${bid.price.toFixed(4)}</td>
                            <td className="p-2 text-zinc-200">{shares.toLocaleString()}</td>
                            <td className="p-2 text-left rtl:text-left text-zinc-400">${totalUsd.toFixed(2)}</td>
                          </tr>
                        );
                      })}
                      {(!orderbook?.bids || orderbook.bids.length === 0) && (
                        <tr>
                          <td colSpan={3} className="py-6 text-center text-zinc-500 text-xs">
                            لا توجد طلبات شراء (Empty Bids)
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ASKS Column */}
              <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950/80">
                <div className="p-2.5 bg-rose-950/40 border-b border-zinc-800 flex items-center justify-between">
                  <span className="text-xs font-bold text-rose-300 flex items-center space-x-1.5 rtl:space-x-reverse">
                    <span>عروض البيع (ASKS)</span>
                    <span className="text-[10px] text-zinc-400 font-mono">({orderbook?.asks?.length || 0})</span>
                  </span>
                  <span className="text-[10px] text-zinc-400 font-mono">ترتيب تصاعدي (الأقل سعراً أولاً)</span>
                </div>
                <div className="max-h-60 overflow-y-auto">
                  <table className="w-full text-right font-mono text-xs">
                    <thead className="text-[11px] text-zinc-400 bg-zinc-900/60 sticky top-0">
                      <tr>
                        <th className="p-2">السعر (Price)</th>
                        <th className="p-2">الكمية (Shares)</th>
                        <th className="p-2 text-left rtl:text-left">القيمة (USD)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/40">
                      {orderbook?.asks?.map((ask, i) => {
                        const shares = ask.size / 1e6;
                        const totalUsd = shares * ask.price;
                        return (
                          <tr key={i} className="hover:bg-rose-950/20">
                            <td className="p-2 font-bold text-rose-400">${ask.price.toFixed(4)}</td>
                            <td className="p-2 text-zinc-200">{shares.toLocaleString()}</td>
                            <td className="p-2 text-left rtl:text-left text-zinc-400">${totalUsd.toFixed(2)}</td>
                          </tr>
                        );
                      })}
                      {(!orderbook?.asks || orderbook.asks.length === 0) && (
                        <tr>
                          <td colSpan={3} className="py-6 text-center text-zinc-500 text-xs">
                            لا توجد عروض بيع (Empty Asks)
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Active Markets Discovery (From MarketFetcher.getActiveMarkets & MarketPageFetcher) */}
        {positionsTab === 'active_markets' && (
          <div className="space-y-4">
            {/* Category Navigation Bar from MarketPageFetcher */}
            {navNodes.length > 0 && (
              <div className="flex items-center space-x-1.5 rtl:space-x-reverse overflow-x-auto pb-1">
                <span className="text-xs text-zinc-400 shrink-0 font-medium ml-2">أقسام السوق (Navigation API):</span>
                {navNodes.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => {
                      setSelectedCategory(cat.name);
                      if (cat.name.toLowerCase().includes('crypto')) {
                        setMarketFilter('btc');
                      } else {
                        setMarketFilter('all');
                      }
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold shrink-0 transition-colors cursor-pointer ${
                      selectedCategory === cat.name
                        ? 'bg-purple-600 text-white shadow-sm'
                        : 'bg-zinc-900/80 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            )}

            {/* Filters & Sorting */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 bg-zinc-950 p-3 rounded-xl border border-zinc-800">
              <div className="flex items-center space-x-1.5 rtl:space-x-reverse flex-wrap gap-y-1">
                <span className="text-xs text-zinc-400 flex items-center space-x-1 rtl:space-x-reverse ml-2">
                  <Filter className="w-3.5 h-3.5" />
                  <span>تصفية:</span>
                </span>
                {[
                  { id: 'btc_5m', label: '⚡ عقود بيتكوين 5 دقائق حصرياً (5M)' },
                  { id: 'btc', label: 'كل عقود البيتكوين' },
                  { id: 'all', label: 'الكل (All)' },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setMarketFilter(item.id as any)}
                    className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold transition-colors cursor-pointer ${
                      marketFilter === item.id
                        ? 'bg-amber-500 text-zinc-950 shadow-sm'
                        : 'bg-zinc-900 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center space-x-2 rtl:space-x-reverse text-xs">
                <span className="text-zinc-400">الترتيب:</span>
                <select
                  value={marketSortBy}
                  onChange={(e) => setMarketSortBy(e.target.value as any)}
                  className="bg-zinc-900 border border-zinc-700 text-zinc-200 rounded-lg px-2.5 py-1 font-mono text-xs focus:outline-none focus:border-blue-500"
                >
                  <option value="newest">الأحدث (newest)</option>
                  <option value="ending_soon">ينتهي قريباً (ending_soon)</option>
                  <option value="high_value">أعلى سيولة (high_value)</option>
                  <option value="lp_rewards">مكافآت LP (lp_rewards)</option>
                </select>
              </div>
            </div>

            {/* Markets Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {activeMarkets.map((m) => {
                const isSelected = selectedSlug === m.slug;
                return (
                  <div
                    key={m.slug}
                    className={`p-4 rounded-xl border transition-all ${
                      isSelected
                        ? 'bg-blue-950/20 border-blue-500/50 ring-1 ring-blue-500/30'
                        : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <h4 className="font-bold text-white text-sm">{m.title}</h4>
                        <span className="text-[11px] text-zinc-400 font-mono block mt-0.5">{m.slug}</span>
                      </div>
                      {isSelected && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40">
                          المحدد حالياً
                        </span>
                      )}
                    </div>

                    <div className="space-y-1.5 text-[11px] font-mono text-zinc-400 bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800/80 my-3">
                      <div className="flex justify-between">
                        <span>Venue Exchange:</span>
                        <span className="text-zinc-300 truncate max-w-[180px]">{m.venue?.exchange || 'EIP-712 Contract'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>YES Token:</span>
                        <span className="text-emerald-400 truncate max-w-[180px]">{m.tokens?.yes ? `${m.tokens.yes.slice(0, 10)}...` : '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>NO Token:</span>
                        <span className="text-rose-400 truncate max-w-[180px]">{m.tokens?.no ? `${m.tokens.no.slice(0, 10)}...` : '—'}</span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 rtl:space-x-reverse pt-1">
                      <button
                        onClick={() => {
                          setSelectedSlug(m.slug);
                          setPositionsTab('orderbook');
                        }}
                        className="flex-1 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold transition-colors flex items-center justify-center space-x-1 rtl:space-x-reverse cursor-pointer"
                      >
                        <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
                        <span>عرض سجل الأوامر</span>
                      </button>

                      {onSelectMarket && (
                        <button
                          onClick={() => {
                            setSelectedSlug(m.slug);
                            onSelectMarket(m.slug);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors flex items-center space-x-1 rtl:space-x-reverse cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>تحديد للبوت</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {activeMarkets.length === 0 && !isLoadingMarkets && (
                <div className="col-span-2 py-10 text-center text-zinc-500 text-xs">
                  لا توجد أسواق تطابق الفلتر المحدد حالياً.
                </div>
              )}
            </div>

            {/* SDK Best Practices Documentation Note */}
            <div className="p-3.5 rounded-xl bg-purple-950/20 border border-purple-800/40 text-purple-200 text-xs space-y-1">
              <div className="font-bold flex items-center space-x-1.5 rtl:space-x-reverse text-purple-300">
                <Info className="w-4 h-4" />
                <span>إرشادات Limitless SDK الرسمية (Best Practices):</span>
              </div>
              <ul className="list-disc list-inside text-zinc-400 text-[11px] space-y-0.5 leading-relaxed pr-2">
                <li><strong className="text-zinc-200">تخزين بيانات Venue:</strong> استدعاء <code className="text-purple-300">getMarket()</code> يخزن عقود التوقيع داخلياً لـ <code className="text-purple-300">OrderClient</code> لتفادي الطلبات المتكررة.</li>
                <li><strong className="text-zinc-200">أسواق NegRisk المجمعة:</strong> استخدم دائماً معرف السوق الفرعي (<code className="text-purple-300">submarket.slug</code>) وليس معرف المجموعة لوضع الأوامر.</li>
                <li><strong className="text-zinc-200">أقصى حد للصفحة:</strong> الحد الأقصى لجلب الأسواق في المرة الواحدة هو 25 سوقاً لتفادي خطأ 400.</li>
              </ul>
            </div>
          </div>
        )}

        {/* TAB 3: Local Realtime Positions Table */}
        {positionsTab === 'local' && (
          <div className="overflow-x-auto">
            <table className="w-full text-right font-mono text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400">
                  <th className="pb-2">العقد</th>
                  <th className="pb-2">سعر الدخول</th>
                  <th className="pb-2">السعر اللحظي</th>
                  <th className="pb-2">الأسهم</th>
                  <th className="pb-2">هدف الربح (+300%)</th>
                  <th className="pb-2">الربح (PnL)</th>
                  <th className="pb-2">الحالة</th>
                  <th className="pb-2 text-left rtl:text-left">الإجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {positions.map((pos, idx) => {
                  const isTargetReached = pos.currentProfitPercent >= pos.targetProfitPercent;
                  return (
                    <tr key={`${pos.id}-${idx}`} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="py-3 font-semibold text-white">
                        {pos.outcomeLabel}
                        <span className="block text-[10px] text-zinc-400">{pos.marketTitle}</span>
                      </td>
                      <td className="py-3 text-zinc-300">${pos.entryPrice.toFixed(4)}</td>
                      <td className="py-3 font-bold text-white">${pos.currentPrice.toFixed(4)}</td>
                      <td className="py-3 text-zinc-300">{pos.sharesBought.toFixed(1)}</td>
                      <td className="py-3 text-amber-400">${pos.targetPrice.toFixed(4)}</td>
                      <td className="py-3">
                        <span
                          className={`px-2 py-0.5 rounded font-bold ${
                            pos.currentProfitPercent >= 300
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                              : pos.currentProfitPercent > 0
                              ? 'text-emerald-400'
                              : 'text-zinc-400'
                          }`}
                        >
                          +{pos.currentProfitPercent.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3">
                        {pos.status === 'DYNAMIC_FLIPPED' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800">
                            تم جني الأرباح (+${pos.realizedPnlUsd?.toFixed(2)})
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-950 text-amber-300 border border-amber-800 animate-pulse">
                            قيد الاحتفاظ (متابعة القفزة)
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-left rtl:text-left">
                        {pos.status === 'OPEN' && (
                          <button
                            onClick={() => onDynamicFlip(pos.id)}
                            className={`px-2.5 py-1 rounded text-xs font-bold transition-colors cursor-pointer ${
                              isTargetReached
                                ? 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950'
                                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                            }`}
                          >
                            {isTargetReached ? 'تنفيذ الخروج 🎯' : 'خروج يدوي'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {positions.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-zinc-400 text-xs">
                      لا توجد مراكز مفتوحة حالياً. قم برصد طفرة 2.5σ CVD لتنفيذ صفقة شراء سريعة تلقائياً.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 4: Live SDK Portfolio & Positions Table */}
        {positionsTab === 'sdk_portfolio' && (
          <div className="space-y-4">
            {/* Profile & Points Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                <div className="flex items-center space-x-2 rtl:space-x-reverse text-purple-400 text-xs font-bold mb-1">
                  <User className="w-3.5 h-3.5" />
                  <span>الملف الشخصي المعتمد (Profile ID)</span>
                </div>
                <div className="font-mono text-sm font-bold text-white">#{portfolioData.profile?.id || 'N/A'}</div>
                <div className="text-[11px] font-mono text-zinc-400 truncate mt-0.5" title={portfolioData.profile?.account}>
                  {portfolioData.profile?.account}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                <div className="flex items-center space-x-2 rtl:space-x-reverse text-emerald-400 text-xs font-bold mb-1">
                  <Award className="w-3.5 h-3.5" />
                  <span>نسبة الرسوم المخصصة (Fee Tier)</span>
                </div>
                <div className="font-mono text-sm font-bold text-white">
                  {portfolioData.profile?.rank?.feeRateBps ? `${portfolioData.profile.rank.feeRateBps} Bps` : '15 Bps (Standard)'}
                </div>
                <div className="text-[11px] text-zinc-400 mt-0.5">
                  خصم تلقائي على رسوم التداول في أسواق CLOB
                </div>
              </div>

              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                <div className="flex items-center space-x-2 rtl:space-x-reverse text-amber-400 text-xs font-bold mb-1">
                  <Coins className="w-3.5 h-3.5" />
                  <span>النقاط التراكمية (Reward Points)</span>
                </div>
                <div className="font-mono text-sm font-bold text-amber-300">
                  {portfolioData.accumulativePoints?.totalPoints?.toLocaleString() || '0'} PTS
                </div>
                <div className="text-[11px] text-zinc-400 mt-0.5">
                  مكافآت توفير السيولة وحجم تداول Arbitrage
                </div>
              </div>
            </div>

            {/* CLOB Positions Table */}
            <div className="border border-zinc-800 rounded-xl overflow-hidden">
              <div className="p-3 bg-zinc-950/80 border-b border-zinc-800 flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-200">
                  مراكز جدول الأوامر (CLOB Orderbook Positions)
                </span>
                <span className="text-[10px] text-purple-300 font-mono bg-purple-950/80 px-2 py-0.5 rounded border border-purple-800/60">
                  PortfolioFetcher.get_positions()["clob"]
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-right font-mono text-xs">
                  <thead className="bg-zinc-950">
                    <tr className="border-b border-zinc-800 text-zinc-400">
                      <th className="p-3">عنوان السوق (Market Title)</th>
                      <th className="p-3">المعرف (Slug)</th>
                      <th className="p-3">الخيار (Outcome)</th>
                      <th className="p-3">حجم المركز (Size)</th>
                      <th className="p-3 text-left rtl:text-left">نوع السوق</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {portfolioData.clob.map((cPos, idx) => (
                      <tr key={idx} className="hover:bg-zinc-800/30 transition-colors">
                        <td className="p-3 font-semibold text-white">{cPos.market?.title}</td>
                        <td className="p-3 text-zinc-400 text-[11px]">{cPos.market?.slug || '—'}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${cPos.outcomeIndex === 0 ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-rose-950 text-rose-300 border border-rose-800'}`}>
                            {cPos.outcomeIndex === 0 ? 'نعم (YES)' : 'لا (NO)'}
                          </span>
                        </td>
                        <td className="p-3 font-bold text-emerald-400">{cPos.size} عقد</td>
                        <td className="p-3 text-left rtl:text-left text-zinc-400">CLOB (Orderbook)</td>
                      </tr>
                    ))}
                    {portfolioData.clob.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-zinc-400 text-xs">
                          لا توجد مراكز CLOB نشطة حالياً في الحساب.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
