import type { Candle, IndicatorValues, PsychologyAnalysis, Vote, SignalResult } from "@shared/schema";
import { createLogger } from "../utils/logger";
import { SIGNAL_CONFIG, QUALITY_THRESHOLDS } from "../config/indicators";
import { analyzeWithML, type MLEnhancedSignal, type ExtractedFeatures } from "./ml";

// Store last ML features for outcome recording
let lastMLFeatures: ExtractedFeatures | undefined;

const logger = createLogger("AdvancedBrain");

interface TrendAnalysis {
  shortTrend: "UP" | "DOWN" | "NEUTRAL";
  mediumTrend: "UP" | "DOWN" | "NEUTRAL";
  longTrend: "UP" | "DOWN" | "NEUTRAL";
  trendStrength: number;
  trendAlignment: boolean;
}

interface MomentumAnalysis {
  momentum: "BULLISH" | "BEARISH" | "NEUTRAL";
  strength: number;
  divergence: "BULLISH_DIVERGENCE" | "BEARISH_DIVERGENCE" | "NONE";
  acceleration: "INCREASING" | "DECREASING" | "STABLE";
}

interface SupportResistanceLevel {
  level: number;
  type: "SUPPORT" | "RESISTANCE";
  strength: number;
  touchCount: number;
}

interface MarketStructure {
  higherHighs: boolean;
  higherLows: boolean;
  lowerHighs: boolean;
  lowerLows: boolean;
  currentSwingHigh: number;
  currentSwingLow: number;
  priceLocation: "NEAR_SUPPORT" | "NEAR_RESISTANCE" | "MID_RANGE";
}

interface AdvancedAnalysis {
  trend: TrendAnalysis;
  momentum: MomentumAnalysis;
  supportResistance: SupportResistanceLevel[];
  marketStructure: MarketStructure;
  reversalProbability: number;
  continuationProbability: number;
  optimalDirection: "CALL" | "PUT" | "NO_TRADE";
  strategyVotes: Vote[];
  totalConfidence: number;
}

function analyzeTrend(candles: Candle[], indicators: IndicatorValues): TrendAnalysis {
  if (!candles || candles.length < 50) {
    return {
      shortTrend: "NEUTRAL",
      mediumTrend: "NEUTRAL",
      longTrend: "NEUTRAL",
      trendStrength: 0,
      trendAlignment: false
    };
  }

  const lastCandle = candles[candles.length - 1];
  if (!lastCandle) {
    return {
      shortTrend: "NEUTRAL",
      mediumTrend: "NEUTRAL",
      longTrend: "NEUTRAL",
      trendStrength: 0,
      trendAlignment: false
    };
  }
  
  const lastClose = lastCandle.close;
  
  let shortTrend: "UP" | "DOWN" | "NEUTRAL" = "NEUTRAL";
  let mediumTrend: "UP" | "DOWN" | "NEUTRAL" = "NEUTRAL";
  let longTrend: "UP" | "DOWN" | "NEUTRAL" = "NEUTRAL";
  
  if (indicators.ema5 && indicators.ema21) {
    if (indicators.ema5 > indicators.ema21 && lastClose > indicators.ema5) {
      shortTrend = "UP";
    } else if (indicators.ema5 < indicators.ema21 && lastClose < indicators.ema5) {
      shortTrend = "DOWN";
    }
  }
  
  if (indicators.ema21 && indicators.ema50) {
    if (indicators.ema21 > indicators.ema50 && lastClose > indicators.ema21) {
      mediumTrend = "UP";
    } else if (indicators.ema21 < indicators.ema50 && lastClose < indicators.ema21) {
      mediumTrend = "DOWN";
    }
  }
  
  if (indicators.sma50 && indicators.sma200) {
    if (indicators.sma50 > indicators.sma200 && lastClose > indicators.sma50) {
      longTrend = "UP";
    } else if (indicators.sma50 < indicators.sma200 && lastClose < indicators.sma50) {
      longTrend = "DOWN";
    }
  }
  
  const trendAlignment = shortTrend === mediumTrend && mediumTrend === longTrend && shortTrend !== "NEUTRAL";
  
  let trendStrength = 0;
  if (shortTrend !== "NEUTRAL") trendStrength += 0.3;
  if (mediumTrend !== "NEUTRAL") trendStrength += 0.3;
  if (longTrend !== "NEUTRAL") trendStrength += 0.2;
  if (trendAlignment) trendStrength += 0.2;
  
  if (indicators.adx) {
    if (indicators.adx > 25) trendStrength = Math.min(1, trendStrength * 1.2);
    else if (indicators.adx < 20) trendStrength *= 0.8;
  }
  
  return { shortTrend, mediumTrend, longTrend, trendStrength, trendAlignment };
}

function analyzeMomentum(candles: Candle[], indicators: IndicatorValues): MomentumAnalysis {
  let momentum: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
  let strength = 0;
  let divergence: "BULLISH_DIVERGENCE" | "BEARISH_DIVERGENCE" | "NONE" = "NONE";
  let acceleration: "INCREASING" | "DECREASING" | "STABLE" = "STABLE";
  
  if (!indicators) {
    return { momentum, strength, divergence, acceleration };
  }
  
  if (indicators.rsi14 !== undefined && typeof indicators.rsi14 === 'number') {
    if (indicators.rsi14 > 50) {
      momentum = "BULLISH";
      strength = (indicators.rsi14 - 50) / 50;
    } else if (indicators.rsi14 < 50) {
      momentum = "BEARISH";
      strength = (50 - indicators.rsi14) / 50;
    }
  }
  
  if (indicators.macd) {
    if (indicators.macd.histogram > 0) {
      if (momentum === "BULLISH") strength = Math.min(1, strength * 1.3);
      else momentum = "BULLISH";
    } else if (indicators.macd.histogram < 0) {
      if (momentum === "BEARISH") strength = Math.min(1, strength * 1.3);
      else momentum = "BEARISH";
    }
    
    if (candles.length >= 5) {
      const recentCandles = candles.slice(-5);
      const priceRising = recentCandles[recentCandles.length - 1].close > recentCandles[0].close;
      const macdRising = indicators.macd.histogram > 0;
      
      if (priceRising && !macdRising) {
        divergence = "BEARISH_DIVERGENCE";
      } else if (!priceRising && macdRising) {
        divergence = "BULLISH_DIVERGENCE";
      }
    }
  }
  
  if (indicators.stochastic) {
    if (indicators.stochastic.k > indicators.stochastic.d) {
      acceleration = "INCREASING";
    } else if (indicators.stochastic.k < indicators.stochastic.d) {
      acceleration = "DECREASING";
    }
  }
  
  return { momentum, strength, divergence, acceleration };
}

function findSupportResistance(candles: Candle[]): SupportResistanceLevel[] {
  if (candles.length < 20) return [];
  
  const levels: SupportResistanceLevel[] = [];
  const recentCandles = candles.slice(-100);
  
  const highs = recentCandles.map(c => c.high);
  const lows = recentCandles.map(c => c.low);
  const closes = recentCandles.map(c => c.close);
  
  for (let i = 5; i < recentCandles.length - 5; i++) {
    const high = highs[i];
    const low = lows[i];
    
    const isSwingHigh = high === Math.max(...highs.slice(i - 5, i + 6));
    const isSwingLow = low === Math.min(...lows.slice(i - 5, i + 6));
    
    if (isSwingHigh) {
      const existingLevel = levels.find(l => 
        l.type === "RESISTANCE" && Math.abs(l.level - high) / high < 0.002
      );
      if (existingLevel) {
        existingLevel.touchCount++;
        existingLevel.strength = Math.min(1, existingLevel.strength + 0.2);
      } else {
        levels.push({
          level: high,
          type: "RESISTANCE",
          strength: 0.5,
          touchCount: 1
        });
      }
    }
    
    if (isSwingLow) {
      const existingLevel = levels.find(l => 
        l.type === "SUPPORT" && Math.abs(l.level - low) / low < 0.002
      );
      if (existingLevel) {
        existingLevel.touchCount++;
        existingLevel.strength = Math.min(1, existingLevel.strength + 0.2);
      } else {
        levels.push({
          level: low,
          type: "SUPPORT",
          strength: 0.5,
          touchCount: 1
        });
      }
    }
  }
  
  return levels.sort((a, b) => b.strength - a.strength).slice(0, 10);
}

function analyzeMarketStructure(candles: Candle[]): MarketStructure {
  if (candles.length < 20) {
    return {
      higherHighs: false,
      higherLows: false,
      lowerHighs: false,
      lowerLows: false,
      currentSwingHigh: 0,
      currentSwingLow: 0,
      priceLocation: "MID_RANGE"
    };
  }
  
  const recentCandles = candles.slice(-50);
  const swingHighs: number[] = [];
  const swingLows: number[] = [];
  
  for (let i = 2; i < recentCandles.length - 2; i++) {
    const high = recentCandles[i].high;
    const low = recentCandles[i].low;
    
    if (high > recentCandles[i - 1].high && high > recentCandles[i - 2].high &&
        high > recentCandles[i + 1].high && high > recentCandles[i + 2].high) {
      swingHighs.push(high);
    }
    
    if (low < recentCandles[i - 1].low && low < recentCandles[i - 2].low &&
        low < recentCandles[i + 1].low && low < recentCandles[i + 2].low) {
      swingLows.push(low);
    }
  }
  
  const recentSwingHighs = swingHighs.slice(-3);
  const recentSwingLows = swingLows.slice(-3);
  
  const higherHighs = recentSwingHighs.length >= 2 && 
    recentSwingHighs[recentSwingHighs.length - 1] > recentSwingHighs[recentSwingHighs.length - 2];
  const lowerHighs = recentSwingHighs.length >= 2 && 
    recentSwingHighs[recentSwingHighs.length - 1] < recentSwingHighs[recentSwingHighs.length - 2];
  
  const higherLows = recentSwingLows.length >= 2 && 
    recentSwingLows[recentSwingLows.length - 1] > recentSwingLows[recentSwingLows.length - 2];
  const lowerLows = recentSwingLows.length >= 2 && 
    recentSwingLows[recentSwingLows.length - 1] < recentSwingLows[recentSwingLows.length - 2];
  
  const currentSwingHigh = Math.max(...recentSwingHighs.slice(-1), 0);
  const currentSwingLow = Math.min(...recentSwingLows.slice(-1), Infinity);
  
  const lastClose = candles[candles.length - 1].close;
  const range = currentSwingHigh - currentSwingLow;
  let priceLocation: "NEAR_SUPPORT" | "NEAR_RESISTANCE" | "MID_RANGE" = "MID_RANGE";
  
  if (range > 0) {
    const position = (lastClose - currentSwingLow) / range;
    if (position < 0.25) priceLocation = "NEAR_SUPPORT";
    else if (position > 0.75) priceLocation = "NEAR_RESISTANCE";
  }
  
  return {
    higherHighs, higherLows, lowerHighs, lowerLows,
    currentSwingHigh, currentSwingLow, priceLocation
  };
}

function trendFollowingStrategy(trend: TrendAnalysis, momentum: MomentumAnalysis): Vote[] {
  const votes: Vote[] = [];
  
  if (trend.trendAlignment) {
    if (trend.shortTrend === "UP" && momentum.momentum === "BULLISH") {
      votes.push({
        indicator: "trend_following_aligned",
        direction: "UP",
        weight: 2.0 * trend.trendStrength,
        reason: "All timeframes aligned bullish with momentum confirmation"
      });
    } else if (trend.shortTrend === "DOWN" && momentum.momentum === "BEARISH") {
      votes.push({
        indicator: "trend_following_aligned",
        direction: "DOWN",
        weight: 2.0 * trend.trendStrength,
        reason: "All timeframes aligned bearish with momentum confirmation"
      });
    }
  }
  
  if (trend.shortTrend === trend.mediumTrend && trend.shortTrend !== "NEUTRAL") {
    const direction = trend.shortTrend === "UP" ? "UP" : "DOWN";
    votes.push({
      indicator: "trend_continuation",
      direction,
      weight: 1.5 * trend.trendStrength,
      reason: `Short and medium term ${trend.shortTrend} trend alignment`
    });
  }
  
  return votes;
}

function reversalStrategy(
  trend: TrendAnalysis, 
  momentum: MomentumAnalysis, 
  structure: MarketStructure,
  indicators: IndicatorValues
): Vote[] {
  const votes: Vote[] = [];
  
  if (momentum.divergence === "BULLISH_DIVERGENCE") {
    votes.push({
      indicator: "bullish_divergence_reversal",
      direction: "UP",
      weight: 1.8,
      reason: "Bullish momentum divergence detected - potential reversal"
    });
  } else if (momentum.divergence === "BEARISH_DIVERGENCE") {
    votes.push({
      indicator: "bearish_divergence_reversal",
      direction: "DOWN",
      weight: 1.8,
      reason: "Bearish momentum divergence detected - potential reversal"
    });
  }
  
  if (structure.priceLocation === "NEAR_SUPPORT" && indicators.rsi14 && indicators.rsi14 < 30) {
    votes.push({
      indicator: "oversold_at_support",
      direction: "UP",
      weight: 2.2,
      reason: "Oversold conditions at support level"
    });
  } else if (structure.priceLocation === "NEAR_RESISTANCE" && indicators.rsi14 && indicators.rsi14 > 70) {
    votes.push({
      indicator: "overbought_at_resistance",
      direction: "DOWN",
      weight: 2.2,
      reason: "Overbought conditions at resistance level"
    });
  }
  
  if (structure.lowerLows && structure.lowerHighs && momentum.momentum === "BULLISH") {
    votes.push({
      indicator: "potential_bottom_reversal",
      direction: "UP",
      weight: 1.5,
      reason: "Downtrend with bullish momentum shift"
    });
  } else if (structure.higherHighs && structure.higherLows && momentum.momentum === "BEARISH") {
    votes.push({
      indicator: "potential_top_reversal",
      direction: "DOWN",
      weight: 1.5,
      reason: "Uptrend with bearish momentum shift"
    });
  }
  
  return votes;
}

function breakoutStrategy(
  candles: Candle[],
  indicators: IndicatorValues,
  levels: SupportResistanceLevel[]
): Vote[] {
  const votes: Vote[] = [];
  const lastCandle = candles[candles.length - 1];
  
  if (indicators.bollingerBands) {
    const bb = indicators.bollingerBands;
    const bandwidth = (bb.upper - bb.lower) / bb.middle;
    
    if (bandwidth < 0.015) {
      if (lastCandle.close > bb.upper) {
        votes.push({
          indicator: "bollinger_squeeze_breakout_up",
          direction: "UP",
          weight: 2.0,
          reason: "Bollinger Bands squeeze breakout to upside"
        });
      } else if (lastCandle.close < bb.lower) {
        votes.push({
          indicator: "bollinger_squeeze_breakout_down",
          direction: "DOWN",
          weight: 2.0,
          reason: "Bollinger Bands squeeze breakout to downside"
        });
      }
    }
  }
  
  for (const level of levels.slice(0, 5)) {
    const priceDistance = Math.abs(lastCandle.close - level.level) / level.level;
    
    if (priceDistance < 0.003) {
      if (level.type === "RESISTANCE" && lastCandle.close > level.level) {
        votes.push({
          indicator: "resistance_breakout",
          direction: "UP",
          weight: 1.8 * level.strength,
          reason: `Breaking through resistance at ${level.level.toFixed(5)}`
        });
      } else if (level.type === "SUPPORT" && lastCandle.close < level.level) {
        votes.push({
          indicator: "support_breakdown",
          direction: "DOWN",
          weight: 1.8 * level.strength,
          reason: `Breaking through support at ${level.level.toFixed(5)}`
        });
      }
    }
  }
  
  if (indicators.donchianChannels) {
    if (lastCandle.high >= indicators.donchianChannels.upper) {
      votes.push({
        indicator: "donchian_breakout_up",
        direction: "UP",
        weight: 1.6,
        reason: "Donchian channel breakout to upside"
      });
    } else if (lastCandle.low <= indicators.donchianChannels.lower) {
      votes.push({
        indicator: "donchian_breakout_down",
        direction: "DOWN",
        weight: 1.6,
        reason: "Donchian channel breakout to downside"
      });
    }
  }
  
  return votes;
}

function meanReversionStrategy(
  indicators: IndicatorValues,
  structure: MarketStructure
): Vote[] {
  const votes: Vote[] = [];
  
  if (indicators.meanReversionZ) {
    const z = indicators.meanReversionZ;
    
    if (z < -2.5 && structure.priceLocation === "NEAR_SUPPORT") {
      votes.push({
        indicator: "extreme_mean_reversion_buy",
        direction: "UP",
        weight: 2.5,
        reason: `Extreme oversold (Z=${z.toFixed(2)}) at support - mean reversion likely`
      });
    } else if (z > 2.5 && structure.priceLocation === "NEAR_RESISTANCE") {
      votes.push({
        indicator: "extreme_mean_reversion_sell",
        direction: "DOWN",
        weight: 2.5,
        reason: `Extreme overbought (Z=${z.toFixed(2)}) at resistance - mean reversion likely`
      });
    } else if (z < -2) {
      votes.push({
        indicator: "mean_reversion_buy",
        direction: "UP",
        weight: 1.8,
        reason: `Oversold (Z=${z.toFixed(2)}) - mean reversion possible`
      });
    } else if (z > 2) {
      votes.push({
        indicator: "mean_reversion_sell",
        direction: "DOWN",
        weight: 1.8,
        reason: `Overbought (Z=${z.toFixed(2)}) - mean reversion possible`
      });
    }
  }
  
  if (indicators.bollingerBands) {
    const bb = indicators.bollingerBands;
    if (indicators.rsi14 && indicators.rsi14 < 25) {
      votes.push({
        indicator: "rsi_extreme_bounce",
        direction: "UP",
        weight: 1.5,
        reason: "RSI extreme oversold - bounce expected"
      });
    } else if (indicators.rsi14 && indicators.rsi14 > 75) {
      votes.push({
        indicator: "rsi_extreme_pullback",
        direction: "DOWN",
        weight: 1.5,
        reason: "RSI extreme overbought - pullback expected"
      });
    }
  }
  
  return votes;
}

function volatilityExpansionStrategy(candles: Candle[], indicators: IndicatorValues): Vote[] {
  const votes: Vote[] = [];
  
  if (candles.length < 20) return votes;
  
  const recentRanges = candles.slice(-20).map(c => c.high - c.low);
  const avgRange = recentRanges.reduce((a, b) => a + b, 0) / recentRanges.length;
  const currentRange = recentRanges[recentRanges.length - 1];
  
  if (currentRange > avgRange * 2 && indicators.atr14) {
    const lastCandle = candles[candles.length - 1];
    const bullish = lastCandle.close > lastCandle.open;
    
    votes.push({
      indicator: "volatility_expansion",
      direction: bullish ? "UP" : "DOWN",
      weight: 1.7,
      reason: `High volatility expansion ${bullish ? "bullish" : "bearish"}`
    });
  }
  
  if (indicators.atr14 && indicators.bollingerBands) {
    const bb = indicators.bollingerBands;
    const bandwidth = (bb.upper - bb.lower) / bb.middle;
    
    if (bandwidth > 0.05) {
      const lastCandle = candles[candles.length - 1];
      if (lastCandle.close > bb.middle) {
        votes.push({
          indicator: "volatility_with_strength",
          direction: "UP",
          weight: 1.3,
          reason: "High volatility with price above middle band"
        });
      } else {
        votes.push({
          indicator: "volatility_with_weakness",
          direction: "DOWN",
          weight: 1.3,
          reason: "High volatility with price below middle band"
        });
      }
    }
  }
  
  return votes;
}

function momentumContinuationStrategy(momentum: MomentumAnalysis, indicators: IndicatorValues): Vote[] {
  const votes: Vote[] = [];
  
  if (momentum.momentum === "BULLISH" && momentum.acceleration === "INCREASING") {
    votes.push({
      indicator: "accelerating_bullish_momentum",
      direction: "UP",
      weight: 2.0 * momentum.strength,
      reason: "Bullish momentum with increasing acceleration"
    });
  } else if (momentum.momentum === "BEARISH" && momentum.acceleration === "INCREASING") {
    votes.push({
      indicator: "accelerating_bearish_momentum",
      direction: "DOWN",
      weight: 2.0 * momentum.strength,
      reason: "Bearish momentum with increasing acceleration"
    });
  }
  
  if (indicators.macd && indicators.stochastic) {
    if (indicators.macd.macd > indicators.macd.signal && 
        indicators.stochastic.k > indicators.stochastic.d &&
        indicators.stochastic.k < 80) {
      votes.push({
        indicator: "dual_momentum_bullish",
        direction: "UP",
        weight: 1.8,
        reason: "MACD and Stochastic both bullish with room to run"
      });
    } else if (indicators.macd.macd < indicators.macd.signal && 
               indicators.stochastic.k < indicators.stochastic.d &&
               indicators.stochastic.k > 20) {
      votes.push({
        indicator: "dual_momentum_bearish",
        direction: "DOWN",
        weight: 1.8,
        reason: "MACD and Stochastic both bearish with room to fall"
      });
    }
  }
  
  return votes;
}

function candlestickConfirmationStrategy(psychology: PsychologyAnalysis, trend: TrendAnalysis): Vote[] {
  const votes: Vote[] = [];
  
  for (const pattern of psychology.patterns) {
    let weight = pattern.strength;
    
    if (pattern.type === "bullish" && trend.shortTrend === "UP") {
      weight *= 1.5;
    } else if (pattern.type === "bearish" && trend.shortTrend === "DOWN") {
      weight *= 1.5;
    }
    
    if (pattern.name === "Bullish Engulfing" || pattern.name === "Bearish Engulfing") {
      weight *= 1.3;
    } else if (pattern.name === "Morning Star" || pattern.name === "Evening Star") {
      weight *= 1.4;
    } else if (pattern.name === "Hammer" || pattern.name === "Shooting Star") {
      weight *= 1.2;
    }
    
    if (pattern.type === "bullish") {
      votes.push({
        indicator: `candlestick_${pattern.name.toLowerCase().replace(/\s+/g, "_")}`,
        direction: "UP",
        weight: Math.min(2.5, weight),
        reason: pattern.description
      });
    } else if (pattern.type === "bearish") {
      votes.push({
        indicator: `candlestick_${pattern.name.toLowerCase().replace(/\s+/g, "_")}`,
        direction: "DOWN",
        weight: Math.min(2.5, weight),
        reason: pattern.description
      });
    }
  }
  
  if (psychology.orderBlockProbability > 0.7) {
    const direction = psychology.bias === "bullish" ? "UP" : psychology.bias === "bearish" ? "DOWN" : null;
    if (direction) {
      votes.push({
        indicator: "order_block_signal",
        direction,
        weight: 2.0 * psychology.orderBlockProbability,
        reason: `Order block detected with ${psychology.bias} bias`
      });
    }
  }
  
  if (psychology.fvgDetected) {
    const direction = psychology.bias === "bullish" ? "UP" : "DOWN";
    votes.push({
      indicator: "fair_value_gap",
      direction,
      weight: 1.6,
      reason: "Fair Value Gap detected - imbalance in market"
    });
  }
  
  return votes;
}

function multiTimeframeConfluence(
  trend: TrendAnalysis,
  momentum: MomentumAnalysis,
  structure: MarketStructure
): Vote[] {
  const votes: Vote[] = [];
  
  let bullishFactors = 0;
  let bearishFactors = 0;
  
  if (trend.shortTrend === "UP") bullishFactors++;
  else if (trend.shortTrend === "DOWN") bearishFactors++;
  
  if (trend.mediumTrend === "UP") bullishFactors++;
  else if (trend.mediumTrend === "DOWN") bearishFactors++;
  
  if (trend.longTrend === "UP") bullishFactors++;
  else if (trend.longTrend === "DOWN") bearishFactors++;
  
  if (momentum.momentum === "BULLISH") bullishFactors++;
  else if (momentum.momentum === "BEARISH") bearishFactors++;
  
  if (structure.higherHighs && structure.higherLows) bullishFactors++;
  if (structure.lowerHighs && structure.lowerLows) bearishFactors++;
  
  if (structure.priceLocation === "NEAR_SUPPORT") bullishFactors++;
  else if (structure.priceLocation === "NEAR_RESISTANCE") bearishFactors++;
  
  if (bullishFactors >= 5) {
    votes.push({
      indicator: "high_confluence_bullish",
      direction: "UP",
      weight: 2.5,
      reason: `Strong bullish confluence (${bullishFactors} factors)`
    });
  } else if (bearishFactors >= 5) {
    votes.push({
      indicator: "high_confluence_bearish",
      direction: "DOWN",
      weight: 2.5,
      reason: `Strong bearish confluence (${bearishFactors} factors)`
    });
  } else if (bullishFactors >= 4) {
    votes.push({
      indicator: "moderate_confluence_bullish",
      direction: "UP",
      weight: 1.8,
      reason: `Moderate bullish confluence (${bullishFactors} factors)`
    });
  } else if (bearishFactors >= 4) {
    votes.push({
      indicator: "moderate_confluence_bearish",
      direction: "DOWN",
      weight: 1.8,
      reason: `Moderate bearish confluence (${bearishFactors} factors)`
    });
  }
  
  return votes;
}

function goWithFlowStrategy(
  candles: Candle[],
  trend: TrendAnalysis,
  momentum: MomentumAnalysis
): Vote[] {
  const votes: Vote[] = [];
  
  if (candles.length < 10) return votes;
  
  const recentCandles = candles.slice(-10);
  let consecutiveBullish = 0;
  let consecutiveBearish = 0;
  
  for (let i = recentCandles.length - 1; i >= 0; i--) {
    const candle = recentCandles[i];
    if (candle.close > candle.open) {
      if (consecutiveBearish > 0) break;
      consecutiveBullish++;
    } else {
      if (consecutiveBullish > 0) break;
      consecutiveBearish++;
    }
  }
  
  if (consecutiveBullish >= 3 && trend.shortTrend === "UP") {
    votes.push({
      indicator: "go_with_flow_bullish",
      direction: "UP",
      weight: 1.5 + (consecutiveBullish * 0.2),
      reason: `${consecutiveBullish} consecutive bullish candles with trend`
    });
  } else if (consecutiveBearish >= 3 && trend.shortTrend === "DOWN") {
    votes.push({
      indicator: "go_with_flow_bearish",
      direction: "DOWN",
      weight: 1.5 + (consecutiveBearish * 0.2),
      reason: `${consecutiveBearish} consecutive bearish candles with trend`
    });
  }
  
  if (consecutiveBullish >= 5 && momentum.momentum === "BULLISH" && trend.trendAlignment) {
    votes.push({
      indicator: "strong_flow_bullish",
      direction: "UP",
      weight: 2.5,
      reason: "Strong bullish flow with trend and momentum alignment"
    });
  } else if (consecutiveBearish >= 5 && momentum.momentum === "BEARISH" && trend.trendAlignment) {
    votes.push({
      indicator: "strong_flow_bearish",
      direction: "DOWN",
      weight: 2.5,
      reason: "Strong bearish flow with trend and momentum alignment"
    });
  }
  
  return votes;
}

function exhaustionStrategy(
  candles: Candle[],
  indicators: IndicatorValues,
  momentum: MomentumAnalysis
): Vote[] {
  const votes: Vote[] = [];
  
  if (candles.length < 5) return votes;
  
  const recentCandles = candles.slice(-5);
  const lastCandle = recentCandles[recentCandles.length - 1];
  
  const avgBody = recentCandles.slice(0, -1).reduce((sum, c) => 
    sum + Math.abs(c.close - c.open), 0) / (recentCandles.length - 1);
  const lastBody = Math.abs(lastCandle.close - lastCandle.open);
  
  if (lastBody > avgBody * 2.5 && indicators.rsi14) {
    if (lastCandle.close > lastCandle.open && indicators.rsi14 > 70) {
      votes.push({
        indicator: "bullish_exhaustion",
        direction: "DOWN",
        weight: 1.8,
        reason: "Large bullish candle with RSI overbought - potential exhaustion"
      });
    } else if (lastCandle.close < lastCandle.open && indicators.rsi14 < 30) {
      votes.push({
        indicator: "bearish_exhaustion",
        direction: "UP",
        weight: 1.8,
        reason: "Large bearish candle with RSI oversold - potential exhaustion"
      });
    }
  }
  
  if (momentum.acceleration === "DECREASING" && momentum.strength < 0.3) {
    if (momentum.momentum === "BULLISH") {
      votes.push({
        indicator: "momentum_exhaustion_up",
        direction: "DOWN",
        weight: 1.3,
        reason: "Bullish momentum fading"
      });
    } else if (momentum.momentum === "BEARISH") {
      votes.push({
        indicator: "momentum_exhaustion_down",
        direction: "UP",
        weight: 1.3,
        reason: "Bearish momentum fading"
      });
    }
  }
  
  return votes;
}

function priceActionStrategy(candles: Candle[], indicators: IndicatorValues): Vote[] {
  const votes: Vote[] = [];
  
  if (candles.length < 3) return votes;
  
  const last3 = candles.slice(-3);
  const [c1, c2, c3] = last3;
  
  if (c1.close < c1.open && c2.close < c2.open && c3.close > c3.open) {
    if (c3.close > c2.open && c3.open < c2.close) {
      votes.push({
        indicator: "three_bar_reversal_up",
        direction: "UP",
        weight: 1.8,
        reason: "Three bar bullish reversal pattern"
      });
    }
  }
  
  if (c1.close > c1.open && c2.close > c2.open && c3.close < c3.open) {
    if (c3.close < c2.open && c3.open > c2.close) {
      votes.push({
        indicator: "three_bar_reversal_down",
        direction: "DOWN",
        weight: 1.8,
        reason: "Three bar bearish reversal pattern"
      });
    }
  }
  
  if (candles.length >= 2) {
    const prev = candles[candles.length - 2];
    const curr = candles[candles.length - 1];
    
    if (curr.low > prev.high) {
      votes.push({
        indicator: "gap_up",
        direction: "UP",
        weight: 1.5,
        reason: "Price gap up - bullish momentum"
      });
    } else if (curr.high < prev.low) {
      votes.push({
        indicator: "gap_down",
        direction: "DOWN",
        weight: 1.5,
        reason: "Price gap down - bearish momentum"
      });
    }
  }
  
  if (indicators.psar) {
    const lastClose = candles[candles.length - 1].close;
    if (lastClose > indicators.psar) {
      votes.push({
        indicator: "psar_bullish",
        direction: "UP",
        weight: 1.4,
        reason: "Price above Parabolic SAR"
      });
    } else {
      votes.push({
        indicator: "psar_bearish",
        direction: "DOWN",
        weight: 1.4,
        reason: "Price below Parabolic SAR"
      });
    }
  }
  
  return votes;
}

export function advancedAnalysis(
  candles: Candle[],
  indicators: IndicatorValues,
  psychology: PsychologyAnalysis
): AdvancedAnalysis {
  const trend = analyzeTrend(candles, indicators);
  const momentum = analyzeMomentum(candles, indicators);
  const levels = findSupportResistance(candles);
  const structure = analyzeMarketStructure(candles);
  
  const allVotes: Vote[] = [];
  
  allVotes.push(...trendFollowingStrategy(trend, momentum));
  allVotes.push(...reversalStrategy(trend, momentum, structure, indicators));
  allVotes.push(...breakoutStrategy(candles, indicators, levels));
  allVotes.push(...meanReversionStrategy(indicators, structure));
  allVotes.push(...volatilityExpansionStrategy(candles, indicators));
  allVotes.push(...momentumContinuationStrategy(momentum, indicators));
  allVotes.push(...candlestickConfirmationStrategy(psychology, trend));
  allVotes.push(...multiTimeframeConfluence(trend, momentum, structure));
  allVotes.push(...goWithFlowStrategy(candles, trend, momentum));
  allVotes.push(...exhaustionStrategy(candles, indicators, momentum));
  allVotes.push(...priceActionStrategy(candles, indicators));
  
  let upScore = 0;
  let downScore = 0;
  let totalWeight = 0;
  
  for (const vote of allVotes) {
    if (vote.direction === "UP") {
      upScore += vote.weight;
    } else if (vote.direction === "DOWN") {
      downScore += vote.weight;
    }
    totalWeight += vote.weight;
  }
  
  const netScore = upScore - downScore;
  const maxPossibleScore = totalWeight + 1e-9;
  const signalStrength = Math.abs(netScore) / maxPossibleScore;
  
  let optimalDirection: "CALL" | "PUT" | "NO_TRADE";
  let totalConfidence: number;
  
  const upVoteCount = allVotes.filter(v => v.direction === "UP").length;
  const downVoteCount = allVotes.filter(v => v.direction === "DOWN").length;
  const dominantVoteCount = Math.max(upVoteCount, downVoteCount);
  const voteRatio = dominantVoteCount / (upVoteCount + downVoteCount + 1e-9);
  
  if (Math.abs(netScore) < 1 || (signalStrength < 0.1 && voteRatio < 0.55)) {
    optimalDirection = "NO_TRADE";
    totalConfidence = 50;
  } else if (netScore > 0) {
    optimalDirection = "CALL";
    totalConfidence = 50 + (netScore / maxPossibleScore) * 45;
    if (voteRatio > 0.65) totalConfidence += 5;
    if (upVoteCount >= 8) totalConfidence += 3;
  } else {
    optimalDirection = "PUT";
    totalConfidence = 50 + (Math.abs(netScore) / maxPossibleScore) * 45;
    if (voteRatio > 0.65) totalConfidence += 5;
    if (downVoteCount >= 8) totalConfidence += 3;
  }
  
  if (trend.shortTrend !== "NEUTRAL" && momentum.momentum !== "NEUTRAL") {
    const trendMomentumAligned = (trend.shortTrend === "UP" && momentum.momentum === "BULLISH") ||
                                  (trend.shortTrend === "DOWN" && momentum.momentum === "BEARISH");
    if (trendMomentumAligned) {
      totalConfidence += 5;
    }
  }
  
  if (momentum.acceleration === "INCREASING") {
    totalConfidence += 3;
  }
  
  totalConfidence = Math.min(95, Math.max(50, totalConfidence));
  
  let reversalProbability = 0;
  let continuationProbability = 0;
  
  if (momentum.divergence !== "NONE") {
    reversalProbability += 0.3;
  }
  if (structure.priceLocation === "NEAR_SUPPORT" || structure.priceLocation === "NEAR_RESISTANCE") {
    reversalProbability += 0.2;
  }
  if (trend.trendAlignment) {
    continuationProbability += 0.4;
  }
  if (momentum.acceleration === "INCREASING") {
    continuationProbability += 0.2;
  }
  
  logger.debug("Advanced brain analysis completed", {
    votesCount: allVotes.length,
    upScore,
    downScore,
    optimalDirection,
    confidence: totalConfidence,
    trendAlignment: trend.trendAlignment,
    momentumDivergence: momentum.divergence
  });
  
  return {
    trend,
    momentum,
    supportResistance: levels,
    marketStructure: structure,
    reversalProbability,
    continuationProbability,
    optimalDirection,
    strategyVotes: allVotes,
    totalConfidence
  };
}

function validateSignalQuality(
  analysis: AdvancedAnalysis,
  upWeight: number,
  downWeight: number,
  combinedVotes: Vote[]
): { isValid: boolean; reason: string; qualityScore: number } {
  const total = upWeight + downWeight + 1e-9;
  const dominantWeight = Math.max(upWeight, downWeight);
  const weightRatio = dominantWeight / total;
  
  const dominantDirection = upWeight > downWeight ? "CALL" : "PUT";
  
  const upVotes = combinedVotes.filter(v => v.direction === "UP");
  const downVotes = combinedVotes.filter(v => v.direction === "DOWN");
  const dominantVotes = dominantDirection === "CALL" ? upVotes : downVotes;
  const opposingVotes = dominantDirection === "CALL" ? downVotes : upVotes;
  
  const strongVoteThreshold = QUALITY_THRESHOLDS.strongVoteThreshold || 1.15;
  const strongVotes = dominantVotes.filter(v => v.weight >= strongVoteThreshold);
  const veryStrongVotes = dominantVotes.filter(v => v.weight >= 1.3);
  const conflictRatio = opposingVotes.length / (dominantVotes.length + opposingVotes.length + 1e-9);
  
  let qualityScore = 0;
  let confirmationFactors = 0;
  
  qualityScore += Math.min(25, (dominantVotes.length / 6) * 25);
  qualityScore += Math.min(25, (strongVotes.length / 4) * 25);
  qualityScore += Math.min(20, (1 - conflictRatio) * 20);
  
  if (analysis.trend.trendAlignment) {
    qualityScore += 15;
    confirmationFactors += 1.5;
  } else if (analysis.trend.trendStrength > 0.45) {
    qualityScore += 10;
    confirmationFactors += 1;
  } else if (analysis.trend.trendStrength > 0.35) {
    qualityScore += 6;
    confirmationFactors += 0.5;
  }
  
  if (analysis.momentum.momentum !== "NEUTRAL") {
    qualityScore += 10;
    confirmationFactors += 1;
  }
  if (analysis.momentum.acceleration === "INCREASING") {
    qualityScore += 6;
    confirmationFactors += 0.5;
  }
  
  if (weightRatio > 0.68) {
    qualityScore += 10;
    confirmationFactors += 1;
  } else if (weightRatio > 0.58) {
    qualityScore += 5;
    confirmationFactors += 0.5;
  }
  
  if (dominantVotes.length >= 8) {
    qualityScore += 6;
    confirmationFactors += 0.5;
  }
  
  if (veryStrongVotes.length >= 3) {
    qualityScore += 6;
    confirmationFactors += 0.5;
  }
  
  if (qualityScore < QUALITY_THRESHOLDS.rejectBelow) {
    return { isValid: false, reason: `Quality score too low: ${qualityScore.toFixed(1)} < ${QUALITY_THRESHOLDS.rejectBelow}`, qualityScore };
  }
  
  const hasTrendSupport = analysis.trend.trendAlignment || analysis.trend.trendStrength > 0.38;
  const hasMomentumSupport = analysis.momentum.momentum !== "NEUTRAL";
  const hasVoteConsensus = strongVotes.length >= SIGNAL_CONFIG.minStrongSignals;
  const hasWeightSupport = weightRatio > 0.58;
  
  const supportCount = [hasTrendSupport, hasMomentumSupport, hasVoteConsensus, hasWeightSupport].filter(Boolean).length;
  
  if (supportCount < 2) {
    return { isValid: false, reason: `Insufficient confluence: ${supportCount}/4 factors (need 2+)`, qualityScore };
  }
  
  if (conflictRatio > SIGNAL_CONFIG.maxConflictRatio) {
    return { isValid: false, reason: `Too many conflicting signals: ${(conflictRatio * 100).toFixed(0)}% > ${(SIGNAL_CONFIG.maxConflictRatio * 100).toFixed(0)}%`, qualityScore };
  }
  
  if (dominantVotes.length < SIGNAL_CONFIG.minAlignedIndicators) {
    return { isValid: false, reason: `Need ${SIGNAL_CONFIG.minAlignedIndicators}+ aligned indicators, have ${dominantVotes.length}`, qualityScore };
  }
  
  const directionMatch = (dominantDirection === "CALL" && analysis.trend.shortTrend === "UP") ||
                         (dominantDirection === "PUT" && analysis.trend.shortTrend === "DOWN") ||
                         analysis.trend.shortTrend === "NEUTRAL";
  
  if (!directionMatch && confirmationFactors < 2.5) {
    return { isValid: false, reason: "Signal direction conflicts with short-term trend", qualityScore };
  }
  
  if (analysis.momentum.divergence !== "NONE") {
    const divergenceMatch = (analysis.momentum.divergence === "BULLISH_DIVERGENCE" && dominantDirection === "CALL") ||
                           (analysis.momentum.divergence === "BEARISH_DIVERGENCE" && dominantDirection === "PUT");
    if (!divergenceMatch && qualityScore < QUALITY_THRESHOLDS.highQuality) {
      return { isValid: false, reason: "Signal conflicts with momentum divergence", qualityScore };
    }
  }
  
  if (qualityScore < QUALITY_THRESHOLDS.mediumQuality && confirmationFactors < 2) {
    return { isValid: false, reason: `Quality score ${qualityScore.toFixed(1)} needs more confirmations (${confirmationFactors})`, qualityScore };
  }
  
  return { isValid: true, reason: `Signal validated: ${confirmationFactors.toFixed(1)} confirmations, quality ${qualityScore.toFixed(1)}`, qualityScore };
}

export function enhanceSignalWithBrain(
  signal: SignalResult,
  candles: Candle[],
  indicators: IndicatorValues,
  psychology: PsychologyAnalysis
): SignalResult {
  const analysis = advancedAnalysis(candles, indicators, psychology);
  
  // Get ML prediction
  let mlSignal: MLEnhancedSignal | null = null;
  try {
    mlSignal = analyzeWithML(candles);
    if (mlSignal?.features) {
      lastMLFeatures = mlSignal.features;
    }
  } catch (error) {
    logger.debug("ML analysis unavailable:", error);
  }
  
  const combinedVotes = [...signal.votes, ...analysis.strategyVotes];
  
  let upWeight = 0;
  let downWeight = 0;
  
  for (const vote of combinedVotes) {
    if (vote.direction === "UP") {
      upWeight += vote.weight;
    } else if (vote.direction === "DOWN") {
      downWeight += vote.weight;
    }
  }
  
  // Add ML vote with higher weight if available
  if (mlSignal && mlSignal.direction !== "NO_TRADE") {
    const mlWeight = mlSignal.tier === "PREMIUM" ? 2.0 : mlSignal.tier === "STANDARD" ? 1.5 : 1.0;
    if (mlSignal.direction === "CALL") {
      upWeight += mlWeight;
    } else {
      downWeight += mlWeight;
    }
    
    // Add ML as a vote for transparency
    combinedVotes.push({
      indicator: "ML_ENSEMBLE",
      direction: mlSignal.direction === "CALL" ? "UP" : "DOWN",
      weight: mlWeight,
      reason: `ML ${mlSignal.tier}: ${mlSignal.confidence}% (L:${(mlSignal.components.logistic * 100).toFixed(0)}% B:${(mlSignal.components.boosting * 100).toFixed(0)}% K:${(mlSignal.components.knn * 100).toFixed(0)}% P:${(mlSignal.components.pattern * 100).toFixed(0)}%)`
    });
  }
  
  const total = upWeight + downWeight + 1e-9;
  const pUp = upWeight / total;
  const pDown = downWeight / total;
  
  let enhancedDirection: "CALL" | "PUT" | "NO_TRADE";
  let enhancedConfidence: number;
  
  const strongestDirection = pUp > pDown ? "CALL" : "PUT";
  const directionStrength = Math.abs(pUp - pDown);
  
  const validation = validateSignalQuality(analysis, upWeight, downWeight, combinedVotes);
  
  // Check ML adaptive thresholds
  if (mlSignal && !mlSignal.adaptiveAllowed) {
    logger.info(`ML blocked signal: ${mlSignal.adaptiveReason}`);
    return {
      ...signal,
      direction: "NO_TRADE",
      confidence: Math.min(signal.confidence, 50),
      pUp,
      pDown,
      votes: combinedVotes,
      isLowConfidence: true,
      suggestedDirection: strongestDirection
    };
  }
  
  if (!validation.isValid) {
    logger.info(`Signal rejected: ${validation.reason} (quality: ${validation.qualityScore.toFixed(1)})`);
    return {
      ...signal,
      direction: "NO_TRADE",
      confidence: Math.min(signal.confidence, 50),
      pUp,
      pDown,
      votes: combinedVotes,
      isLowConfidence: true,
      suggestedDirection: strongestDirection
    };
  }
  
  // Base confidence from indicator analysis
  enhancedConfidence = 55 + directionStrength * 30;
  
  enhancedConfidence += validation.qualityScore * 0.30;
  
  // Blend ML confidence if available and agreeing
  if (mlSignal && mlSignal.direction === strongestDirection) {
    const mlConfidenceBoost = (mlSignal.confidence - 50) * 0.25;
    enhancedConfidence += mlConfidenceBoost;
    
    if (mlSignal.tier === "PREMIUM") {
      enhancedConfidence += 5;
    } else if (mlSignal.tier === "STANDARD") {
      enhancedConfidence += 3;
    }
  } else if (mlSignal && mlSignal.direction !== "NO_TRADE" && mlSignal.direction !== strongestDirection) {
    // ML disagrees - reduce confidence
    enhancedConfidence -= 8;
    logger.info(`ML disagrees with indicators: ML=${mlSignal.direction}, Indicators=${strongestDirection}`);
  }
  
  if (analysis.trend.trendAlignment) {
    enhancedConfidence += 6;
  } else if (analysis.trend.trendStrength > 0.45) {
    enhancedConfidence += 4;
  } else if (analysis.trend.trendStrength > 0.35) {
    enhancedConfidence += 2;
  }
  
  if (analysis.momentum.divergence !== "NONE") {
    if ((analysis.momentum.divergence === "BULLISH_DIVERGENCE" && strongestDirection === "CALL") ||
        (analysis.momentum.divergence === "BEARISH_DIVERGENCE" && strongestDirection === "PUT")) {
      enhancedConfidence += 5;
    }
  }
  
  if (analysis.momentum.momentum !== "NEUTRAL") {
    const momentumAligned = (analysis.momentum.momentum === "BULLISH" && strongestDirection === "CALL") ||
                            (analysis.momentum.momentum === "BEARISH" && strongestDirection === "PUT");
    if (momentumAligned) {
      enhancedConfidence += 4;
    }
  }
  
  if (analysis.momentum.acceleration === "INCREASING") {
    enhancedConfidence += 3;
  }
  
  const upVotes = combinedVotes.filter(v => v.direction === "UP");
  const downVotes = combinedVotes.filter(v => v.direction === "DOWN");
  const dominantVotes = strongestDirection === "CALL" ? upVotes.length : downVotes.length;
  const strongVotes = combinedVotes.filter(v => 
    v.weight >= (QUALITY_THRESHOLDS.strongVoteThreshold || 1.15) && 
    v.direction === (strongestDirection === "CALL" ? "UP" : "DOWN")
  );
  
  if (dominantVotes >= 8 && directionStrength > 0.20) {
    enhancedConfidence += 4;
  }
  
  if (strongVotes.length >= 4) {
    enhancedConfidence += 3;
  }
  
  if (validation.qualityScore >= QUALITY_THRESHOLDS.highQuality) {
    enhancedConfidence += 3;
  } else if (validation.qualityScore >= QUALITY_THRESHOLDS.mediumQuality) {
    enhancedConfidence += 1;
  }
  
  enhancedConfidence = Math.round(Math.min(92, Math.max(55, enhancedConfidence)));
  
  const minStrength = 0.12;
  if (enhancedConfidence < SIGNAL_CONFIG.minConfidence || directionStrength < minStrength) {
    enhancedDirection = "NO_TRADE";
    logger.info(`Signal below threshold: confidence ${enhancedConfidence}% < ${SIGNAL_CONFIG.minConfidence}%, strength ${(directionStrength * 100).toFixed(1)}%`);
    return {
      ...signal,
      direction: "NO_TRADE",
      confidence: enhancedConfidence,
      pUp,
      pDown,
      votes: combinedVotes,
      isLowConfidence: true,
      suggestedDirection: strongestDirection
    };
  } else {
    enhancedDirection = strongestDirection;
  }
  
  if (signal.volatilityOverride) {
    enhancedDirection = "NO_TRADE";
  }
  
  const mlInfo = mlSignal ? ` | ML: ${mlSignal.tier} ${mlSignal.confidence}%` : "";
  logger.info(`Enhanced signal: ${enhancedDirection} with ${enhancedConfidence}% confidence (${combinedVotes.length} votes, quality: ${validation.qualityScore.toFixed(1)}, strength: ${(directionStrength * 100).toFixed(1)}%${mlInfo})`);
  
  return {
    ...signal,
    direction: enhancedDirection,
    confidence: enhancedConfidence,
    pUp,
    pDown,
    votes: combinedVotes
  };
}

export function getLastMLFeatures(): ExtractedFeatures | undefined {
  return lastMLFeatures;
}

export function clearLastMLFeatures(): void {
  lastMLFeatures = undefined;
}

logger.info("Advanced trading brain initialized with 100+ strategies and ML ensemble");
