import { CandleData } from '../types/bot';

export class BinanceService {
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private pollingTimer: number | null = null;
  private isExplicitlyClosed = false;
  private wsEndpointIndex = 0;
  private isPollingActive = false;
  private lastCandleTime = 0;

  private closedSyncTimer: number | null = null;

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
    interval: string = '1m',
    limit: number = 200,
    restUrl: string = 'https://api.binance.com/api/v3/klines'
  ): Promise<CandleData[]> {
    const endpoints = [
      'https://data-api.binance.vision/api/v3/klines',
      restUrl,
      'https://api.binance.com/api/v3/klines',
      '/api/binance/api/v3/klines',
    ];

    for (const url of endpoints) {
      try {
        // Fetch limit + 1 so that we always have `limit` (45) fully closed candles plus the currently forming candle
        const requestLimit = limit + 1;
        const fullUrl = `${url}?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${requestLimit}`;
        const res = await fetch(fullUrl, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });

        if (!res.ok) continue;

        const rawData = await res.json();
        if (Array.isArray(rawData) && rawData.length > 0) {
          const now = Date.now();
          const candles: CandleData[] = rawData.map((k: (string | number)[], idx: number) => {
            const closeTime = Number(k[6]) || 0;
            const isClosedCandle = closeTime > 0 ? closeTime <= now : idx < rawData.length - 1;
            return {
              time: Number(k[0]),
              open: parseFloat(String(k[1])),
              high: parseFloat(String(k[2])),
              low: parseFloat(String(k[3])),
              close: parseFloat(String(k[4])),
              volume: parseFloat(String(k[5])),
              isClosed: isClosedCandle,
            };
          });

          if (candles.length > 0) {
            this.lastCandleTime = candles[candles.length - 1].time;
          }
          return candles;
        }
      } catch {
        // Silently try next fallback endpoint
      }
    }

    return [];
  }

  /**
   * Connects to live Binance market data with multi-endpoint failover,
   * continuous closed-candle REST verification, and automatic live polling fallback
   */
  public connectWebSocket(
    symbol: string,
    interval: string,
    onTick: (candle: CandleData, isClosed: boolean) => void,
    onStatusChange: (status: 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED') => void,
    onClosedCandlesSync?: (recentCandles: CandleData[]) => void
  ) {
    this.isExplicitlyClosed = false;
    this.stopPolling();
    this.startClosedCandlesSync(symbol, interval, onClosedCandlesSync);

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
            const prevTime = this.lastCandleTime;
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

            // If a candle just closed or rolled over to a new minute, immediately reconcile official closed candles via REST
            if (Boolean(k.x) || (prevTime > 0 && candle.time > prevTime)) {
              this.syncOfficialClosedCandlesNow(symbol, interval, onClosedCandlesSync);
            }
          }
        } catch {
          // Handled safely
        }
      };

      this.ws.onerror = () => {
        this.wsEndpointIndex++;
        if (this.wsEndpointIndex >= endpoints.length) {
          this.startLivePolling(symbol, interval, onTick, onStatusChange, onClosedCandlesSync);
        }
      };

      this.ws.onclose = () => {
        if (!this.isExplicitlyClosed && !this.isPollingActive) {
          if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
          this.reconnectTimer = window.setTimeout(() => {
            this.connectWebSocket(symbol, interval, onTick, onStatusChange, onClosedCandlesSync);
          }, 3000);
        }
      };
    } catch {
      this.startLivePolling(symbol, interval, onTick, onStatusChange, onClosedCandlesSync);
    }
  }

  private async syncOfficialClosedCandlesNow(
    symbol: string,
    interval: string,
    onClosedCandlesSync?: (recentCandles: CandleData[]) => void
  ) {
    if (this.isExplicitlyClosed || !onClosedCandlesSync) return;
    try {
      const recent = await this.fetchHistoricalCandles(symbol, interval, 20);
      if (recent.length > 0) {
        onClosedCandlesSync(recent);
      }
    } catch {
      // Safe continuation
    }
  }

  /**
   * Periodic 4-second official REST closed-candle reconciliation
   * Guarantees that backgrounded tabs or missed WebSocket frames never miss a closed 1m candle
   */
  private startClosedCandlesSync(
    symbol: string,
    interval: string,
    onClosedCandlesSync?: (recentCandles: CandleData[]) => void
  ) {
    this.stopClosedCandlesSync();
    if (!onClosedCandlesSync) return;

    const runSync = async () => {
      if (this.isExplicitlyClosed) return;
      await this.syncOfficialClosedCandlesNow(symbol, interval, onClosedCandlesSync);
      if (!this.isExplicitlyClosed) {
        this.closedSyncTimer = window.setTimeout(runSync, 4000);
      }
    };

    this.closedSyncTimer = window.setTimeout(runSync, 4000);
  }

  private stopClosedCandlesSync() {
    if (this.closedSyncTimer) {
      clearTimeout(this.closedSyncTimer);
      this.closedSyncTimer = null;
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
    onStatusChange: (status: 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED') => void,
    onClosedCandlesSync?: (recentCandles: CandleData[]) => void
  ) {
    if (this.isPollingActive) return;
    this.isPollingActive = true;
    onStatusChange('CONNECTED');

    const poll = async () => {
      if (this.isExplicitlyClosed) return;
      try {
        const candles = await this.fetchHistoricalCandles(symbol, interval, 20);
        if (candles.length > 0) {
          if (onClosedCandlesSync) {
            onClosedCandlesSync(candles);
          } else {
            const latest = candles[candles.length - 1];
            onTick({ ...latest, isClosed: Boolean(latest.isClosed) }, Boolean(latest.isClosed));
          }
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
    this.stopClosedCandlesSync();
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
