import React, { useState } from 'react';
import { BotConfig } from '../types/bot';
import { Copy, Check, Download, FileCode2, Terminal, Shield } from 'lucide-react';

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
import { WebSocketClient } from '@limitless-exchange/sdk';

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
    CHUNK_DELAY_MS: ${config.chunkDelayMs},
    
    // عناوين البيانات الحية الرسمية
    BINANCE_REST_URL: '${config.binanceRestUrl}', 
    BINANCE_WS_URL: '${config.binanceWsUrl}',
    
    // خادم Limitless الرسمي المدعوم رسمياً من SDK
    LIMITLESS_WS_URL: '${config.limitlessWsUrl}', // wss://ws.limitless.exchange
    LIMITLESS_MARKET_SLUG: '${config.limitlessMarketSlug}', // e.g. 'btc-100k-weekly'
    
    // توثيق HMAC لمنصة Limitless
    LMTS_TOKEN_ID: process.env.LMTS_TOKEN_ID || '${config.limitlessTokenId || ''}',
    LMTS_TOKEN_SECRET: process.env.LMTS_TOKEN_SECRET || '${config.limitlessTokenSecret || ''}',
    API_KEY: process.env.LIMITLESS_API_KEY || '${config.limitlessApiKey || ''}'
};

// ==========================================
// 2. الكلاس الرئيسي للروبوت
// ==========================================
class LimitlessTradingBot {
    private closePrices: number[] = [];
    private crossedUpperThreshold: boolean = false;
    private limitlessWs: WebSocketClient;
    private currentBalance: number = ${config.initialBalance};
    private winProbability: number = ${config.winProbability.toFixed(2)};

    constructor() {
        // تهيئة عميل Limitless الرسمي مع دعم إعادة الاتصال التلقائي وتوقيع HMAC
        const credentials = CONFIG.LMTS_TOKEN_ID && CONFIG.LMTS_TOKEN_SECRET
            ? { tokenId: CONFIG.LMTS_TOKEN_ID, secret: CONFIG.LMTS_TOKEN_SECRET }
            : undefined;

        this.limitlessWs = new WebSocketClient({
            url: CONFIG.LIMITLESS_WS_URL,
            autoReconnect: true,
            hmacCredentials: credentials,
            apiKey: CONFIG.API_KEY || undefined,
        });

        this.initLimitlessWS();
    }

    // تهيئة واستقبال أحداث Limitless WebSocket الحية
    private async initLimitlessWS() {
        try {
            await this.limitlessWs.connect();
            console.log('✅ Connected to Limitless WebSocket (Official SDK)');

            // الاشتراك في الأسعار ودفتر الأوامر الحي (Public)
            await this.limitlessWs.subscribe('subscribe_market_prices', {
                marketSlugs: [CONFIG.LIMITLESS_MARKET_SLUG]
            });

            // الاشتراك في المراكز والأوامر والمعاملات (Authenticated)
            if (CONFIG.LMTS_TOKEN_ID || CONFIG.API_KEY) {
                await this.limitlessWs.subscribe('subscribe_positions', {
                    marketSlugs: [CONFIG.LIMITLESS_MARKET_SLUG]
                });
                await this.limitlessWs.subscribe('subscribe_order_events');
                await this.limitlessWs.subscribe('subscribe_transactions');
                console.log('🔒 Subscribed to authenticated positions and order events');
            }

            // استقبال تحديثات دفتر الأوامر
            this.limitlessWs.on('orderbookUpdate', (data: any) => {
                const bestBid = data.orderbook.bids[0];
                const bestAsk = data.orderbook.asks[0];
                console.log(\`[\${data.marketSlug}] CLOB Best Bid: \${bestBid?.price ?? '-'} | Best Ask: \${bestAsk?.price ?? '-'}\`);
            });

            // استقبال تحديثات المراكز
            this.limitlessWs.on('positions', (data: any) => {
                console.log('📊 Position update received:', data);
            });

            // استقبال أحداث دورة حياة الأوامر (OME & Settlement)
            this.limitlessWs.on('orderEvent', (event: any) => {
                console.log('⚡ Order event:', event.source, event.type, event.orderId);
            });

            this.limitlessWs.on('disconnect', (reason: string) => {
                console.log('⚠️ Limitless disconnected:', reason);
            });

        } catch (err) {
            console.error('❌ Failed to connect Limitless WebSocket:', err);
        }
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
                    limit: CONFIG.PERIODS + 1
                }
            });

            this.closePrices = response.data.map((candle: any[]) => parseFloat(candle[4]));
            console.log('📊 Historical data loaded. Running prices:', this.closePrices.slice(-CONFIG.PERIODS));
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

            // تحديث السعر وتقييم الاستراتيجية حصرياً عند إغلاق الشمعة
            if (kline && kline.x) {
                const closePrice = parseFloat(kline.c);
                this.updatePrices(closePrice);
            }
        });

        binanceWs.on('open', () => console.log('✅ Connected to Binance Live Feed'));
        binanceWs.on('error', (err) => console.warn('Binance WS notice:', err.message));
    }

    private updatePrices(newPrice: number) {
        this.closePrices.shift();
        this.closePrices.push(newPrice);
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
        return stdDev > 0 ? (currentPrice - mean) / stdDev : 0;
    }

    // ==========================================
    // 6. منطق الاستراتيجية
    // ==========================================
    private evaluateStrategy() {
        if (this.closePrices.length < CONFIG.PERIODS) return;

        const currentZScore = this.calculateZScore();
        console.log(\`📈 Current Z-Score: \${currentZScore.toFixed(2)}σ\`);

        // الشرط الأول: تجاوز العتبة 2.0 (التأهب)
        if (currentZScore > CONFIG.Z_SCORE_UPPER) {
            if (!this.crossedUpperThreshold) {
                console.log(\`⚠️ Z-Score crossed above \${CONFIG.Z_SCORE_UPPER}σ! Bot is ARMED.\`);
                this.crossedUpperThreshold = true;
            }
        }

        // الشرط الثاني: الارتداد تحت 1.90 (إشارة الدخول الحية)
        if (this.crossedUpperThreshold && currentZScore < CONFIG.Z_SCORE_ENTRY) {
            console.log(\`🎯 LIVE ENTRY SIGNAL! Z-Score reverted below \${CONFIG.Z_SCORE_ENTRY}σ.\`);
            this.executeTrade();
            this.crossedUpperThreshold = false;
        }
    }

    // ==========================================
    // 7. إدارة المخاطر (Kelly Criterion) 5% Max
    // ==========================================
    private calculatePositionSize(): number {
        // نسبة العائد إلى المخاطرة (شراء بـ 0.20$ والربح الصافي 0.80$ -> النسبة = 4)
        const b = (1.00 - CONFIG.MAX_PRICE_CENTS) / CONFIG.MAX_PRICE_CENTS; 
        const p = this.winProbability;
        const q = 1 - p;

        // معادلة كيلي: (bp - q) / b
        const kellyFraction = (b * p - q) / b;
        
        // تطبيق الحد الأقصى للمخاطرة (لا يتجاوز 5% لحماية رأس المال)
        const riskToTake = Math.min(Math.max(kellyFraction, 0), CONFIG.MAX_RISK_PERCENT);
        
        const positionSizeUsd = this.currentBalance * riskToTake;
        console.log(\`🛡️ Kelly Risk: \${(riskToTake * 100).toFixed(2)}% | Size: $\${positionSizeUsd.toFixed(2)}\`);
        return positionSizeUsd;
    }

    // ==========================================
    // 8. تنفيذ الأوامر وتجزئة العقود (Limitless SDK)
    // ==========================================
    private executeTrade() {
        const totalInvestment = this.calculatePositionSize();
        const numberOfContracts = Math.floor(totalInvestment / CONFIG.MAX_PRICE_CENTS);

        if (numberOfContracts <= 0) {
            console.log('⚠️ Position size is 0, skipping order execution.');
            return;
        }

        console.log(\`🛒 Preparing to buy \${numberOfContracts} contracts at max $\${CONFIG.MAX_PRICE_CENTS} GTC\`);

        // تجزئة العقد إلى 4 أجزاء متتالية مع فاصل زمني لتفادي قيود سرعة المنصة (Rate Limit)
        const chunkSize = Math.floor(numberOfContracts / CONFIG.FRACTION_CHUNKS);
        let remainingContracts = numberOfContracts;

        for (let i = 0; i < CONFIG.FRACTION_CHUNKS; i++) {
            const contractsToBuy = (i === CONFIG.FRACTION_CHUNKS - 1) ? remainingContracts : chunkSize;
            remainingContracts -= contractsToBuy;

            const orderPayload = {
                action: 'PLACE_ORDER',
                market: CONFIG.LIMITLESS_MARKET_SLUG,
                side: 'BUY',
                type: CONFIG.ORDER_TYPE,
                price: CONFIG.MAX_PRICE_CENTS,
                size: contractsToBuy,
                chunkId: i + 1
            };

            setTimeout(() => {
                console.log(\`🚀 Chunk \${i + 1}/\${CONFIG.FRACTION_CHUNKS} dispatched: \${contractsToBuy} contracts @ $\${CONFIG.MAX_PRICE_CENTS}\`);
                // إرسال عبر مقبس Limitless الحي
                if ((this.limitlessWs as any).socket) {
                    (this.limitlessWs as any).socket.emit('order', orderPayload);
                }
            }, i * CONFIG.CHUNK_DELAY_MS);
        }
    }
}

// ==========================================
// 9. تشغيل الروبوت الحي
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
      <div className="flex flex-wrap items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/40 gap-2">
        <div className="flex items-center gap-2">
          <FileCode2 className="w-4 h-4 text-emerald-400" />
          <h3 className="font-bold text-slate-100 text-sm tracking-wide">
            {isAr
              ? 'كود الروبوت الحي المتوافق مع Limitless SDK الرسمي'
              : 'Production Bot Code (Official Limitless SDK & WebSocket)'}
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
            className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isAr ? 'تحميل الملف' : 'Download TS'}</span>
          </button>
        </div>
      </div>

      {/* Terminal Instructions */}
      <div className="px-4 py-2.5 bg-slate-950/70 border-b border-slate-800/80 flex flex-wrap items-center justify-between text-xs font-mono text-slate-400 gap-2">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>Install &amp; Run:</span>
          <code className="text-slate-200 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
            npm install @limitless-exchange/sdk ws axios &amp;&amp; npx tsx bot.ts
          </code>
        </div>
        <div className="text-[11px] text-slate-500">
          Official Limitless Protocol v1.3
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
