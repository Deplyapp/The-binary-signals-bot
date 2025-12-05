import { EventEmitter } from "events";
import { createLogger } from "../utils/logger";
import { derivFeed } from "./derivFeed";
import { volatilityMonitor, analyzeVolatility } from "./volatilityService";
import { updateMarketVolatility } from "../telegram/handlers";
import { SUPPORTED_ASSETS } from "../config/assets";
import type { Tick, Candle, MarketVolatility } from "@shared/schema";

const logger = createLogger("MarketMonitor");

const POLL_INTERVAL_MS = 1000;
const CANDLE_HISTORY_LIMIT = 300;

interface AssetData {
  symbol: string;
  candles: Map<number, Candle[]>;
  formingCandles: Map<number, Candle>;
  lastTick?: Tick;
  lastUpdate: number;
}

export class MarketMonitor extends EventEmitter {
  private assetData: Map<string, AssetData> = new Map();
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private monitoredTimeframes: number[] = [60, 120, 300];
  
  constructor() {
    super();
    this.setupTickHandlers();
  }
  
  private setupTickHandlers(): void {
    derivFeed.on("tick", (tick: Tick) => {
      this.processTick(tick);
    });
  }
  
  private processTick(tick: Tick): void {
    let data = this.assetData.get(tick.symbol);
    
    if (!data) {
      data = {
        symbol: tick.symbol,
        candles: new Map(),
        formingCandles: new Map(),
        lastTick: tick,
        lastUpdate: Date.now()
      };
      this.assetData.set(tick.symbol, data);
    }
    
    data.lastTick = tick;
    data.lastUpdate = Date.now();
    
    for (const timeframe of this.monitoredTimeframes) {
      this.updateFormingCandle(data, tick, timeframe);
    }
  }
  
  private updateFormingCandle(data: AssetData, tick: Tick, timeframe: number): void {
    const candleBoundary = Math.floor(tick.timestamp / timeframe) * timeframe;
    const closeTime = candleBoundary + timeframe;
    
    let forming = data.formingCandles.get(timeframe);
    
    if (!forming || forming.timestamp !== candleBoundary) {
      if (forming) {
        forming.isForming = false;
        let candles = data.candles.get(timeframe) || [];
        candles.push(forming);
        
        if (candles.length > CANDLE_HISTORY_LIMIT) {
          candles = candles.slice(-CANDLE_HISTORY_LIMIT);
        }
        
        data.candles.set(timeframe, candles);
        
        this.emit("candleClose", data.symbol, timeframe, forming);
      }
      
      forming = {
        symbol: tick.symbol,
        timeframe,
        open: tick.price,
        high: tick.price,
        low: tick.price,
        close: tick.price,
        timestamp: candleBoundary,
        tickCount: 1,
        isForming: true
      };
      
      data.formingCandles.set(timeframe, forming);
    } else {
      forming.high = Math.max(forming.high, tick.price);
      forming.low = Math.min(forming.low, tick.price);
      forming.close = tick.price;
      forming.tickCount++;
    }
  }
  
  async start(): Promise<void> {
    if (this.isRunning) return;
    
    logger.info("Starting market monitor...");
    this.isRunning = true;
    
    for (const asset of SUPPORTED_ASSETS) {
      await this.subscribeToAsset(asset.id);
    }
    
    this.pollInterval = setInterval(() => {
      this.pollVolatility();
    }, POLL_INTERVAL_MS);
    
    logger.info(`Market monitor started with ${POLL_INTERVAL_MS}ms polling interval`);
  }
  
  private async subscribeToAsset(symbol: string): Promise<void> {
    try {
      await derivFeed.subscribeTicks(symbol, "market_monitor");
      
      for (const timeframe of this.monitoredTimeframes) {
        const candles = await derivFeed.fetchCandleHistory(symbol, timeframe, 100);
        if (candles.length > 0) {
          let data = this.assetData.get(symbol);
          if (!data) {
            data = {
              symbol,
              candles: new Map(),
              formingCandles: new Map(),
              lastUpdate: Date.now()
            };
            this.assetData.set(symbol, data);
          }
          data.candles.set(timeframe, candles);
        }
      }
      
      logger.info(`Subscribed to ${symbol} for market monitoring`);
    } catch (error) {
      logger.error(`Failed to subscribe to ${symbol}`, error);
    }
  }
  
  private pollVolatility(): void {
    for (const [symbol, data] of this.assetData) {
      const candles = data.candles.get(60) || [];
      
      if (candles.length < 15) continue;
      
      const analysis = analyzeVolatility(candles, symbol);
      
      volatilityMonitor.updateCandles(symbol, candles);
      
      const marketVolatility: MarketVolatility = {
        symbol,
        volatilityScore: analysis.volatilityScore,
        wickRatio: analysis.wickRatio,
        atrRatio: analysis.atrRatio,
        isStable: !analysis.isVolatile && analysis.volatilityScore < 0.3,
        lastUpdated: Date.now()
      };
      
      updateMarketVolatility(marketVolatility);
      
      this.emit("volatilityUpdate", symbol, analysis);
    }
    
    const stablePairs = volatilityMonitor.getStablePairs();
    for (const [symbol, data] of this.assetData) {
      const analysis = volatilityMonitor.getVolatility(symbol);
      if (analysis) {
        analysis.suggestedPairs = stablePairs.filter(p => p !== symbol);
      }
    }
  }
  
  getAssetCandles(symbol: string, timeframe: number): { closed: Candle[]; forming?: Candle } {
    const data = this.assetData.get(symbol);
    if (!data) {
      return { closed: [] };
    }
    
    return {
      closed: data.candles.get(timeframe) || [],
      forming: data.formingCandles.get(timeframe)
    };
  }
  
  getAssetVolatility(symbol: string): ReturnType<typeof analyzeVolatility> | undefined {
    return volatilityMonitor.getVolatility(symbol);
  }
  
  getStablePairs(): string[] {
    return volatilityMonitor.getStablePairs();
  }
  
  isAssetStable(symbol: string): boolean {
    const analysis = volatilityMonitor.getVolatility(symbol);
    if (!analysis) return true;
    return !analysis.isVolatile;
  }
  
  stop(): void {
    if (!this.isRunning) return;
    
    logger.info("Stopping market monitor...");
    this.isRunning = false;
    
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    
    for (const asset of SUPPORTED_ASSETS) {
      derivFeed.unsubscribeTicks(asset.id, "market_monitor").catch(() => {});
    }
    
    this.assetData.clear();
    volatilityMonitor.clear();
    
    logger.info("Market monitor stopped");
  }
  
  isRunningStatus(): boolean {
    return this.isRunning;
  }
}

export const marketMonitor = new MarketMonitor();
