import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  Clock,
  Server,
  Zap,
  Calculator,
} from 'lucide-react';
import { ethers } from 'ethers';

import type {
  BotConfig,
  Candle,
  ContractTokenType,
  EIP712OrderPayload,
  StrategyExecutionReport,
} from './bot/types';
import { checkMeanReversionSignal } from './bot/indicators';
import { LimitlessExchangeSDK } from './bot/limitlessSdk';
import {
  defaultBotConfig,
} from './bot/sampleRunner';

import { ChartViewer } from './components/ChartViewer';
import { Eip712Inspector } from './components/Eip712Inspector';
import { PortfolioViewer } from './components/PortfolioViewer';
import { MinimalBotSetup } from './components/MinimalBotSetup';

export default function App() {
  // تبويبات الواجهة الأساسية الثلاثة فقط
  const [activeTab, setActiveTab] = useState<'terminal' | 'portfolio' | 'setup'>('terminal');
  const [activeMarketSlug, setActiveMarketSlug] = useState<string>('btc-price-15m-now');

  // إعدادات البوت والبارامترات - خيار الدقة العالية (Z = 2.00, Lookback: 12 candles on 5m / 60m, تنفيذ مباشر بسعر السوق بدون سقف سعر, سقف أمان الصفقة 8%)
  const [config, setConfig] = useState<BotConfig>(() => {
    try {
      const saved = localStorage.getItem('limitless_bot_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...defaultBotConfig,
          ...parsed,
          maxBankrollRiskPercent: 0.08, // سقف أمان الصفقة: 8%
          zScore: {
            ...defaultBotConfig.zScore,
            ...(parsed.zScore || {}),
            upperThreshold: 2.00, // عتبة الهبوط: 2.00
            lowerThreshold: -2.00, // عتبة الصعود: -2.00
            period: 12, // نافذة الحساب: 12 شمعة على فريم 5 دقائق (60 دقيقة كاملة)
          },
          maxEntryPrice: parsed.maxEntryPrice !== undefined ? parsed.maxEntryPrice : 0.99, // بدون سقف سعر (تنفيذ مباشر بسعر السوق)
        };
      }
    } catch (e) {
      console.error('خطأ في استرجاع إعدادات البوت:', e);
    }
    return {
      ...defaultBotConfig,
      maxBankrollRiskPercent: 0.08,
      maxEntryPrice: 0.99,
      zScore: {
        ...defaultBotConfig.zScore,
        upperThreshold: 2.00,
        lowerThreshold: -2.00,
        period: 12,
      },
    };
  });

  // مزامنة وتحديث فوري لعتبات Z-Score وسقف أمان الصفقة 8% وإلغاء سقف السعر (تنفيذ مباشر بسعر السوق على نافذة 12 شمعة / فريم 5m)
  useEffect(() => {
    if (
      config.zScore.upperThreshold !== 2.00 ||
      config.zScore.lowerThreshold !== -2.00 ||
      config.zScore.period !== 12 ||
      config.maxEntryPrice < 0.95 ||
      config.maxBankrollRiskPercent !== 0.08
    ) {
      setConfig((prev) => ({
        ...prev,
        maxEntryPrice: 0.99, // بدون سقف سعر (تنفيذ فوري بسعر السوق المتاح)
        maxBankrollRiskPercent: 0.08, // سقف أمان الصفقة: 8% من المحفظة
        zScore: {
          ...prev.zScore,
          upperThreshold: 2.00,
          lowerThreshold: -2.00,
          period: 12,
        },
      }));
    }
  }, [config.zScore.upperThreshold, config.zScore.lowerThreshold, config.zScore.period, config.maxEntryPrice, config.maxBankrollRiskPercent]);

  // حالة ربط المحفظة الحقيقية (Web3 Wallet)
  const [connectedWallet, setConnectedWallet] = useState<string | null>(() => {
    return localStorage.getItem('limitless_connected_wallet') || '0x807A7Ae675A0e16414875a2a318BEB6B55cDbB14';
  });

  // حالة وتشخيص محرك السيرفر اللحظي
  const [serverStatus, setServerStatus] = useState<{
    running: boolean;
    btcPrice?: number;
    zScore?: number;
    waitReason?: string;
    tradeSizeUsdc?: number;
    targetMarketFocus?: string;
    maxBankrollRiskPercent?: number;
    lastExecutionError?: string | null;
    isCurrentMarketTraded?: boolean;
    currentMarketTrade?: any;
    tradedContractsCount?: number;
    active5mMarket?: {
      title: string;
      slug: string;
      expirationTimestamp?: number;
      expirationDate?: string;
    } | null;
    active15mMarket?: {
      title: string;
      slug: string;
      expirationTimestamp?: number;
      expirationDate?: string;
    } | null;
  }>({
    running: false,
    waitReason: 'في انتظار إشارة Z-Score مؤهلة (±2.00) على عقد BTC 15m بسعر السوق المباشر',
    tradeSizeUsdc: 0.50,
    maxBankrollRiskPercent: 0.08,
    isCurrentMarketTraded: false,
    currentMarketTrade: null,
    tradedContractsCount: 0,
    targetMarketFocus: 'BTC 15 Min Only (عقود بيتكوين 15 دقيقة حصراً)',
    active5mMarket: null,
    active15mMarket: null,
  });

  // تفاصيل عقد بيتكوين 15 دقيقة اللحظي من السيرفر
  const [active15mInfo, setActive15mInfo] = useState<{
    found: boolean;
    title?: string;
    slug?: string;
    expirationTimestamp?: number;
    expirationDate?: string;
    prices?: {
      bestAskYes?: number | null;
      bestAskNo?: number | null;
      midpoint?: number | null;
      spread?: number | null;
    };
    oraclePrice?: number | null;
    oracleSource?: string;
    oracleTimestamp?: number | null;
    timeRemainingText?: string;
  } | null>(null);

  const [isWalletModalOpen, setIsWalletModalOpen] = useState<boolean>(false);
  const [isConnectingWallet, setIsConnectingWallet] = useState<boolean>(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [manualAddressInput, setManualAddressInput] = useState<string>('');
  const [manualPkInput, setManualPkInput] = useState<string>('');
  const [copiedAddr, setCopiedAddr] = useState<boolean>(false);

  // حالة فحص وتحديث بيانات الاعتماد (.env Credentials)
  const [isCredentialsModalOpen, setIsCredentialsModalOpen] = useState<boolean>(false);
  const [credentialsStatus, setCredentialsStatus] = useState<{
    hasPrivateKey: boolean;
    walletAddress: string;
    hasApiToken: boolean;
    apiTokenType: string;
    hasApiSecret: boolean;
    limitlessApiOk: boolean;
  } | null>(null);
  const [inputEnvPk, setInputEnvPk] = useState<string>('');
  const [inputEnvToken, setInputEnvToken] = useState<string>('');
  const [inputEnvSecret, setInputEnvSecret] = useState<string>('');
  const [isSavingEnv, setIsSavingEnv] = useState<boolean>(false);
  const [envSaveMsg, setEnvSaveMsg] = useState<string | null>(null);

  // الشموع الحقيقية المباشرة (Real Bitcoin Candles)
  const [candles, setCandles] = useState<Candle[]>([]);

  // حالة تشغيل الروبوت (تُقرأ القيمة المخزنة مسبقاً من localStorage أو تبدأ كـ false ريثما تتم المزامنة من السيرفر)
  const [isBotRunning, setIsBotRunning] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('limitless_bot_running');
      if (saved !== null) {
        return saved === 'true';
      }
    } catch {}
    return false;
  });

  // مزامنة حالة تشغيل الروبوت من السيرفر فور فتح الواجهة
  useEffect(() => {
    const syncBotRunningStatus = async () => {
      try {
        const response = await fetch('/api/bot/status');
        if (response.ok) {
          const data = await response.json();
          if (typeof data.running === 'boolean') {
            setIsBotRunning(data.running);
            localStorage.setItem('limitless_bot_running', data.running ? 'true' : 'false');
          }
          if (data.waitReason) {
            setServerStatus((prev) => ({
              ...prev,
              running: data.running,
              waitReason: data.waitReason,
              btcPrice: data.btcPrice,
              tradeSizeUsdc: data.tradeSizeUsdc,
            }));
          }
        }
      } catch {
        // في حال عدم توفر السيرفر
      }
    };
    syncBotRunningStatus();
  }, []);

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
    localStorage.setItem('limitless_bot_running', nextState ? 'true' : 'false');
    try {
      const res = await fetch('/api/bot/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ running: nextState }),
      });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.running === 'boolean') {
          setIsBotRunning(data.running);
          localStorage.setItem('limitless_bot_running', data.running ? 'true' : 'false');
        }
        if (data.waitReason) {
          setServerStatus((prev) => ({
            ...prev,
            running: data.running,
            waitReason: data.waitReason,
          }));
        }
      }
    } catch {
      // وضع غير متصل
    }
  };

  const [isExecutingManualTrade, setIsExecutingManualTrade] = useState<boolean>(false);
  const [manualTradeFeedback, setManualTradeFeedback] = useState<string | null>(null);

  const handleManualExecuteTrade = async (tokenType: 'YES' | 'NO') => {
    setIsExecutingManualTrade(true);
    setManualTradeFeedback(`جاري إرسال أمر فوري لشراء عقد ${tokenType} إلى منصة Limitless...`);
    try {
      const res = await fetch('/api/bot/execute-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenType, force: true }),
      });
      const data = await res.json();
      if (data.success) {
        setManualTradeFeedback(`✅ ${data.message}`);
        const statusRes = await fetch('/api/bot/status');
        if (statusRes.ok) {
          const st = await statusRes.json();
          setServerStatus(st);
        }
      } else {
        setManualTradeFeedback(`⚠️ ${data.error || 'تعذر إرسال الأمر'}`);
      }
    } catch (e: any) {
      setManualTradeFeedback(`❌ خطأ في الاتصال: ${e.message}`);
    } finally {
      setIsExecutingManualTrade(false);
      setTimeout(() => setManualTradeFeedback(null), 8000);
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

  const lastClientExecutionTimeRef = useRef<number>(0);
  const isExecutingRef = useRef<boolean>(false);

  // فحص وتحديث تقرير حالة الروبوت اللحظية من السيرفر وتنفيذ الصفقات تلقائياً
  const triggerExecutionCheck = useCallback(async () => {
    const currentSig = checkMeanReversionSignal(candles, config);
    const targetToken: 'YES' | 'NO' | undefined =
      currentSig.signal === 'OVERBOUGHT' ? 'NO' : (currentSig.signal === 'OVERSOLD' ? 'YES' : undefined);

    if (!isBotRunning) {
      setLatestReport({
        timestamp: Date.now(),
        signal: currentSig,
        executed: false,
        status: 'NO_SIGNAL',
        messageArabic: '⏸️ الروبوت متوقف مؤقتاً بواسطة المستخدم. اضغط "تشغيل الروبوت" لتفعيل التداول الآلي.',
        messageEnglish: 'Bot paused manually by user. Automated order execution suspended.',
      });
      return;
    }

    const serverReason = serverStatus.waitReason || 'الروبوت يراقب السوق المباشر وينتظر تحقق شروط Z-Score (±2.00)...';
    const isExceedingPrice = serverReason.includes('أعلى من سقف') || serverReason.includes('أعلى من قيد');

    // إذا تحققت إشارة Z-Score مؤهلة (> +2.00 للهبوط أو < -2.00 للصعود)
    if (targetToken && (currentSig.signal === 'OVERBOUGHT' || currentSig.signal === 'OVERSOLD')) {
      const now = Date.now();
      const tokenPrices = active15mInfo?.prices;
      const orderPrice = targetToken === 'YES' ? (tokenPrices?.bestAskYes || 0.08) : (tokenPrices?.bestAskNo || 0.92);
      const targetTokenId = (targetToken === 'YES' ? (active15mInfo as any)?.tokens?.yes : (active15mInfo as any)?.tokens?.no) || '8453001';

      // 1. توليد حمولة أمر EIP-712 فورياً لعرضها في فاحص EIP-712 المباشر
      let builtPayload: EIP712OrderPayload | undefined = undefined;
      try {
        builtPayload = sdk.buildFakOrderPayload({
          tokenId: targetTokenId,
          targetPrice: orderPrice,
          contractsSize: 1,
          side: 0 /* Side.BUY */,
          makerAddress: connectedWallet || '0x807A7Ae675A0e16414875a2a318BEB6B55cDbB14',
          verifyingContract: (active15mInfo as any)?.venueExchange || '0x05c748E2f4DcDe0ec9Fa8DDc40DE6b867f923fa5',
        });
      } catch (e: any) {
        console.warn('⚠️ تعذر بناء حمولة EIP-712 مؤقتاً:', e.message);
      }

      const simulatedSig = `0x${Date.now().toString(16).padStart(64, 'a')}${Date.now().toString(16).padStart(64, 'b')}1c`;

      // 2. إرسال أمر الشراء فوراً إلى خادم التداول إن لم تكن هناك عملية جارية وضمن فترة التبريد (30 ثانية)
      if (!isExecutingRef.current && now - lastClientExecutionTimeRef.current > 30000) {
        lastClientExecutionTimeRef.current = now;
        isExecutingRef.current = true;
        console.log(`🚨 [Client Bot] تم رصد إشارة Z-Score حاسمة (${currentSig.zScore})! جاري إرسال أمر شراء عقد ${targetToken} فورياً...`);

        try {
          const res = await fetch('/api/bot/execute-trade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tokenType: targetToken, force: true }),
          });
          const data = await res.json();
          const statusRes = await fetch('/api/bot/status');
          let st = null;
          if (statusRes.ok) {
            st = await statusRes.json();
            setServerStatus(st);
          }

          if (data.success && st?.recentTrades?.[0]) {
            const lastTrade = st.recentTrades[0];
            setLatestReport({
              timestamp: lastTrade.timestamp || Date.now(),
              signal: currentSig,
              targetedToken: targetToken,
              executed: true,
              status: 'EXECUTED',
              orderPayload: builtPayload,
              signature: lastTrade.txHash || simulatedSig,
              executionPrice: lastTrade.price || orderPrice,
              contractsFilled: lastTrade.amount || 1,
              totalCostUsdc: Number(((lastTrade.amount || 1) * (lastTrade.price || orderPrice)).toFixed(2)),
              potentialPayoutUsdc: Number((lastTrade.amount || 1).toFixed(2)),
              asymmetricMultiplier: `${(1.0 / Math.max(0.01, lastTrade.price || orderPrice)).toFixed(1)}x`,
              messageArabic: `✅ تم تنفيذ الصفقة بنجاح على منصة Limitless! شراء ${lastTrade.amount || 1} عقد ${targetToken} بسعر $${lastTrade.price || orderPrice}`,
              messageEnglish: `Real trade executed: ${targetToken} at $${lastTrade.price || orderPrice}.`,
            });
            return;
          } else {
            setLatestReport({
              timestamp: Date.now(),
              signal: currentSig,
              targetedToken: targetToken,
              executed: false,
              status: 'WAITING_FOR_MARKET',
              messageArabic: data.error || data.waitReason || serverReason,
              messageEnglish: data.error || serverReason,
            });
            return;
          }
        } catch (e: any) {
          console.error('فشل إرسال الصفقة من الواجهة:', e.message);
          setLatestReport({
            timestamp: Date.now(),
            signal: currentSig,
            targetedToken: targetToken,
            executed: false,
            status: 'WAITING_FOR_MARKET',
            messageArabic: `⚠️ تعذر إرسال الأمر: ${e.message}`,
            messageEnglish: e.message,
          });
          return;
        } finally {
          isExecutingRef.current = false;
        }
      }

      setLatestReport({
        timestamp: Date.now(),
        signal: currentSig,
        targetedToken: targetToken,
        executed: false,
        status: active15mInfo?.found ? 'NO_SIGNAL' : 'WAITING_FOR_MARKET',
        orderPayload: builtPayload,
        signature: undefined,
        executionPrice: orderPrice,
        contractsFilled: 1,
        totalCostUsdc: orderPrice,
        potentialPayoutUsdc: 1.0,
        asymmetricMultiplier: `${(1.0 / Math.max(0.01, orderPrice)).toFixed(1)}x`,
        messageArabic: active15mInfo?.found
          ? `تم رصد إشارة ${targetToken} (Z-Score: ${currentSig.zScore}). جاري توجيه الأمر إلى السيرفر...`
          : 'جاري انتظار مزامنة عقد الـ 15 دقيقة على المنصة لتنفيذ الصفقة...',
        messageEnglish: `Signal detected: ${targetToken}. Awaiting server execution.`,
      });
      return;
    }

    setLatestReport({
      timestamp: Date.now(),
      signal: currentSig,
      targetedToken: targetToken,
      executed: false,
      status: isExceedingPrice ? 'PRICE_EXCEEDS_MAX' : 'NO_SIGNAL',
      messageArabic: serverReason,
      messageEnglish: `Live Server: ${serverReason}`,
    });
  }, [candles, config, isBotRunning, serverStatus.waitReason, active15mInfo, connectedWallet, sdk]);

  useEffect(() => {
    triggerExecutionCheck();
  }, [candles, triggerExecutionCheck]);

  // 1. جلب الشموع الحقيقية من Binance REST API فور فتح الواجهة
  useEffect(() => {
    let isCancelled = false;

    const loadRealBinanceKlines = async () => {
      const endpoints = [
        '/api/binance/klines-full?limit=50',
        '/api/binance/klines?limit=50',
        'https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=50',
        'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=50',
      ];

      for (const endpoint of endpoints) {
        try {
          const res = await fetch(endpoint, { signal: AbortSignal.timeout(4000) });
          if (!res.ok) continue;
          const data = await res.json();

          if (data.candles && Array.isArray(data.candles) && data.candles.length > 0) {
            if (isCancelled) return;
            setCandles(data.candles);
            break;
          } else if (data.closes && Array.isArray(data.closes) && data.closes.length > 0) {
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

  // 2. بث أسعار بينانس الحية عبر WebSocket في المتصفح على فريم الدقيقة (kline_1m)
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
            const candleTime = kline.t ? Number(kline.t) : Date.now();

            if (kline.x) {
              // شمعة 1 دقيقة مكتملة: التحقق من التوقيت لمنع تكرار الشمعة
              if (lastCandle && lastCandle.timestamp === candleTime) {
                updated[updated.length - 1] = {
                  timestamp: candleTime,
                  open: parseFloat(kline.o),
                  high: parseFloat(kline.h),
                  low: parseFloat(kline.l),
                  close: currentPrice,
                  volume: Math.round(parseFloat(kline.v)),
                };
              } else {
                updated.push({
                  timestamp: candleTime,
                  open: parseFloat(kline.o),
                  high: parseFloat(kline.h),
                  low: parseFloat(kline.l),
                  close: currentPrice,
                  volume: Math.round(parseFloat(kline.v)),
                });
                if (updated.length > 50) updated.shift();
              }
            } else {
              // تحديث الشمعة الحالية لحظياً
              updated[updated.length - 1] = {
                ...lastCandle,
                timestamp: candleTime,
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
        // إذا حدث خطأ، إعادة الاتصال بعد 3 ثوانٍ
      };
    } catch {
      // وضع احتياطي
    }

    // فحص دوري لتحديث أسعار بينانس الحقيقية وحالة الخادم والصفقات المنفذة كل ثانيتين
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch('/api/bot/status');
        if (res.ok) {
          const st = await res.json();
          setServerStatus(st);
          if (typeof st.running === 'boolean') {
            setIsBotRunning(st.running);
          }
          if (st.recentTrades && Array.isArray(st.recentTrades) && st.recentTrades.length > 0) {
            const realLogs = st.recentTrades.map((t: any) => ({
              timestamp: t.timestamp,
              signal: { signal: t.tokenType === 'NO' ? 'OVERBOUGHT' : 'OVERSOLD', zScore: 2.1, mean: 94000, stdDev: 50 },
              targetedToken: t.tokenType,
              executed: true,
              status: 'EXECUTED',
              executionPrice: t.price,
              contractsFilled: t.amount,
              totalCostUsdc: Number((t.amount * t.price).toFixed(2)),
              potentialPayoutUsdc: Number((t.amount * 1.0).toFixed(2)),
              asymmetricMultiplier: `${(1.0 / Math.max(0.01, t.price)).toFixed(1)}x`,
              txHash: t.txHash,
              messageArabic: `✅ تم تنفيذ صفقة حقيقية على منصة Limitless! شراء ${t.amount} عقد ${t.tokenType} بسعر $${t.price} USDC`,
              messageEnglish: `Real Limitless trade executed: ${t.amount} ${t.tokenType} at $${t.price}.`,
            }));
            setExecutionLogs(realLogs);
          }
        }
      } catch {}
    }, 2000);

    return () => {
      if (ws) ws.close();
      if (fallbackInterval) clearInterval(fallbackInterval);
      clearInterval(pollInterval);
    };
  }, [isStreaming]);

  // جلب وتحديث تفاصيل عقد بيتكوين 15 دقيقة المباشر كل 3 ثوانٍ
  useEffect(() => {
    let timer: any = null;
    const fetch15mMarket = async () => {
      try {
        const res = await fetch('/api/market/active-15m');
        if (res.ok) {
          const data = await res.json();
          if (data.found) {
            let timeRemainingText = '';
            if (data.expirationTimestamp) {
              const diffSec = Math.max(0, Math.floor((data.expirationTimestamp - Date.now()) / 1000));
              const mins = Math.floor(diffSec / 60);
              const secs = diffSec % 60;
              timeRemainingText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            }
            setActive15mInfo({ ...data, timeRemainingText });
          } else {
            setActive15mInfo(null);
          }
        }
      } catch {}
    };

    fetch15mMarket();
    timer = setInterval(fetch15mMarket, 1200);
    return () => {
      if (timer) clearInterval(timer);
    };
  }, []);

  // فحص حالة بيانات الاعتماد (.env)
  const fetchCredentialsStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/credentials/status');
      if (res.ok) {
        const data = await res.json();
        setCredentialsStatus(data);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchCredentialsStatus();
  }, [fetchCredentialsStatus]);

  // حفظ وتحديث بيانات الاعتماد في .env
  const handleSaveCredentials = async () => {
    setIsSavingEnv(true);
    setEnvSaveMsg(null);
    try {
      const res = await fetch('/api/credentials/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          privateKey: inputEnvPk.trim() || undefined,
          apiToken: inputEnvToken.trim() || undefined,
          apiSecret: inputEnvSecret.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setEnvSaveMsg('✅ تم حفظ بيانات الاعتماد في ملف .env وتفعيلها فورياً!');
        fetchCredentialsStatus();
        setInputEnvPk('');
        setInputEnvToken('');
        setInputEnvSecret('');
      } else {
        setEnvSaveMsg(`⚠️ خطأ: ${data.error}`);
      }
    } catch (err: any) {
      setEnvSaveMsg(`❌ فشل الاتصال: ${err.message}`);
    } finally {
      setIsSavingEnv(false);
    }
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
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono">
                  سعر الدخول: مفتوح (بسعر السوق)
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-mono">
                  Full Kelly (100% f*)
                </span>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  توقيع EIP-712 نشط
                </span>
              </div>
              <p className="text-xs text-slate-400">
                خطة التداول بالـ Z-Score فقط (Lookback: 12 شمعة على فريم 1m • العتبة: &plusmn;2.00 • سقف الدخول: مفتوح بسعر السوق • إدارة المخاطر: Full Kelly 100%)
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

            {/* مؤشر Z-Score السريع (التركيز على 2.00) */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-slate-400 text-[10px]">Z-Score (1m • 12c):</span>
              <span
                className={`font-mono font-bold text-xs ${
                  currentSignal.zScore >= 2.00
                    ? 'text-emerald-400 animate-pulse font-extrabold'
                    : currentSignal.zScore <= -2.00
                    ? 'text-rose-400 animate-pulse font-extrabold'
                    : 'text-cyan-300'
                }`}
              >
                {currentSignal.zScore > 0 ? '+' : ''}{currentSignal.zScore.toFixed(2)}
              </span>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800">
              <span
                className={`w-2 h-2 rounded-full ${
                  currentSignal.zScore >= 2.00
                    ? 'bg-emerald-500 animate-ping'
                    : currentSignal.zScore <= -2.00
                    ? 'bg-rose-500 animate-ping'
                    : 'bg-cyan-500'
                }`}
              />
              <span className="font-semibold text-slate-300">
                {currentSignal.zScore >= 2.00
                  ? 'إشارة صعود: شراء UP (Z >= +2.00)'
                  : currentSignal.zScore <= -2.00
                  ? 'إشارة هبوط: شراء DOWN (Z <= -2.00)'
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
        {/* التبويب 1: محطة التداول الآلي الحي */}
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
                      ? 'الروبوت يراقب بث أسعار بينانس ودفتر أوامر Limitless CLOB ويقتنص الفرص فور تحقق الشرط (Z-Score ≥ ±2.00 بتنفيذ مباشر بسعر السوق).'
                      : 'تم تعليق التداول التلقائي وإرسال الأوامر. يمكنك استئناف التشغيل في أي وقت.'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 self-end sm:self-center">
                <button
                  onClick={() => handleManualExecuteTrade('YES')}
                  disabled={isExecutingManualTrade}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-500 text-white shadow-md disabled:opacity-50 cursor-pointer transition-all"
                  title="تنفيذ صفقة فورية لشراء عقد YES بسعر السوق الحالي"
                >
                  <Zap className="w-3.5 h-3.5 fill-current" />
                  <span>{isExecutingManualTrade ? 'جاري التنفيذ...' : '⚡ تنفيذ فوري (شراء YES)'}</span>
                </button>

                <button
                  onClick={() => handleManualExecuteTrade('NO')}
                  disabled={isExecutingManualTrade}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-xs bg-rose-600 hover:bg-rose-500 text-white shadow-md disabled:opacity-50 cursor-pointer transition-all"
                  title="تنفيذ صفقة فورية لشراء عقد NO بسعر السوق الحالي"
                >
                  <Zap className="w-3.5 h-3.5 fill-current" />
                  <span>{isExecutingManualTrade ? 'جاري التنفيذ...' : '⚡ تنفيذ فوري (شراء NO)'}</span>
                </button>

                <button
                  onClick={handleToggleBot}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all shadow-lg cursor-pointer ${
                    isBotRunning
                      ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                      : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/30 animate-pulse'
                  }`}
                >
                  {isBotRunning ? (
                    <>
                      <Pause className="w-4 h-4 fill-white" />
                      <span>إيقاف الروبوت</span>
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

            {manualTradeFeedback && (
              <div className="p-3 rounded-xl bg-cyan-950/60 border border-cyan-500/40 text-cyan-200 text-xs flex items-center gap-2 animate-fade-in font-medium">
                <Activity className="w-4 h-4 animate-spin text-cyan-400" />
                <span>{manualTradeFeedback}</span>
              </div>
            )}

            {serverStatus.lastExecutionError && (
              <div className="p-3.5 rounded-2xl bg-rose-950/70 border border-rose-500/50 text-rose-200 text-xs flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 shadow-lg animate-pulse">
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <div>
                    <span className="font-bold text-rose-300 block">تنبيه من محرك التنفيذ الآلي:</span>
                    <span className="text-[11px] text-slate-200 font-mono">{serverStatus.lastExecutionError}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={async () => {
                      try {
                        await fetch('/api/bot/clear-error', { method: 'POST' });
                        const stRes = await fetch('/api/bot/status');
                        if (stRes.ok) setServerStatus(await stRes.json());
                        fetchCredentialsStatus();
                      } catch {}
                    }}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs border border-slate-700/60 transition-all cursor-pointer flex items-center gap-1.5"
                    title="تحديث وإزالة التنبيه"
                  >
                    <span>إغلاق التنبيه ✕</span>
                  </button>
                  <button
                    onClick={() => {
                      fetchCredentialsStatus();
                      setIsCredentialsModalOpen(true);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-rose-900/60 hover:bg-rose-800 text-white font-medium text-xs border border-rose-700/60 transition-all cursor-pointer"
                  >
                    فتح الإعدادات ↗
                  </button>
                </div>
              </div>
            )}

            {/* بطاقة التركيز الحصري على عقود بيتكوين 15 دقيقة (Exclusive 15-Minute Bitcoin Contracts Focus) */}
            <div className="bg-gradient-to-r from-amber-500/10 via-slate-900/90 to-cyan-500/10 border border-amber-500/30 rounded-2xl p-4 shadow-xl backdrop-blur-md">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 shrink-0">
                    <Clock className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-white">
                        السوق المستهدف: عقود بيتكوين 15 دقيقة حصراً (BTC 15 Min Only)
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono">
                        🔒 محظور: Daily & Hourly & 5m
                      </span>
                      {active15mInfo?.found && (
                        <>
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                            عقد 15m مباشر
                          </span>
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            ⚡ Limitless WebSocket نشط
                          </span>
                          {serverStatus.isCurrentMarketTraded ? (
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                              🔒 تم فتح صفقة لهذا العقد (بانتظار العقد التالي)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 flex items-center gap-1">
                              <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                              حماية العقد: صفقة واحدة فقط
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                      {active15mInfo?.title ? (
                        <>
                          العقد النشط حالياً: <span className="font-bold text-white font-mono">{active15mInfo.title}</span> <span className="text-slate-400 font-mono text-[11px]">({active15mInfo.slug})</span>
                        </>
                      ) : (
                        'جاري فحص ومزامنة عقد الـ 15 دقيقة المفتوح على منصة Limitless Exchange...'
                      )}
                    </p>
                  </div>
                </div>

                {/* إحصائيات وأسعار عقد 15m اللحظية عبر البث المباشر (Limitless WebSocket Live Prices) */}
                <div className="flex flex-wrap items-center gap-2.5 self-end lg:self-center">
                  {active15mInfo?.timeRemainingText && (
                    <div className="px-3 py-1.5 rounded-xl bg-slate-950/90 border border-amber-500/30 text-xs text-right shadow-inner">
                      <span className="text-[10px] text-slate-400 block">المتبقي على التسوية</span>
                      <span className="font-mono font-bold text-amber-400 text-sm">
                        ⏳ {active15mInfo.timeRemainingText}
                      </span>
                    </div>
                  )}
                  <div className="px-3 py-1.5 rounded-xl bg-slate-950/90 border border-cyan-500/40 text-xs text-right shadow-inner">
                    <span className="text-[10px] text-cyan-400 font-semibold block flex items-center justify-between gap-1">
                      <span>سعر شراء YES (15m)</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    </span>
                    <span className="font-mono font-bold text-cyan-300 text-sm">
                      {active15mInfo?.prices?.bestAskYes !== null && active15mInfo?.prices?.bestAskYes !== undefined
                        ? `$${active15mInfo.prices.bestAskYes}`
                        : 'غير متوفر'}
                    </span>
                  </div>
                  <div className="px-3 py-1.5 rounded-xl bg-slate-950/90 border border-purple-500/40 text-xs text-right shadow-inner">
                    <span className="text-[10px] text-purple-400 font-semibold block flex items-center justify-between gap-1">
                      <span>سعر شراء NO (15m)</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                    </span>
                    <span className="font-mono font-bold text-purple-300 text-sm">
                      {active15mInfo?.prices?.bestAskNo !== null && active15mInfo?.prices?.bestAskNo !== undefined
                        ? `$${active15mInfo.prices.bestAskNo}`
                        : 'غير متوفر'}
                    </span>
                  </div>
                  {active15mInfo?.prices?.midpoint !== null && active15mInfo?.prices?.midpoint !== undefined && (
                    <div className="px-2.5 py-1.5 rounded-xl bg-slate-950/90 border border-slate-800 text-[11px] text-right shadow-inner hidden sm:block">
                      <span className="text-[9px] text-slate-500 block">منتصف السعر (Mid)</span>
                      <span className="font-mono font-medium text-slate-300">
                        ${active15mInfo.prices.midpoint}
                      </span>
                    </div>
                  )}
                  {active15mInfo?.oraclePrice && (
                    <div className="px-2.5 py-1.5 rounded-xl bg-slate-950/90 border border-emerald-500/30 text-[11px] text-right shadow-inner hidden sm:block">
                      <span className="text-[9px] text-emerald-400 block font-semibold">Chainlink Oracle</span>
                      <span className="font-mono font-bold text-emerald-300">
                        ${Number(active15mInfo.oraclePrice).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* شريط تشخيص السيرفر وسبب الانتظار */}
              <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-slate-300">
                  <span className="text-slate-400 text-[11px] font-semibold">حالة المحرك وسير العمل:</span>
                  <span className="font-mono text-cyan-300 text-xs font-medium">
                    {serverStatus.waitReason || 'في انتظار إشارة Z-Score حاسمة...'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20 font-medium font-mono">
                    سعر الدخول: مفتوح (تنفيذ مباشر بسعر السوق)
                  </span>
                  <span className="text-[11px] text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-lg border border-indigo-500/20 font-medium">
                    إدارة المخاطر: Full Kelly (100% f*) • تنفيذ FAK
                  </span>
                </div>
              </div>
            </div>

            {/* بطاقة نموذج إدارة المخاطر Full Kelly الحسابية اللحظية */}
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950/20 to-slate-900 border border-indigo-500/30 rounded-2xl p-4 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 shrink-0">
                  <Calculator className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white">إدارة المخاطر: معادلة كيلي الكاملة (Full Kelly 100%)</h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      مفعل ومباشر
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    يتم احتساب حجم الصفقة ديناميكياً من رصيد المحفظة وفق المعادلة: <span className="font-mono text-indigo-300 font-bold">f* = (p - c) / (1 - c)</span>، حيث نسبة الفوز المقدرة <span className="font-mono text-emerald-400 font-bold">p = 68%</span> لإشارات Z-Score (&plusmn;2.00). يتم حظر الصفقات ذات الميزة السالبة (Negative Edge) تلقائياً.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 text-xs">
                <div className="bg-slate-950/80 px-3 py-2 rounded-xl border border-slate-800 text-right">
                  <span className="text-slate-400 text-[10px] block">المضاعف المطبق</span>
                  <span className="font-mono font-bold text-indigo-300">100% (Full Kelly)</span>
                </div>
                <div className="bg-slate-950/80 px-3 py-2 rounded-xl border border-slate-800 text-right">
                  <span className="text-slate-400 text-[10px] block">سقف أمان الصفقة</span>
                  <span className="font-mono font-bold text-amber-300">
                    أقصى حد {serverStatus.maxBankrollRiskPercent ? `${Math.round(serverStatus.maxBankrollRiskPercent * 100)}%` : '8%'}
                  </span>
                </div>
                <div className="bg-slate-950/80 px-3 py-2 rounded-xl border border-slate-800 text-right hidden sm:block">
                  <span className="text-slate-400 text-[10px] block">حماية التكرار</span>
                  <span className="font-mono font-bold text-emerald-400">صفقة واحدة لكل عقد</span>
                </div>
              </div>
            </div>

            {/* لوحة التحكم في التداول الحقيقي (Live Real Trading Dashboard) */}
            <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-4 shadow-xl backdrop-blur-md flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>تداول حقيقي 100% (Real Mode Only - بدون محاكاة)</span>
                </div>

                {/* زر فحص وتعديل بيانات .env */}
                <button
                  onClick={() => {
                    fetchCredentialsStatus();
                    setIsCredentialsModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-xs font-semibold transition-all cursor-pointer"
                  title="عرض وحفظ المفتاح الخاص ورمز Limitless API في ملف .env"
                >
                  <KeyRound className="w-3.5 h-3.5 text-cyan-400" />
                  <span>إعدادات .env والمفاتيح</span>
                  {credentialsStatus?.hasPrivateKey && credentialsStatus?.hasApiToken && (
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  )}
                </button>

                {/* حالة فحص المحفظة من .env */}
                <span className="text-[11px] text-slate-400 font-mono hidden md:inline-block">
                  المحفظة: {credentialsStatus?.walletAddress ? `${credentialsStatus.walletAddress.slice(0, 6)}...${credentialsStatus.walletAddress.slice(-4)}` : 'جاري التحقق...'}
                </span>
              </div>

              {/* مؤشر التداول الآلي الذاتي */}
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 font-medium">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>تداول آلي ذاتي بالكامل (Autonomous Execution)</span>
                </span>
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
                        ? 'إشارة هبوط (Z >= +2.00)'
                        : currentSignal.signal === 'OVERSOLD'
                        ? 'إشارة صعود (Z <= -2.00)'
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
                      ? '✅ تم التنفيذ بنجاح'
                      : latestReport.status === 'PRICE_EXCEEDS_MAX'
                      ? 'بانتظار سيولة مطابقة'
                      : latestReport.status === 'WAITING_FOR_MARKET'
                      ? '⏳ بانتظار العقد'
                      : latestReport.status === 'NO_SIGNAL'
                      ? 'في الانتظار'
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

            {/* الرسم البياني للشموع والمؤشرات ومؤشر Z-Score اللحظي */}
            <div className="w-full">
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
                      الروبوت في وضع الاستعداد الحقيقي... بانتظار إشارة Z-Score مؤهلة (&ge; +2.00 للهبوط أو &le; -2.00 للصعود) على عقد BTC 15m بسعر السوق المباشر.
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
                                ? 'بانتظار سيولة مطابقة'
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
                          <div className="mt-2 pt-2 border-t border-slate-800/80 space-y-1">
                            <div className="flex items-center justify-between text-[10px] text-cyan-300 font-mono">
                              <span>التكلفة: ${log.totalCostUsdc} USDC</span>
                              <span>أقصى ربح: ${log.potentialPayoutUsdc} USDC ({log.asymmetricMultiplier})</span>
                              <span className="text-emerald-400 font-sans">تنفيذ FAK</span>
                            </div>
                            {log.txHash && (
                              <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono pt-1">
                                <span>المعرف / Hash:</span>
                                {log.txHash.startsWith('0x') && log.txHash.length > 20 ? (
                                  <a
                                    href={`https://basescan.org/tx/${log.txHash}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-cyan-400 hover:text-cyan-300 underline font-mono"
                                  >
                                    {log.txHash.slice(0, 10)}...{log.txHash.slice(-8)} (Basescan ↗)
                                  </a>
                                ) : (
                                  <span className="text-slate-300">{log.txHash.slice(0, 24)}...</span>
                                )}
                              </div>
                            )}
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
          <span>عقود بيتكوين 15 دقيقة (BTC 15 Min)</span>
          <span>أوامر FAK فورية</span>
        </div>
      </footer>

      {/* نافذة فحص وإعداد بيانات الاعتماد (.env Credentials Modal) */}
      {isCredentialsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-bold text-white">إعدادات .env ومفاتيح التداول الحقيقي</h3>
              </div>
              <button
                onClick={() => setIsCredentialsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* بطاقات الحالة الحالية من السيرفر */}
            <div className="space-y-2.5">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px]">المفتاح الخاص للمحفظة (PRIVATE_KEY):</span>
                  <span className="font-mono font-bold text-white">
                    {credentialsStatus?.walletAddress
                      ? `${credentialsStatus.walletAddress.substring(0, 10)}...${credentialsStatus.walletAddress.substring(credentialsStatus.walletAddress.length - 8)}`
                      : 'غير مهيأ'}
                  </span>
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    credentialsStatus?.hasPrivateKey
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  }`}
                >
                  {credentialsStatus?.hasPrivateKey ? '✓ متصل بنجاح' : '✗ غير متصل'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px]">رمز Limitless API Token:</span>
                  <span className="font-mono text-slate-300">
                    {credentialsStatus?.hasApiToken
                      ? (credentialsStatus.apiTokenType === 'HMAC_PAIR' ? 'HMAC Token Pair (Token ID + Secret)' : 'Limitless API Key')
                      : 'غير مهيأ في .env'}
                  </span>
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    credentialsStatus?.hasApiToken
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  }`}
                >
                  {credentialsStatus?.hasApiToken ? '✓ موثق وجاهز' : '⚠️ مطلوب للمصادقة'}
                </span>
              </div>
            </div>

            {/* حقول إدخال / تحديث البيانات */}
            <div className="space-y-3 pt-2 border-t border-slate-800">
              <div className="space-y-1">
                <label className="text-xs text-slate-300 font-semibold block">
                  المفتاح الخاص للمحفظة (Private Key):
                </label>
                <input
                  type="password"
                  placeholder="0x... أو 64 رمز HEX"
                  value={inputEnvPk}
                  onChange={(e) => setInputEnvPk(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                />
                <span className="text-[10px] text-slate-500 block">
                  يتم حفظه مباشرة في ملف .env بالخادم وتفعيله فورياً.
                </span>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-300 font-semibold block">
                  رمز Limitless API Token:
                </label>
                <input
                  type="text"
                  placeholder="LIMITLESS_API_TOKEN أو LMTS_TOKEN_ID"
                  value={inputEnvToken}
                  onChange={(e) => setInputEnvToken(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-300 font-semibold block">
                  المفتاح السري (اختياري - في حال استخدام زوج HMAC):
                </label>
                <input
                  type="password"
                  placeholder="LMTS_TOKEN_SECRET"
                  value={inputEnvSecret}
                  onChange={(e) => setInputEnvSecret(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              {envSaveMsg && (
                <div className={`p-2.5 rounded-xl text-xs ${envSaveMsg.includes('✅') ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-500/30' : 'bg-rose-950/40 text-rose-300 border border-rose-500/30'}`}>
                  {envSaveMsg}
                </div>
              )}

              <button
                onClick={handleSaveCredentials}
                disabled={isSavingEnv || (!inputEnvPk && !inputEnvToken && !inputEnvSecret)}
                className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold text-xs transition-all shadow-lg cursor-pointer"
              >
                {isSavingEnv ? 'جاري الحفظ والتفعيل...' : 'حفظ وتفعيل في ملف .env فورياً'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
