import { ExecutedChunk, WsMessageLog } from '../types/bot';
import { soundController } from '../utils/audio';

export type LimitlessStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'AUTHENTICATED' | 'ERROR';

export class LimitlessService {
  private ws: WebSocket | null = null;
  private status: LimitlessStatus = 'DISCONNECTED';
  private listeners: ((status: LimitlessStatus) => void)[] = [];
  private logListeners: ((log: WsMessageLog) => void)[] = [];
  private balanceListeners: ((newBalance: number) => void)[] = [];
  private reconnectTimer: number | null = null;
  private shouldReconnect = true;

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

  public connect(url: string, apiKey: string) {
    this.disconnect();
    this.shouldReconnect = true;
    this.setStatus('CONNECTING');
    this.log('SYSTEM', `[LIVE GATEWAY] Establishing WebSocket connection to ${url}`);

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.setStatus('CONNECTED');
        this.log('SYSTEM', '[LIVE GATEWAY] WebSocket connected successfully. Transmitting AUTH payload...');
        
        // Transmit real authentication frame as required by Limitless
        const authPayload = { type: 'AUTH', apiKey: apiKey || 'YOUR_API_KEY' };
        this.send(authPayload);
        this.setStatus('AUTHENTICATED');
      };

      this.ws.onmessage = (evt) => {
        try {
          const parsed = JSON.parse(evt.data.toString());
          this.log('INCOMING', parsed);

          // Update live balance from exchange message
          if (parsed.type === 'BALANCE_UPDATE' && typeof parsed.balance === 'number') {
            this.balanceListeners.forEach((l) => l(parsed.balance));
          }
        } catch {
          this.log('INCOMING', evt.data);
        }
      };

      this.ws.onerror = (err) => {
        this.setStatus('ERROR');
        this.log('SYSTEM', `[LIVE GATEWAY ERROR] WebSocket connection failure: ${url}. Verify network access and endpoint validity.`);
      };

      this.ws.onclose = (event) => {
        this.setStatus('DISCONNECTED');
        this.log('SYSTEM', `[LIVE GATEWAY] WebSocket closed (code: ${event.code}).`);
        
        if (this.shouldReconnect) {
          if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
          this.reconnectTimer = window.setTimeout(() => {
            this.log('SYSTEM', '[LIVE GATEWAY] Attempting auto-reconnection to Limitless Exchange...');
            this.connect(url, apiKey);
          }, 5000);
        }
      };
    } catch (err: unknown) {
      this.setStatus('ERROR');
      const msg = err instanceof Error ? err.message : String(err);
      this.log('SYSTEM', `[LIVE GATEWAY EXCEPTION] ${msg}`);
    }
  }

  public disconnect() {
    this.shouldReconnect = false;
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
    this.setStatus('DISCONNECTED');
  }

  public send(payload: Record<string, unknown>): boolean {
    this.log('OUTGOING', payload);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
      return true;
    } else {
      this.log('SYSTEM', '[WARNING] Order rejected locally: Limitless WebSocket is not connected or socket is not open.');
      return false;
    }
  }

  /**
   * Executes LIVE orders in staggered chunks directly on Limitless WebSocket
   * No simulation. Fails if WebSocket is closed.
   */
  public async executeChunkedOrder(
    totalContracts: number,
    priceCents: number,
    chunksCount: number,
    orderType: string,
    delayMs: number,
    onChunkUpdate: (chunk: ExecutedChunk) => void
  ): Promise<ExecutedChunk[]> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      const errorMsg = 'Cannot execute live trade: Limitless WebSocket is DISCONNECTED. Connect to exchange before trading.';
      this.log('SYSTEM', `[TRADE ABORTED] ${errorMsg}`);
      throw new Error(errorMsg);
    }

    const executedChunks: ExecutedChunk[] = [];
    const chunkSize = Math.floor(totalContracts / chunksCount);
    let remainingContracts = totalContracts;

    for (let i = 0; i < chunksCount; i++) {
      const contractsToBuy = i === chunksCount - 1 ? remainingContracts : chunkSize;
      remainingContracts -= contractsToBuy;

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

      // Staggered execution
      if (i > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      chunkState.status = 'SENDING';
      onChunkUpdate({ ...chunkState });

      const sent = this.send(orderPayload);
      if (sent) {
        chunkState.status = 'SENT';
        chunkState.timestamp = Date.now();
        onChunkUpdate({ ...chunkState });
        soundController.playChunkExecuted(i);
        console.log(`🚀 Live Chunk ${chunkId}/${chunksCount} transmitted: ${contractsToBuy} contracts @ $${priceCents}`);
      } else {
        chunkState.status = 'FAILED';
        onChunkUpdate({ ...chunkState });
        break;
      }
    }

    return executedChunks;
  }
}

export const limitlessService = new LimitlessService();
