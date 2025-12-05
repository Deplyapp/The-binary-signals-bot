import { EventEmitter } from "events";
import { createLogger } from "../utils/logger";
import type { Candle, MarketVolatility, VolatilityInfo } from "@shared/schema";
import { computeIndicators } from "./indicatorEngine";
import { VOLATILITY_CONFIG } from "../config/indicators";

const logger = createLogger("VolatilityService");

const VOLATILITY_THRESHOLDS = {
  HIGH_ATR_RATIO: 0.008,
  EXTREME_ATR_RATIO: 0.015,
  HIGH_WICK_RATIO: 0.60,
  EXTREME_WICK_RATIO: 0.75,
  HIGH_RANGE_RATIO: 0.015,
  EXTREME_RANGE_RATIO: 0.025,
  STABLE_ATR_RATIO: 0.004,
  STABLE_WICK_RATIO: 0.35,
  MAX_RANGE_EXPANSION: 2.5,
  SPIKE_THRESHOLD: 3.0,
  OPTIMAL_ATR_MIN: 0.002,
  OPTIMAL_ATR_MAX: 0.006,
};

export interface VolatilityAnalysis {
  symbol: string;
  isVolatile: boolean;
  volatilityScore: number;
  atrRatio: number;
  wickRatio: number;
  rangeRatio: number;
  severity: 'low' | 'medium' | 'high' | 'extreme';
  reason?: string;
  suggestedPairs: string[];
  priceStability: number;
  recentSpikes: number;
}

function calculateWickRatio(candles: Candle[]): number {
  if (candles.length < 5) return 1;
  
  const recentCandles = candles.slice(-15);
  let totalWickSize = 0;
  let totalBodySize = 0;
  
  for (const candle of recentCandles) {
    const body = Math.abs(candle.close - candle.open);
    const range = candle.high - candle.low;
    const upperWick = candle.high - Math.max(candle.open, candle.close);
    const lowerWick = Math.min(candle.open, candle.close) - candle.low;
    
    totalWickSize += upperWick + lowerWick;
    totalBodySize += body;
  }
  
  if (totalBodySize === 0) return 1;
  return totalWickSize / (totalWickSize + totalBodySize);
}

function calculateAtrRatio(candles: Candle[]): number {
  if (candles.length < 15) return 1;
  
  const indicators = computeIndicators(candles);
  const atr = indicators.atr14;
  const currentPrice = candles[candles.length - 1].close;
  
  if (!atr || currentPrice <= 0) return 1;
  return atr / currentPrice;
}

function calculateRangeRatio(candles: Candle[]): number {
  if (candles.length < 5) return 1;
  
  const recentCandles = candles.slice(-15);
  let totalRange = 0;
  
  for (const candle of recentCandles) {
    const range = (candle.high - candle.low) / candle.low;
    totalRange += range;
  }
  
  return totalRange / recentCandles.length;
}

function detectLargeWicks(candles: Candle[]): { hasLargeWicks: boolean; count: number } {
  if (candles.length < 3) return { hasLargeWicks: false, count: 0 };
  
  const recentCandles = candles.slice(-10);
  const avgRange = recentCandles.reduce((sum, c) => sum + (c.high - c.low), 0) / recentCandles.length;
  let largeWickCount = 0;
  
  for (const candle of recentCandles.slice(-5)) {
    const body = Math.abs(candle.close - candle.open);
    const range = candle.high - candle.low;
    const upperWick = candle.high - Math.max(candle.open, candle.close);
    const lowerWick = Math.min(candle.open, candle.close) - candle.low;
    
    if (upperWick > body * 1.5 || lowerWick > body * 1.5) {
      largeWickCount++;
    }
    
    if (range > avgRange * VOLATILITY_THRESHOLDS.MAX_RANGE_EXPANSION) {
      largeWickCount++;
    }
  }
  
  return { hasLargeWicks: largeWickCount >= 2, count: largeWickCount };
}

function detectPriceSpikes(candles: Candle[]): { hasSpikes: boolean; count: number } {
  if (candles.length < 10) return { hasSpikes: false, count: 0 };
  
  const recentCandles = candles.slice(-15);
  const ranges = recentCandles.map(c => (c.high - c.low) / c.low);
  const avgRange = ranges.slice(0, -5).reduce((a, b) => a + b, 0) / (ranges.length - 5);
  
  let spikeCount = 0;
  const lastFiveRanges = ranges.slice(-5);
  
  for (const range of lastFiveRanges) {
    if (range > avgRange * VOLATILITY_THRESHOLDS.SPIKE_THRESHOLD) {
      spikeCount++;
    }
  }
  
  return { hasSpikes: spikeCount >= 2, count: spikeCount };
}

function calculatePriceStability(candles: Candle[]): number {
  if (candles.length < 10) return 0;
  
  const recentCandles = candles.slice(-20);
  let directionChanges = 0;
  let consecutiveDirection = 0;
  let maxConsecutive = 0;
  
  for (let i = 1; i < recentCandles.length; i++) {
    const prevBullish = recentCandles[i - 1].close > recentCandles[i - 1].open;
    const currBullish = recentCandles[i].close > recentCandles[i].open;
    
    if (prevBullish !== currBullish) {
      directionChanges++;
      maxConsecutive = Math.max(maxConsecutive, consecutiveDirection);
      consecutiveDirection = 1;
    } else {
      consecutiveDirection++;
    }
  }
  
  maxConsecutive = Math.max(maxConsecutive, consecutiveDirection);
  
  const stabilityScore = (maxConsecutive / recentCandles.length) + (1 - directionChanges / recentCandles.length);
  return Math.min(1, stabilityScore / 2);
}

export function analyzeVolatility(candles: Candle[], symbol: string): VolatilityAnalysis {
  const wickRatio = calculateWickRatio(candles);
  const atrRatio = calculateAtrRatio(candles);
  const rangeRatio = calculateRangeRatio(candles);
  
  const largeWicks = detectLargeWicks(candles);
  const priceSpikes = detectPriceSpikes(candles);
  const priceStability = calculatePriceStability(candles);
  
  let volatilityScore = 0;
  const reasons: string[] = [];
  
  if (atrRatio > VOLATILITY_THRESHOLDS.EXTREME_ATR_RATIO) {
    volatilityScore += 0.5;
    reasons.push(`Extreme ATR: ${(atrRatio * 100).toFixed(2)}%`);
  } else if (atrRatio > VOLATILITY_THRESHOLDS.HIGH_ATR_RATIO) {
    volatilityScore += 0.35;
    reasons.push(`High ATR: ${(atrRatio * 100).toFixed(2)}%`);
  } else if (atrRatio > VOLATILITY_THRESHOLDS.STABLE_ATR_RATIO) {
    volatilityScore += 0.15;
  }
  
  if (wickRatio > VOLATILITY_THRESHOLDS.EXTREME_WICK_RATIO) {
    volatilityScore += 0.4;
    reasons.push(`Extreme wicks: ${(wickRatio * 100).toFixed(0)}% wick ratio`);
  } else if (wickRatio > VOLATILITY_THRESHOLDS.HIGH_WICK_RATIO) {
    volatilityScore += 0.25;
    reasons.push(`High wicks: ${(wickRatio * 100).toFixed(0)}% wick ratio`);
  } else if (wickRatio > VOLATILITY_THRESHOLDS.STABLE_WICK_RATIO) {
    volatilityScore += 0.1;
  }
  
  if (rangeRatio > VOLATILITY_THRESHOLDS.EXTREME_RANGE_RATIO) {
    volatilityScore += 0.35;
    reasons.push(`Extreme range: ${(rangeRatio * 100).toFixed(2)}%`);
  } else if (rangeRatio > VOLATILITY_THRESHOLDS.HIGH_RANGE_RATIO) {
    volatilityScore += 0.2;
    reasons.push(`Wide range: ${(rangeRatio * 100).toFixed(2)}%`);
  }
  
  if (largeWicks.hasLargeWicks) {
    volatilityScore += 0.15 * (largeWicks.count / 5);
    if (!reasons.some(r => r.includes('wick'))) {
      reasons.push(`${largeWicks.count} large wick candles detected`);
    }
  }
  
  if (priceSpikes.hasSpikes) {
    volatilityScore += 0.2 * (priceSpikes.count / 5);
    reasons.push(`${priceSpikes.count} price spike(s) detected`);
  }
  
  if (priceStability < 0.3) {
    volatilityScore += 0.15;
    reasons.push('Unstable price action');
  }
  
  volatilityScore = Math.min(1, volatilityScore);
  
  let severity: 'low' | 'medium' | 'high' | 'extreme' = 'low';
  if (volatilityScore >= 0.8) {
    severity = 'extreme';
  } else if (volatilityScore >= 0.6) {
    severity = 'high';
  } else if (volatilityScore >= 0.35) {
    severity = 'medium';
  }
  
  const isVolatile = volatilityScore >= 0.4;
  
  return {
    symbol,
    isVolatile,
    volatilityScore,
    atrRatio,
    wickRatio,
    rangeRatio,
    severity,
    reason: reasons.join('; ') || 'Market is stable',
    suggestedPairs: [],
    priceStability,
    recentSpikes: priceSpikes.count,
  };
}

export function getVolatilityInfo(candles: Candle[], symbol: string): VolatilityInfo {
  const analysis = analyzeVolatility(candles, symbol);
  
  return {
    isVolatile: analysis.isVolatile,
    wickRatio: analysis.wickRatio,
    atrRatio: analysis.atrRatio,
    reason: analysis.reason,
    severity: analysis.severity === 'extreme' ? 'high' : analysis.severity,
    suggestedPairs: analysis.suggestedPairs,
  };
}

export function shouldNoTrade(candles: Candle[]): { noTrade: boolean; reason?: string } {
  if (candles.length < 10) {
    return { noTrade: true, reason: 'Insufficient candle data' };
  }
  
  const wickRatio = calculateWickRatio(candles);
  const atrRatio = calculateAtrRatio(candles);
  const largeWicks = detectLargeWicks(candles);
  const priceSpikes = detectPriceSpikes(candles);
  const priceStability = calculatePriceStability(candles);
  
  if (atrRatio > VOLATILITY_THRESHOLDS.EXTREME_ATR_RATIO) {
    return {
      noTrade: true,
      reason: `Extreme volatility detected (ATR: ${(atrRatio * 100).toFixed(2)}%)`
    };
  }
  
  if (atrRatio > VOLATILITY_THRESHOLDS.HIGH_ATR_RATIO && priceSpikes.count >= 3) {
    return {
      noTrade: true,
      reason: `High volatility with multiple price spikes`
    };
  }
  
  if (wickRatio > VOLATILITY_THRESHOLDS.EXTREME_WICK_RATIO && largeWicks.count >= 4) {
    return {
      noTrade: true,
      reason: `Excessive wick activity (${(wickRatio * 100).toFixed(0)}% wick ratio)`
    };
  }
  
  if (priceSpikes.count >= 4 && priceStability < 0.25) {
    return {
      noTrade: true,
      reason: `Multiple price spikes with unstable action (${priceSpikes.count} spikes)`
    };
  }
  
  if (priceStability < 0.15 && largeWicks.count >= 4 && atrRatio > VOLATILITY_THRESHOLDS.HIGH_ATR_RATIO) {
    return {
      noTrade: true,
      reason: 'Highly unstable price action with large wicks'
    };
  }
  
  return { noTrade: false };
}

export function calculateTradingScore(candles: Candle[], symbol: string): number {
  const analysis = analyzeVolatility(candles, symbol);
  
  let score = 100;
  
  if (analysis.atrRatio < VOLATILITY_THRESHOLDS.OPTIMAL_ATR_MIN) {
    score -= 10;
  } else if (analysis.atrRatio > VOLATILITY_THRESHOLDS.OPTIMAL_ATR_MAX) {
    score -= (analysis.atrRatio - VOLATILITY_THRESHOLDS.OPTIMAL_ATR_MAX) * 2000;
  } else {
    score += 5;
  }
  
  if (analysis.wickRatio > VOLATILITY_THRESHOLDS.HIGH_WICK_RATIO) {
    score -= (analysis.wickRatio - VOLATILITY_THRESHOLDS.HIGH_WICK_RATIO) * 100;
  } else if (analysis.wickRatio < VOLATILITY_THRESHOLDS.STABLE_WICK_RATIO) {
    score += 5;
  }
  
  score += analysis.priceStability * 15;
  
  score -= analysis.recentSpikes * 8;
  
  score -= analysis.volatilityScore * 30;
  
  return Math.max(0, Math.min(100, score));
}

export class VolatilityMonitor extends EventEmitter {
  private volatilityCache: Map<string, VolatilityAnalysis> = new Map();
  private candleCache: Map<string, Candle[]> = new Map();
  private tradingScores: Map<string, number> = new Map();
  
  updateCandles(symbol: string, candles: Candle[]): void {
    this.candleCache.set(symbol, candles);
    const analysis = analyzeVolatility(candles, symbol);
    this.volatilityCache.set(symbol, analysis);
    
    const tradingScore = calculateTradingScore(candles, symbol);
    this.tradingScores.set(symbol, tradingScore);
    
    this.emit('volatilityUpdate', symbol, analysis);
  }
  
  getVolatility(symbol: string): VolatilityAnalysis | undefined {
    return this.volatilityCache.get(symbol);
  }
  
  getTradingScore(symbol: string): number {
    return this.tradingScores.get(symbol) ?? 50;
  }
  
  getStablePairs(): string[] {
    const stablePairs: string[] = [];
    
    for (const [symbol, analysis] of this.volatilityCache) {
      if (!analysis.isVolatile && analysis.volatilityScore < 0.35 && analysis.priceStability > 0.4) {
        stablePairs.push(symbol);
      }
    }
    
    return stablePairs.sort((a, b) => {
      const aScore = this.tradingScores.get(a) || 0;
      const bScore = this.tradingScores.get(b) || 0;
      return bScore - aScore;
    }).slice(0, 6);
  }
  
  getBestTradingPairs(): string[] {
    const pairs: Array<{ symbol: string; score: number }> = [];
    
    for (const [symbol, score] of this.tradingScores) {
      const analysis = this.volatilityCache.get(symbol);
      if (analysis && !analysis.isVolatile && score >= 60) {
        pairs.push({ symbol, score });
      }
    }
    
    return pairs
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(p => p.symbol);
  }
  
  getTradablePairs(): string[] {
    const pairs: string[] = [];
    
    for (const [symbol, analysis] of this.volatilityCache) {
      const score = this.tradingScores.get(symbol) ?? 0;
      if (score >= 50 && analysis.severity !== 'extreme') {
        pairs.push(symbol);
      }
    }
    
    return pairs.sort((a, b) => {
      return (this.tradingScores.get(b) || 0) - (this.tradingScores.get(a) || 0);
    });
  }
  
  getAllVolatility(): Map<string, VolatilityAnalysis> {
    return new Map(this.volatilityCache);
  }
  
  clear(): void {
    this.volatilityCache.clear();
    this.candleCache.clear();
    this.tradingScores.clear();
  }
}

export const volatilityMonitor = new VolatilityMonitor();
