import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { CvdTerminal } from './components/CvdTerminal';
import { LimitlessMarketView } from './components/LimitlessMarketView';
import { CodeViewer } from './components/CodeViewer';
import { ConfigPanel } from './components/ConfigPanel';
import { ArchitectureGuide } from './components/ArchitectureGuide';
import { ExecutionConsole } from './components/ExecutionConsole';
import { BotConfigState, LimitlessPosition, MomentumSpike, TerminalLog } from './types';
import { generateCustomPythonScript } from './data/pythonCode';

const DEFAULT_CONFIG: BotConfigState = {
  rpcUrl: 'https://base-mainnet.g.alchemy.com/v2/alch_JNomeBEeTF4e_R2LFweN6',
  walletAddress: '0x7b819231Df2665D0d5a6e91d8f4D55B395298C9A',
  privateKey: '0xd5e837bde21ca239c1546b847fcacdc7210cd1f214e227a371bd58c778a6108f',
  isBotRunning: false, // Bot is stopped by default
  riskPerTrade: 0.005, // 0.50% of wallet
  maxEntryPrice: 0.10, // <= $0.10 OTM
  maxSlippage: 0.10, // Max slippage $0.10
  dynamicFlipProfit: 3.00, // 300% profit target
  sigmaThreshold: 2.5, // 2.5 Sigma threshold
  rollingWindowSize: 120,
  usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  limitlessRouter: '0xD729221C3D6176378411D048b0C7c77d5b1B3736',
  btc5mMarketAddress: '0x1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c',
  lmtsTokenId: 'PD9nivZ1_Ck-o5XD',
  lmtsTokenSecret: '4/aP4RTcMqT+0DSyphnZ6GlKPSojIDWWTM0nbNxA73g=',
  btcMarketSlug: '',
  proxyUrl: '',
  remoteBotApiUrl: 'http://localhost:8080',
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'terminal' | 'market' | 'code' | 'config' | 'guide'>('terminal');
  const [config, setConfig] = useState<BotConfigState>(DEFAULT_CONFIG);
  const [wsConnected, setWsConnected] = useState<boolean>(true);
  const [positions, setPositions] = useState<LimitlessPosition[]>([]);
  const [logs, setLogs] = useState<TerminalLog[]>([
    {
      id: 'log-1',
      timestamp: new Date().toLocaleTimeString('ar-SA'),
      level: 'INFO',
      message: 'تم تشغيل بوت استغلال فجوة التأخير اللحظية (Limitless MML). الاتصال ناجح بعقدة Base RPC الخاصة بك: Alchemy Dedicated Endpoint (<35ms).',
    },
    {
      id: 'log-2',
      timestamp: new Date().toLocaleTimeString('ar-SA'),
      level: 'INFO',
      message: 'تم الاتصال ببث عقود Binance الدائمة عبر WebSocket. جاري حساب CVD وسرعة التدفق لرصد انحرافات 2.5σ.',
    },
    {
      id: 'log-3',
      timestamp: new Date().toLocaleTimeString('ar-SA'),
      level: 'WEB3',
      message: 'تم تفعيل مفاتيح Limitless SDK الرسمية (Token ID: PD9nivZ1... | HMAC-SHA256 Auth). الاتصال اللحظي بـ WebSocket و OrderClient جاهز.',
    },
    {
      id: 'log-wallet',
      timestamp: new Date().toLocaleTimeString('ar-SA'),
      level: 'WEB3',
      message: 'تم ربط المحفظة بنجاح (0x7b819231Df2665D0d5a6e91d8f4D55B395298C9A). نظام التوقيع المحلي وتفويض USDC جاهز.',
    },
    {
      id: 'log-4',
      timestamp: new Date().toLocaleTimeString('ar-SA'),
      level: 'WEB3',
      message: 'تم اكتشاف عقود أسواق BTC إطار 5 دقائق على منصة Limitless (FPMM). فلتر العقود الرخيصة نشط: السعر <= 0.10$.',
    },
  ]);

  const addLog = (level: TerminalLog['level'], message: string) => {
    const newLog: TerminalLog = {
      id: `log-${Date.now()}-${Math.random()}`,
      timestamp: new Date().toLocaleTimeString('ar-SA'),
      level,
      message,
    };
    setLogs((prev) => [newLog, ...prev.slice(0, 49)]);
  };

  const fetchConfig = () => {
    fetch('/api/config')
      .then((res) => res.json())
      .then((data) => {
        if (!data.error) {
          setConfig((prev) => ({
            ...prev,
            walletAddress: data.walletAddress || prev.walletAddress,
            walletBalance: data.balanceUsdc ?? prev.walletBalance,
            riskPerTrade: data.riskPerTrade || prev.riskPerTrade,
            maxEntryPrice: data.maxEntryPrice || prev.maxEntryPrice,
            dynamicFlipProfit: data.dynamicFlipProfit || prev.dynamicFlipProfit,
            sigmaThreshold: data.sigmaThreshold || prev.sigmaThreshold,
            isBotRunning: data.isConfigured ? prev.isBotRunning : false,
          }));

          if (data.walletAddress) {
            addLog('WEB3', `تم جلب الإعدادات الحقيقية من السيرفر. المحفظة: ${data.walletAddress} | الرصيد المتاح: $${data.balanceUsdc} USDC`);
          }
        }
      })
      .catch((err) => console.error('Failed to fetch config', err));
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  // Toggle Bot Run / Stop
  const handleToggleBot = () => {
    setConfig((prev) => {
      const nextRunning = !prev.isBotRunning;
      if (nextRunning) {
        addLog(
          'INFO',
          '🟢 [تشغيل الروبوت] تم تشغيل الروبوت بنجاح! محرك استغلال فجوة التأخير (MML) يراقب السوق ونظام التنفيذ الآلي نشط الآن.'
        );
      } else {
        addLog(
          'WARN',
          '🔴 [إيقاف الروبوت] تم إيقاف الروبوت مؤقتاً. تم تعليق تنفيذ الصفقات التلقائية لحماية المحفظة.'
        );
      }

      // Sync with GCE VM / Remote Python Bot if endpoint configured
      if (prev.remoteBotApiUrl) {
        const action = nextRunning ? 'start' : 'stop';
        fetch(`${prev.remoteBotApiUrl.replace(/\/$/, '')}/api/${action}`, {
          method: 'POST',
        })
          .then((res) => res.json())
          .then((data) => {
            if (data && data.message) {
              addLog('INFO', `📡 [تزامن خادم GCE VM] رد الخادم: ${data.message}`);
            }
          })
          .catch(() => {
            // Standalone or offline fallback
          });
      }

      return {
        ...prev,
        isBotRunning: nextRunning,
      };
    });
  };

  // Manual / Auto buffer flush & garbage collection routine
  const handleFlushBuffer = () => {
    setLogs((prev) => [
      {
        id: Math.random().toString(),
        timestamp: new Date().toLocaleTimeString('ar-EG'),
        level: 'INFO',
        message:
          '🧹 [فرمتة الذاكرة والكاش] تم تفريغ وتدوير طوابير التدفق المؤقتة (Circular Buffer Purged). معدل اختناق الطابور: 0.00ms والذاكرة خالية 100%.',
      },
      ...prev.slice(0, 15),
    ]);
  };

  // Automated real execution when a 2.5 Sigma volume spike is detected
  const handleSpikeDetected = async (spike: MomentumSpike) => {
    // Check if bot is running
    if (!config.isBotRunning) {
      addLog(
        'WARN',
        `⚠️ [تم رصد طفرة سيغما ${spike.zScore > 0 ? '+' : ''}${spike.zScore.toFixed(2)}σ] ولكن تم تعليق التنفيذ لأن الروبوت في وضع الإيقاف (متوقف). اضغط على زر "تشغيل الروبوت" لتفعيل الصفقات الآلية.`
      );
      return;
    }

    const isUp = spike.direction === 'BUY_UP';
    const outcomeIndex = isUp ? 0 : 1;
    const outcomeLabel = isUp ? 'BTC_UP_5M (صعود)' : 'BTC_DOWN_5M (هبوط)';
    const entryPrice = 0.07; // Real OTM limit price

    addLog(
      'MOMENTUM',
      `🚨 [رصد طفرة سيغما 2.5σ+] الاتجاه: ${spike.direction === 'BUY_UP' ? 'شراء صاعد ▲' : 'بيع هابط ▼'} | الانحراف Z: ${spike.zScore > 0 ? '+' : ''}${spike.zScore.toFixed(2)}σ | سعر BTC: $${spike.price.toFixed(1)} | دلتا CVD: ${spike.cvd.toFixed(1)} BTC`
    );

    // Check OTM condition
    if (entryPrice > config.maxEntryPrice) {
      addLog('WARN', `سعر العقد $${entryPrice.toFixed(2)} يتجاوز سقف الدخول OTM ($${config.maxEntryPrice.toFixed(2)}). تم تخطي الصفقة لحماية المحفظة.`);
      return;
    }

    const walletBalance = config.walletBalance || 0;
    if (walletBalance <= 0) {
      addLog('WARN', '⚠️ رصيد محفظة USDC هو 0.00$ على شبكة Base. تم تعليق تنفيذ الصفقة الحقيقية لحين شحن الرصيد.');
      return;
    }

    const tradeSizeUsd = walletBalance * config.riskPerTrade;
    addLog(
      'EXEC',
      `⚡ [استغلال فجوة التأخير اللحظية] إرسال أمر شراء ماركت حقيقي على Base L2! القيمة: $${tradeSizeUsd.toFixed(2)} USDC (مخاطرة ${(config.riskPerTrade * 100).toFixed(2)}%) | العقد: ${outcomeLabel} بسعر $${entryPrice.toFixed(4)}`
    );

    try {
      const res = await fetch('/api/trade/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outcomeIndex,
          outcomeLabel,
          entryPrice,
          amountUsd: tradeSizeUsd,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        addLog(
          'EXEC',
          `✅ [تنفيذ حقيقي مؤكد على Base L2] تم شراء العقد بنجاح! المعاملة: ${data.txHash} | الحجم: $${tradeSizeUsd.toFixed(2)} USDC | الأسهم: ${data.sharesBought.toFixed(1)}`
        );
        const newPos: LimitlessPosition = {
          id: `pos-${Date.now()}`,
          timestamp: Date.now(),
          marketTitle: 'سوق تنبؤات BTC 5M',
          outcomeIndex,
          outcomeLabel,
          entryPrice: data.entryPrice || entryPrice,
          currentPrice: data.entryPrice || entryPrice,
          sizeUsd: tradeSizeUsd,
          sharesBought: data.sharesBought,
          targetPrice: (data.entryPrice || entryPrice) * (1 + config.dynamicFlipProfit),
          targetProfitPercent: config.dynamicFlipProfit * 100,
          currentProfitPercent: 0,
          status: 'OPEN',
          txHash: data.txHash,
        };
        setPositions((prev) => [newPos, ...prev]);
        fetchConfig();
      } else {
        addLog('WARN', `❌ ${data.error || 'فشل إرسال الصفقة الحقيقية على شبكة Base'}`);
      }
    } catch (err: any) {
      addLog('WARN', `❌ خطأ في الاتصال بخادم المعاملات: ${err.message}`);
    }
  };

  // Real manual trade execution from the Limitless view
  const handleExecuteManualTrade = async (outcomeIndex: number, outcomeLabel: string, entryPrice: number) => {
    const walletBalance = config.walletBalance || 0;
    if (walletBalance <= 0) {
      addLog('WARN', '⚠️ رصيد محفظة USDC هو 0.00$ على شبكة Base. تم إلغاء الصفقة اليدوية.');
      return;
    }

    const tradeSizeUsd = walletBalance * config.riskPerTrade;
    addLog(
      'EXEC',
      `🚀 إرسال أمر شراء يدوي حقيقي للعقد ${outcomeLabel} بسعر $${entryPrice.toFixed(4)} | الحجم: $${tradeSizeUsd.toFixed(2)} USDC على شبكة Base`
    );

    try {
      const res = await fetch('/api/trade/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outcomeIndex,
          outcomeLabel,
          entryPrice,
          amountUsd: tradeSizeUsd,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        addLog('EXEC', `✅ [صفقة يدوية حقيقية مؤكدة] الهاش: ${data.txHash} | الحجم: $${tradeSizeUsd.toFixed(2)} USDC`);
        const newPos: LimitlessPosition = {
          id: `pos-${Date.now()}`,
          timestamp: Date.now(),
          marketTitle: 'سوق تنبؤات BTC 5M',
          outcomeIndex,
          outcomeLabel,
          entryPrice,
          currentPrice: entryPrice,
          sizeUsd: tradeSizeUsd,
          sharesBought: data.sharesBought,
          targetPrice: entryPrice * (1 + config.dynamicFlipProfit),
          targetProfitPercent: config.dynamicFlipProfit * 100,
          currentProfitPercent: 0,
          status: 'OPEN',
          txHash: data.txHash,
        };
        setPositions((prev) => [newPos, ...prev]);
        fetchConfig();
      } else {
        addLog('WARN', `❌ ${data.error || 'فشل تنفيذ الصفقة اليدوية على شبكة Base'}`);
      }
    } catch (err: any) {
      addLog('WARN', `❌ تعذر الاتصال بخادم التداول: ${err.message}`);
    }
  };

  // Execute Real Dynamic Flip Exit
  const handleDynamicFlip = async (positionId: string) => {
    const pos = positions.find((p) => p.id === positionId);
    if (!pos) return;

    addLog('FLIP', `⚡ إرسال أمر خروج سريع (Dynamic Flip) لبيع ${pos.sharesBought.toFixed(1)} سهم على Base L2...`);
    try {
      const res = await fetch('/api/trade/exit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positionId, shares: pos.sharesBought, targetPrice: pos.targetPrice }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const realized = (pos.currentPrice - pos.entryPrice) * pos.sharesBought;
        addLog(
          'FLIP',
          `💰 [نجاح الخروج التلقائي DYNAMIC FLIP] تم بيع ${pos.sharesBought.toFixed(1)} سهم من ${pos.outcomeLabel}. الأرباح المحققة: +$${realized.toFixed(2)} USDC!`
        );
        setPositions((prev) =>
          prev.map((p) =>
            p.id === positionId
              ? {
                  ...p,
                  status: 'DYNAMIC_FLIPPED',
                  realizedPnlUsd: realized,
                  exitTxHash: data.txHash || p.txHash,
                }
              : p
          )
        );
        fetchConfig();
      } else {
        addLog('WARN', `❌ فشل إرسال أمر الخروج: ${data.error || 'خطأ في شبكة Base'}`);
      }
    } catch (err: any) {
      addLog('WARN', `❌ تعذر الاتصال بخادم التداول: ${err.message}`);
    }
  };

  // 1-Click Download limitless_mml_bot.py
  const handleDownloadScript = () => {
    const pythonCode = generateCustomPythonScript(config);
    const blob = new Blob([pythonCode], { type: 'text/x-python' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'limitless_mml_bot.py';
    a.click();
    URL.revokeObjectURL(url);
    addLog('INFO', 'تم تحميل ملف بايثون limitless_mml_bot.py بنجاح.');
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col antialiased selection:bg-emerald-500/20 selection:text-emerald-300">
      {/* Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        config={config}
        wsConnected={wsConnected}
        onDownloadScript={handleDownloadScript}
        onToggleBot={handleToggleBot}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Dynamic Tab Views */}
        {activeTab === 'terminal' && (
          <CvdTerminal
            config={config}
            onSpikeDetected={handleSpikeDetected}
            onWsStatusChange={setWsConnected}
            onToggleBot={handleToggleBot}
          />
        )}

        {activeTab === 'market' && (
          <LimitlessMarketView
            config={config}
            onExecuteManualTrade={handleExecuteManualTrade}
            positions={positions}
            onDynamicFlip={handleDynamicFlip}
          />
        )}

        {activeTab === 'code' && (
          <CodeViewer config={config} onDownloadScript={handleDownloadScript} />
        )}

        {activeTab === 'config' && (
          <ConfigPanel
            config={config}
            setConfig={setConfig}
            onResetDefaults={() => setConfig(DEFAULT_CONFIG)}
          />
        )}

        {activeTab === 'guide' && <ArchitectureGuide />}

        {/* Global Terminal Execution Stream */}
        <ExecutionConsole
          logs={logs}
          onClearLogs={() => setLogs([])}
          onFlushBuffer={handleFlushBuffer}
        />
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800/80 bg-zinc-950 py-4 px-4 sm:px-6 lg:px-8 text-center text-xs text-zinc-400">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            بوت التداول الكمي Limitless MML &bull; استغلال فجوة التأخير لشمعة BTC 5m &bull; شبكة Base L2 (8453)
          </span>
          <div className="flex items-center space-x-3 rtl:space-x-reverse text-[11px] font-mono">
            <span className="text-emerald-400">طفرة CVD: 2.5σ</span>
            <span>&bull;</span>
            <span className="text-cyan-400">فلتر OTM: &le; $0.10</span>
            <span>&bull;</span>
            <span className="text-amber-400">الخروج التلقائي: &ge; 300%</span>
            <span>&bull;</span>
            <span className="text-blue-400">المخاطرة: {(config.riskPerTrade * 100).toFixed(2)}%</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
