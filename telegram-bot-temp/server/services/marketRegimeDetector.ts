import type { Candle, IndicatorValues } from "@shared/schema";
import { computeIndicators } from "./indicatorEngine";
import { createLogger } from "../utils/logger";
import { MARKET_REGIME_CONFIG } from "../config/indicators";

const logger = createLogger("MarketRegimeDetector");

export type MarketRegime = "TRENDING_UP" | "TRENDING_DOWN" | "RANGING" | "CHOPPY" | "UNKNOWN";

export interface MarketCondition {
  regime: MarketRegime;
  strength: number;
  isTradeable: boolean;
  reason: string;
  trendDuration: number;
  momentumAligned: boolean;
  volatilityLevel: "LOW" | "MEDIUM" | "HIGH";
  priceAction: "CLEAN" | "MESSY" | "CHOPPY";
}

export interface TrendAnalysis {
  direction: "UP" | "DOWN" | "NEUTRAL";
  strength: number;
  duration: number;
  isConfirmed: boolean;
}

function analyzePriceAction(candles: Candle[]): "CLEAN" | "MESSY" | "CHOPPY" {
  if (candles.length < 10) return "CHOPPY";
  
  const recentCandles = candles.slice(-20);
  let directionChanges = 0;
  let wickDominance = 0;
  let bodyConsistency = 0;
  
  for (let i = 1; i < recentCandles.length; i++) {
    const prev = recentCandles[i - 1];
    const curr = recentCandles[i];
    
    const prevBullish = prev.close > prev.open;
    const currBullish = curr.close > curr.open;
    
    if (prevBullish !== currBullish) {
      directionChanges++;
    }
    
    const body = Math.abs(curr.close - curr.open);
    const range = curr.high - curr.low;
    const wickSize = range - body;
    
    if (range > 0 && wickSize > body) {
      wickDominance++;
    }
    
    if (range > 0 && body / range > 0.5) {
      bodyConsistency++;
    }
  }
  
  const changeRatio = directionChanges / (recentCandles.length - 1);
  const wickRatio = wickDominance / recentCandles.length;
  const consistencyRatio = bodyConsistency / recentCandles.length;
  
  if (changeRatio > 0.6 || wickRatio > 0.6) {
    return "CHOPPY";
  }
  
  if (changeRatio > 0.4 || wickRatio > 0.4 || consistencyRatio < 0.4) {
    return "MESSY";
  }
  
  return "CLEAN";
}

function detectTrendDuration(candles: Candle[], direction: "UP" | "DOWN"): number {
  if (candles.length < 5) return 0;
  
  let duration = 0;
  const recentCandles = candles.slice(-30);
  
  for (let i = recentCandles.length - 1; i >= 1; i--) {
    const curr = recentCandles[i];
    const prev = recentCandles[i - 1];
    
    if (direction === "UP") {
      if (curr.close > prev.close && curr.low > prev.low * 0.998) {
        duration++;
      } else {
        break;
      }
    } else {
      if (curr.close < prev.close && curr.high < prev.high * 1.002) {
        duration++;
      } else {
        break;
      }
    }
  }
  
  return duration;
}

function analyzeHigherHighsLowerLows(candles: Candle[]): TrendAnalysis {
  if (candles.length < 20) {
    return { direction: "NEUTRAL", strength: 0, duration: 0, isConfirmed: false };
  }
  
  const recentCandles = candles.slice(-30);
  const swingPoints: { type: "HIGH" | "LOW"; value: number; index: number }[] = [];
  
  for (let i = 2; i < recentCandles.length - 2; i++) {
    const candle = recentCandles[i];
    const isSwingHigh = candle.high > recentCandles[i - 1].high && 
                        candle.high > recentCandles[i - 2].high &&
                        candle.high > recentCandles[i + 1].high && 
                        candle.high > recentCandles[i + 2].high;
    
    const isSwingLow = candle.low < recentCandles[i - 1].low && 
                       candle.low < recentCandles[i - 2].low &&
                       candle.low < recentCandles[i + 1].low && 
                       candle.low < recentCandles[i + 2].low;
    
    if (isSwingHigh) {
      swingPoints.push({ type: "HIGH", value: candle.high, index: i });
    }
    if (isSwingLow) {
      swingPoints.push({ type: "LOW", value: candle.low, index: i });
    }
  }
  
  const highs = swingPoints.filter(p => p.type === "HIGH").slice(-3);
  const lows = swingPoints.filter(p => p.type === "LOW").slice(-3);
  
  let higherHighs = 0;
  let higherLows = 0;
  let lowerHighs = 0;
  let lowerLows = 0;
  
  for (let i = 1; i < highs.length; i++) {
    if (highs[i].value > highs[i - 1].value) higherHighs++;
    if (highs[i].value < highs[i - 1].value) lowerHighs++;
  }
  
  for (let i = 1; i < lows.length; i++) {
    if (lows[i].value > lows[i - 1].value) higherLows++;
    if (lows[i].value < lows[i - 1].value) lowerLows++;
  }
  
  if (higherHighs >= 1 && higherLows >= 1) {
    const duration = detectTrendDuration(candles, "UP");
    const strength = (higherHighs + higherLows) / 4;
    return { 
      direction: "UP", 
      strength: Math.min(1, strength), 
      duration,
      isConfirmed: higherHighs >= 2 && higherLows >= 1
    };
  }
  
  if (lowerHighs >= 1 && lowerLows >= 1) {
    const duration = detectTrendDuration(candles, "DOWN");
    const strength = (lowerHighs + lowerLows) / 4;
    return { 
      direction: "DOWN", 
      strength: Math.min(1, strength), 
      duration,
      isConfirmed: lowerHighs >= 2 && lowerLows >= 1
    };
  }
  
  return { direction: "NEUTRAL", strength: 0, duration: 0, isConfirmed: false };
}

function checkMomentumAlignment(indicators: IndicatorValues, direction: "UP" | "DOWN"): boolean {
  let alignedCount = 0;
  let totalChecks = 0;
  
  if (indicators.rsi14 !== undefined) {
    totalChecks++;
    if (direction === "UP" && indicators.rsi14 > 50 && indicators.rsi14 < 75) {
      alignedCount++;
    } else if (direction === "DOWN" && indicators.rsi14 < 50 && indicators.rsi14 > 25) {
      alignedCount++;
    }
  }
  
  if (indicators.macd) {
    totalChecks++;
    if (direction === "UP" && indicators.macd.histogram > 0) {
      alignedCount++;
    } else if (direction === "DOWN" && indicators.macd.histogram < 0) {
      alignedCount++;
    }
  }
  
  if (indicators.stochastic) {
    totalChecks++;
    if (direction === "UP" && indicators.stochastic.k > indicators.stochastic.d) {
      alignedCount++;
    } else if (direction === "DOWN" && indicators.stochastic.k < indicators.stochastic.d) {
      alignedCount++;
    }
  }
  
  if (indicators.superTrend) {
    totalChecks++;
    if (direction === "UP" && indicators.superTrend.direction === "up") {
      alignedCount++;
    } else if (direction === "DOWN" && indicators.superTrend.direction === "down") {
      alignedCount++;
    }
  }
  
  return totalChecks > 0 && (alignedCount / totalChecks) >= 0.6;
}

function calculateVolatilityLevel(candles: Candle[], indicators: IndicatorValues): "LOW" | "MEDIUM" | "HIGH" {
  if (candles.length < 15) return "HIGH";
  
  const recentCandles = candles.slice(-15);
  const ranges = recentCandles.map(c => (c.high - c.low) / c.low);
  const avgRange = ranges.reduce((a, b) => a + b, 0) / ranges.length;
  
  const atrRatio = indicators.atr14 && candles[candles.length - 1].close > 0
    ? indicators.atr14 / candles[candles.length - 1].close
    : avgRange;
  
  if (atrRatio > 0.006 || avgRange > 0.008) {
    return "HIGH";
  }
  
  if (atrRatio > 0.003 || avgRange > 0.004) {
    return "MEDIUM";
  }
  
  return "LOW";
}

export function detectMarketRegime(candles: Candle[]): MarketCondition {
  if (candles.length < 30) {
    return {
      regime: "UNKNOWN",
      strength: 0,
      isTradeable: false,
      reason: "Insufficient data for market analysis",
      trendDuration: 0,
      momentumAligned: false,
      volatilityLevel: "HIGH",
      priceAction: "CHOPPY"
    };
  }
  
  const indicators = computeIndicators(candles);
  const priceAction = analyzePriceAction(candles);
  const trendAnalysis = analyzeHigherHighsLowerLows(candles);
  const volatilityLevel = calculateVolatilityLevel(candles, indicators);
  
  const adx = indicators.adx || 0;
  const allowRangingTrades = (MARKET_REGIME_CONFIG as any).allowRangingTrades ?? false;
  
  if (priceAction === "CHOPPY" && volatilityLevel === "HIGH") {
    return {
      regime: "CHOPPY",
      strength: 0,
      isTradeable: false,
      reason: "Choppy price action with high volatility",
      trendDuration: 0,
      momentumAligned: false,
      volatilityLevel,
      priceAction
    };
  }
  
  if (adx < MARKET_REGIME_CONFIG.rangingAdxThreshold && trendAnalysis.direction === "NEUTRAL") {
    return {
      regime: "RANGING",
      strength: 0.35,
      isTradeable: allowRangingTrades && priceAction !== "CHOPPY" && volatilityLevel !== "HIGH",
      reason: `Market is ranging (ADX: ${adx.toFixed(1)})`,
      trendDuration: 0,
      momentumAligned: false,
      volatilityLevel,
      priceAction
    };
  }
  
  if (trendAnalysis.direction !== "NEUTRAL" && adx >= MARKET_REGIME_CONFIG.trendingAdxThreshold) {
    const momentumAligned = checkMomentumAlignment(indicators, trendAnalysis.direction);
    const regime = trendAnalysis.direction === "UP" ? "TRENDING_UP" : "TRENDING_DOWN";
    
    const hasMinConfirmation = trendAnalysis.isConfirmed || trendAnalysis.strength > 0.4;
    const hasMinDuration = trendAnalysis.duration >= MARKET_REGIME_CONFIG.minTrendDuration;
    const priceActionOk = priceAction !== "CHOPPY";
    const volatilityOk = volatilityLevel !== "HIGH" || adx > MARKET_REGIME_CONFIG.strongTrendAdxThreshold;
    
    const isTradeable = hasMinConfirmation && 
                        (momentumAligned || trendAnalysis.strength > 0.5) && 
                        hasMinDuration &&
                        priceActionOk &&
                        volatilityOk;
    
    let reason = `${regime.replace("_", " ")} trend (ADX: ${adx.toFixed(1)})`;
    
    return {
      regime,
      strength: Math.min(1, trendAnalysis.strength * (adx / 40)),
      isTradeable,
      reason,
      trendDuration: trendAnalysis.duration,
      momentumAligned,
      volatilityLevel,
      priceAction
    };
  }
  
  if (trendAnalysis.direction !== "NEUTRAL") {
    const momentumAligned = checkMomentumAlignment(indicators, trendAnalysis.direction);
    const regime = trendAnalysis.direction === "UP" ? "TRENDING_UP" : "TRENDING_DOWN";
    
    const weakTrendTradeable = trendAnalysis.strength > 0.35 && 
                                momentumAligned && 
                                priceAction === "CLEAN" &&
                                volatilityLevel !== "HIGH";
    
    return {
      regime,
      strength: trendAnalysis.strength * 0.6,
      isTradeable: weakTrendTradeable,
      reason: `Developing ${regime.replace("_", " ")} trend (ADX: ${adx.toFixed(1)})`,
      trendDuration: trendAnalysis.duration,
      momentumAligned,
      volatilityLevel,
      priceAction
    };
  }
  
  return {
    regime: "RANGING",
    strength: 0.25,
    isTradeable: allowRangingTrades && priceAction === "CLEAN" && volatilityLevel !== "HIGH",
    reason: "Ranging market",
    trendDuration: 0,
    momentumAligned: false,
    volatilityLevel,
    priceAction
  };
}

export function shouldTradeInCurrentCondition(condition: MarketCondition, direction: "CALL" | "PUT"): boolean {
  if (!condition.isTradeable) {
    return false;
  }
  
  if (condition.volatilityLevel === "HIGH" && condition.priceAction !== "CLEAN") {
    return false;
  }
  
  if (condition.priceAction === "CHOPPY" && condition.volatilityLevel === "HIGH") {
    return false;
  }
  
  const allowRangingTrades = (MARKET_REGIME_CONFIG as any).allowRangingTrades ?? false;
  
  if (condition.regime === "RANGING") {
    return allowRangingTrades && condition.priceAction !== "CHOPPY";
  }
  
  if (direction === "CALL" && condition.regime === "TRENDING_DOWN" && condition.strength > 0.5) {
    return false;
  }
  
  if (direction === "PUT" && condition.regime === "TRENDING_UP" && condition.strength > 0.5) {
    return false;
  }
  
  if (!condition.momentumAligned && MARKET_REGIME_CONFIG.momentumConfirmationRequired) {
    return false;
  }
  
  return condition.strength >= 0.2;
}

export function getMarketConditionPenalty(condition: MarketCondition): number {
  if (condition.regime === "CHOPPY" && condition.volatilityLevel === "HIGH") {
    return 0.4;
  }
  
  if (condition.regime === "CHOPPY") {
    return 0.6;
  }
  
  const allowRangingTrades = (MARKET_REGIME_CONFIG as any).allowRangingTrades ?? false;
  const rangingPenalty = (MARKET_REGIME_CONFIG as any).rangingConfidencePenalty ?? 0.85;
  
  if (condition.regime === "RANGING") {
    return allowRangingTrades ? rangingPenalty : 0.5;
  }
  
  if (condition.volatilityLevel === "HIGH") {
    return condition.priceAction === "CLEAN" ? 0.75 : 0.6;
  }
  
  if (!condition.momentumAligned) {
    return 0.85;
  }
  
  if (condition.priceAction === "MESSY") {
    return 0.9;
  }
  
  if (condition.trendDuration < MARKET_REGIME_CONFIG.minTrendDuration) {
    return 0.88;
  }
  
  return 1.0;
}
