import { EventEmitter } from "events";
import { createLogger } from "../utils/logger";
import { getCandleBoundary, getCandleCloseTime } from "../utils/time";
import type { Tick, Candle } from "@shared/schema";

const logger = createLogger("CandleAggregator");

interface SymbolAggregator {
  timeframe: number;
  closedCandles: Candle[];
  formingCandle: Candle | null;
  maxCandles: number;
}

export class CandleAggregator extends EventEmitter {
  private aggregators: Map<string, SymbolAggregator> = new Map();

  private getKey(symbol: string, timeframe: number): string {
    return `${symbol}:${timeframe}`;
  }

  initialize(symbol: string, timeframe: number, historyCandles: Candle[] = [], maxCandles: number = 500): void {
    const key = this.getKey(symbol, timeframe);
    
    const sortedCandles = [...historyCandles]
      .filter(c => !c.isForming)
      .sort((a, b) => a.timestamp - b.timestamp);

    this.aggregators.set(key, {
      timeframe,
      closedCandles: sortedCandles.slice(-maxCandles),
      formingCandle: null,
      maxCandles,
    });

    logger.info(`Initialized aggregator for ${symbol} ${timeframe}s with ${sortedCandles.length} historical candles`);
  }

  processTick(tick: Tick, timeframe: number): void {
    const key = this.getKey(tick.symbol, timeframe);
    const aggregator = this.aggregators.get(key);

    if (!aggregator) {
      logger.warn(`No aggregator found for ${tick.symbol} ${timeframe}s`);
      return;
    }

    const candleBoundary = getCandleBoundary(tick.timestamp, timeframe);
    const candleCloseTime = getCandleCloseTime(tick.timestamp, timeframe);

    if (!aggregator.formingCandle) {
      aggregator.formingCandle = {
        symbol: tick.symbol,
        timeframe,
        open: tick.price,
        high: tick.price,
        low: tick.price,
        close: tick.price,
        timestamp: candleBoundary,
        tickCount: 1,
        isForming: true,
      };
      
      this.emit("forming", tick.symbol, timeframe, aggregator.formingCandle);
      return;
    }

    if (candleBoundary !== aggregator.formingCandle.timestamp) {
      const closedCandle: Candle = {
        ...aggregator.formingCandle,
        isForming: false,
      };

      aggregator.closedCandles.push(closedCandle);

      if (aggregator.closedCandles.length > aggregator.maxCandles) {
        aggregator.closedCandles.shift();
      }

      this.emit("closed", tick.symbol, timeframe, closedCandle);
      logger.debug(`Candle closed for ${tick.symbol}: O=${closedCandle.open} H=${closedCandle.high} L=${closedCandle.low} C=${closedCandle.close}`);

      aggregator.formingCandle = {
        symbol: tick.symbol,
        timeframe,
        open: tick.price,
        high: tick.price,
        low: tick.price,
        close: tick.price,
        timestamp: candleBoundary,
        tickCount: 1,
        isForming: true,
      };

      this.emit("forming", tick.symbol, timeframe, aggregator.formingCandle);
      return;
    }

    aggregator.formingCandle.high = Math.max(aggregator.formingCandle.high, tick.price);
    aggregator.formingCandle.low = Math.min(aggregator.formingCandle.low, tick.price);
    aggregator.formingCandle.close = tick.price;
    aggregator.formingCandle.tickCount++;

    this.emit("tick", tick.symbol, timeframe, aggregator.formingCandle);
  }

  getClosedCandles(symbol: string, timeframe: number): Candle[] {
    const key = this.getKey(symbol, timeframe);
    const aggregator = this.aggregators.get(key);
    return aggregator ? [...aggregator.closedCandles] : [];
  }

  getFormingCandle(symbol: string, timeframe: number): Candle | null {
    const key = this.getKey(symbol, timeframe);
    const aggregator = this.aggregators.get(key);
    return aggregator?.formingCandle || null;
  }

  getAllCandles(symbol: string, timeframe: number): Candle[] {
    const closed = this.getClosedCandles(symbol, timeframe);
    const forming = this.getFormingCandle(symbol, timeframe);
    return forming ? [...closed, forming] : closed;
  }

  getLastNCandles(symbol: string, timeframe: number, n: number): Candle[] {
    const closed = this.getClosedCandles(symbol, timeframe);
    return closed.slice(-n);
  }

  getSecondsUntilClose(symbol: string, timeframe: number): number {
    const forming = this.getFormingCandle(symbol, timeframe);
    if (!forming) return -1;
    
    const closeTime = getCandleCloseTime(forming.timestamp, timeframe);
    const now = Math.floor(Date.now() / 1000);
    return Math.max(0, closeTime - now);
  }

  hasEnoughCandles(symbol: string, timeframe: number, minCandles: number): boolean {
    const closed = this.getClosedCandles(symbol, timeframe);
    return closed.length >= minCandles;
  }

  cleanup(symbol: string, timeframe: number): void {
    const key = this.getKey(symbol, timeframe);
    this.aggregators.delete(key);
    logger.info(`Cleaned up aggregator for ${symbol} ${timeframe}s`);
  }

  cleanupAll(): void {
    this.aggregators.clear();
    logger.info("Cleaned up all aggregators");
  }
}

export const candleAggregator = new CandleAggregator();
