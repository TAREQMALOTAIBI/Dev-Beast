import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  Terminal,
  Code2,
  CheckCircle2,
  AlertTriangle,
  Flame,
  ShieldCheck,
  Activity,
  Layers,
  Wallet,
  X,
  Globe,
  KeyRound,
  Check,
  Copy,
  ExternalLink,
  ChevronDown,
  LogOut,
} from 'lucide-react';
import { ethers } from 'ethers';

import type {
  BotConfig,
  Candle,
  ContractTokenType,
  StrategyExecutionReport,
  OrderBook,
} from './bot/types';
import { checkMeanReversionSignal } from './bot/indicators';
import { LimitlessExchangeSDK } from './bot/limitlessSdk';
import { executeAsymmetricMeanReversion } from './bot/strategy';
import {
  defaultBotConfig,
  generateSyntheticCandles,
} from './bot/sampleRunner';

import { ChartViewer } from './components/ChartViewer';
import { OrderbookViewer } from './components/OrderbookViewer';
import { Eip712Inspector } from './components/Eip712Inspector';
import { PortfolioViewer } from './components/PortfolioViewer';
import { MinimalBotSetup } from './components/MinimalBotSetup';

export default function App() {
  // تبويبات الواجهة الأساسية المطلوبة فقط
  const [activeTab, setActiveTab] = useState<'terminal' | 'portfolio' | 'setup'>('terminal');
  const [activeMarketSlug, setActiveMarketSlug] = useState<string>('btc-price-15m-now');

  // إعدادات البوت والبارامترات
  const [config, setConfig] = useState<BotConfig>(() => {
    try {
      const saved = localStorage.getItem('limitless_bot_config');
      if (saved) return { ...defaultBotConfig, ...JSON.parse(saved) };
    } catch (e) {
      console.error('خطأ في استرجاع إعدادات البوت:', e);
    }
    return defaultBotConfig;
  });

  // حالة ربط المحفظة الحقيقية (Web3 Wallet)
  const [connectedWallet, setConnectedWallet] = useState<string | null>(() => {
    return localStorage.getItem('limitless_connected_wallet') || '0x807A7Ae675A0e16414875a2a318BEB6B55cDbB14';
  });

  // حالة وتشخيص محرك السيرفر اللحظي
  const [serverStatus, setServerStatus] = useState<{
    running: boolean;
    btcPrice?: number;
    rsi?: number;
    waitReason?: string;
    tradeSizeUsdc?: number;
  }>({
    running: true,
    waitReason: 'في انتظار اكتمال شروط الاستراتيجية (RSI ≥ 70 أو ≤ 30) وسعر العقد ≤ 0.20$',
    tradeSizeUsdc: 4.0,
  });

  const [isWalletModalOpen, setIsWalletModalOpen] = useState<boolean>(false);
  const [isConnectingWallet, setIsConnectingWallet] = useState<boolean>(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [manualAddressInput, setManualAddressInput] = useState<string>('');
  const [manualPkInput, setManualPkInput] = useState<string>('');
  const [copiedAddr, setCopiedAddr] = useState<boolean>(false);

  // حالات محاكاة السوق
  const [candles, setCandles] = useState<Candle[]>(() =>
    generateSyntheticCandles(50, 94850, 'NORMAL')
  );

  // حالة تشغيل الروبوت مع حفظها في التخزين المحلي (LocalStorage) لتبقى محفوظة عند الخروج والعودة
  const [isBotRunning, setIsBotRunning] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('limitless_bot_running');
      return saved !== null ? saved === 'true' : true;
    } catch (e) {
      return true;
    }
  });

  // حفظ حالة تشغيل الروبوت تلقائياً عند تغييرها
  useEffect(() => {
    try {
      localStorage.setItem('limitless_bot_running', isBotRunning ? 'true' : 'false');
    } catch (e) {
      console.error('فشل حفظ حالة الروبوت:', e);
    }
  }, [isBotRunning]);

  // حفظ الإعدادات تلقائياً عند تعديلها
  useEffect(() => {
    try {
      localStorage.setItem('limitless_bot_config', JSON.stringify(config));
    } catch (e) {
      console.error('فشل حفظ الإعدادات:', e);
    }
  }, [config]);

  // تبديل حالة تشغيل الروبوت مع مزامنتها مع السيرفر الخلفي
  const handleToggleBot = async () => {
    const nextState = !isBotRunning;
    setIsBotRunning(nextState);
    try {
      await fetch('/api/bot/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ running: nextState }),
      });
    } catch {
      // وضع غير متصل
    }
  };

  // المزامنة التلقائية للمحفظة الحقيقية من السيرفر (.env) فور فتح الصفحة
  useEffect(() => {
    const syncServerWallet = async () => {
      try {
        const response = await fetch('/api/wallet');
        if (response.ok) {
          const data = await response.json();
          if (data.configured && data.address) {
            setConnectedWallet(data.address);
            localStorage.setItem('limitless_connected_wallet', data.address);
            setConfig((prev) => ({ ...prev, walletAddress: data.address }));
          }
        }
      } catch (err) {
        // في حال تشغيل العميل بدون خادم
      }
    };
    syncServerWallet();
  }, []);

  // ربط المحفظة عبر Browser Extension (MetaMask / Rabby / Coinbase)
  const connectBrowserWallet = async () => {
    setIsConnectingWallet(true);
    setWalletError(null);
    try {
      if (typeof window !== 'undefined' && (window as any).ethereum) {
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        const accounts = await provider.send('eth_requestAccounts', []);
        if (accounts && accounts.length > 0) {
          const address = accounts[0];
          setConnectedWallet(address);
          localStorage.setItem('limitless_connected_wallet', address);
          setConfig((prev) => ({ ...prev, walletAddress: address }));

          // التبديل التلقائي لشبكة Base Mainnet (ChainId: 8453 = 0x2105)
          try {
            await (window as any).ethereum.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: '0x2105' }],
            });
          } catch (switchError: any) {
            if (switchError.code === 4902) {
              await (window as any).ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [
                  {
                    chainId: '0x2105',
                    chainName: 'Base Mainnet',
                    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
                    rpcUrls: ['https://mainnet.base.org'],
                    blockExplorerUrls: ['https://basescan.org'],
                  },
                ],
              });
            }
          }
          setIsWalletModalOpen(false);
        }
      } else {
        setWalletError('لم يتم العثور على إضافة محفظة (MetaMask أو Rabby) في المتصفح. يمكنك إدخال عنوان محفظتك يدوياً في الخيار الثاني بالأسفل.');
      }
    } catch (err: any) {
      console.error('Wallet connection error:', err);
      setWalletError(err.message || 'فشل الاتصال بالمحفظة');
    } finally {
      setIsConnectingWallet(false);
    }
  };

  // ربط المحفظة يدوياً عبر العنوان
  const handleSaveManualAddress = () => {
    const trimmed = manualAddressInput.trim();
    if (ethers.isAddress(trimmed)) {
      setConnectedWallet(trimmed);
      localStorage.setItem('limitless_connected_wallet', trimmed);
      setConfig((prev) => ({ ...prev, walletAddress: trimmed }));
      setIsWalletModalOpen(false);
      setWalletError(null);
      setManualAddressInput('');
    } else {
      setWalletError('عنوان المحفظة غير صالح، يرجى كتابة عنوان EVM صحيح يبدأ بـ 0x.');
    }
  };

  // ربط المفتاح الخاص محلياً
  const handleSavePrivateKey = () => {
    let pk = manualPkInput.trim();
    if (!pk.startsWith('0x') && pk.length === 64) {
      pk = `0x${pk}`;
    }
    try {
      const w = new ethers.Wallet(pk);
      const address = w.address;
      setConnectedWallet(address);
      localStorage.setItem('limitless_connected_wallet', address);
      setConfig((prev) => ({ ...prev, walletAddress: address, privateKey: pk }));
      setIsWalletModalOpen(false);
      setWalletError(null);
      setManualPkInput('');
    } catch {
      setWalletError('المفتاح الخاص غير صالح. يرجى التأكد من كتابته بشكل سليم.');
    }
  };

  const disconnectWallet = () => {
    setConnectedWallet(null);
    localStorage.removeItem('limitless_connected_wallet');
    setConfig((prev) => ({ ...prev, walletAddress: '0x45a90F8eB3f4bC1a3419eD9C882fF4129b0142fa' }));
    setIsWalletModalOpen(false);
  };

  const [isStreaming, setIsStreaming] = useState<boolean>(true);
  const [selectedTokenType, setSelectedTokenType] = useState<ContractTokenType>('NO');

  // سجل التنفيذ
  const [executionLogs, setExecutionLogs] = useState<StrategyExecutionReport[]>([]);
  const [latestReport, setLatestReport] = useState<StrategyExecutionReport | null>(null);

  // دفتر الأوامر التجريبي التفاعلي (Limitless CLOB)
  const [orderbook, setOrderbook] = useState<OrderBook>({
    tokenId: '0x2222222222222222222222222222222222222222_NO_TOKEN',
    midpoint: 0.1700,
    adjustedMidpoint: 0.1700,
    maxSpread: '0.035',
    minSize: '50000000',
    lastTradePrice: 0.18,
    asks: [
      { price: 0.18, size: 500, side: 'SELL', totalCost: 90.0 },
      { price: 0.20, size: 850, side: 'SELL', totalCost: 170.0 },
      { price: 0.23, size: 1200, side: 'SELL', totalCost: 276.0 },
      { price: 0.28, size: 1600, side: 'SELL', totalCost: 448.0 },
    ],
    bids: [
      { price: 0.16, size: 600, side: 'BUY', totalCost: 96.0 },
      { price: 0.15, size: 900, side: 'BUY', totalCost: 135.0 },
      { price: 0.13, size: 1400, side: 'BUY', totalCost: 182.0 },
    ],
    timestamp: Date.now(),
  });

  // عميل SDK
  const sdk = useMemo(() => {
    return new LimitlessExchangeSDK({
      chainId: config.chainId,
      verifyingContract: config.limitlessExchangeAddress,
      walletAddress: config.walletAddress,
    });
  }, [config.chainId, config.limitlessExchangeAddress, config.walletAddress]);

  // فحص الإشارة اللحظية
  const currentSignal = useMemo(() => {
    return checkMeanReversionSignal(candles, config);
  }, [candles, config]);

  // تنفيذ الاستراتيجية عند تغير البيانات
  const triggerExecutionCheck = useCallback(async () => {
    if (!isBotRunning) {
      setLatestReport({
        timestamp: Date.now(),
        signal: checkMeanReversionSignal(candles, config),
        executed: false,
        status: 'NO_SIGNAL',
        messageArabic: '⏸️ الروبوت متوقف مؤقتاً بواسطة المستخدم. تم تعليق إرسال الأوامر والتداول الآلي.',
        messageEnglish: 'Bot paused manually by user. Automated order execution suspended.',
      });
      return;
    }

    try {
      const report = await executeAsymmetricMeanReversion(sdk, candles, config);
      setLatestReport(report);

      if (report.status !== 'NO_SIGNAL') {
        setExecutionLogs((prev) => [report, ...prev.slice(0, 19)]);
      }
    } catch (err) {
      console.error('خطأ في فحص التنفيذ:', err);
    }
  }, [sdk, candles, config, isBotRunning]);

  useEffect(() => {
    triggerExecutionCheck();
  }, [candles, triggerExecutionCheck]);

  // 1. جلب الشموع الحقيقية من Binance REST API فور فتح الواجهة
  useEffect(() => {
    let isCancelled = false;

    const loadRealBinanceKlines = async () => {
      const endpoints = [
        '/api/binance/klines?limit=50',
        'https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=50',
        'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=50',
      ];

      for (const endpoint of endpoints) {
        try {
          const res = await fetch(endpoint, { signal: AbortSignal.timeout(4000) });
          if (!res.ok) continue;
          const data = await res.json();

          if (data.closes && Array.isArray(data.closes) && data.closes.length > 0) {
            if (isCancelled) return;
            const now = Date.now();
            const realCandles: Candle[] = data.closes.map((close: number, idx: number) => ({
              timestamp: now - (data.closes.length - idx) * 60000,
              open: close,
              high: close,
              low: close,
              close,
              volume: 50,
            }));
            setCandles(realCandles);
            break;
          } else if (Array.isArray(data) && data.length > 0) {
            if (isCancelled) return;
            const now = Date.now();
            const realCandles: Candle[] = data.map((k: any, idx: number) => {
              const open = parseFloat(k[1]);
              const high = parseFloat(k[2]);
              const low = parseFloat(k[3]);
              const close = parseFloat(k[4]);
              const volume = parseFloat(k[5]) || 50;
              return {
                timestamp: k[0] || (now - (data.length - idx) * 60000),
                open,
                high,
                low,
                close,
                volume: Math.round(volume),
              };
            });
            setCandles(realCandles);
            break;
          }
        } catch {}
      }
    };

    loadRealBinanceKlines();

    return () => {
      isCancelled = true;
    };
  }, []);

  // 2. بث أسعار بينانس الحية عبر WebSocket في المتصفح مع معالجة الانقطاع
  useEffect(() => {
    if (!isStreaming) return;

    let ws: WebSocket | null = null;
    let fallbackInterval: any = null;

    try {
      ws = new WebSocket('wss://data-stream.binance.vision/ws/btcusdt@kline_1m');

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (!payload.k) return;
          const kline = payload.k;
          const currentPrice = parseFloat(kline.c);

          setCandles((prev) => {
            if (!prev || prev.length === 0) return prev;
            const updated = [...prev];
            const lastCandle = updated[updated.length - 1];

            if (kline.x) {
              // شمعة دقيقة مكتملة
              updated.push({
                timestamp: kline.t || Date.now(),
                open: parseFloat(kline.o),
                high: parseFloat(kline.h),
                low: parseFloat(kline.l),
                close: currentPrice,
                volume: Math.round(parseFloat(kline.v)),
              });
              if (updated.length > 50) updated.shift();
            } else {
              // تحديث الشمعة الحالية لحظياً
              updated[updated.length - 1] = {
                ...lastCandle,
                close: currentPrice,
                high: Math.max(lastCandle.high, currentPrice),
                low: Math.min(lastCandle.low, currentPrice),
              };
            }
            return updated;
          });
        } catch {}
      };

      ws.onerror = () => {
        // إذا حُظر WebSocket في المتصفح، تفعيل المؤقت الاحتياطي
        if (!fallbackInterval) {
          fallbackInterval = setInterval(() => {
            setCandles((prev) => {
              if (!prev || prev.length === 0) return prev;
              const lastCandle = prev[prev.length - 1];
              const drift = (Math.random() - 0.49) * 15;
              const newClose = Number((lastCandle.close + drift).toFixed(2));
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...lastCandle,
                close: newClose,
                high: Math.max(lastCandle.high, newClose),
                low: Math.min(lastCandle.low, newClose),
              };
              return updated;
            });
          }, 1500);
        }
      };
    } catch {
      // وضع احتياطي
    }

    return () => {
      if (ws) ws.close();
      if (fallbackInterval) clearInterval(fallbackInterval);
    };
  }, [isStreaming]);

  // سيناريوهات الاختبار الفوري
  const injectScenario = (type: 'OVERBOUGHT_PUMP' | 'OVERSOLD_DUMP' | 'NORMAL') => {
    const fresh = generateSyntheticCandles(50, 94850, type);
    setCandles(fresh);

    if (type === 'OVERBOUGHT_PUMP') {
      setSelectedTokenType('NO');
      setOrderbook({
        tokenId: '0x2222_NO_TOKEN',
        midpoint: 0.1600,
        adjustedMidpoint: 0.1600,
        maxSpread: '0.035',
        minSize: '50000000',
        lastTradePrice: 0.17,
        asks: [
          { price: 0.17, size: 650, side: 'SELL', totalCost: 110.5 },
          { price: 0.19, size: 900, side: 'SELL', totalCost: 171.0 },
          { price: 0.20, size: 1400, side: 'SELL', totalCost: 280.0 },
          { price: 0.24, size: 2000, side: 'SELL', totalCost: 480.0 },
        ],
        bids: [
          { price: 0.15, size: 500, side: 'BUY', totalCost: 75.0 },
          { price: 0.14, size: 800, side: 'BUY', totalCost: 112.0 },
        ],
        timestamp: Date.now(),
      });
    } else if (type === 'OVERSOLD_DUMP') {
      setSelectedTokenType('YES');
      setOrderbook({
        tokenId: '0x1111_YES_TOKEN',
        midpoint: 0.1700,
        adjustedMidpoint: 0.1700,
        maxSpread: '0.035',
        minSize: '50000000',
        lastTradePrice: 0.18,
        asks: [
          { price: 0.18, size: 700, side: 'SELL', totalCost: 126.0 },
          { price: 0.20, size: 1100, side: 'SELL', totalCost: 220.0 },
          { price: 0.25, size: 1500, side: 'SELL', totalCost: 375.0 },
        ],
        bids: [
          { price: 0.16, size: 400, side: 'BUY', totalCost: 64.0 },
          { price: 0.14, size: 750, side: 'BUY', totalCost: 105.0 },
        ],
        timestamp: Date.now(),
      });
    } else {
      setOrderbook({
        tokenId: '0x2222_NO_TOKEN',
        midpoint: 0.2250,
        adjustedMidpoint: 0.2250,
        maxSpread: '0.035',
        minSize: '50000000',
        lastTradePrice: 0.23,
        asks: [
          { price: 0.24, size: 500, side: 'SELL', totalCost: 120.0 },
          { price: 0.29, size: 850, side: 'SELL', totalCost: 246.5 },
        ],
        bids: [
          { price: 0.21, size: 600, side: 'BUY', totalCost: 126.0 },
        ],
        timestamp: Date.now(),
      });
    }
  };

  const toggleHighPrices = () => {
    setOrderbook((prev) => ({
      ...prev,
      midpoint: 0.2350,
      asks: [
        { price: 0.26, size: 500, side: 'SELL', totalCost: 130.0 },
        { price: 0.32, size: 800, side: 'SELL', totalCost: 256.0 },
        { price: 0.40, size: 1200, side: 'SELL', totalCost: 480.0 },
      ],
    }));
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-['Cairo',sans-serif]">
      {/* الشريط العلوي (Navbar) */}
      <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/80 backdrop-blur-xl px-4 sm:px-6 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-cyan-500 to-indigo-600 text-white shadow-lg shadow-cyan-500/20">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-white">
                  منصة التداول الكمي Limitless
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-mono">
                  عقود BTC 15m
                </span>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  توقيع EIP-712 نشط
                </span>
              </div>
              <p className="text-xs text-slate-400">
                خطة التداول بالـ Z-Score فقط (Lookback: 20m • التركيز على 2.0 • الدخول &le; 0.20$ • أوامر FAK)
              </p>
            </div>
          </div>

          {/* شريط المؤشرات السريعة والتبويبات */}
          <div className="flex items-center gap-4 text-xs">
            <div className="hidden md:flex flex-col text-right">
              <span className="text-slate-400 text-[10px]">سعر البيتكوين اللحظي</span>
              <span className="text-white font-bold font-mono text-sm">
                ${candles[candles.length - 1]?.close.toLocaleString() || '94,850.00'}
              </span>
            </div>

            {/* مؤشر Z-Score السريع (التركيز على 2.0) */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-slate-400 text-[10px]">Z-Score (20m):</span>
              <span
                className={`font-mono font-bold text-xs ${
                  currentSignal.zScore >= 2.0
                    ? 'text-rose-400 animate-pulse font-extrabold'
                    : currentSignal.zScore <= -2.0
                    ? 'text-emerald-400 animate-pulse font-extrabold'
                    : 'text-cyan-300'
                }`}
              >
                {currentSignal.zScore > 0 ? '+' : ''}{currentSignal.zScore.toFixed(2)}
              </span>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800">
              <span
                className={`w-2 h-2 rounded-full ${
                  currentSignal.signal === 'OVERBOUGHT'
                    ? 'bg-rose-500 animate-ping'
                    : currentSignal.signal === 'OVERSOLD'
                    ? 'bg-emerald-500 animate-ping'
                    : 'bg-cyan-500'
                }`}
              />
              <span className="font-semibold text-slate-300">
                {currentSignal.signal === 'OVERBOUGHT'
                  ? 'إشارة هبوط (Z >= +2.0)'
                  : currentSignal.signal === 'OVERSOLD'
                  ? 'إشارة صعود (Z <= -2.0)'
                  : 'سوق محايد (Neutral)'}
              </span>
            </div>

            {/* زر تشغيل وإيقاف الروبوت الرئيسي */}
            <button
              onClick={handleToggleBot}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all shadow-md cursor-pointer ${
                isBotRunning
                  ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/20'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/25 animate-pulse'
              }`}
              title={isBotRunning ? 'إيقاف التداول الآلي فورياً' : 'تفعيل التداول الآلي للروبوت'}
            >
              {isBotRunning ? (
                <>
                  <Pause className="w-3.5 h-3.5 fill-current" />
                  <span>إيقاف الروبوت</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>تشغيل الروبوت</span>
                </>
              )}
            </button>

            {/* أزرار التبويبات الثلاثة الأساسية فقط */}
            <nav className="flex rounded-xl bg-slate-900 p-1 border border-slate-800 text-xs">
              <button
                onClick={() => setActiveTab('terminal')}
                className={`px-3.5 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                  activeTab === 'terminal'
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>محطة التداول الآلي</span>
              </button>
              <button
                onClick={() => setActiveTab('portfolio')}
                className={`px-3.5 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                  activeTab === 'portfolio'
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Wallet className="w-3.5 h-3.5" />
                <span>المحفظة والمراكز</span>
              </button>
              <button
                onClick={() => setActiveTab('setup')}
                className={`px-3.5 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                  activeTab === 'setup'
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>كود البوت وإعدادات التشغيل</span>
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* المحتوى الرئيسي */}
      <main className="max-w-7xl mx-auto w-full p-4 sm:p-6 flex-1 space-y-6">
        {/* التبويب 1: محطة التداول والمحاكاة الحية */}
        {activeTab === 'terminal' && (
          <div className="space-y-6">
            {/* شريط حالة وزر تشغيل/إيقاف الروبوت الرئيسي */}
            <div
              className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                isBotRunning
                  ? 'bg-emerald-950/30 border-emerald-500/40 shadow-lg shadow-emerald-950/20'
                  : 'bg-rose-950/30 border-rose-500/40 shadow-lg shadow-rose-950/20'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`p-2.5 rounded-xl border ${
                    isBotRunning
                      ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
                      : 'bg-rose-500/20 border-rose-500/30 text-rose-400'
                  }`}
                >
                  {isBotRunning ? (
                    <Activity className="w-5 h-5 animate-pulse" />
                  ) : (
                    <AlertTriangle className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">حالة الروبوت الآلي:</span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-xs font-bold font-mono ${
                        isBotRunning
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      }`}
                    >
                      {isBotRunning ? '● نشط وقيد التداول الآلي (RUNNING)' : '■ متوقف مؤقتاً (PAUSED)'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5">
                    {isBotRunning
                      ? 'الروبوت يراقب بث أسعار بينانس ودفتر أوامر Limitless CLOB ويقتنص الفرص فور تحقق الشرط (≤ 0.20$).'
                      : 'تم تعليق التداول التلقائي وإرسال الأوامر. يمكنك استئناف التشغيل في أي وقت.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 self-end sm:self-center">
                <button
                  onClick={handleToggleBot}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all shadow-lg cursor-pointer ${
                    isBotRunning
                      ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/25'
                      : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/30 animate-pulse'
                  }`}
                >
                  {isBotRunning ? (
                    <>
                      <Pause className="w-4 h-4 fill-white" />
                      <span>إيقاف الروبوت مؤقتاً</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-slate-950" />
                      <span>تشغيل الروبوت الآن</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* شريط التحكم وحقن السيناريوهات */}
            <div className="bg-slate-900/80 rounded-2xl border border-slate-800/80 p-4 shadow-xl backdrop-blur-md flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-400 font-bold ml-1">
                  أدوات المحاكاة الحية:
                </span>
                <button
                  onClick={() => setIsStreaming(!isStreaming)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                    isStreaming
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  }`}
                >
                  {isStreaming ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{isStreaming ? 'بث مباشر للشموع (1.5 ث)' : 'البث متوقف'}</span>
                </button>

                <button
                  onClick={() => injectScenario('OVERBOUGHT_PUMP')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs transition-all font-bold"
                >
                  <TrendingUp className="w-3.5 h-3.5 text-rose-400" />
                  <span>⚡ محاكاة قمة (Z-Score &ge; +2.0)</span>
                </button>

                <button
                  onClick={() => injectScenario('OVERSOLD_DUMP')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs transition-all font-bold"
                >
                  <TrendingDown className="w-3.5 h-3.5 text-emerald-400" />
                  <span>🚀 محاكاة قاع (Z-Score &le; -2.0)</span>
                </button>

                <button
                  onClick={() => injectScenario('NORMAL')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs transition-all"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>إعادة ضبط Z-Score للحياد</span>
                </button>
              </div>

              {/* اختبار حالات الرفض */}
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleHighPrices}
                  className="px-2.5 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs transition-all"
                  title="اختبار رفض الصفقة عند تجاوز سعر البيع 0.20$"
                >
                  رفع السعر &gt; 0.20$ (اختبار الرفض)
                </button>
              </div>
            </div>

            {/* بطاقة التنبيه والتشخيص اللحظي */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div
                  className={`p-2 rounded-xl mt-0.5 ${
                    currentSignal.signal === 'OVERBOUGHT'
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      : currentSignal.signal === 'OVERSOLD'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                  }`}
                >
                  <Flame className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>تشخيص حالة إشارة Z-Score:</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded font-mono font-bold ${
                        currentSignal.signal === 'OVERBOUGHT'
                          ? 'bg-rose-950 text-rose-300 border border-rose-700'
                          : currentSignal.signal === 'OVERSOLD'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {currentSignal.signal === 'OVERBOUGHT'
                        ? 'إشارة هبوط (Z >= +2.0)'
                        : currentSignal.signal === 'OVERSOLD'
                        ? 'إشارة صعود (Z <= -2.0)'
                        : 'حياد (NEUTRAL)'}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    {currentSignal.explanationArabic}
                  </p>
                </div>
              </div>

              {latestReport && (
                <div className="shrink-0 p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs">
                  <span className="text-slate-400 block text-[10px]">نتيجة آخر فحص للتنفيذ</span>
                  <span
                    className={`font-bold font-mono ${
                      latestReport.status === 'EXECUTED'
                        ? 'text-emerald-400'
                        : latestReport.status === 'PRICE_EXCEEDS_MAX'
                        ? 'text-amber-400'
                        : 'text-slate-400'
                    }`}
                  >
                    {latestReport.status === 'EXECUTED'
                      ? 'تم التنفيذ بنجاح'
                      : latestReport.status === 'PRICE_EXCEEDS_MAX'
                      ? 'مرفوض: السعر > 0.20$'
                      : latestReport.status}
                  </span>
                  {latestReport.asymmetricMultiplier && (
                    <span className="block text-emerald-300 text-[11px] font-bold mt-0.5">
                      العائد المتوقع: {latestReport.asymmetricMultiplier}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* شبكة العرض: الرسم البياني + دفتر الأوامر */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* الرسم البياني للشموع والمؤشرات (7 أعمدة) */}
              <div className="lg:col-span-7">
                <ChartViewer
                  candles={candles}
                  bb={currentSignal.bollingerBands}
                  rsi={currentSignal.rsi || 50}
                  overboughtThreshold={85}
                  oversoldThreshold={15}
                  signal={currentSignal.signal}
                  zScore={currentSignal.zScore}
                  mean={currentSignal.mean}
                  stdDev={currentSignal.stdDev}
                />
              </div>

              {/* دفتر أوامر Limitless CLOB (5 أعمدة) */}
              <div className="lg:col-span-5">
                <OrderbookViewer
                  orderbook={orderbook}
                  targetedToken={selectedTokenType}
                  maxEntryPrice={config.maxEntryPrice}
                  onSelectToken={setSelectedTokenType}
                />
              </div>
            </div>

            {/* فاحص التوقيع المشفر EIP-712 وسجل العمليات */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7">
                <Eip712Inspector
                  payload={latestReport?.orderPayload || null}
                  signature={latestReport?.signature}
                  executionResult={latestReport?.executionResult}
                />
              </div>

              {/* سجل العمليات الحية */}
              <div className="lg:col-span-5 bg-slate-900/80 rounded-2xl border border-slate-800/80 p-4 shadow-2xl backdrop-blur-md flex flex-col">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-cyan-400" />
                    <h3 className="font-bold text-white text-sm">سجل التنفيذ والعمليات الفورية</h3>
                  </div>
                  <span className="text-xs font-mono text-slate-500">
                    {executionLogs.length} حدث
                  </span>
                </div>

                <div className="mt-3 space-y-2 max-h-72 overflow-y-auto pl-1">
                  {executionLogs.length === 0 ? (
                    <div className="text-center py-10 text-slate-500 text-xs">
                      في انتظار إشارات التداول... استخدم أزرار المحاكاة أعلاه لاختبار استجابة البوت.
                    </div>
                  ) : (
                    executionLogs.map((log, index) => (
                      <div
                        key={index}
                        className={`p-3 rounded-xl border text-xs transition-all ${
                          log.status === 'EXECUTED'
                            ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                            : log.status === 'PRICE_EXCEEDS_MAX'
                            ? 'bg-amber-950/30 border-amber-500/40 text-amber-200'
                            : 'bg-slate-950/40 border-slate-800 text-slate-400'
                        }`}
                      >
                        <div className="flex items-center justify-between font-bold mb-1">
                          <span className="flex items-center gap-1.5">
                            {log.status === 'EXECUTED' ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                            )}
                            <span>
                              {log.status === 'EXECUTED'
                                ? 'تم تنفيذ الأمر فورياً'
                                : log.status === 'PRICE_EXCEEDS_MAX'
                                ? 'إلغاء: السعر تجاوز 0.20$'
                                : log.status}
                            </span>
                            {log.targetedToken && (
                              <span className="px-1.5 py-0.2 rounded bg-slate-800 text-white text-[10px] font-mono">
                                عقد {log.targetedToken}
                              </span>
                            )}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {new Date(log.timestamp).toLocaleTimeString('ar-EG')}
                          </span>
                        </div>

                        <p className="text-[11px] text-slate-300 leading-normal">
                          {log.messageArabic}
                        </p>

                        {log.executed && (
                          <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-cyan-300 font-mono">
                            <span>التكلفة: ${log.totalCostUsdc} USDC</span>
                            <span>أقصى ربح: ${log.potentialPayoutUsdc} USDC ({log.asymmetricMultiplier})</span>
                            <span className="text-emerald-400 font-sans">تنفيذ FAK</span>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* تبويب المحفظة والمراكز PortfolioFetcher */}
        {activeTab === 'portfolio' && (
          <PortfolioViewer
            sdk={sdk}
            connectedWallet={connectedWallet}
          />
        )}

        {/* التبويب 3: كود وإعدادات البوت الأساسية فقط */}
        {activeTab === 'setup' && (
          <MinimalBotSetup
            config={config}
            onUpdateConfig={setConfig}
          />
        )}
      </main>

      {/* الشريط السفلي (Footer) */}
      <footer className="border-t border-slate-800/80 bg-slate-950/80 py-4 px-6 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-cyan-400" />
          <span>تكامل رسمي مع حزمة Limitless Exchange SDK &bull; توقيع مشفر EIP-712 &bull; نظام تداول غير احتجازي</span>
        </div>
        <div className="flex items-center gap-4 text-slate-400">
          <span>الاستراتيجية: الارتداد المتوسط اللامتماثل</span>
          <span>أقصى مخاطرة: &le; 0.20$ لكل عقد</span>
        </div>
      </footer>
    </div>
  );
}
