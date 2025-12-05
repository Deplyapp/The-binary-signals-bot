import { EventEmitter } from "events";
import { createLogger } from "../utils/logger";
import { derivFeed } from "./derivFeed";
import { 
  getAllPendingSignals, 
  removePendingSignal, 
  sendWinLossUpdate,
  sendVolatilityWarning
} from "../telegram/handlers";
import { sessionManager } from "./sessionManager";
import { getMarketVolatility } from "../telegram/handlers";
import type TelegramBot from "node-telegram-bot-api";
import { recordMLOutcome, getMLStats } from "./ml";
import { getLastMLFeatures, clearLastMLFeatures } from "./advancedBrain";

const logger = createLogger("WinLossTracker");

const CHECK_INTERVAL_MS = 1000;
const VOLATILITY_CHECK_INTERVAL_MS = 5000;

interface AssetPriceCache {
  symbol: string;
  price: number;
  timestamp: number;
}

export class WinLossTracker extends EventEmitter {
  private priceCache: Map<string, AssetPriceCache> = new Map();
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private volatilityCheckInterval: ReturnType<typeof setInterval> | null = null;
  private bot: TelegramBot | null = null;
  private lastVolatilityWarnings: Map<string, number> = new Map();
  private isRunning = false;
  private processedSignals: Set<string> = new Set();
  private isProcessingSignals = false;
  
  constructor() {
    super();
    this.setupPriceHandlers();
  }
  
  private setupPriceHandlers(): void {
    derivFeed.on("tick", (tick: { symbol: string; price: number; timestamp: number }) => {
      this.priceCache.set(tick.symbol, {
        symbol: tick.symbol,
        price: tick.price,
        timestamp: tick.timestamp
      });
    });
  }
  
  setBot(bot: TelegramBot): void {
    this.bot = bot;
  }
  
  start(): void {
    if (this.isRunning) return;
    
    logger.info("Starting win/loss tracker...");
    this.isRunning = true;
    
    this.checkInterval = setInterval(() => {
      this.checkPendingSignals();
    }, CHECK_INTERVAL_MS);
    
    this.volatilityCheckInterval = setInterval(() => {
      this.checkInSessionVolatility();
    }, VOLATILITY_CHECK_INTERVAL_MS);
    
    logger.info("Win/loss tracker started");
  }
  
  private async checkPendingSignals(): Promise<void> {
    if (!this.bot) return;
    
    if (this.isProcessingSignals) {
      logger.debug("Already processing signals, skipping this cycle");
      return;
    }
    
    this.isProcessingSignals = true;
    
    try {
      const now = Math.floor(Date.now() / 1000);
      const pendingSignals = getAllPendingSignals();
      
      for (const [signalKey, pending] of pendingSignals) {
        if (this.processedSignals.has(signalKey)) {
          logger.debug(`Signal ${signalKey} already processed, removing duplicate`);
          removePendingSignal(signalKey);
          continue;
        }
        
        if (now >= pending.expiryTime) {
          this.processedSignals.add(signalKey);
          removePendingSignal(signalKey);
          
          const currentPrice = this.priceCache.get(pending.signal.symbol);
          
          if (!currentPrice) {
            logger.warn(`No price data available for ${pending.signal.symbol}, skipping outcome check`);
            continue;
          }
          
          const entryPrice = pending.entryPrice;
          const exitPrice = currentPrice.price;
          const direction = pending.signal.direction;
          
          let outcome: 'WIN' | 'LOSS';
          
          if (direction === 'CALL') {
            outcome = exitPrice > entryPrice ? 'WIN' : 'LOSS';
          } else if (direction === 'PUT') {
            outcome = exitPrice < entryPrice ? 'WIN' : 'LOSS';
          } else {
            continue;
          }
          
          logger.info(`[WIN/LOSS] Signal ${signalKey} result: ${outcome}. Direction: ${direction}, Entry: ${entryPrice}, Exit: ${exitPrice}`);
          
          // Record outcome for ML learning
          try {
            const mlFeatures = getLastMLFeatures();
            const confidence = pending.signal.confidence || 70;
            recordMLOutcome(mlFeatures, outcome, confidence);
            clearLastMLFeatures();
            
            const mlStats = getMLStats();
            logger.info(`[ML LEARNING] Outcome recorded. Rolling accuracy: ${(mlStats.ensemble.rollingAccuracy * 100).toFixed(1)}%, Samples: ${mlStats.ensemble.samplesProcessed}, Win rate: ${(mlStats.adaptive.metrics.winRate * 100).toFixed(1)}%`);
          } catch (mlError) {
            logger.debug("ML outcome recording error:", mlError);
          }
          
          try {
            await sendWinLossUpdate(
              this.bot,
              pending.chatId,
              pending.sessionId,
              outcome,
              direction,
              entryPrice,
              exitPrice,
              pending.signal.symbol
            );
          } catch (error) {
            logger.error("Failed to send win/loss update", error);
          }
          this.emit("tradeResult", {
            signalKey,
            outcome,
            direction,
            entryPrice,
            exitPrice,
            symbol: pending.signal.symbol,
            sessionId: pending.sessionId
          });
          
          if (this.processedSignals.size > 1000) {
            const keysArray = Array.from(this.processedSignals);
            for (let i = 0; i < 500; i++) {
              this.processedSignals.delete(keysArray[i]);
            }
          }
        }
      }
    } finally {
      this.isProcessingSignals = false;
    }
  }
  
  private async checkInSessionVolatility(): Promise<void> {
    if (!this.bot) return;
    
    const now = Date.now();
    const WARNING_COOLDOWN_MS = 60000;
    const MAX_WARNINGS_PER_SESSION = 3;
    
    try {
      const activeSessions = sessionManager.getAllActiveSessions();
      
      for (const session of activeSessions) {
        if (!session || !session.id || !session.symbol) {
          continue;
        }
        
        try {
          const volatility = getMarketVolatility(session.symbol);
          
          if (volatility && !volatility.isStable && volatility.volatilityScore > 0.6) {
            const lastWarning = this.lastVolatilityWarnings.get(session.id);
            const warningCount = this.getWarningCount(session.id);
            
            if (warningCount >= MAX_WARNINGS_PER_SESSION) {
              continue;
            }
            
            if (!lastWarning || (now - lastWarning) > WARNING_COOLDOWN_MS) {
              try {
                await sendVolatilityWarning(
                  this.bot,
                  session.chatId,
                  session.symbol,
                  'in_session'
                );
                
                this.lastVolatilityWarnings.set(session.id, now);
                this.incrementWarningCount(session.id);
                logger.info(`[IN-SESSION WARNING] Sent volatility warning #${warningCount + 1} for session ${session.id}, symbol ${session.symbol}`);
              } catch (error) {
                logger.error(`Failed to send in-session volatility warning for session ${session.id}`, error);
              }
            }
          }
        } catch (sessionError) {
          logger.error(`Error processing session ${session.id} for volatility check`, sessionError);
        }
      }
    } catch (error) {
      logger.error("Error in checkInSessionVolatility", error);
    }
  }
  
  private warningCounts: Map<string, number> = new Map();
  
  private getWarningCount(sessionId: string): number {
    return this.warningCounts.get(sessionId) || 0;
  }
  
  private incrementWarningCount(sessionId: string): void {
    const count = this.getWarningCount(sessionId);
    this.warningCounts.set(sessionId, count + 1);
  }
  
  resetWarningCount(sessionId: string): void {
    this.warningCounts.delete(sessionId);
    this.lastVolatilityWarnings.delete(sessionId);
  }
  
  getCurrentPrice(symbol: string): number | undefined {
    return this.priceCache.get(symbol)?.price;
  }
  
  stop(): void {
    if (!this.isRunning) return;
    
    logger.info("Stopping win/loss tracker...");
    this.isRunning = false;
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    
    if (this.volatilityCheckInterval) {
      clearInterval(this.volatilityCheckInterval);
      this.volatilityCheckInterval = null;
    }
    
    this.priceCache.clear();
    this.lastVolatilityWarnings.clear();
    this.warningCounts.clear();
    this.processedSignals.clear();
    
    logger.info("Win/loss tracker stopped");
  }
  
  isRunningStatus(): boolean {
    return this.isRunning;
  }
}

export const winLossTracker = new WinLossTracker();
