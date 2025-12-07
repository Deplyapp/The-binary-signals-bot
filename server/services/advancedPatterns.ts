import type { Candle, CandlestickPattern } from "@shared/schema";
import { createLogger } from "../utils/logger";

const logger = createLogger("AdvancedPatterns");

export interface HarmonicPattern {
  name: string;
  type: 'bullish' | 'bearish';
  strength: number;
  completionLevel: number;
  description: string;
  fibLevels: number[];
}

export interface ChartPattern {
  name: string;
  type: 'bullish' | 'bearish' | 'neutral';
  strength: number;
  targetPrice?: number;
  description: string;
}

export interface AdvancedPatternAnalysis {
  harmonicPatterns: HarmonicPattern[];
  chartPatterns: ChartPattern[];
  totalPatternScore: number;
  dominantBias: 'bullish' | 'bearish' | 'neutral';
}

const FIB_RATIOS = {
  0.236: 0.236,
  0.382: 0.382,
  0.5: 0.5,
  0.618: 0.618,
  0.786: 0.786,
  0.886: 0.886,
  1.0: 1.0,
  1.272: 1.272,
  1.414: 1.414,
  1.618: 1.618,
  2.0: 2.0,
  2.618: 2.618,
};

const TOLERANCE = 0.03;

function isWithinTolerance(value: number, target: number, tolerance: number = TOLERANCE): boolean {
  return Math.abs(value - target) <= tolerance;
}

function findSwingPoints(candles: Candle[], lookback: number = 5): { highs: number[]; lows: number[]; highIndices: number[]; lowIndices: number[] } {
  const highs: number[] = [];
  const lows: number[] = [];
  const highIndices: number[] = [];
  const lowIndices: number[] = [];
  
  for (let i = lookback; i < candles.length - lookback; i++) {
    let isHigh = true;
    let isLow = true;
    
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) isHigh = false;
      if (candles[j].low <= candles[i].low) isLow = false;
    }
    
    if (isHigh) {
      highs.push(candles[i].high);
      highIndices.push(i);
    }
    if (isLow) {
      lows.push(candles[i].low);
      lowIndices.push(i);
    }
  }
  
  return { highs, lows, highIndices, lowIndices };
}

function detectGartley(candles: Candle[]): HarmonicPattern | null {
  if (candles.length < 50) return null;
  
  const swings = findSwingPoints(candles, 3);
  if (swings.highs.length < 2 || swings.lows.length < 2) return null;
  
  const recentCandles = candles.slice(-30);
  const prices = recentCandles.map(c => (c.high + c.low) / 2);
  
  const max = Math.max(...prices);
  const min = Math.min(...prices);
  const range = max - min;
  
  if (range === 0) return null;
  
  const currentPrice = prices[prices.length - 1];
  const retracementFromHigh = (max - currentPrice) / range;
  const retracementFromLow = (currentPrice - min) / range;
  
  if (isWithinTolerance(retracementFromHigh, 0.618, 0.05) || 
      isWithinTolerance(retracementFromHigh, 0.786, 0.05)) {
    return {
      name: "Gartley",
      type: "bullish",
      strength: 1.4,
      completionLevel: retracementFromHigh,
      description: "Bullish Gartley pattern - potential reversal zone at 61.8-78.6% retracement",
      fibLevels: [0.618, 0.786],
    };
  }
  
  if (isWithinTolerance(retracementFromLow, 0.618, 0.05) || 
      isWithinTolerance(retracementFromLow, 0.786, 0.05)) {
    return {
      name: "Gartley",
      type: "bearish",
      strength: 1.4,
      completionLevel: retracementFromLow,
      description: "Bearish Gartley pattern - potential reversal zone at 61.8-78.6% extension",
      fibLevels: [0.618, 0.786],
    };
  }
  
  return null;
}

function detectButterfly(candles: Candle[]): HarmonicPattern | null {
  if (candles.length < 50) return null;
  
  const recentCandles = candles.slice(-40);
  const prices = recentCandles.map(c => (c.high + c.low) / 2);
  
  const max = Math.max(...prices);
  const min = Math.min(...prices);
  const range = max - min;
  
  if (range === 0) return null;
  
  const currentPrice = prices[prices.length - 1];
  const extensionFromLow = (currentPrice - min) / range;
  const extensionFromHigh = (max - currentPrice) / range;
  
  if (isWithinTolerance(extensionFromHigh, 1.272, 0.08) || 
      isWithinTolerance(extensionFromHigh, 1.618, 0.08)) {
    return {
      name: "Butterfly",
      type: "bullish",
      strength: 1.5,
      completionLevel: extensionFromHigh,
      description: "Bullish Butterfly pattern - extended reversal zone at 127.2-161.8%",
      fibLevels: [1.272, 1.618],
    };
  }
  
  if (isWithinTolerance(extensionFromLow, 1.272, 0.08) || 
      isWithinTolerance(extensionFromLow, 1.618, 0.08)) {
    return {
      name: "Butterfly",
      type: "bearish",
      strength: 1.5,
      completionLevel: extensionFromLow,
      description: "Bearish Butterfly pattern - extended reversal zone at 127.2-161.8%",
      fibLevels: [1.272, 1.618],
    };
  }
  
  return null;
}

function detectBat(candles: Candle[]): HarmonicPattern | null {
  if (candles.length < 50) return null;
  
  const recentCandles = candles.slice(-35);
  const prices = recentCandles.map(c => (c.high + c.low) / 2);
  
  const max = Math.max(...prices);
  const min = Math.min(...prices);
  const range = max - min;
  
  if (range === 0) return null;
  
  const currentPrice = prices[prices.length - 1];
  const retracementFromHigh = (max - currentPrice) / range;
  const retracementFromLow = (currentPrice - min) / range;
  
  if (isWithinTolerance(retracementFromHigh, 0.886, 0.05)) {
    return {
      name: "Bat",
      type: "bullish",
      strength: 1.5,
      completionLevel: retracementFromHigh,
      description: "Bullish Bat pattern - deep 88.6% retracement reversal zone",
      fibLevels: [0.886],
    };
  }
  
  if (isWithinTolerance(retracementFromLow, 0.886, 0.05)) {
    return {
      name: "Bat",
      type: "bearish",
      strength: 1.5,
      completionLevel: retracementFromLow,
      description: "Bearish Bat pattern - deep 88.6% extension reversal zone",
      fibLevels: [0.886],
    };
  }
  
  return null;
}

function detectCrab(candles: Candle[]): HarmonicPattern | null {
  if (candles.length < 50) return null;
  
  const recentCandles = candles.slice(-45);
  const prices = recentCandles.map(c => (c.high + c.low) / 2);
  
  const max = Math.max(...prices);
  const min = Math.min(...prices);
  const range = max - min;
  
  if (range === 0) return null;
  
  const currentPrice = prices[prices.length - 1];
  const extensionFromLow = (currentPrice - min) / range;
  const extensionFromHigh = (max - currentPrice) / range;
  
  if (extensionFromHigh > 1.5 && extensionFromHigh < 1.7) {
    return {
      name: "Crab",
      type: "bullish",
      strength: 1.6,
      completionLevel: extensionFromHigh,
      description: "Bullish Crab pattern - extreme 161.8% extension reversal",
      fibLevels: [1.618],
    };
  }
  
  if (extensionFromLow > 1.5 && extensionFromLow < 1.7) {
    return {
      name: "Crab",
      type: "bearish",
      strength: 1.6,
      completionLevel: extensionFromLow,
      description: "Bearish Crab pattern - extreme 161.8% extension reversal",
      fibLevels: [1.618],
    };
  }
  
  return null;
}

function detectCypher(candles: Candle[]): HarmonicPattern | null {
  if (candles.length < 50) return null;
  
  const recentCandles = candles.slice(-30);
  const prices = recentCandles.map(c => (c.high + c.low) / 2);
  
  const max = Math.max(...prices);
  const min = Math.min(...prices);
  const range = max - min;
  
  if (range === 0) return null;
  
  const currentPrice = prices[prices.length - 1];
  const retracementFromHigh = (max - currentPrice) / range;
  const retracementFromLow = (currentPrice - min) / range;
  
  if (isWithinTolerance(retracementFromHigh, 0.786, 0.04)) {
    return {
      name: "Cypher",
      type: "bullish",
      strength: 1.4,
      completionLevel: retracementFromHigh,
      description: "Bullish Cypher pattern - 78.6% retracement completion zone",
      fibLevels: [0.382, 0.786],
    };
  }
  
  if (isWithinTolerance(retracementFromLow, 0.786, 0.04)) {
    return {
      name: "Cypher",
      type: "bearish",
      strength: 1.4,
      completionLevel: retracementFromLow,
      description: "Bearish Cypher pattern - 78.6% extension completion zone",
      fibLevels: [0.382, 0.786],
    };
  }
  
  return null;
}

function detectDoubleTop(candles: Candle[]): ChartPattern | null {
  if (candles.length < 30) return null;
  
  const highs = candles.map(c => c.high);
  const recentHighs = highs.slice(-25);
  
  const maxHigh = Math.max(...recentHighs);
  const maxIndex = recentHighs.lastIndexOf(maxHigh);
  
  const firstPeak = recentHighs.slice(0, Math.max(5, maxIndex - 3));
  if (firstPeak.length === 0) return null;
  
  const firstPeakHigh = Math.max(...firstPeak);
  const tolerance = maxHigh * 0.01;
  
  if (Math.abs(maxHigh - firstPeakHigh) < tolerance && maxIndex > 5) {
    const currentPrice = candles[candles.length - 1].close;
    if (currentPrice < maxHigh * 0.98) {
      return {
        name: "Double Top",
        type: "bearish",
        strength: 1.5,
        description: "Bearish double top pattern - two matching peaks followed by rejection",
      };
    }
  }
  
  return null;
}

function detectDoubleBottom(candles: Candle[]): ChartPattern | null {
  if (candles.length < 30) return null;
  
  const lows = candles.map(c => c.low);
  const recentLows = lows.slice(-25);
  
  const minLow = Math.min(...recentLows);
  const minIndex = recentLows.lastIndexOf(minLow);
  
  const firstTrough = recentLows.slice(0, Math.max(5, minIndex - 3));
  if (firstTrough.length === 0) return null;
  
  const firstTroughLow = Math.min(...firstTrough);
  const tolerance = minLow * 0.01;
  
  if (Math.abs(minLow - firstTroughLow) < tolerance && minIndex > 5) {
    const currentPrice = candles[candles.length - 1].close;
    if (currentPrice > minLow * 1.02) {
      return {
        name: "Double Bottom",
        type: "bullish",
        strength: 1.5,
        description: "Bullish double bottom pattern - two matching lows followed by bounce",
      };
    }
  }
  
  return null;
}

function detectHeadAndShoulders(candles: Candle[]): ChartPattern | null {
  if (candles.length < 40) return null;
  
  const swings = findSwingPoints(candles.slice(-35), 3);
  
  if (swings.highs.length >= 3) {
    const recentHighs = swings.highs.slice(-3);
    const [left, head, right] = recentHighs;
    
    if (head > left && head > right && 
        Math.abs(left - right) / head < 0.05 &&
        head > left * 1.02) {
      return {
        name: "Head and Shoulders",
        type: "bearish",
        strength: 1.7,
        description: "Bearish head and shoulders - classic reversal pattern forming",
      };
    }
  }
  
  return null;
}

function detectInverseHeadAndShoulders(candles: Candle[]): ChartPattern | null {
  if (candles.length < 40) return null;
  
  const swings = findSwingPoints(candles.slice(-35), 3);
  
  if (swings.lows.length >= 3) {
    const recentLows = swings.lows.slice(-3);
    const [left, head, right] = recentLows;
    
    if (head < left && head < right && 
        Math.abs(left - right) / head < 0.05 &&
        head < left * 0.98) {
      return {
        name: "Inverse Head and Shoulders",
        type: "bullish",
        strength: 1.7,
        description: "Bullish inverse head and shoulders - classic reversal pattern forming",
      };
    }
  }
  
  return null;
}

function detectTriangle(candles: Candle[]): ChartPattern | null {
  if (candles.length < 20) return null;
  
  const recentCandles = candles.slice(-15);
  const highs = recentCandles.map(c => c.high);
  const lows = recentCandles.map(c => c.low);
  
  let higherLows = true;
  let lowerHighs = true;
  
  for (let i = 1; i < 5; i++) {
    if (lows[lows.length - i] <= lows[lows.length - i - 3]) higherLows = false;
    if (highs[highs.length - i] >= highs[highs.length - i - 3]) lowerHighs = false;
  }
  
  if (higherLows && lowerHighs) {
    return {
      name: "Symmetrical Triangle",
      type: "neutral",
      strength: 1.2,
      description: "Symmetrical triangle forming - breakout expected in trend direction",
    };
  }
  
  if (higherLows && !lowerHighs) {
    return {
      name: "Ascending Triangle",
      type: "bullish",
      strength: 1.4,
      description: "Ascending triangle - bullish breakout likely with higher lows",
    };
  }
  
  if (!higherLows && lowerHighs) {
    return {
      name: "Descending Triangle",
      type: "bearish",
      strength: 1.4,
      description: "Descending triangle - bearish breakout likely with lower highs",
    };
  }
  
  return null;
}

function detectFlag(candles: Candle[]): ChartPattern | null {
  if (candles.length < 25) return null;
  
  const flagPole = candles.slice(-25, -10);
  const flag = candles.slice(-10);
  
  const poleStart = flagPole[0].close;
  const poleEnd = flagPole[flagPole.length - 1].close;
  const poleChange = (poleEnd - poleStart) / poleStart;
  
  const flagRange = Math.max(...flag.map(c => c.high)) - Math.min(...flag.map(c => c.low));
  const poleRange = Math.abs(poleEnd - poleStart);
  
  if (Math.abs(poleChange) > 0.02 && flagRange < poleRange * 0.5) {
    const isBullish = poleChange > 0;
    return {
      name: isBullish ? "Bull Flag" : "Bear Flag",
      type: isBullish ? "bullish" : "bearish",
      strength: 1.4,
      description: `${isBullish ? "Bullish" : "Bearish"} flag pattern - continuation expected after consolidation`,
    };
  }
  
  return null;
}

function detectWedge(candles: Candle[]): ChartPattern | null {
  if (candles.length < 20) return null;
  
  const recentCandles = candles.slice(-15);
  const highs = recentCandles.map(c => c.high);
  const lows = recentCandles.map(c => c.low);
  
  const highSlope = (highs[highs.length - 1] - highs[0]) / highs.length;
  const lowSlope = (lows[lows.length - 1] - lows[0]) / lows.length;
  
  if (highSlope > 0 && lowSlope > 0 && highSlope < lowSlope * 0.8) {
    return {
      name: "Rising Wedge",
      type: "bearish",
      strength: 1.3,
      description: "Rising wedge pattern - bearish reversal likely as momentum weakens",
    };
  }
  
  if (highSlope < 0 && lowSlope < 0 && Math.abs(highSlope) > Math.abs(lowSlope) * 0.8) {
    return {
      name: "Falling Wedge",
      type: "bullish",
      strength: 1.3,
      description: "Falling wedge pattern - bullish reversal likely as selling pressure weakens",
    };
  }
  
  return null;
}

export function analyzeAdvancedPatterns(candles: Candle[]): AdvancedPatternAnalysis {
  const harmonicPatterns: HarmonicPattern[] = [];
  const chartPatterns: ChartPattern[] = [];
  
  const gartley = detectGartley(candles);
  if (gartley) harmonicPatterns.push(gartley);
  
  const butterfly = detectButterfly(candles);
  if (butterfly) harmonicPatterns.push(butterfly);
  
  const bat = detectBat(candles);
  if (bat) harmonicPatterns.push(bat);
  
  const crab = detectCrab(candles);
  if (crab) harmonicPatterns.push(crab);
  
  const cypher = detectCypher(candles);
  if (cypher) harmonicPatterns.push(cypher);
  
  const doubleTop = detectDoubleTop(candles);
  if (doubleTop) chartPatterns.push(doubleTop);
  
  const doubleBottom = detectDoubleBottom(candles);
  if (doubleBottom) chartPatterns.push(doubleBottom);
  
  const headAndShoulders = detectHeadAndShoulders(candles);
  if (headAndShoulders) chartPatterns.push(headAndShoulders);
  
  const inverseHS = detectInverseHeadAndShoulders(candles);
  if (inverseHS) chartPatterns.push(inverseHS);
  
  const triangle = detectTriangle(candles);
  if (triangle) chartPatterns.push(triangle);
  
  const flag = detectFlag(candles);
  if (flag) chartPatterns.push(flag);
  
  const wedge = detectWedge(candles);
  if (wedge) chartPatterns.push(wedge);
  
  let bullishScore = 0;
  let bearishScore = 0;
  
  for (const hp of harmonicPatterns) {
    if (hp.type === 'bullish') bullishScore += hp.strength;
    else bearishScore += hp.strength;
  }
  
  for (const cp of chartPatterns) {
    if (cp.type === 'bullish') bullishScore += cp.strength;
    else if (cp.type === 'bearish') bearishScore += cp.strength;
  }
  
  const totalPatternScore = bullishScore + bearishScore;
  let dominantBias: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  
  if (bullishScore > bearishScore + 0.5) dominantBias = 'bullish';
  else if (bearishScore > bullishScore + 0.5) dominantBias = 'bearish';
  
  logger.debug(`Advanced patterns: ${harmonicPatterns.length} harmonic, ${chartPatterns.length} chart, bias=${dominantBias}`);
  
  return {
    harmonicPatterns,
    chartPatterns,
    totalPatternScore,
    dominantBias,
  };
}

export function getAdvancedPatternVotes(analysis: AdvancedPatternAnalysis): Array<{ indicator: string; direction: 'UP' | 'DOWN' | 'NEUTRAL'; weight: number; reason: string }> {
  const votes: Array<{ indicator: string; direction: 'UP' | 'DOWN' | 'NEUTRAL'; weight: number; reason: string }> = [];
  
  for (const hp of analysis.harmonicPatterns) {
    votes.push({
      indicator: `harmonic_${hp.name.toLowerCase()}`,
      direction: hp.type === 'bullish' ? 'UP' : 'DOWN',
      weight: hp.strength,
      reason: hp.description,
    });
  }
  
  for (const cp of analysis.chartPatterns) {
    votes.push({
      indicator: `chart_${cp.name.toLowerCase().replace(/\s+/g, '_')}`,
      direction: cp.type === 'bullish' ? 'UP' : cp.type === 'bearish' ? 'DOWN' : 'NEUTRAL',
      weight: cp.strength,
      reason: cp.description,
    });
  }
  
  return votes;
}
