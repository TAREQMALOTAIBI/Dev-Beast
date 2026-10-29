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
  private eventSource: EventSource | null = null;
  private status: LimitlessStatus = 'DISCONNECTED';
  private listeners: ((status: LimitlessStatus) => void)[] = [];
  private logListeners: ((log: WsMessageLog) => void)[] = [];
  private balanceListeners: ((newBalance: number) => void)[] = [];
  private orderbookListeners: ((book: OrderbookUpdate) => void)[] = [];
  private oracleListeners: ((oracle: OraclePriceData) => void)[] = [];
  private positionListeners: ((positions: PositionItem[]) => void)[] = [];
  private orderEventListeners: ((event: OrderEvent) => void)[] = [];
  private priceListeners: ((data: { marketSlug: string; prices: [number, number] }) => void)[] = [];
  private marketChangeListeners: ((market: any) => void)[] = [];
  private tradeGuardListeners: ((guard: any) => void)[] = [];

  private currentTradeGuard: any = null;
  private currentOrderbook: OrderbookUpdate | null = null;
  private currentOracle: OraclePriceData | null = null;
  private currentPositions: PositionItem[] = [];
  private isExplicitlyClosed = false;
  private activeMarketSlug = 'btc-up-or-down-hourly';
  private pollingTimer: number | null = null;
  private liveStateTimer: number | null = null;
  private credentials?: { apiKey?: string; tokenId?: string; secret?: string };

  /**
   * Continuous high-reliability sync via /api/limitless/live-state
   * Ensures uninterrupted data flow even when browser proxy interrupts or buffers SSE.
   */
  private startLiveStateSync() {
    this.stopLiveStateSync();
    const fetchState = async () => {
      if (this.isExplicitlyClosed) return;
      try {
        const res = await fetch('/api/limitless/live-state');
        if (!res.ok) return;
        const data = await res.json();
        if (data) {
          if (data.status && data.status !== 'DISCONNECTED') {
            if (data.status === 'ERROR' && (data.orderbook || data.market)) {
              const hasAuth = Boolean(this.credentials?.tokenId || this.credentials?.apiKey);
              this.setStatus(hasAuth ? 'AUTHENTICATED' : 'CONNECTED');
            } else {
              this.setStatus(data.status);
            }
          }
          if (data.market?.slug) {
            this.activeMarketSlug = data.market.slug;
          }
          if (data.orderbook) {
            const obWrapped = data.orderbook.orderbook ? data.orderbook : { marketSlug: data.market?.slug || this.activeMarketSlug, orderbook: data.orderbook, timestamp: Date.now() };
            this.currentOrderbook = obWrapped;
            this.orderbookListeners.forEach((l) => l(obWrapped));

            const ob = obWrapped.orderbook;
            if (typeof ob?.adjustedMidpoint === 'number' && ob.adjustedMidpoint > 0 && ob.adjustedMidpoint < 1) {
              const p0 = parseFloat(Number(ob.adjustedMidpoint).toFixed(4));
              const p1 = parseFloat((1 - p0).toFixed(4));
              this.priceListeners.forEach((l) =>
                l({ marketSlug: data.market?.slug || this.activeMarketSlug, prices: [p0, p1] })
              );
            }
          }
          if (data.oracle) {
            this.currentOracle = data.oracle;
            this.oracleListeners.forEach((l) => l(data.oracle));
          }
          if (data.positions && Array.isArray(data.positions.positions)) {
            this.currentPositions = data.positions.positions;
            this.positionListeners.forEach((l) => l(this.currentPositions));
          }
          if (data.market) {
            if (data.market.prices && Array.isArray(data.market.prices)) {
              this.priceListeners.forEach((l) =>
                l({ marketSlug: data.market.slug || this.activeMarketSlug, prices: data.market.prices })
              );
            }
            this.marketChangeListeners.forEach((l) => l(data.market));
          }
        }
      } catch {
        // Safe continuation
      }
    };

    fetchState();
    this.liveStateTimer = window.setInterval(fetchState, 1500);
  }

  private stopLiveStateSync() {
    if (this.liveStateTimer) {
      clearInterval(this.liveStateTimer);
      this.liveStateTimer = null;
    }
  }

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

  public subscribePriceUpdate(listener: (data: { marketSlug: string; prices: [number, number] }) => void) {
    this.priceListeners.push(listener);
    return () => {
      this.priceListeners = this.priceListeners.filter((l) => l !== listener);
    };
  }

  public subscribeMarketChange(listener: (market: any) => void) {
    this.marketChangeListeners.push(listener);
    return () => {
      this.marketChangeListeners = this.marketChangeListeners.filter((l) => l !== listener);
    };
  }

  public subscribeTradeGuard(listener: (guard: any) => void) {
    this.tradeGuardListeners.push(listener);
    if (this.currentTradeGuard !== undefined) {
      listener(this.currentTradeGuard);
    }
    return () => {
      this.tradeGuardListeners = this.tradeGuardListeners.filter((l) => l !== listener);
    };
  }

  public async fetchTradeGuard(): Promise<any> {
    try {
      const res = await fetch('/api/trade-guard');
      if (!res.ok) return null;
      const data = await res.json();
      if (data && data.success) {
        this.currentTradeGuard = data.guard || null;
        this.tradeGuardListeners.forEach((l) => l(this.currentTradeGuard));
        return this.currentTradeGuard;
      }
    } catch (err: any) {
      console.warn('[LimitlessService] fetchTradeGuard error:', err?.message);
    }
    return null;
  }

  public async saveTradeGuardOnVm(guard: any): Promise<boolean> {
    try {
      this.currentTradeGuard = guard;
      this.tradeGuardListeners.forEach((l) => l(guard));
      const res = await fetch('/api/trade-guard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(guard),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  public async clearTradeGuardOnVm(): Promise<boolean> {
    try {
      this.currentTradeGuard = null;
      this.tradeGuardListeners.forEach((l) => l(null));
      const res = await fetch('/api/trade-guard/clear', {
        method: 'POST',
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private setStatus(status: LimitlessStatus) {
    if (this.status !== status) {
      this.status = status;
      this.listeners.forEach((l) => l(status));
    }
  }

  public log(direction: 'INCOMING' | 'OUTGOING' | 'SYSTEM', data: Record<string, unknown> | string) {
    const entry: WsMessageLog = {
      id: Math.random().toString(36).substring(2, 9),
      channel: 'LIMITLESS',
      direction,
      timestamp: Date.now(),
      data,
    };
    this.logListeners.forEach((l) => l(entry));
  }

  public logDirect(direction: 'INCOMING' | 'OUTGOING' | 'SYSTEM', data: Record<string, unknown> | string) {
    this.log(direction, data);
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
   * Connect to Limitless Exchange live stream via official backend SDK WebSocket gateway
   */
  public connect(
    url: string = 'wss://ws.limitless.exchange',
    marketSlug: string = 'btc-up-or-down-hourly',
    credentials?: { apiKey?: string; tokenId?: string; secret?: string }
  ) {
    this.disconnect();
    this.isExplicitlyClosed = false;
    this.setStatus('CONNECTING');
    this.credentials = credentials;
    this.activeMarketSlug = marketSlug || 'btc-up-or-down-hourly';

    this.log('SYSTEM', `[LIMITLESS STREAM] Initializing live connection to Limitless Exchange Gateway...`);
    this.startLiveStateSync();

    // Connect to official Limitless WebSocketClient SSE stream provided by backend server
    try {
      if (typeof window !== 'undefined' && 'EventSource' in window) {
        const es = new EventSource('/api/limitless/live-stream');
        this.eventSource = es;

        es.onopen = () => {
          this.log('SYSTEM', '[LIMITLESS STREAM] Live stream connection established successfully.');
          const hasAuth = Boolean(this.credentials?.tokenId || this.credentials?.apiKey);
          this.setStatus(hasAuth ? 'AUTHENTICATED' : 'CONNECTED');
          this.stopOrderbookPolling();
          this.subscribeMarket(this.activeMarketSlug);
          this.discoverAndSubscribeActiveBtcMarket();
        };

        es.addEventListener('status', (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            if (data?.status === 'AUTHENTICATED' || data?.status === 'CONNECTED') {
              this.setStatus(data.status);
              this.stopOrderbookPolling();
            } else if (data?.status === 'CONNECTING') {
              this.setStatus('CONNECTING');
            }
          } catch {}
        });

        es.addEventListener('orderbookUpdate', (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            this.currentOrderbook = data;
            this.orderbookListeners.forEach((l) => l(data));
            if (this.status === 'CONNECTING') {
              const hasAuth = Boolean(this.credentials?.tokenId || this.credentials?.apiKey);
              this.setStatus(hasAuth ? 'AUTHENTICATED' : 'CONNECTED');
            }
            this.stopOrderbookPolling();
          } catch {}
        });

        es.addEventListener('priceUpdate', (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            if (data?.prices && Array.isArray(data.prices)) {
              this.priceListeners.forEach((l) => l(data));
            }
          } catch {}
        });

        es.addEventListener('marketChange', (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            if (data?.slug) {
              this.activeMarketSlug = data.slug;
              this.marketChangeListeners.forEach((l) => l(data));
            }
          } catch {}
        });

        es.addEventListener('oraclePriceData', (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            this.currentOracle = data;
            this.oracleListeners.forEach((l) => l(data));
          } catch {}
        });

        es.addEventListener('positions', (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            if (data && typeof data === 'object' && 'positions' in data && Array.isArray(data.positions)) {
              this.currentPositions = data.positions;
              this.positionListeners.forEach((l) => l(this.currentPositions));
            }
          } catch {}
        });

        es.addEventListener('orderEvent', (e: MessageEvent) => {
          try {
            const event = JSON.parse(e.data);
            this.log('INCOMING', { event: 'orderEvent', source: event.source, type: event.type, orderId: event.orderId });
            this.orderEventListeners.forEach((l) => l(event));
          } catch {}
        });

        es.addEventListener('tx', (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            this.log('INCOMING', { event: 'tx', txHash: data.txHash, status: data.status });
          } catch {}
        });

        es.addEventListener('system', (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            this.log('SYSTEM', data);
          } catch {}
        });

        es.addEventListener('tradeGuardUpdate', (e: MessageEvent) => {
          try {
            const data = e.data ? JSON.parse(e.data) : null;
            this.currentTradeGuard = data;
            this.tradeGuardListeners.forEach((l) => l(data));
          } catch {}
        });

        es.onerror = () => {
          // EventSource automatically attempts to reconnect on transient drops.
          // Only change status if connection was completely terminated.
          if (es.readyState === EventSource.CLOSED && !this.isExplicitlyClosed) {
            this.setStatus('CONNECTING');
            this.startOrderbookPolling(this.activeMarketSlug);
          }
        };
      }
    } catch (err) {
      this.setStatus('ERROR');
      const msg = err instanceof Error ? err.message : String(err);
      this.log('SYSTEM', `[LIMITLESS CONNECTION NOTICE] ${msg}. Using REST polling fallback.`);
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
    // Notify official backend SDK WebSocket to subscribe
    fetch('/api/limitless/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ marketSlug: slug }),
    }).catch(() => {});
    this.log('OUTGOING', { action: 'subscribe_market_prices', marketSlugs: [slug] });
    this.fetchInitialOrderbook(slug);
  }

  /**
   * Automatically discovers the active Hourly BTC prediction market from Limitless
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
          const match = json.data.find(
            (m: { slug?: string; title?: string }) =>
              (m.slug?.toLowerCase().includes('btc') || m.title?.toLowerCase().includes('btc')) &&
              (/hourly/i.test(m.slug || '') || /hourly/i.test(m.title || '') || /(^|[^0-9])1-hour/i.test(m.slug || '') || /1\s*hour/i.test(m.title || '') || /(^|[^0-9])1h/i.test(m.slug || '')) &&
              !/(^|[^0-9])5-min/i.test(m.slug || '') &&
              !/(^|[^0-9])15-min/i.test(m.slug || '') &&
              !/(^|[^0-9])5\s*min/i.test(m.title || '') &&
              !/(^|[^0-9])15\s*min/i.test(m.title || '')
          );
          discoveredSlug = match?.slug;
        }

        if (discoveredSlug && discoveredSlug !== this.activeMarketSlug) {
          this.log('SYSTEM', `[LIMITLESS DISCOVERY] Active Hourly BTC prediction market found: ${discoveredSlug}`);
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
              tokenId: ob.tokenId || '',
              bids: ob.bids || [],
              asks: ob.asks || [],
              adjustedMidpoint: ob.adjustedMidpoint ?? ob.midpoint ?? 0,
              maxSpread: ob.maxSpread ?? 0,
              minSize: ob.minSize ?? 0,
            },
            timestamp: Date.now(),
          };
          this.currentOrderbook = update;
          this.orderbookListeners.forEach((l) => l(update));

          const mid = update.orderbook.adjustedMidpoint;
          if (typeof mid === 'number' && mid > 0 && mid < 1) {
            const p0 = parseFloat(Number(mid).toFixed(4));
            const p1 = parseFloat((1 - p0).toFixed(4));
            this.priceListeners.forEach((l) => l({ marketSlug: slug, prices: [p0, p1] }));
          }
        }
      }
    } catch {
      // Fail silently
    }
  }

  /**
   * Starts periodic REST polling if live stream is disconnected or recovering
   */
  private startOrderbookPolling(slug: string) {
    if (this.pollingTimer) return;
    this.pollingTimer = window.setInterval(() => {
      if (this.eventSource && this.eventSource.readyState === EventSource.OPEN) {
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
    this.stopLiveStateSync();
    if (this.eventSource) {
      try {
        this.eventSource.close();
      } catch {}
      this.eventSource = null;
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
    onChunkUpdate: (chunk: ExecutedChunk) => void,
    direction: 'SHORT' | 'LONG' = 'SHORT',
    targetMarketSlug?: string,
    credentials?: { privateKey?: string; tokenId?: string; secret?: string; apiKey?: string }
  ): Promise<ExecutedChunk[]> {
    if (this.status !== 'CONNECTED' && this.status !== 'AUTHENTICATED') {
      this.log('SYSTEM', `[ORDER DISPATCH] WebSocket status is ${this.status}. Transmitting order via Limitless HTTP REST order execution proxy...`);
    }

    const resolvedSlug = (targetMarketSlug || this.activeMarketSlug || 'btc-up-or-down-hourly').trim();

    // Strict safety check: Never permit 5-minute or 15-minute contracts
    if (/(^|[^0-9])5-min/i.test(resolvedSlug) || /(^|[^0-9])15-min/i.test(resolvedSlug)) {
      const err = `Safety Guard Blocked: Execution rejected for '${resolvedSlug}'. The bot is restricted exclusively to 1-hour contracts (BTC Up or Down Hourly).`;
      this.log('SYSTEM', `[ORDER BLOCKED] ${err}`);
      throw new Error(err);
    }

    const executedChunks: ExecutedChunk[] = [];
    const outcome = direction === 'LONG' ? 'UP' : 'DOWN';
    const contractsToBuy = totalContracts;

    const orderPayload = {
      action: 'PLACE_ORDER',
      market: resolvedSlug,
      side: 'BUY',
      direction,
      outcome,
      type: orderType, // FAK or GTC
      price: priceCents,
      size: contractsToBuy,
      chunkId: 1,
      privateKey: credentials?.privateKey,
      tokenId: credentials?.tokenId,
      secret: credentials?.secret,
    };

    const chunkState: ExecutedChunk = {
      chunkId: 1,
      totalChunks: 1,
      contracts: contractsToBuy,
      price: priceCents,
      direction,
      status: 'QUEUED',
      delayMs: 0,
      timestamp: Date.now(),
      payload: orderPayload,
    };

    executedChunks.push(chunkState);
    onChunkUpdate({ ...chunkState });

    chunkState.status = 'SENDING';
    onChunkUpdate({ ...chunkState });

    this.log('OUTGOING', orderPayload);

    // Transmit to exchange via backend execution route in one single direct call
    try {
      const orderRes = await fetch('/api/limitless/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload),
      });
      const orderResult = await orderRes.json().catch(() => null);
      if (!orderRes.ok || (orderResult && orderResult.success === false) || orderResult?.mode === 'DRY_RUN_EIP712_PREVIEW' || orderResult?.mode === 'MISSING_CREDENTIALS') {
        const errMessage = orderResult?.error || orderResult?.message || `HTTP ${orderRes.status}: Order rejected by Limitless exchange`;
        chunkState.status = 'FAILED';
        chunkState.timestamp = Date.now();
        (chunkState as any).error = errMessage;
        onChunkUpdate({ ...chunkState });
        this.log('SYSTEM', `❌ [فشل تنفيذ الصفقة] ${errMessage}`);
        throw new Error(errMessage);
      }

      chunkState.status = 'SENT';
      chunkState.timestamp = Date.now();
      (chunkState as any).orderId = orderResult?.orderId;
      (chunkState as any).details = orderResult?.details;
      onChunkUpdate({ ...chunkState });
      soundController.playChunkExecuted(0);
      console.log(
        `🚀 Live Direct Order transmitted to Limitless: ${contractsToBuy} contracts @ $${priceCents} (${orderType}) [1% Max Risk - No Chunking]`
      );
    } catch (err: any) {
      chunkState.status = 'FAILED';
      chunkState.timestamp = Date.now();
      (chunkState as any).error = err?.message || String(err);
      onChunkUpdate({ ...chunkState });
      throw err;
    }

    return executedChunks;
  }
}

export const limitlessService = new LimitlessService();
