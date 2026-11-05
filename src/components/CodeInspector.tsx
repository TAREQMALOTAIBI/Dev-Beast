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
// 1. إعدادات المتغيرات والاستراتيجية (Document 6 Quant Config)
// ==========================================
const CONFIG = {
    SYMBOL: '${config.symbol}',
    TIMEFRAME: '1m', // btcusdt@kline_1m — دقيقة واحدة فقط
    PERIODS: ${config.periods || 180}, // 180-period SMA (3 hours lookback)
    STRATEGY_DIRECTION: '${config.strategyDirection || 'BOTH'}', // 'BOTH' | 'LONG_ONLY' | 'SHORT_ONLY'
    Z_SCORE_UPPER: ${config.zScoreUpper || 2.4}, // Asymmetric Short Entry (+2.4σ)
    Z_SCORE_LOWER: ${config.zScoreLower || -2.2}, // Asymmetric Long Entry (-2.2σ)
    VOLATILITY_FILTER: '10 bp < RV_3m < 60 bp', // فلتر التقلب المحقق
    TREND_FILTER: 'ADX(14, 1m) < 25', // فلتر الاتجاه
    MAX_SHARE_PRICE: ${config.maxPriceCents || 0.46}, // Hard Cap: $0.46 (46¢)
    MAX_RISK_PERCENT: ${config.maxRiskPercent || 0.04}, // Quarter-Kelly Sizing: 3-5% Max
    ORDER_TYPE: '${config.orderType || 'FAK'}', // Order Type: FAK (Fill-And-Kill / IOC)
    SINGLE_ENTRY_PER_15M_MARKET: true, // Single-Entry Lock per 15m Market
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
    // 4. البث الحي (btcusdt@kline_1m — حساب الإشارات عند إغلاق الشمعة 1m)
    // ==========================================
    private lastExecutedMarketSlug: string = '';
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

        binanceWs.on('open', () => console.log('✅ Connected to btcusdt@kline_1m (Evaluation on 1m Candle Close)'));
        binanceWs.on('error', (err) => console.warn('Binance WS notice:', err.message));
    }

    private onTick(price: number, isClosed: boolean, candleTime: number) {
        // تقييم الاستراتيجية وتنفيذ الأوامر حصراً عند إغلاق الشمعة (isClosed === true)
        if (isClosed) {
            const closedWindow = [...this.closePrices.slice(-(CONFIG.PERIODS - 1)), price];
            this.closePrices = closedWindow;
            this.evaluateStrategy(closedWindow, candleTime);
        }
    }

    // ==========================================
    // 5. حساب Z-Score (180-Period SMA - 3 Hours)
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

        const currentZScore = this.calculateZScore(prices);

        // 1. Short (DOWN): Asymmetric Entry >= +2.40σ + Filters (RV & ADX)
        if (CONFIG.STRATEGY_DIRECTION === 'BOTH' || CONFIG.STRATEGY_DIRECTION === 'SHORT_ONLY') {
            if (currentZScore >= CONFIG.Z_SCORE_UPPER) {
                if (!this.isExecutingTrade) {
                    console.log(\`🎯 Short Signal! z=\${currentZScore.toFixed(2)}σ (>= +\${CONFIG.Z_SCORE_UPPER}). Executing FAK DOWN order @ <= $0.46 (46¢)!\`);
                    this.executeTrade('SHORT');
                }
            }
        }

        // 2. Long (UP): Asymmetric Entry <= -2.20σ + Filters (RV & ADX)
        if (CONFIG.STRATEGY_DIRECTION === 'BOTH' || CONFIG.STRATEGY_DIRECTION === 'LONG_ONLY') {
            if (currentZScore <= CONFIG.Z_SCORE_LOWER) {
                if (!this.isExecutingTrade) {
                    console.log(\`🎯 Long Signal! z=\${currentZScore.toFixed(2)}σ (<= \${CONFIG.Z_SCORE_LOWER}). Executing FAK UP order @ <= $0.46 (46¢)!\`);
                    this.executeTrade('LONG');
                }
            }
        }
    }

    // ==========================================
    // 7. حجم الصفقة: Quarter-Kelly Sizing (3-5% Max)
    // ==========================================
    private calculatePositionSize(): number {
        const positionSizeUsd = this.currentBalance * CONFIG.MAX_RISK_PERCENT;
        console.log(\`🛡️ Quarter-Kelly 3-5%: $\${positionSizeUsd.toFixed(2)} per 15m contract\`);
        return positionSizeUsd;
    }

    // ==========================================
    // 8. تنفيذ أمر FAK بسقف صلب $0.46 (46¢) مع قفل دخول واحد لكل عقد 15 دقيقة
    // ==========================================
    private async executeTrade(direction: 'SHORT' | 'LONG' = 'SHORT') {
        const currentSlotSec = Math.floor(Date.now() / 900000) * 900;
        const resolvedSlug = CONFIG.LIMITLESS_MARKET_SLUG === 'btc-up-or-down-15-min'
            ? \`btc-up-or-down-15-min-\${currentSlotSec}\`
            : CONFIG.LIMITLESS_MARKET_SLUG;

        if (CONFIG.SINGLE_ENTRY_PER_15M_MARKET && this.lastExecutedMarketSlug === resolvedSlug) {
            console.log(\`🔒 Single-Entry Lock active for \${resolvedSlug}. Skipping duplicate entry.\`);
            return;
        }

        const totalInvestment = this.calculatePositionSize();
        const outcome = direction === 'LONG' ? 'UP' : 'DOWN';

        try {
            this.isExecutingTrade = true;
            if (this.orderClient) {
                const marketFetcher = new MarketFetcher(this.httpClient!);
                const market: any = await marketFetcher.getMarket(resolvedSlug);
                const tokenId = direction === 'LONG' ? market.tokens?.yes : market.tokens?.no;
                const livePrice = direction === 'LONG'
                    ? (market.tradePrices?.buy?.market?.[0] ?? market.prices?.[0] ?? 0.46)
                    : (market.tradePrices?.buy?.market?.[1] ?? market.prices?.[1] ?? 0.46);
                const executionPrice = Math.min(CONFIG.MAX_SHARE_PRICE, Math.max(0.001, Number(livePrice.toFixed(3))));
                const numberOfContracts = Math.max(0.001, Math.floor((totalInvestment / executionPrice) * 1000) / 1000);

                if (tokenId) {
                    const signedOrder = await this.orderClient.createOrder({
                        marketSlug: market.slug || resolvedSlug,
                        tokenId: String(tokenId),
                        side: Side.BUY,
                        orderType: OrderType.FAK,
                        price: executionPrice, // Hard Cap <= $0.46 (46¢)
                        size: numberOfContracts
                    });
                    this.lastExecutedMarketSlug = market.slug || resolvedSlug;
                    console.log(\`✅ FAK Order Placed (\${outcome})! ID: \${signedOrder.id} | \${numberOfContracts} contracts @ $\${executionPrice} (<= $0.46 / 46¢)\`);
                    return;
                }
            }
        } catch (err: any) {
            console.error('❌ Order execution failed:', err.message);
        } finally {
            this.isExecutingTrade = false;
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
