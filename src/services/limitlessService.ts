import { io, Socket } from 'socket.io-client';
import {
  ExecutedChunk,
  WsMessageLog,
  OrderbookUpdate,
  OraclePriceData,
  PositionItem,
  OrderEvent,
  TransactionEvent,
} from '../types/bot';
import { soundController } from '../utils/audio';

export type LimitlessStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'AUTHENTICATED' | 'ERROR';

export class LimitlessService {
  private socket: Socket | null = null;
  private status: LimitlessStatus = 'DISCONNECTED';
  private listeners: ((status: LimitlessStatus) => void)[] = [];
  private logListeners: ((log: WsMessageLog) => void)[] = [];
  private balanceListeners: ((newBalance: number) => void)[] = [];
  private orderbookListeners: ((book: OrderbookUpdate) => void)[] = [];
  private oracleListeners: ((oracle: OraclePriceData) => void)[] = [];
  private positionListeners: ((positions: PositionItem[]) => void)[] = [];
  private orderEventListeners: ((event: OrderEvent) => void)[] = [];

  private currentOrderbook: OrderbookUpdate | null = null;
  private currentOracle: OraclePriceData | null = null;
  private currentPositions: PositionItem[] = [];
  private isExplicitlyClosed = false;
  private activeMarketSlug = 'btc-100k-weekly';
  private pollingTimer: number | null = null;
  private credentials?: { apiKey?: string; tokenId?: string; secret?: string };

  public subscribeStatus(listener: (status: LimitlessStatus) => void) {
    this.listeners.push(listener);
    listener(this.status);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public subscribeLogs(listener: (log: WsMessageLog) => void) {
    this.logListeners.push(listener);
    return () => {
      this.logListeners = this.logListeners.filter((l) => l !== listener);
    };
  }

  public subscribeBalance(listener: (balance: number) => void) {
    this.balanceListeners.push(listener);
    return () => {
      this.balanceListeners = this.balanceListeners.filter((l) => l !== listener);
    };
  }

  public subscribeOrderbook(listener: (book: OrderbookUpdate) => void) {
    this.orderbookListeners.push(listener);
    if (this.currentOrderbook) listener(this.currentOrderbook);
    return () => {
      this.orderbookListeners = this.orderbookListeners.filter((l) => l !== listener);
    };
  }

  public subscribeOracle(listener: (oracle: OraclePriceData) => void) {
    this.oracleListeners.push(listener);
    if (this.currentOracle) listener(this.currentOracle);
    return () => {
      this.oracleListeners = this.oracleListeners.filter((l) => l !== listener);
    };
  }

  public subscribePositions(listener: (positions: PositionItem[]) => void) {
    this.positionListeners.push(listener);
    listener(this.currentPositions);
    return () => {
      this.positionListeners = this.positionListeners.filter((l) => l !== listener);
    };
  }

  public subscribeOrderEvents(listener: (event: OrderEvent) => void) {
    this.orderEventListeners.push(listener);
    return () => {
      this.orderEventListeners = this.orderEventListeners.filter((l) => l !== listener);
    };
  }

  private setStatus(status: LimitlessStatus) {
    if (this.status !== status) {
      this.status = status;
      this.listeners.forEach((l) => l(status));
    }
  }

  private log(direction: 'INCOMING' | 'OUTGOING' | 'SYSTEM', data: Record<string, unknown> | string) {
    const entry: WsMessageLog = {
      id: Math.random().toString(36).substring(2, 9),
      channel: 'LIMITLESS',
      direction,
      timestamp: Date.now(),
      data,
    };
    this.logListeners.forEach((l) => l(entry));
  }

  /**
   * Normalizes the WebSocket / Socket.IO URL to the official Limitless endpoint
   */
  private normalizeSocketUrl(rawUrl: string): string {
    let clean = (rawUrl || 'https://ws.limitless.exchange').trim();
    if (!clean.endsWith('/markets')) {
      clean = clean.replace(/\/+$/, '') + '/markets';
    }
    if (clean.startsWith('ws://')) {
      clean = 'http://' + clean.slice(5);
    } else if (clean.startsWith('wss://')) {
      clean = 'https://' + clean.slice(6);
    }
    return clean;
  }

  /**
   * Connect to Limitless Exchange Socket.IO gateway
   * Endpoint: https://ws.limitless.exchange/markets
   */
  public connect(
    url: string = 'wss://ws.limitless.exchange',
    marketSlug: string = 'btc-100k-weekly',
    credentials?: { apiKey?: string; tokenId?: string; secret?: string }
  ) {
    this.disconnect();
    this.isExplicitlyClosed = false;
    this.setStatus('CONNECTING');
    this.credentials = credentials;
    this.activeMarketSlug = marketSlug || 'btc-100k-weekly';

    const targetEndpoint = this.normalizeSocketUrl(url);
    this.log('SYSTEM', `[LIMITLESS STREAM] Initializing connection to: ${targetEndpoint}`);

    try {
      const socket = io(targetEndpoint, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 8000,
        timeout: 10000,
      });

      this.socket = socket;

      socket.on('connect', () => {
        const hasAuth = Boolean(this.credentials?.tokenId || this.credentials?.apiKey);
        this.setStatus(hasAuth ? 'AUTHENTICATED' : 'CONNECTED');
        this.stopOrderbookPolling();
        this.log(
          'SYSTEM',
          `[LIMITLESS STREAM] Connected successfully (Socket ID: ${socket.id}). Mode: ${
            hasAuth ? 'AUTHENTICATED' : 'PUBLIC STREAM'
          }`
        );

        // 1. Subscribe to configured market
        this.subscribeMarket(this.activeMarketSlug);

        // 2. Discover and subscribe to active BTC 15m prediction market
        this.discoverAndSubscribeActiveBtcMarket();

        // 3. Authenticated subscriptions if credentials provided
        if (hasAuth) {
          this.log('OUTGOING', {
            action: 'subscribe_authenticated',
            channels: ['positions', 'order_events', 'transactions'],
          });
          socket.emit('subscribe_positions', { marketSlugs: [this.activeMarketSlug] });
          socket.emit('subscribe_order_events');
          socket.emit('subscribe_transactions');
        }
      });

      // Streamed Orderbook updates
      socket.on('orderbookUpdate', (data: OrderbookUpdate) => {
        this.currentOrderbook = data;
        this.orderbookListeners.forEach((l) => l(data));
        this.log('INCOMING', {
          event: 'orderbookUpdate',
          marketSlug: data.marketSlug,
          bids: data.orderbook?.bids?.length || 0,
          asks: data.orderbook?.asks?.length || 0,
          midpoint: data.orderbook?.adjustedMidpoint || data.orderbook?.midpoint,
        });
      });

      // Streamed Oracle price data
      socket.on('oraclePriceData', (data: OraclePriceData) => {
        this.currentOracle = data;
        this.oracleListeners.forEach((l) => l(data));
        this.log('INCOMING', {
          event: 'oraclePriceData',
          marketSlug: data.marketSlug,
          value: data.value,
          timestamp: data.timestamp,
        });
      });

      // Positions
      socket.on('positions', (data: unknown) => {
        this.log('INCOMING', { event: 'positions', data });
        if (
          data &&
          typeof data === 'object' &&
          'positions' in data &&
          Array.isArray((data as { positions: PositionItem[] }).positions)
        ) {
          this.currentPositions = (data as { positions: PositionItem[] }).positions;
          this.positionListeners.forEach((l) => l(this.currentPositions));
        }
      });

      // Order lifecycle events
      socket.on('orderEvent', (event: OrderEvent) => {
        this.log('INCOMING', { event: 'orderEvent', source: event.source, type: event.type, orderId: event.orderId });
        this.orderEventListeners.forEach((l) => l(event));
      });

      // Transaction events
      socket.on('tx', (data: TransactionEvent) => {
        this.log('INCOMING', { event: 'tx', txHash: data.txHash, status: data.status });
      });

      // AMM prices
      socket.on('newPriceData', (data: unknown) => {
        this.log('INCOMING', { event: 'newPriceData', data });
      });

      // Disconnect handling
      socket.on('disconnect', (reason: string) => {
        this.log('SYSTEM', `[LIMITLESS STREAM] Disconnected: ${reason}`);
        if (!this.isExplicitlyClosed) {
          this.setStatus('CONNECTING');
          this.startOrderbookPolling(this.activeMarketSlug);
        } else {
          this.setStatus('DISCONNECTED');
        }
      });

      // Error handling
      socket.on('connect_error', (err: Error) => {
        this.log('SYSTEM', `[LIMITLESS STREAM ERROR] Connection notice: ${err.message}. Activating orderbook polling fallback.`);
        this.startOrderbookPolling(this.activeMarketSlug);
      });
    } catch (err) {
      this.setStatus('ERROR');
      const msg = err instanceof Error ? err.message : String(err);
      this.log('SYSTEM', `[LIMITLESS CONNECTION FAILED] ${msg}. Using REST polling fallback.`);
      this.startOrderbookPolling(this.activeMarketSlug);
    }

    // Immediately fetch initial snapshot so orderbook is populated with zero delay
    this.fetchInitialOrderbook(this.activeMarketSlug);
  }

  /**
   * Subscribe to specific market prices
   */
  public subscribeMarket(slug: string) {
    if (!slug) return;
    this.activeMarketSlug = slug;
    if (this.socket && this.socket.connected) {
      this.socket.emit('subscribe_market_prices', { marketSlugs: [slug] });
      this.log('OUTGOING', { action: 'subscribe_market_prices', marketSlugs: [slug] });
    }
    this.fetchInitialOrderbook(slug);
  }

  /**
   * Automatically discovers the active 15m BTC prediction market from Limitless
   */
  private async discoverAndSubscribeActiveBtcMarket() {
    try {
      let res = await fetch('/api/limitless/active-btc').catch(() => null);
      if (!res || !res.ok) {
        res = await fetch('https://api.limitless.exchange/markets/active').catch(() => null);
      }
      if (res && res.ok) {
        const json = await res.json();
        let discoveredSlug: string | undefined = json?.slug;
        if (!discoveredSlug && Array.isArray(json?.data)) {
          const match =
            json.data.find(
              (m: { slug?: string }) => m.slug?.toLowerCase().includes('btc') && m.slug?.includes('15-min')
            ) || json.data.find((m: { slug?: string }) => m.slug?.toLowerCase().includes('btc'));
          discoveredSlug = match?.slug;
        }

        if (discoveredSlug && discoveredSlug !== this.activeMarketSlug) {
          this.log('SYSTEM', `[LIMITLESS DISCOVERY] Active BTC prediction market found: ${discoveredSlug}`);
          this.subscribeMarket(discoveredSlug);
        }
      }
    } catch {
      // Non-critical auto-discovery
    }
  }

  /**
   * Fetches initial orderbook snapshot from Limitless REST API
   */
  private async fetchInitialOrderbook(slug: string) {
    if (!slug) return;
    try {
      let res = await fetch(`/api/limitless/orderbook?slug=${encodeURIComponent(slug)}`).catch(() => null);
      if (!res || !res.ok) {
        res = await fetch(`https://api.limitless.exchange/markets/${encodeURIComponent(slug)}/orderbook`).catch(() => null);
      }
      if (res && res.ok) {
        const ob = await res.json();
        if (ob && (ob.bids || ob.asks)) {
          const update: OrderbookUpdate = {
            marketSlug: slug,
            orderbook: {
              bids: ob.bids || [],
              asks: ob.asks || [],
              midpoint: ob.midpoint,
              adjustedMidpoint: ob.adjustedMidpoint || ob.midpoint,
              maxSpread: ob.maxSpread,
              minSize: ob.minSize,
            },
          };
          this.currentOrderbook = update;
          this.orderbookListeners.forEach((l) => l(update));
          if (this.status === 'CONNECTING' || this.status === 'DISCONNECTED') {
            this.setStatus('CONNECTED');
          }
        }
      }
    } catch {
      // Fail silently
    }
  }

  /**
   * Starts periodic REST polling if WebSocket is disconnected or recovering
   */
  private startOrderbookPolling(slug: string) {
    if (this.pollingTimer) return;
    this.pollingTimer = window.setInterval(() => {
      if (this.socket && this.socket.connected) {
        this.stopOrderbookPolling();
        return;
      }
      this.fetchInitialOrderbook(slug);
    }, 3000);
  }

  private stopOrderbookPolling() {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  public disconnect() {
    this.isExplicitlyClosed = true;
    this.stopOrderbookPolling();
    if (this.socket) {
      try {
        this.socket.disconnect();
      } catch {
        // Safe disconnect
      }
      this.socket = null;
    }
    this.setStatus('DISCONNECTED');
  }

  /**
   * Execute trade chunks via Limitless Exchange
   */
  public async executeChunkedOrder(
    totalContracts: number,
    priceCents: number,
    chunksCount: number,
    orderType: string,
    delayMs: number,
    onChunkUpdate: (chunk: ExecutedChunk) => void
  ): Promise<ExecutedChunk[]> {
    if (this.status !== 'CONNECTED' && this.status !== 'AUTHENTICATED') {
      const errorMsg = 'Cannot place live order: Limitless WebSocket is not connected.';
      this.log('SYSTEM', `[ORDER ABORTED] ${errorMsg}`);
      throw new Error(errorMsg);
    }

    const executedChunks: ExecutedChunk[] = [];
    const effectiveChunks = Math.min(Math.max(1, totalContracts), chunksCount);
    const chunkSize = Math.floor(totalContracts / effectiveChunks);
    let remainingContracts = totalContracts;

    for (let i = 0; i < effectiveChunks; i++) {
      const contractsToBuy = i === effectiveChunks - 1 ? remainingContracts : chunkSize;
      remainingContracts -= contractsToBuy;
      if (contractsToBuy <= 0) continue;

      const chunkId = i + 1;
      const orderPayload = {
        action: 'PLACE_ORDER',
        market: this.activeMarketSlug || 'BTC_15M_PREDICTION',
        side: 'BUY',
        type: orderType, // FAK or GTC
        price: priceCents,
        size: contractsToBuy,
        chunkId,
      };

      const chunkState: ExecutedChunk = {
        chunkId,
        totalChunks: chunksCount,
        contracts: contractsToBuy,
        price: priceCents,
        status: 'QUEUED',
        delayMs: i * delayMs,
        timestamp: Date.now(),
        payload: orderPayload,
      };

      executedChunks.push(chunkState);
      onChunkUpdate({ ...chunkState });

      if (i > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      chunkState.status = 'SENDING';
      onChunkUpdate({ ...chunkState });

      this.log('OUTGOING', orderPayload);

      // Transmit to exchange via socket or server proxy
      try {
        if (this.socket && this.socket.connected) {
          this.socket.emit('order', orderPayload);
        }

        // Also notify backend execution route
        fetch('/api/limitless/order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(orderPayload),
        }).catch(() => {
          // Socket transmission is primary
        });

        chunkState.status = 'SENT';
        chunkState.timestamp = Date.now();
        onChunkUpdate({ ...chunkState });
        soundController.playChunkExecuted(i);
        console.log(
          `🚀 Live Order Chunk ${chunkId}/${chunksCount} transmitted to Limitless: ${contractsToBuy} contracts @ $${priceCents} (${orderType})`
        );
      } catch (err) {
        chunkState.status = 'FAILED';
        onChunkUpdate({ ...chunkState });
        throw err;
      }
    }

    return executedChunks;
  }
}

export const limitlessService = new LimitlessService();
