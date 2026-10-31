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
import { ethers } from 'ethers';
import {
    WebSocketClient,
    HttpClient,
    OrderClient,
    MarketFetcher,
    ConsoleLogger,
    Side,
    OrderType,
    DEFAULT_API_URL
} from '@limitless-exchange/sdk';

// ==========================================
// 1. إعدادات المتغيرات والاستراتيجية (Config)
// ==========================================
const CONFIG = {
    SYMBOL: '${config.symbol}',
    TIMEFRAME: '1m', // 1min Binance WebSocket & Historical Candles
    PERIODS: 45, // 45 Historical Candles
    STRATEGY_DIRECTION: '${config.strategyDirection || 'BOTH'}', // 'BOTH' | 'LONG_ONLY' | 'SHORT_ONLY'
    Z_SCORE_UPPER: 2.50, // First confirmation (+2.5)
    Z_SCORE_ENTRY: 2.30, // Second confirmation (+2.3)
    Z_SCORE_LOWER: -2.50, // First confirmation (-2.5)
    Z_SCORE_LOWER_ENTRY: -2.30, // Second confirmation (-2.3)
    MAX_RISK_PERCENT: 0.04, // Fixed 4% of bankroll per 15m contract
    ORDER_TYPE: 'GTC', // GTC Order without max Entry price
    EXECUTION_MODE: 'DIRECT_UNIFIED',
    
    // عناوين البيانات الحية الرسمية
    BINANCE_REST_URL: '${config.binanceRestUrl}', 
    BINANCE_WS_URL: 'wss://stream.binance.com/ws/btcusdt@kline_1m',
    
    // خادم Limitless الرسمي المدعوم رسمياً من SDK
    LIMITLESS_WS_URL: '${config.limitlessWsUrl}', // wss://ws.limitless.exchange
    LIMITLESS_MARKET_SLUG: '${config.limitlessMarketSlug}', // 15m BTC contract
    
    // مفاتيح المحفظة وتوثيق HMAC (EIP-712 Order Signing)
    PRIVATE_KEY: process.env.PRIVATE_KEY || '',
    LMTS_TOKEN_ID: process.env.LMTS_TOKEN_ID || '${config.limitlessTokenId || ''}',
    LMTS_TOKEN_SECRET: process.env.LMTS_TOKEN_SECRET || '${config.limitlessTokenSecret || ''}',
    API_KEY: process.env.LIMITLESS_API_KEY || '${config.limitlessApiKey || ''}'
};

// ==========================================
// 2. الكلاس الرئيسي للروبوت وتوقيع EIP-712
// ==========================================
class LimitlessTradingBot {
    private closePrices: number[] = [];
    private crossedUpperThreshold: boolean = false;
    private crossedLowerThreshold: boolean = false;
    private limitlessWs: WebSocketClient;
    private httpClient: HttpClient | null = null;
    private orderClient: OrderClient | null = null;
    private wallet: ethers.Wallet | null = null;
    private currentBalance: number = ${config.initialBalance};
    private winProbability: number = ${config.winProbability.toFixed(2)};

    constructor() {
        // 1. تهيئة عميل WebSocket
        const credentials = CONFIG.LMTS_TOKEN_ID && CONFIG.LMTS_TOKEN_SECRET
            ? { tokenId: CONFIG.LMTS_TOKEN_ID, secret: CONFIG.LMTS_TOKEN_SECRET }
            : undefined;

        this.limitlessWs = new WebSocketClient({
            url: CONFIG.LIMITLESS_WS_URL,
            autoReconnect: true,
            hmacCredentials: credentials,
            apiKey: CONFIG.API_KEY || undefined,
        });

        // 2. تهيئة محرك التوقيع EIP-712 وOrderClient
        if (CONFIG.PRIVATE_KEY && credentials) {
            const pk = CONFIG.PRIVATE_KEY.startsWith('0x') ? CONFIG.PRIVATE_KEY : \`0x\${CONFIG.PRIVATE_KEY}\`;
            this.wallet = new ethers.Wallet(pk);
            this.httpClient = new HttpClient({
                baseURL: DEFAULT_API_URL,
                hmacCredentials: credentials
            });
            this.orderClient = new OrderClient({
                httpClient: this.httpClient,
                wallet: this.wallet,
                logger: new ConsoleLogger()
            });
            this.ensureEoaTradingMode();
        }

        this.initLimitlessWS();
    }

    // تفعيل وضع EOA لتمكين توقيع الأوامر الذاتي وفق متطلبات Limitless
    private async ensureEoaTradingMode() {
        try {
            const axiosInstance = (this.httpClient as any)?.http?.client;
            if (axiosInstance && typeof axiosInstance.put === 'function') {
                await axiosInstance.put('/profiles', { tradeWalletOption: 'eoa' });
                console.log('✅ Trading wallet profile confirmed: EOA Mode');
            }
        } catch (e: any) {
            console.log('Profile trading mode notice:', e.message);
        }
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
                const bestBid = data.orderbook?.bids?.[0];
                const bestAsk = data.orderbook?.asks?.[0];
                console.log(\`[\${data.marketSlug}] CLOB Best Bid: \${bestBid?.price ?? '-'} | Best Ask: \${bestAsk?.price ?? '-'}\`);
            });

            // استقبال تحديثات أسعار الأوراكل الحية (Chainlink / Pyth)
            this.limitlessWs.on('oraclePriceData', (data: any) => {
                console.log(\`🔮 Oracle [\${data.marketSlug}] Value: \${data.value} @ \${data.timestamp}\`);
            });

            // استقبال تحديثات المراكز الحقيقية
            this.limitlessWs.on('positions', (data: any) => {
                console.log('📊 Position update received:', data);
            });

            // استقبال دورة حياة الأوامر (OME / Settlement)
            this.limitlessWs.on('orderEvent', (event: any) => {
                if (event.source === 'OME') {
                    console.log('⚡ OME Order State:', event.type, event.orderId, event.clientOrderId ?? '');
                } else {
                    console.log('🔗 On-Chain Settlement:', event.type, event.orderId, event.txHash ?? '');
                }
            });

            // استقبال أحداث المعاملات
            this.limitlessWs.on('tx', (data: any) => {
                console.log(\`📜 Tx confirmation: \${data.txHash} Status: \${data.status}\`);
            });

            // استقبال رسائل النظام الداخلية
            this.limitlessWs.on('system', (msg: any) => {
                console.log('ℹ️ Limitless System Notice:', msg);
            });

            // معالجة انقطاع الاتصال وإعادة الاتصال بمصافحة HMAC جديدة طبقاً للتوثيق
            this.limitlessWs.on('disconnect', async (reason: string) => {
                console.log('⚠️ Limitless disconnected:', reason);
                console.log('🔄 Re-initiating fresh handshake to avoid replaying expired HMAC signature...');
                setTimeout(async () => {
                    try {
                        await this.limitlessWs.disconnect();
                        await this.initLimitlessWS();
                    } catch (err) {
                        console.error('Reconnect error:', err);
                    }
                }, 3000);
            });

        } catch (err) {
            console.error('❌ Failed to connect Limitless WebSocket:', err);
        }
    }

    // ==========================================
    // 3. جلب 45 شمعة تاريخية مغلقة مؤكدة (1m) من Binance Rest API
    // ==========================================
    public async fetchHistoricalData() {
        console.log(\`📥 Fetching last \${CONFIG.PERIODS} closed candles (1m) for \${CONFIG.SYMBOL}...\`);
        try {
            const response = await axios.get(CONFIG.BINANCE_REST_URL, {
                params: {
                    symbol: CONFIG.SYMBOL,
                    interval: CONFIG.TIMEFRAME,
                    limit: CONFIG.PERIODS + 1
                }
            });

            const now = Date.now();
            const closedKlines = response.data.filter((candle: any[], idx: number) => {
                const closeTime = Number(candle[6]) || 0;
                return closeTime > 0 ? closeTime <= now : idx < response.data.length - 1;
            });

            this.closePrices = closedKlines.slice(-CONFIG.PERIODS).map((candle: any[]) => parseFloat(candle[4]));
            console.log('📊 45 confirmed closed 1m candles loaded:', this.closePrices.length);
            this.startBinanceWS();
        } catch (error) {
            console.error('❌ Error fetching historical data:', error);
        }
    }

    // ==========================================
    // 4. البث الحي (Binance 1m WebSocket — حساب عند إغلاق الشمعة فقط)
    // ==========================================
    private lastExecutedCandleTime: number = 0;
    private isExecutingTrade: boolean = false;

    private startBinanceWS() {
        const binanceWs = new WebSocket(CONFIG.BINANCE_WS_URL);

        binanceWs.on('message', (data: WebSocket.Data) => {
            const message = JSON.parse(data.toString());
            const kline = message.k;

            if (kline) {
                const currentPrice = parseFloat(kline.c);
                const isClosed = Boolean(kline.x);
                const candleTime = Number(kline.t);
                this.onTick(currentPrice, isClosed, candleTime);
            }
        });

        binanceWs.on('open', () => console.log('✅ Connected to Binance 1m Live Feed (Closed Candles Only)'));
        binanceWs.on('error', (err) => console.warn('Binance WS notice:', err.message));
    }

    private onTick(newPrice: number, isClosed: boolean, candleTime: number) {
        // حساب المؤشر وتأكيد الإشارات حصرياً بعد إغلاق الشمعة المؤكد (Closed Candles Only)
        if (!isClosed) return;

        this.closePrices = [...this.closePrices.slice(-(CONFIG.PERIODS - 1)), newPrice];
        this.evaluateStrategy(this.closePrices, candleTime);
    }

    // ==========================================
    // 5. حساب Z-Score على 45 شمعة (1m)
    // ==========================================
    private calculateZScore(prices: number[]): number {
        const windowPrices = prices.slice(-CONFIG.PERIODS);
        const n = windowPrices.length;
        const mean = windowPrices.reduce((a, b) => a + b, 0) / n;
        const variance = windowPrices.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
        const stdDev = Math.sqrt(variance);
        
        const currentPrice = windowPrices[n - 1];
        return stdDev > 0 ? (currentPrice - mean) / stdDev : 0;
    }

    // ==========================================
    // 6. منطق الاستراتيجية: التأكيد الأول (2.5) والتأكيد الثاني (2.3)
    // ==========================================
    private evaluateStrategy(prices: number[] = this.closePrices, candleTime?: number) {
        if (prices.length < CONFIG.PERIODS) return;

        const currentZScore = this.calculateZScore(prices);

        // 1. Short (DOWN): First confirmation >= +2.5, Second confirmation <= +2.3
        if (CONFIG.STRATEGY_DIRECTION === 'BOTH' || CONFIG.STRATEGY_DIRECTION === 'SHORT_ONLY') {
            if (currentZScore >= CONFIG.Z_SCORE_UPPER) {
                this.crossedUpperThreshold = true;
            } else if (this.crossedUpperThreshold && currentZScore <= CONFIG.Z_SCORE_ENTRY && currentZScore > 0) {
                this.crossedUpperThreshold = false;
                if (!this.isExecutingTrade && (!candleTime || this.lastExecutedCandleTime !== candleTime)) {
                    console.log(\`🎯 Short Second Confirmation! z=\${currentZScore.toFixed(2)}σ (<= +\${CONFIG.Z_SCORE_ENTRY}). Executing GTC DOWN order!\`);
                    if (candleTime) this.lastExecutedCandleTime = candleTime;
                    this.executeTrade('SHORT');
                }
            } else if (currentZScore <= 0) {
                this.crossedUpperThreshold = false;
            }
        }

        // 2. Long (UP): First confirmation <= -2.5, Second confirmation >= -2.3
        if (CONFIG.STRATEGY_DIRECTION === 'BOTH' || CONFIG.STRATEGY_DIRECTION === 'LONG_ONLY') {
            if (currentZScore <= CONFIG.Z_SCORE_LOWER) {
                this.crossedLowerThreshold = true;
            } else if (this.crossedLowerThreshold && currentZScore >= CONFIG.Z_SCORE_LOWER_ENTRY && currentZScore < 0) {
                this.crossedLowerThreshold = false;
                if (!this.isExecutingTrade && (!candleTime || this.lastExecutedCandleTime !== candleTime)) {
                    console.log(\`🎯 Long Second Confirmation! z=\${currentZScore.toFixed(2)}σ (>= \${CONFIG.Z_SCORE_LOWER_ENTRY}). Executing GTC UP order!\`);
                    if (candleTime) this.lastExecutedCandleTime = candleTime;
                    this.executeTrade('LONG');
                }
            } else if (currentZScore >= 0) {
                this.crossedLowerThreshold = false;
            }
        }
    }

    // ==========================================
    // 7. حجم الصفقة: Fixed 4% من الرصيد لكل عقد 15 دقيقة
    // ==========================================
    private calculatePositionSize(): number {
        const positionSizeUsd = this.currentBalance * CONFIG.MAX_RISK_PERCENT;
        console.log(\`🛡️ Fixed 4% Bankroll Bet Size: $\${positionSizeUsd.toFixed(2)} per 15m contract\`);
        return positionSizeUsd;
    }

    // ==========================================
    // 8. تنفيذ أمر GTC بدون سقف سعر دخول على عقد الـ 15 دقيقة
    // ==========================================
    private async executeTrade(direction: 'SHORT' | 'LONG' = 'SHORT') {
        const totalInvestment = this.calculatePositionSize();
        const outcome = direction === 'LONG' ? 'UP' : 'DOWN';

        try {
            if (this.orderClient) {
                const marketFetcher = new MarketFetcher(this.httpClient!);
                const market = await marketFetcher.getMarket(CONFIG.LIMITLESS_MARKET_SLUG);
                const tokenId = direction === 'LONG' ? market.tokens?.yes : market.tokens?.no;
                const livePrice = direction === 'LONG'
                    ? (market.prices?.[0] || 0.50)
                    : (market.prices?.[1] || 0.50);
                const executionPrice = Math.min(0.99, Math.max(0.01, Number(livePrice.toFixed(2))));
                const numberOfContracts = Math.max(1, Math.floor(totalInvestment / executionPrice));

                if (tokenId) {
                    const signedOrder = await this.orderClient.createOrder({
                        marketSlug: CONFIG.LIMITLESS_MARKET_SLUG,
                        tokenId: String(tokenId),
                        side: Side.BUY,
                        orderType: OrderType.GTC,
                        price: executionPrice, // GTC Order without max Entry price cap
                        size: numberOfContracts
                    });
                    console.log(\`✅ GTC Order Executed (\${outcome})! ID: \${signedOrder.id} | \${numberOfContracts} contracts @ $\${executionPrice}\`);
                    return;
                }
            }
        } catch (err: any) {
            console.error('❌ Order execution failed:', err.message);
        }
    }
}

// ==========================================
// 9. تشغيل الروبوت الحي والإغلاق الآمن
// ==========================================
const bot = new LimitlessTradingBot();
bot.fetchHistoricalData();

process.on('SIGINT', () => {
    console.log('🛑 Graceful shutdown initiated...');
    process.exit(0);
});
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

      {/* EIP-712 Architecture & Protocol Specs */}
      <div className="p-4 bg-slate-950/90 border-t border-slate-800 space-y-3 text-xs">
        <div className="flex items-center gap-2 text-sky-400 font-semibold">
          <Shield className="w-4 h-4" />
          <span>{isAr ? 'معايير التوقيع المشفر EIP-712 في شبكة Base (ChainId: 8453)' : 'EIP-712 Order Signing Specification (Base Mainnet)'}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono text-[11px]">
          <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
            <span className="text-slate-400 block mb-1 font-bold">{isAr ? '1. مجال التوقيع (Domain)' : '1. Domain Separator'}</span>
            <div className="text-slate-300 space-y-0.5">
              <div>name: <span className="text-emerald-400 font-bold">&quot;Limitless CTF Exchange&quot;</span></div>
              <div>version: <span className="text-emerald-400 font-bold">&quot;1&quot;</span></div>
              <div>chainId: <span className="text-emerald-400 font-bold">8453</span> (Base)</div>
              <div>verifyingContract: <span className="text-emerald-400 font-bold">venue.exchange</span></div>
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
            <span className="text-slate-400 block mb-1 font-bold">{isAr ? '2. وضع المحفظة (Wallet Mode)' : '2. Profile Wallet Mode'}</span>
            <div className="text-slate-300 space-y-1">
              <div>Option: <span className="text-amber-400 font-bold">&quot;eoa&quot;</span></div>
              <div className="text-slate-400 text-[10px]">
                {isAr
                  ? 'يتطلب إرسال PUT /profiles مع tradeWalletOption: "eoa" لتفادي خطأ 400 Signer Mismatch.'
                  : 'Requires tradeWalletOption: "eoa" to authorize direct self-signed orders.'}
              </div>
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
            <span className="text-slate-400 block mb-1 font-bold">{isAr ? '3. معايير الحقول (Field Rules)' : '3. Field Rules & Scaling'}</span>
            <div className="text-slate-300 space-y-0.5">
              <div>Amounts: <span className="text-sky-400 font-bold">Scaled by 1e6</span> (USDC)</div>
              <div>expiration: <span className="text-sky-400 font-bold">0</span> | nonce: <span className="text-sky-400 font-bold">0</span></div>
              <div>feeRateBps: <span className="text-sky-400 font-bold">0</span> (Collateral Venue)</div>
              <div>taker: <span className="text-sky-400 font-bold">0x000...000</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
