import { CandleData } from '../types/bot';

export class BinanceService {
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private isExplicitlyClosed = false;

  /**
   * Fetches real historical candlestick data from Binance public API
   * No simulation or mock data
   */
  public async fetchHistoricalCandles(
    symbol: string = 'BTCUSDT',
    interval: string = '15m',
    limit: number = 50,
    restUrl: string = 'https://api.binance.vision/api/v3/klines'
  ): Promise<CandleData[]> {
    const endpoints = [
      restUrl,
      'https://api.binance.vision/api/v3/klines',
      'https://api.binance.com/api/v3/klines',
    ];

    for (const url of endpoints) {
      try {
        const fullUrl = `${url}?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`;
        const res = await fetch(fullUrl, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });

        if (!res.ok) {
          continue;
        }

        const rawData = await res.json();
        if (Array.isArray(rawData) && rawData.length > 0) {
          return rawData.map((k: (string | number)[]) => ({
            time: Number(k[0]),
            open: parseFloat(String(k[1])),
            high: parseFloat(String(k[2])),
            low: parseFloat(String(k[3])),
            close: parseFloat(String(k[4])),
            volume: parseFloat(String(k[5])),
            isClosed: true,
          }));
        }
      } catch (err) {
        console.warn(`Error connecting to Binance endpoint ${url}:`, err);
      }
    }

    // In pure live mode, if connection fails, return empty list and let caller handle reconnect
    console.error('Failed to load live Binance historical klines from all endpoints.');
    return [];
  }

  /**
   * Connects to live Binance WebSocket stream for real-time market ticks
   */
  public connectWebSocket(
    symbol: string,
    interval: string,
    onTick: (candle: CandleData, isClosed: boolean) => void,
    onStatusChange: (status: 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED') => void
  ) {
    this.isExplicitlyClosed = false;
    const cleanSymbol = symbol.toLowerCase();
    const wsUrl = `wss://stream.binance.com:9443/ws/${cleanSymbol}@kline_${interval}`;

    onStatusChange('CONNECTING');

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        onStatusChange('CONNECTED');
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.e === 'kline' && message.k) {
            const k = message.k;
            const candle: CandleData = {
              time: Number(k.t),
              open: parseFloat(k.o),
              high: parseFloat(k.h),
              low: parseFloat(k.l),
              close: parseFloat(k.c),
              volume: parseFloat(k.v),
              isClosed: Boolean(k.x),
            };
            onTick(candle, Boolean(k.x));
          }
        } catch (err) {
          console.error('Error parsing live Binance WS message:', err);
        }
      };

      this.ws.onerror = (err) => {
        console.error('Live Binance WebSocket connection error:', err);
      };

      this.ws.onclose = () => {
        onStatusChange('DISCONNECTED');
        if (!this.isExplicitlyClosed) {
          if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
          this.reconnectTimer = window.setTimeout(() => {
            this.connectWebSocket(symbol, interval, onTick, onStatusChange);
          }, 3000);
        }
      };
    } catch (err) {
      console.error('Unable to establish Binance WebSocket:', err);
      onStatusChange('DISCONNECTED');
    }
  }

  public disconnect() {
    this.isExplicitlyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export const binanceService = new BinanceService();
