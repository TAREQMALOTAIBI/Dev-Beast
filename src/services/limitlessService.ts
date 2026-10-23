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
  private client: unknown = null;
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
    this.status = status;
    this.listeners.forEach((l) => l(status));
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
   * Connect to Limitless WebSocket server according to official documentation
   * Endpoint: wss://ws.limitless.exchange
   */
  public async connect(
    url: string = 'wss://ws.limitless.exchange',
    marketSlug: string = 'btc-100k-weekly',
    credentials?: { apiKey?: string; tokenId?: string; secret?: string }
  ) {
    this.disconnect();
    this.setStatus('CONNECTING');
    this.log('SYSTEM', `[LIMITLESS SDK] Connecting to Limitless Streaming Server: ${url}`);

    try {
      // Dynamically import official @limitless-exchange/sdk
      const { WebSocketClient } = await import('@limitless-exchange/sdk');

      const clientConfig: Record<string, unknown> = {
        url: url || 'wss://ws.limitless.exchange',
        autoReconnect: true,
        timeout: 10000,
      };

      const hasHmac = Boolean(credentials?.tokenId && credentials?.secret);
      const hasApiKey = Boolean(credentials?.apiKey);

      if (hasHmac) {
        clientConfig.hmacCredentials = {
          tokenId: credentials!.tokenId,
          secret: credentials!.secret,
        };
      } else if (hasApiKey) {
        clientConfig.apiKey = credentials!.apiKey;
      }

      const ws = new WebSocketClient(clientConfig);
      this.client = ws;

      await ws.connect();
      this.setStatus(hasHmac || hasApiKey ? 'AUTHENTICATED' : 'CONNECTED');
      this.log('SYSTEM', `[LIMITLESS SDK] Connected successfully. Mode: ${hasHmac || hasApiKey ? 'AUTHENTICATED' : 'PUBLIC STREAM'}`);

      // 1. Subscribe to public market prices
      const targetSlug = marketSlug || 'btc-100k-weekly';
      try {
        await ws.subscribe('subscribe_market_prices', {
          marketSlugs: [targetSlug],
        });
        this.log('OUTGOING', { action: 'subscribe_market_prices', marketSlugs: [targetSlug] });
      } catch (err) {
        this.log('SYSTEM', `[LIMITLESS] Market price subscription: ${err instanceof Error ? err.message : String(err)}`);
      }

      // 2. Subscribe to authenticated channels if credentials present
      if (hasHmac || hasApiKey) {
        try {
          await ws.subscribe('subscribe_positions', { marketSlugs: [targetSlug] });
          await ws.subscribe('subscribe_order_events');
          await ws.subscribe('subscribe_transactions');
          this.log('OUTGOING', { action: 'subscribe_authenticated', channels: ['positions', 'order_events', 'tx'] });
        } catch (err) {
          this.log('SYSTEM', `[LIMITLESS] Auth subscription: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // Event Listeners from official docs
      ws.on('orderbookUpdate', (data: OrderbookUpdate) => {
        this.currentOrderbook = data;
        this.orderbookListeners.forEach((l) => l(data));
        this.log('INCOMING', {
          event: 'orderbookUpdate',
          marketSlug: data.marketSlug,
          bids: data.orderbook?.bids?.length || 0,
          asks: data.orderbook?.asks?.length || 0,
          midpoint: data.orderbook?.adjustedMidpoint,
        });
      });

      ws.on('oraclePriceData', (data: OraclePriceData) => {
        this.currentOracle = data;
        this.oracleListeners.forEach((l) => l(data));
        this.log('INCOMING', {
          event: 'oraclePriceData',
          marketSlug: data.marketSlug,
          value: data.value,
          timestamp: data.timestamp,
        });
      });

      ws.on('positions', (data: unknown) => {
        this.log('INCOMING', { event: 'positions', data });
        if (data && typeof data === 'object' && 'positions' in data && Array.isArray((data as { positions: PositionItem[] }).positions)) {
          this.currentPositions = (data as { positions: PositionItem[] }).positions;
          this.positionListeners.forEach((l) => l(this.currentPositions));
        }
      });

      ws.on('orderEvent', (event: OrderEvent) => {
        this.log('INCOMING', { event: 'orderEvent', source: event.source, type: event.type, orderId: event.orderId });
        this.orderEventListeners.forEach((l) => l(event));
      });

      ws.on('tx', (data: TransactionEvent) => {
        this.log('INCOMING', { event: 'tx', txHash: data.txHash, status: data.status });
      });

      ws.on('disconnect', (reason: string) => {
        this.setStatus('DISCONNECTED');
        this.log('SYSTEM', `[LIMITLESS SDK] Disconnected: ${reason}`);
      });

      ws.on('error', (err: unknown) => {
        this.setStatus('ERROR');
        this.log('SYSTEM', `[LIMITLESS SDK ERROR] ${err instanceof Error ? err.message : String(err)}`);
      });

    } catch (err: unknown) {
      this.setStatus('ERROR');
      const msg = err instanceof Error ? err.message : String(err);
      this.log('SYSTEM', `[LIMITLESS CONNECTION FAILED] ${msg}. Using direct WebSocket fallback.`);
      this.fallbackRawWebSocket(url, credentials?.apiKey);
    }
  }

  /**
   * Fallback to direct raw WebSocket if SDK fails to load in specific runtime
   */
  private fallbackRawWebSocket(url: string, apiKey?: string) {
    try {
      const ws = new WebSocket(url || 'wss://ws.limitless.exchange');
      this.client = ws;

      ws.onopen = () => {
        this.setStatus('CONNECTED');
        this.log('SYSTEM', '[LIMITLESS RAW WS] Connected. Sending AUTH packet...');
        if (apiKey) {
          ws.send(JSON.stringify({ type: 'AUTH', apiKey }));
          this.setStatus('AUTHENTICATED');
        }
      };

      ws.onmessage = (evt) => {
        try {
          const parsed = JSON.parse(evt.data.toString());
          this.log('INCOMING', parsed);
          if (parsed.type === 'BALANCE_UPDATE' && typeof parsed.balance === 'number') {
            this.balanceListeners.forEach((l) => l(parsed.balance));
          }
        } catch {
          this.log('INCOMING', evt.data);
        }
      };

      ws.onclose = () => {
        this.setStatus('DISCONNECTED');
      };
    } catch {
      this.setStatus('ERROR');
    }
  }

  public disconnect() {
    if (this.client) {
      try {
        const c = this.client as { disconnect?: () => Promise<void> | void; close?: () => void };
        if (typeof c.disconnect === 'function') {
          c.disconnect();
        } else if (typeof c.close === 'function') {
          c.close();
        }
      } catch {
        // Safe close
      }
      this.client = null;
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
        market: 'BTC_15M_PREDICTION',
        side: 'BUY',
        type: orderType, // GTC
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

      // Transmit to exchange
      try {
        if (this.client && 'socket' in (this.client as Record<string, unknown>)) {
          const c = this.client as { socket?: { emit: (ev: string, data: unknown) => void } };
          c.socket?.emit('order', orderPayload);
        } else if (this.client && 'send' in (this.client as Record<string, unknown>)) {
          (this.client as WebSocket).send(JSON.stringify(orderPayload));
        }

        chunkState.status = 'SENT';
        chunkState.timestamp = Date.now();
        onChunkUpdate({ ...chunkState });
        soundController.playChunkExecuted(i);
        console.log(`🚀 Live Chunk ${chunkId}/${chunksCount} transmitted to Limitless: ${contractsToBuy} contracts @ $${priceCents}`);
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
