import WebSocket from "ws";
import { EventEmitter } from "events";
import { createLogger } from "../utils/logger";
import { analyzeVolatility } from "./volatilityService";
import type { Tick, Candle } from "@shared/schema";

const logger = createLogger("DerivFeed");

const DERIV_WS_URL = "wss://ws.binaryws.com/websockets/v3?app_id=1089";
const RECONNECT_DELAY = 5000;
const PING_INTERVAL = 30000;
const MAX_RECONNECT_ATTEMPTS = 10;

interface DerivTickResponse {
  tick?: {
    symbol: string;
    quote: number;
    epoch: number;
  };
  error?: {
    code: string;
    message: string;
  };
}

interface DerivHistoryResponse {
  candles?: Array<{
    epoch: number;
    open: number;
    high: number;
    low: number;
    close: number;
  }>;
  error?: {
    code: string;
    message: string;
  };
}

export class DerivFeed extends EventEmitter {
  private ws: WebSocket | null = null;
  private subscriptions: Map<string, Set<string>> = new Map();
  private reconnectAttempts = 0;
  private isConnecting = false;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pendingRequests: Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }> = new Map();
  private requestId = 0;

  constructor() {
    super();
    this.connect();
  }

  connect(): void {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.isConnecting = true;
    logger.info("Connecting to Deriv WebSocket...");

    try {
      this.ws = new WebSocket(DERIV_WS_URL);

      this.ws.on("open", () => {
        logger.info("Connected to Deriv WebSocket");
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.startPingTimer();
        this.resubscribeAll();
        this.emit("connected");
      });

      this.ws.on("message", (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          logger.error("Failed to parse message", error);
        }
      });

      this.ws.on("error", (error) => {
        logger.error("WebSocket error", error);
        this.emit("error", error);
      });

      this.ws.on("close", () => {
        logger.warn("WebSocket closed");
        this.isConnecting = false;
        this.stopPingTimer();
        this.emit("disconnected");
        this.scheduleReconnect();
      });
    } catch (error) {
      logger.error("Failed to create WebSocket", error);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      logger.error("Max reconnection attempts reached");
      this.emit("maxReconnectAttempts");
      return;
    }

    this.reconnectAttempts++;
    const delay = RECONNECT_DELAY * Math.min(this.reconnectAttempts, 5);
    logger.info(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  private startPingTimer(): void {
    this.stopPingTimer();
    this.pingTimer = setInterval(() => {
      this.send({ ping: 1 });
    }, PING_INTERVAL);
  }

  private stopPingTimer(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private handleMessage(message: Record<string, unknown>): void {
    const msgType = message.msg_type as string;
    const reqId = message.req_id;
    const reqIdStr = reqId !== undefined ? String(reqId) : undefined;

    if (reqIdStr && this.pendingRequests.has(reqIdStr)) {
      const pending = this.pendingRequests.get(reqIdStr)!;
      this.pendingRequests.delete(reqIdStr);
      
      if (message.error) {
        pending.reject(new Error((message.error as { message: string }).message));
      } else {
        pending.resolve(message);
      }
      return;
    }

    switch (msgType) {
      case "tick":
        this.handleTick(message as unknown as DerivTickResponse);
        break;
      case "candles":
        break;
      case "ping":
        break;
      case "pong":
        break;
      default:
        if (message.error) {
          logger.error("API Error", message.error);
        }
    }
  }

  private handleTick(response: DerivTickResponse): void {
    if (response.error) {
      logger.error("Tick error", response.error);
      return;
    }

    if (response.tick) {
      const tick: Tick = {
        symbol: response.tick.symbol,
        price: response.tick.quote,
        timestamp: response.tick.epoch,
        epoch: response.tick.epoch,
      };

      if (!isFinite(tick.price) || tick.price <= 0) {
        logger.warn("Invalid tick price", tick);
        return;
      }

      this.emit("tick", tick);
      this.emit(`tick:${tick.symbol}`, tick);
    }
  }

  private send(data: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private sendRequest<T>(data: Record<string, unknown>): Promise<T> {
    return new Promise((resolve, reject) => {
      const reqId = ++this.requestId;
      const reqIdStr = String(reqId);
      data.req_id = reqId;

      this.pendingRequests.set(reqIdStr, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });

      setTimeout(() => {
        if (this.pendingRequests.has(reqIdStr)) {
          this.pendingRequests.delete(reqIdStr);
          reject(new Error("Request timeout"));
        }
      }, 30000);

      this.send(data);
    });
  }

  private resubscribeAll(): void {
    for (const [symbol] of this.subscriptions) {
      this.send({
        ticks: symbol,
        subscribe: 1,
      });
    }
    logger.info(`Resubscribed to ${this.subscriptions.size} symbols`);
  }

  async subscribeTicks(symbol: string, listenerId: string): Promise<void> {
    if (!this.subscriptions.has(symbol)) {
      this.subscriptions.set(symbol, new Set());
    }
    this.subscriptions.get(symbol)!.add(listenerId);

    if (this.subscriptions.get(symbol)!.size === 1) {
      this.send({
        ticks: symbol,
        subscribe: 1,
      });
      logger.info(`Subscribed to ticks for ${symbol}`);
    }
  }

  async unsubscribeTicks(symbol: string, listenerId: string): Promise<void> {
    const listeners = this.subscriptions.get(symbol);
    if (listeners) {
      listeners.delete(listenerId);
      if (listeners.size === 0) {
        this.subscriptions.delete(symbol);
        this.send({
          forget_all: "ticks",
        });
        logger.info(`Unsubscribed from ticks for ${symbol}`);
      }
    }
  }

  async fetchCandleHistory(
    symbol: string,
    granularity: number,
    count: number = 300
  ): Promise<Candle[]> {
    try {
      const response = await this.sendRequest<DerivHistoryResponse>({
        ticks_history: symbol,
        style: "candles",
        granularity,
        count,
        end: "latest",
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.candles || !Array.isArray(response.candles)) {
        return [];
      }

      const candles = response.candles.map((c) => ({
        symbol,
        timeframe: granularity,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        timestamp: c.epoch,
        tickCount: 0,
        isForming: false,
      }));
      
      if (candles.length >= 50) {
        const volatility = analyzeVolatility(candles, symbol);
        this.emit("volatilityUpdate", symbol, volatility);
        logger.debug(`Volatility update for ${symbol}: score=${volatility.volatilityScore.toFixed(2)}, stable=${!volatility.isVolatile}`);
      }
      
      return candles;
    } catch (error) {
      logger.error(`Failed to fetch candle history for ${symbol}`, error);
      return [];
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  disconnect(): void {
    this.stopPingTimer();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.subscriptions.clear();
    this.pendingRequests.clear();
  }
}

export const derivFeed = new DerivFeed();
