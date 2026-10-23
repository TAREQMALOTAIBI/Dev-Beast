import React, { useState } from 'react';
import { BotConfig } from '../types/bot';
import { Copy, Check, Download, FileCode2, Terminal } from 'lucide-react';

interface CodeInspectorProps {
  config: BotConfig;
  lang: 'en' | 'ar';
}

export const CodeInspector: React.FC<CodeInspectorProps> = ({ config, lang }) => {
  const isAr = lang === 'ar';
  const [copied, setCopied] = useState(false);

  const generateSourceCode = () => {
    return `import WebSocket from 'ws';
import axios from 'axios';

// ==========================================
// 1. إعدادات المتغيرات والاستراتيجية (Config)
// ==========================================
const CONFIG = {
    SYMBOL: '${config.symbol}',
    TIMEFRAME: '${config.timeframe}',
    PERIODS: ${config.periods},
    Z_SCORE_UPPER: ${config.zScoreUpper.toFixed(2)},
    Z_SCORE_ENTRY: ${config.zScoreEntry.toFixed(2)},
    MAX_PRICE_CENTS: ${config.maxPriceCents.toFixed(2)}, // أقصى سعر للدخول (${Math.round(config.maxPriceCents * 100)} سنت)
    MAX_RISK_PERCENT: ${config.maxRiskPercent.toFixed(2)}, // الحد الأقصى للمخاطرة ${(config.maxRiskPercent * 100).toFixed(0)}%
    ORDER_TYPE: '${config.orderType}',
    FRACTION_CHUNKS: ${config.fractionChunks}, // عدد الأجزاء لتجزئة العقد
    // عناوين تتجاوز الحظر الجغرافي الأمريكي للبيانات العامة
    BINANCE_REST_URL: '${config.binanceRestUrl}', 
    BINANCE_WS_URL: '${config.binanceWsUrl}',
    LIMITLESS_WS_URL: '${config.limitlessWsUrl}' // مسار تخيلي لمنصة Limitless
};

// ==========================================
// 2. الكلاس الرئيسي للروبوت
// ==========================================
class LimitlessTradingBot {
    private closePrices: number[] = [];
    private crossedUpperThreshold: boolean = false;
    private limitlessWs: WebSocket;
    private currentBalance: number = ${config.initialBalance}; // رصيد افتراضي (يتم تحديثه من المنصة)
    private winProbability: number = ${config.winProbability.toFixed(2)}; // نسبة نجاح الاستراتيجية الافتراضية لحساب كيلي

    constructor() {
        this.limitlessWs = new WebSocket(CONFIG.LIMITLESS_WS_URL);
        this.initLimitlessWS();
    }

    // تهيئة اتصال Limitless WebSocket
    private initLimitlessWS() {
        this.limitlessWs.on('open', () => {
            console.log('✅ Connected to Limitless WebSocket');
            // هنا تضع كود المصادقة (Authentication) الخاص بمنصة Limitless
            this.limitlessWs.send(JSON.stringify({ type: 'AUTH', apiKey: 'YOUR_API_KEY' }));
        });

        this.limitlessWs.on('message', (data: WebSocket.Data) => {
            const response = JSON.parse(data.toString());
            if (response.type === 'BALANCE_UPDATE') {
                this.currentBalance = response.balance;
            }
        });
    }

    // ==========================================
    // 3. جلب الشموع التاريخية (Binance Rest API)
    // ==========================================
    public async fetchHistoricalData() {
        console.log(\`📥 Fetching last \${CONFIG.PERIODS} candles for \${CONFIG.SYMBOL}...\`);
        try {
            const response = await axios.get(CONFIG.BINANCE_REST_URL, {
                params: {
                    symbol: CONFIG.SYMBOL,
                    interval: CONFIG.TIMEFRAME,
                    limit: CONFIG.PERIODS
                }
            });

            this.closePrices = response.data.map((candle: any[]) => parseFloat(candle[4]));
            console.log('📊 Historical data loaded. Current prices:', this.closePrices);
            this.startBinanceWS();
        } catch (error) {
            console.error('❌ Error fetching historical data:', error);
        }
    }

    // ==========================================
    // 4. البث الحي (Binance WebSocket)
    // ==========================================
    private startBinanceWS() {
        const binanceWs = new WebSocket(CONFIG.BINANCE_WS_URL);

        binanceWs.on('message', (data: WebSocket.Data) => {
            const message = JSON.parse(data.toString());
            const kline = message.k;

            // تحديث السعر عند إغلاق الشمعة
            if (kline.x) {
                const closePrice = parseFloat(kline.c);
                this.updatePrices(closePrice);
            }
        });

        binanceWs.on('open', () => console.log('✅ Connected to Binance Live WebSocket'));
    }

    private updatePrices(newPrice: number) {
        this.closePrices.shift(); // إزالة أقدم سعر
        this.closePrices.push(newPrice); // إضافة السعر الجديد
        this.evaluateStrategy();
    }

    // ==========================================
    // 5. الحسابات الرياضية (Z-Score)
    // ==========================================
    private calculateZScore(): number {
        const n = this.closePrices.length;
        const mean = this.closePrices.reduce((a, b) => a + b, 0) / n;
        
        const variance = this.closePrices.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
        const stdDev = Math.sqrt(variance);
        
        const currentPrice = this.closePrices[n - 1];
        const zScore = (currentPrice - mean) / stdDev;
        
        return zScore;
    }

    // ==========================================
    // 6. منطق الاستراتيجية
    // ==========================================
    private evaluateStrategy() {
        if (this.closePrices.length < CONFIG.PERIODS) return;

        const currentZScore = this.calculateZScore();
        console.log(\`📈 Current Z-Score: \${currentZScore.toFixed(2)}\`);

        // الشرط الأول: تجاوز العتبة 2.0
        if (currentZScore > CONFIG.Z_SCORE_UPPER) {
            if (!this.crossedUpperThreshold) {
                console.log(\`⚠️ Z-Score crossed above \${CONFIG.Z_SCORE_UPPER}\`);
                this.crossedUpperThreshold = true;
            }
        }

        // الشرط الثاني: الرجوع تحت 1.90 (إشارة الدخول)
        if (this.crossedUpperThreshold && currentZScore < CONFIG.Z_SCORE_ENTRY) {
            console.log(\`🎯 ENTRY SIGNAL! Z-Score dropped below \${CONFIG.Z_SCORE_ENTRY}\`);
            this.executeTrade();
            this.crossedUpperThreshold = false; // إعادة ضبط الحالة بعد الدخول
        }
    }

    // ==========================================
    // 7. إدارة المخاطر (Kelly Criterion) 5% Max
    // ==========================================
    private calculatePositionSize(): number {
        // العائد المتوقع: شراء بـ 0.20$ والربح 0.80$ (1.00$ - 0.20$) -> النسبة = 4
        const b = (1.00 - CONFIG.MAX_PRICE_CENTS) / CONFIG.MAX_PRICE_CENTS; 
        const p = this.winProbability;
        const q = 1 - p;

        // معادلة كيلي: (bp - q) / b
        let kellyFraction = (b * p - q) / b;
        
        // تطبيق الحد الأقصى للمخاطرة (لا يتجاوز 5%)
        const riskToTake = Math.min(Math.max(kellyFraction, 0), CONFIG.MAX_RISK_PERCENT);
        
        const positionSizeUsd = this.currentBalance * riskToTake;
        console.log(\`🛡️ Kelly Criterion Risk: \${(riskToTake * 100).toFixed(2)}% | Position Size: $\${positionSizeUsd.toFixed(2)}\`);
        return positionSizeUsd;
    }

    // ==========================================
    // 8. تنفيذ الأوامر وتجزئة العقود (Limitless WS)
    // ==========================================
    private executeTrade() {
        const totalInvestment = this.calculatePositionSize();
        const numberOfContracts = Math.floor(totalInvestment / CONFIG.MAX_PRICE_CENTS);

        if (numberOfContracts <= 0) return;

        console.log(\`🛒 Preparing to buy \${numberOfContracts} contracts at max $\${CONFIG.MAX_PRICE_CENTS} GTC\`);

        // ميزة تجزئة العقد (Fractionalization)
        const chunkSize = Math.floor(numberOfContracts / CONFIG.FRACTION_CHUNKS);
        let remainingContracts = numberOfContracts;

        for (let i = 0; i < CONFIG.FRACTION_CHUNKS; i++) {
            const contractsToBuy = (i === CONFIG.FRACTION_CHUNKS - 1) ? remainingContracts : chunkSize;
            
            const orderPayload = {
                action: 'PLACE_ORDER',
                market: 'BTC_15M_PREDICTION',
                side: 'BUY',
                type: CONFIG.ORDER_TYPE, // GTC
                price: CONFIG.MAX_PRICE_CENTS, // أقصى سعر 20 سنت (0.20$)
                size: contractsToBuy,
                chunkId: i + 1
            };

            // إرسال الطلب المجزأ بفارق زمني بسيط لتجنب رفض السيرفر (Rate Limit)
            setTimeout(() => {
                if (this.limitlessWs.readyState === WebSocket.OPEN) {
                    this.limitlessWs.send(JSON.stringify(orderPayload));
                    console.log(\`🚀 Chunk \${i + 1}/\${CONFIG.FRACTION_CHUNKS} sent: \${contractsToBuy} contracts.\`);
                }
            }, i * 500); // 500ms delay between chunks

            remainingContracts -= contractsToBuy;
        }
    }
}

// ==========================================
// 9. تشغيل الروبوت
// ==========================================
const bot = new LimitlessTradingBot();
bot.fetchHistoricalData();
`;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generateSourceCode());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const code = generateSourceCode();
    const blob = new Blob([code], { type: 'text/typescript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `limitless_bot_${config.symbol.toLowerCase()}_${config.timeframe}.ts`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/90 backdrop-blur-sm overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/40">
        <div className="flex items-center gap-2">
          <FileCode2 className="w-4 h-4 text-sky-400" />
          <h3 className="font-bold text-slate-100 text-sm tracking-wide">
            {isAr ? 'كود الروبوت بلغة TypeScript والمواصفات' : 'Bot Source Code & Standalone Runner'}
          </h3>
          <span className="text-slate-600">·</span>
          <span className="text-xs text-slate-400 font-mono">bot.ts</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? (isAr ? 'تم النسخ!' : 'Copied!') : isAr ? 'نسخ الكود' : 'Copy Code'}</span>
          </button>

          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 py-1 bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium rounded-lg transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isAr ? 'تحميل الملف' : 'Download TS'}</span>
          </button>
        </div>
      </div>

      {/* Terminal Instructions */}
      <div className="px-4 py-2 bg-slate-950/70 border-b border-slate-800/80 flex items-center justify-between text-xs font-mono text-slate-400">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-emerald-400" />
          <span>Quick Run:</span>
          <code className="text-slate-200 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
            npm install ws axios &amp;&amp; npx tsx bot.ts
          </code>
        </div>
      </div>

      {/* Code Display */}
      <div className="p-4 bg-slate-950 text-xs font-mono max-h-96 overflow-y-auto leading-relaxed select-text">
        <pre className="text-slate-300">
          <code>{generateSourceCode()}</code>
        </pre>
      </div>
    </div>
  );
};
