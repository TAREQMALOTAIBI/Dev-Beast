import { CandleData } from '../types/bot';

export class BinanceService {
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private pollingTimer: number | null = null;
  private isExplicitlyClosed = false;
  private wsEndpointIndex = 0;
  private isPollingActive = false;
  private lastCandleTime = 0;

  // Real candidate endpoints in order of browser compatibility (port 443 preferred over 9443)
  private getWsEndpoints(symbol: string, interval: string): string[] {
    const s = symbol.toLowerCase();
    return [
      `wss://stream.binance.com/ws/${s}@kline_${interval}`,
      `wss://data-stream.binance.vision/ws/${s}@kline_${interval}`,
      `wss://stream.binance.com:9443/ws/${s}@kline_${interval}`,
    ];
  }

  /**
   * Fetches real historical candlestick data from Binance API
   */
  public async fetchHistoricalCandles(
    symbol: string = 'BTCUSDT',
    interval: string = '15m',
    limit: number = 100,
    restUrl: string = 'https://api.binance.com/api/v3/klines'
  ): Promise<CandleData[]> {
    const endpoints = [
      restUrl,
      'https://api.binance.com/api/v3/klines',
      '/api/binance/api/v3/klines',
      'https://api.binance.vision/api/v3/klines',
    ];

    for (const url of endpoints) {
      try {
        const fullUrl = `${url}?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`;
        const res = await fetch(fullUrl, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });

        if (!res.ok) continue;

        const rawData = await res.json();
        if (Array.isArray(rawData) && rawData.length > 0) {
          const candles: CandleData[] = rawData.map((k: (string | number)[]) => ({
            time: Number(k[0]),
            open: parseFloat(String(k[1])),
            high: parseFloat(String(k[2])),
            low: parseFloat(String(k[3])),
            close: parseFloat(String(k[4])),
            volume: parseFloat(String(k[5])),
            isClosed: true,
          }));

          if (candles.length > 0) {
            this.lastCandleTime = candles[candles.length - 1].time;
          }
          return candles;
        }
      } catch (err) {
        // Silently try next fallback endpoint
      }
    }

    return [];
  }

  /**
   * Connects to live Binance market data with multi-endpoint failover
   * and automatic real-time live polling fallback if browser WebSocket is blocked
   */
  public connectWebSocket(
    symbol: string,
    interval: string,
    onTick: (candle: CandleData, isClosed: boolean) => void,
    onStatusChange: (status: 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED') => void
  ) {
    this.isExplicitlyClosed = false;
    this.stopPolling();

    const endpoints = this.getWsEndpoints(symbol, interval);
    const targetUrl = endpoints[this.wsEndpointIndex % endpoints.length];

    onStatusChange('CONNECTING');

    try {
      this.ws = new WebSocket(targetUrl);

      this.ws.onopen = () => {
        onStatusChange('CONNECTED');
        this.stopPolling();
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
            this.lastCandleTime = candle.time;
            onTick(candle, Boolean(k.x));
          }
        } catch {
          // Handled safely
        }
      };

      this.ws.onerror = () => {
        // Do not throw console.error - gracefully fail over to next endpoint or live polling
        this.wsEndpointIndex++;
        if (this.wsEndpointIndex >= endpoints.length) {
          // All direct browser WebSockets blocked by sandbox/CSP - activate Live High-Frequency Poller
          this.startLivePolling(symbol, interval, onTick, onStatusChange);
        }
      };

      this.ws.onclose = () => {
        if (!this.isExplicitlyClosed && !this.isPollingActive) {
          if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
          this.reconnectTimer = window.setTimeout(() => {
            this.connectWebSocket(symbol, interval, onTick, onStatusChange);
          }, 3000);
        }
      };
    } catch {
      // If direct WebSocket instantiation is disallowed by environment, switch to live polling
      this.startLivePolling(symbol, interval, onTick, onStatusChange);
    }
  }

  /**
   * High-frequency live polling fallback (every 2.5 seconds)
   * Fetches the real latest live candle from Binance REST API
   */
  private startLivePolling(
    symbol: string,
    interval: string,
    onTick: (candle: CandleData, isClosed: boolean) => void,
    onStatusChange: (status: 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED') => void
  ) {
    if (this.isPollingActive) return;
    this.isPollingActive = true;
    onStatusChange('CONNECTED');

    const poll = async () => {
      if (this.isExplicitlyClosed) return;
      try {
        const candles = await this.fetchHistoricalCandles(symbol, interval, 2);
        if (candles.length > 0) {
          const latest = candles[candles.length - 1];
          const isClosed = this.lastCandleTime > 0 && latest.time > this.lastCandleTime;
          this.lastCandleTime = latest.time;
          onTick(latest, isClosed);
        }
      } catch {
        // Continue polling safely
      }

      if (!this.isExplicitlyClosed) {
        this.pollingTimer = window.setTimeout(poll, 2500);
      }
    };

    poll();
  }

  private stopPolling() {
    this.isPollingActive = false;
    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  public disconnect() {
    this.isExplicitlyClosed = true;
    this.stopPolling();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Safe close
      }
      this.ws = null;
    }
  }
}

export const binanceService = new BinanceService();
