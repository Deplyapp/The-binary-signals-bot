import { EventEmitter } from "events";
import { derivFeed } from "./derivFeed";
import { candleAggregator } from "./candleAggregator";
import { generateSignal } from "./signalEngine";
import { SIGNAL_CONFIG } from "../config/indicators";
import { getCandleCloseTime, nowEpoch } from "../utils/time";
import { createLogger } from "../utils/logger";
import { getVolatilityInfo, shouldNoTrade } from "./volatilityService";
import { detectMarketRegime, shouldTradeInCurrentCondition } from "./marketRegimeDetector";
import type { Session, SessionOptions, SignalResult, Candle, UserPreferences } from "@shared/schema";

const logger = createLogger("SessionManager");

interface ActiveSession extends Session {
  signalTimer?: ReturnType<typeof setTimeout>;
  lastSignalCandleTimestamp?: number;
  preferences?: UserPreferences;
}

class SessionManager extends EventEmitter {
  private sessions: Map<string, ActiveSession> = new Map();
  private tickHandlers: Map<string, (tick: unknown) => void> = new Map();
  private candleCloseHandler: ((symbol: string, timeframe: number, closedCandle: Candle) => void) | null = null;

  constructor() {
    super();
    this.setupDerivListeners();
    this.setupCandleCloseListener();
  }

  private setupDerivListeners(): void {
    derivFeed.on("connected", () => {
      logger.info("Deriv feed connected - restarting active sessions");
      for (const session of this.sessions.values()) {
        if (session.status === "active") {
          this.restartSession(session.id);
        }
      }
    });

    derivFeed.on("disconnected", () => {
      logger.warn("Deriv feed disconnected");
      this.emit("feedDisconnected");
    });
  }

  private setupCandleCloseListener(): void {
    this.candleCloseHandler = (symbol: string, timeframe: number, closedCandle: Candle) => {
      for (const session of this.sessions.values()) {
        if (session.status === "active" && session.symbol === symbol && session.timeframe === timeframe) {
          const candleKey = `${symbol}-${timeframe}-${closedCandle.timestamp}`;
          const lastKey = session.lastSignalCandleTimestamp 
            ? `${symbol}-${timeframe}-${session.lastSignalCandleTimestamp}`
            : null;
          
          if (candleKey !== lastKey) {
            logger.info(`Candle closed for ${symbol} ${timeframe}s - emitting signal immediately (session ${session.id})`);
            this.emitCandleCloseSignal(session.id, closedCandle);
            session.lastSignalCandleTimestamp = closedCandle.timestamp;
          } else {
            logger.debug(`Skipping duplicate signal for candle ${closedCandle.timestamp}`);
          }
        }
      }
    };

    candleAggregator.on("closed", this.candleCloseHandler);
    logger.info("Candle close listener initialized - signals will be sent WHEN candles close");
  }

  async startSession(
    sessionId: string,
    chatId: number,
    symbol: string,
    timeframe: number,
    preferences?: UserPreferences,
    options?: SessionOptions
  ): Promise<Session> {
    if (this.sessions.has(sessionId)) {
      throw new Error(`Session ${sessionId} already exists`);
    }

    logger.info(`Starting session ${sessionId} for ${symbol} ${timeframe}s`);

    const historyCandles = await derivFeed.fetchCandleHistory(symbol, timeframe, SIGNAL_CONFIG.historyCandles);
    
    candleAggregator.initialize(symbol, timeframe, historyCandles, 500);

    const session: ActiveSession = {
      id: sessionId,
      chatId,
      symbol,
      timeframe,
      status: "active",
      startedAt: nowEpoch(),
      options: {
        ...options,
        timezone: preferences?.timezone,
        confidenceFilter: preferences?.confidenceFilter,
      },
      preferences,
    };

    this.sessions.set(sessionId, session);

    const tickHandler = (tick: { symbol: string; price: number; timestamp: number }) => {
      if (tick.symbol === symbol) {
        this.onTick(sessionId, tick);
      }
    };

    this.tickHandlers.set(sessionId, tickHandler);
    derivFeed.on(`tick:${symbol}`, tickHandler);

    await derivFeed.subscribeTicks(symbol, sessionId);

    this.emit("sessionStarted", session);
    logger.info(`Session ${sessionId} started successfully - signals will emit on candle close`);

    return session;
  }

  private onTick(sessionId: string, tick: { symbol: string; price: number; timestamp: number }): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== "active") return;

    candleAggregator.processTick(
      { ...tick, epoch: tick.timestamp },
      session.timeframe
    );
  }

  private emitCandleCloseSignal(sessionId: string, closedCandle: Candle): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== "active") return;

    const closedCandles = candleAggregator.getClosedCandles(session.symbol, session.timeframe);
    const formingCandle = candleAggregator.getFormingCandle(session.symbol, session.timeframe);
    const candleCloseTime = closedCandle.timestamp + session.timeframe;

    const marketCondition = detectMarketRegime(closedCandles);
    logger.debug(`Market condition for ${session.symbol}: ${marketCondition.regime} (tradeable: ${marketCondition.isTradeable})`);

    let signal = generateSignal(
      sessionId,
      session.symbol,
      session.timeframe,
      closedCandles,
      formingCandle,
      candleCloseTime,
      session.options
    );

    const volatilityCheck = shouldNoTrade(closedCandles);
    if (volatilityCheck.noTrade && signal.direction !== 'NO_TRADE') {
      signal.direction = 'NO_TRADE';
      signal.volatilityOverride = true;
      signal.volatilityReason = volatilityCheck.reason;
    }
    
    if (signal.direction !== 'NO_TRADE' && !shouldTradeInCurrentCondition(marketCondition, signal.direction)) {
      logger.info(`Signal blocked by market regime: ${marketCondition.reason}`);
      signal.direction = 'NO_TRADE';
      signal.volatilityOverride = true;
      signal.volatilityReason = `Market regime: ${marketCondition.regime} - ${marketCondition.reason}`;
    }
    
    if (signal.direction !== 'NO_TRADE' && signal.confidence < SIGNAL_CONFIG.minConfidence) {
      logger.info(`Signal blocked by confidence threshold: ${signal.confidence}% < ${SIGNAL_CONFIG.minConfidence}%`);
      signal.suggestedDirection = signal.direction;
      signal.direction = 'NO_TRADE';
      signal.isLowConfidence = true;
    }
    
    signal.volatilityInfo = getVolatilityInfo(closedCandles, session.symbol);

    session.lastSignalAt = signal.timestamp;
    
    this.emit("candleCloseSignal", session, signal);
    logger.info(`Candle close signal emitted for ${session.symbol}: ${signal.direction} (${signal.confidence}%) - candle closed at ${closedCandle.close}`);
  }

  async stopSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn(`Session ${sessionId} not found`);
      return;
    }

    logger.info(`Stopping session ${sessionId}`);

    session.status = "stopped";

    if (session.signalTimer) {
      clearTimeout(session.signalTimer);
    }

    const tickHandler = this.tickHandlers.get(sessionId);
    if (tickHandler) {
      derivFeed.off(`tick:${session.symbol}`, tickHandler);
      this.tickHandlers.delete(sessionId);
    }

    await derivFeed.unsubscribeTicks(session.symbol, sessionId);

    candleAggregator.cleanup(session.symbol, session.timeframe);

    this.emit("sessionStopped", session);
    logger.info(`Session ${sessionId} stopped`);
  }

  private async restartSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    logger.info(`Restarting session ${sessionId}`);

    const historyCandles = await derivFeed.fetchCandleHistory(
      session.symbol,
      session.timeframe,
      SIGNAL_CONFIG.historyCandles
    );
    
    candleAggregator.initialize(session.symbol, session.timeframe, historyCandles, 500);

    await derivFeed.subscribeTicks(session.symbol, sessionId);
    
    logger.info(`Session ${sessionId} restarted - listening for candle close events`);
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  getSessionByChatId(chatId: number): Session | undefined {
    for (const session of this.sessions.values()) {
      if (session.chatId === chatId && session.status === "active") {
        return session;
      }
    }
    return undefined;
  }

  getSessionsByChatId(chatId: number): Session[] {
    const sessions: Session[] = [];
    for (const session of this.sessions.values()) {
      if (session.chatId === chatId && session.status === "active") {
        sessions.push(session);
      }
    }
    return sessions;
  }

  getActiveSessionsCount(): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.status === "active") count++;
    }
    return count;
  }

  getAllSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  getAllActiveSessions(): Session[] {
    return Array.from(this.sessions.values()).filter(s => s.status === "active");
  }

  getSessionCandles(sessionId: string): { closed: Candle[]; forming: Candle | null } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { closed: [], forming: null };
    }

    return {
      closed: candleAggregator.getClosedCandles(session.symbol, session.timeframe),
      forming: candleAggregator.getFormingCandle(session.symbol, session.timeframe),
    };
  }

  getDebugSignal(symbol: string, timeframe: number): SignalResult | null {
    const closedCandles = candleAggregator.getClosedCandles(symbol, timeframe);
    const formingCandle = candleAggregator.getFormingCandle(symbol, timeframe);

    if (closedCandles.length === 0) {
      return null;
    }

    const candleCloseTime = getCandleCloseTime(
      formingCandle?.timestamp || closedCandles[closedCandles.length - 1].timestamp,
      timeframe
    );

    return generateSignal(
      "debug",
      symbol,
      timeframe,
      closedCandles,
      formingCandle,
      candleCloseTime
    );
  }

  cleanup(): void {
    for (const sessionId of this.sessions.keys()) {
      this.stopSession(sessionId);
    }
    this.sessions.clear();
    this.tickHandlers.clear();
    candleAggregator.cleanupAll();
  }
}

export const sessionManager = new SessionManager();
