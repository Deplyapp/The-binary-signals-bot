import { EventEmitter } from "events";
import { derivFeed } from "./derivFeed";
import { candleAggregator } from "./candleAggregator";
import { generateSignal } from "./signalEngine";
import { SIGNAL_CONFIG } from "../config/indicators";
import { getCandleCloseTime, scheduleAt, nowEpoch } from "../utils/time";
import { createLogger } from "../utils/logger";
import { getVolatilityInfo, shouldNoTrade } from "./volatilityService";
import { detectMarketRegime, shouldTradeInCurrentCondition } from "./marketRegimeDetector";
import type { Session, SessionOptions, SignalResult, Candle, UserPreferences } from "@shared/schema";

const logger = createLogger("SessionManager");

interface ActiveSession extends Session {
  signalTimer?: ReturnType<typeof setTimeout>;
  preCloseTimer?: ReturnType<typeof setTimeout>;
  lastSignalCandleTimestamp?: number;
  preferences?: UserPreferences;
}

class SessionManager extends EventEmitter {
  private sessions: Map<string, ActiveSession> = new Map();
  private tickHandlers: Map<string, (tick: unknown) => void> = new Map();

  constructor() {
    super();
    this.setupDerivListeners();
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

    this.scheduleNextPreClose(sessionId);

    this.emit("sessionStarted", session);
    logger.info(`Session ${sessionId} started successfully`);

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

  private scheduleNextPreClose(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== "active") return;

    if (session.preCloseTimer) {
      clearTimeout(session.preCloseTimer);
      session.preCloseTimer = undefined;
    }

    const formingCandle = candleAggregator.getFormingCandle(session.symbol, session.timeframe);
    if (!formingCandle) {
      logger.debug(`No forming candle for session ${sessionId}, retrying in 1s`);
      session.preCloseTimer = setTimeout(() => {
        this.scheduleNextPreClose(sessionId);
      }, 1000);
      return;
    }

    const candleCloseTime = getCandleCloseTime(formingCandle.timestamp, session.timeframe);
    const preCloseTime = candleCloseTime - SIGNAL_CONFIG.preCloseSeconds;
    const now = nowEpoch();

    const candleSignalKey = `${session.symbol}-${session.timeframe}-${formingCandle.timestamp}`;
    const lastCandleSignalKey = session.lastSignalCandleTimestamp 
      ? `${session.symbol}-${session.timeframe}-${session.lastSignalCandleTimestamp}`
      : null;

    if (preCloseTime <= now) {
      if (candleSignalKey !== lastCandleSignalKey) {
        logger.info(`Emitting signal for candle ${formingCandle.timestamp} (session ${sessionId})`);
        this.emitPreCloseSignal(sessionId, candleCloseTime);
        session.lastSignalCandleTimestamp = formingCandle.timestamp;
      } else {
        logger.debug(`Skipping duplicate signal for candle ${formingCandle.timestamp}`);
      }
      
      const nextCandleStart = candleCloseTime;
      const nextPreClose = nextCandleStart + session.timeframe - SIGNAL_CONFIG.preCloseSeconds;
      const delayMs = Math.max(500, (nextPreClose - nowEpoch()) * 1000);
      
      logger.debug(`Next signal check scheduled in ${delayMs}ms for session ${sessionId}`);
      session.preCloseTimer = setTimeout(() => {
        this.scheduleNextPreClose(sessionId);
      }, delayMs);
    } else {
      const delayMs = Math.max(100, (preCloseTime - now) * 1000);
      logger.debug(`Scheduling pre-close signal in ${delayMs}ms for session ${sessionId}`);
      
      session.preCloseTimer = setTimeout(() => {
        const currentSession = this.sessions.get(sessionId);
        if (!currentSession || currentSession.status !== "active") return;
        
        const currentFormingCandle = candleAggregator.getFormingCandle(session.symbol, session.timeframe);
        if (!currentFormingCandle) {
          this.scheduleNextPreClose(sessionId);
          return;
        }
        
        const currentKey = `${session.symbol}-${session.timeframe}-${currentFormingCandle.timestamp}`;
        const lastKey = currentSession.lastSignalCandleTimestamp 
          ? `${session.symbol}-${session.timeframe}-${currentSession.lastSignalCandleTimestamp}`
          : null;
        
        if (currentKey !== lastKey) {
          const currentCandleCloseTime = getCandleCloseTime(currentFormingCandle.timestamp, session.timeframe);
          logger.info(`Emitting scheduled signal for candle ${currentFormingCandle.timestamp} (session ${sessionId})`);
          this.emitPreCloseSignal(sessionId, currentCandleCloseTime);
          currentSession.lastSignalCandleTimestamp = currentFormingCandle.timestamp;
        }
        
        this.scheduleNextPreClose(sessionId);
      }, delayMs);
    }
  }

  private emitPreCloseSignal(sessionId: string, candleCloseTime: number): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== "active") return;

    const closedCandles = candleAggregator.getClosedCandles(session.symbol, session.timeframe);
    const formingCandle = candleAggregator.getFormingCandle(session.symbol, session.timeframe);

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
    
    this.emit("preCloseSignal", session, signal);
    logger.info(`Pre-close signal emitted for ${session.symbol}: ${signal.direction} (${signal.confidence}%)`);
  }

  async stopSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn(`Session ${sessionId} not found`);
      return;
    }

    logger.info(`Stopping session ${sessionId}`);

    session.status = "stopped";

    if (session.preCloseTimer) {
      clearTimeout(session.preCloseTimer);
    }
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

    this.scheduleNextPreClose(sessionId);
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
