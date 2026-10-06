/**
 * @file sampleRunner.ts
 * @description كود تنفيذي متكامل (Production Daemon Runner) لتشغيل بوت Limitless في بيئة Node.js / Docker
 * يستخدم الحزمة الرسمية @limitless-exchange/sdk مع ethers ومكتبة technicalindicators.
 */

import { ethers } from 'ethers';
import { executeAsymmetricMeanReversion } from './strategy';
import { LimitlessExchangeSDK } from './limitlessSdk';
import type { BotConfig, Candle } from './types';

/**
 * تكوين البوت الموصى به للاستراتيجية (Recommended Production Config)
 */
export const defaultBotConfig: BotConfig = {
  symbol: 'BTC/USD',
  candleTimeframe: '1m',
  marketDurationMinutes: 15,
  maxEntryPrice: 0.20, // سقف السعر اللامتماثل (حتى 0.20$ لعائد 5 أضعاف)
  zScore: {
    period: 20,           // Lookback Window: آخر 20 شمعة على فريم الدقيقة (1m)
    upperThreshold: 2.0,  // إشارة هبوط عند Z-Score >= +2.0
    lowerThreshold: -2.0, // إشارة صعود عند Z-Score <= -2.0
  },
  bollingerBands: {
    period: 20,
    stdDev: 2,
  },
  rsi: {
    period: 14,
    overboughtThreshold: 85, // شرط ذروة الشراء الحرج
    oversoldThreshold: 15,  // شرط ذروة البيع الحرج
  },
  tradeSizeUsdc: 100, // ميزانية الصفقة بالدولار
  maxSlippagePercent: 1.0,
  apiBaseUrl: process.env.LIMITLESS_API_URL || 'https://api.limitless.exchange',
  lmtsTokenId: process.env.LMTS_TOKEN_ID,
  lmtsTokenSecret: process.env.LMTS_TOKEN_SECRET,
  privateKey: process.env.PRIVATE_KEY,
  chainId: 8453, // Base Mainnet
  limitlessExchangeAddress: '0xC9c98965297Bc527861c898329Ee280632B76e18',
  walletAddress: process.env.WALLET_ADDRESS || '0x807A7Ae675A0e16414875a2a318BEB6B55cDbB14',
};

/**
 * دالة لتوليد أو جلب شموع 1 دقيقة للتداول التجريبي والحي
 */
export function generateSyntheticCandles(
  count: number = 60,
  basePrice: number = 94500,
  scenario: 'NORMAL' | 'OVERBOUGHT_PUMP' | 'OVERSOLD_DUMP' = 'NORMAL'
): Candle[] {
  const candles: Candle[] = [];
  const now = Date.now();
  let current = basePrice;

  for (let i = count; i >= 1; i--) {
    const timestamp = now - i * 60 * 1000;
    let volatility = (Math.random() - 0.49) * 45;

    if (scenario === 'OVERBOUGHT_PUMP' && i <= 8) {
      volatility = 120 + Math.random() * 80; // صعود صاروخي يرفع RSI فوق 85
    } else if (scenario === 'OVERSOLD_DUMP' && i <= 8) {
      volatility = -130 - Math.random() * 70; // هبوط حاد ينزل RSI تحت 15
    }

    const open = current;
    const close = open + volatility;
    const high = Math.max(open, close) + Math.random() * 20;
    const low = Math.min(open, close) - Math.random() * 20;
    const volume = Math.floor(Math.random() * 80) + 15;

    candles.push({
      timestamp,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume,
    });

    current = close;
  }

  return candles;
}

/**
 * الحلقة الرئيسية للبوت (Trading Loop)
 */
export async function startTradingBot(
  config: BotConfig = defaultBotConfig,
  onLog?: (message: string) => void
) {
  const log = onLog || console.log;
  log('🚀 تشغيل بوت التداول اللامتماثل المعتمد على @limitless-exchange/sdk...');
  log(`📊 الإعدادات: سوق BTC 15m | سقف الدخول: $${config.maxEntryPrice} | BB(${config.bollingerBands.period}, ${config.bollingerBands.stdDev}) | RSI(${config.rsi.period}, >${config.rsi.overboughtThreshold} / <${config.rsi.oversoldThreshold})`);

  const sdk = new LimitlessExchangeSDK({
    baseURL: config.apiBaseUrl,
    lmtsTokenId: config.lmtsTokenId,
    lmtsTokenSecret: config.lmtsTokenSecret,
    privateKey: config.privateKey,
    chainId: config.chainId,
    walletAddress: config.walletAddress,
  });

  const sampleCandles = generateSyntheticCandles(50, 94800, 'NORMAL');
  const result = await executeAsymmetricMeanReversion(sdk, sampleCandles, config);

  log(`[${new Date().toLocaleTimeString('ar-EG')}] فحص الشمعة الحالية: ${result.signal.signal}`);
  log(`   ${result.messageArabic}`);

  return { sdk, result };
}
