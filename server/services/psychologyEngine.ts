import type { Candle, CandlestickPattern, PsychologyAnalysis } from "@shared/schema";
import { createLogger } from "../utils/logger";

const logger = createLogger("PsychologyEngine");

const DOJI_THRESHOLD = 0.1;
const WICK_REJECTION_THRESHOLD = 0.6;
const ENGULFING_BODY_RATIO = 1.2;
const HAMMER_WICK_RATIO = 2.0;

function calculateBodyRatio(candle: Candle): number {
  const range = candle.high - candle.low;
  if (range === 0) return 0;
  const body = Math.abs(candle.close - candle.open);
  return body / range;
}

function calculateUpperWickRatio(candle: Candle): number {
  const range = candle.high - candle.low;
  if (range === 0) return 0;
  const upperWick = candle.high - Math.max(candle.open, candle.close);
  return upperWick / range;
}

function calculateLowerWickRatio(candle: Candle): number {
  const range = candle.high - candle.low;
  if (range === 0) return 0;
  const lowerWick = Math.min(candle.open, candle.close) - candle.low;
  return lowerWick / range;
}

function isBullish(candle: Candle): boolean {
  return candle.close > candle.open;
}

function isBearish(candle: Candle): boolean {
  return candle.close < candle.open;
}

function isDoji(candle: Candle): boolean {
  return calculateBodyRatio(candle) < DOJI_THRESHOLD;
}

function detectBullishEngulfing(candles: Candle[]): CandlestickPattern | null {
  if (candles.length < 2) return null;
  
  const current = candles[candles.length - 1];
  const previous = candles[candles.length - 2];
  
  if (!isBullish(current) || !isBearish(previous)) return null;
  
  const currentBody = Math.abs(current.close - current.open);
  const previousBody = Math.abs(previous.close - previous.open);
  
  if (currentBody > previousBody * ENGULFING_BODY_RATIO &&
      current.open <= previous.close &&
      current.close >= previous.open) {
    return {
      name: "Bullish Engulfing",
      type: "bullish",
      strength: Math.min(currentBody / previousBody, 2.0),
      description: "Strong bullish reversal pattern",
    };
  }
  
  return null;
}

function detectBearishEngulfing(candles: Candle[]): CandlestickPattern | null {
  if (candles.length < 2) return null;
  
  const current = candles[candles.length - 1];
  const previous = candles[candles.length - 2];
  
  if (!isBearish(current) || !isBullish(previous)) return null;
  
  const currentBody = Math.abs(current.close - current.open);
  const previousBody = Math.abs(previous.close - previous.open);
  
  if (currentBody > previousBody * ENGULFING_BODY_RATIO &&
      current.open >= previous.close &&
      current.close <= previous.open) {
    return {
      name: "Bearish Engulfing",
      type: "bearish",
      strength: Math.min(currentBody / previousBody, 2.0),
      description: "Strong bearish reversal pattern",
    };
  }
  
  return null;
}

function detectHammer(candle: Candle): CandlestickPattern | null {
  const lowerWickRatio = calculateLowerWickRatio(candle);
  const upperWickRatio = calculateUpperWickRatio(candle);
  const bodyRatio = calculateBodyRatio(candle);
  
  if (lowerWickRatio >= WICK_REJECTION_THRESHOLD &&
      upperWickRatio < 0.1 &&
      bodyRatio < 0.4 &&
      lowerWickRatio > bodyRatio * HAMMER_WICK_RATIO) {
    return {
      name: "Hammer",
      type: "bullish",
      strength: lowerWickRatio,
      description: "Bullish reversal pattern with long lower wick",
    };
  }
  
  return null;
}

function detectShootingStar(candle: Candle): CandlestickPattern | null {
  const lowerWickRatio = calculateLowerWickRatio(candle);
  const upperWickRatio = calculateUpperWickRatio(candle);
  const bodyRatio = calculateBodyRatio(candle);
  
  if (upperWickRatio >= WICK_REJECTION_THRESHOLD &&
      lowerWickRatio < 0.1 &&
      bodyRatio < 0.4 &&
      upperWickRatio > bodyRatio * HAMMER_WICK_RATIO) {
    return {
      name: "Shooting Star",
      type: "bearish",
      strength: upperWickRatio,
      description: "Bearish reversal pattern with long upper wick",
    };
  }
  
  return null;
}

function detectDojiPattern(candle: Candle): CandlestickPattern | null {
  if (isDoji(candle)) {
    const upperWick = calculateUpperWickRatio(candle);
    const lowerWick = calculateLowerWickRatio(candle);
    
    let name = "Doji";
    if (upperWick > 0.4 && lowerWick > 0.4) {
      name = "Long-Legged Doji";
    } else if (upperWick > 0.4 && lowerWick < 0.1) {
      name = "Gravestone Doji";
    } else if (lowerWick > 0.4 && upperWick < 0.1) {
      name = "Dragonfly Doji";
    }
    
    return {
      name,
      type: "neutral",
      strength: 0.5,
      description: "Indecision pattern - watch for breakout direction",
    };
  }
  
  return null;
}

function detectWickRejection(candle: Candle): CandlestickPattern | null {
  const upperWick = calculateUpperWickRatio(candle);
  const lowerWick = calculateLowerWickRatio(candle);
  
  if (upperWick > WICK_REJECTION_THRESHOLD) {
    return {
      name: "Upper Wick Rejection",
      type: "bearish",
      strength: upperWick,
      description: "Price rejected at higher levels",
    };
  }
  
  if (lowerWick > WICK_REJECTION_THRESHOLD) {
    return {
      name: "Lower Wick Rejection",
      type: "bullish",
      strength: lowerWick,
      description: "Price rejected at lower levels",
    };
  }
  
  return null;
}

function detectMorningStar(candles: Candle[]): CandlestickPattern | null {
  if (candles.length < 3) return null;
  
  const first = candles[candles.length - 3];
  const second = candles[candles.length - 2];
  const third = candles[candles.length - 1];
  
  if (isBearish(first) &&
      isDoji(second) &&
      isBullish(third) &&
      third.close > (first.open + first.close) / 2) {
    return {
      name: "Morning Star",
      type: "bullish",
      strength: 1.5,
      description: "Strong bullish reversal pattern",
    };
  }
  
  return null;
}

function detectEveningStar(candles: Candle[]): CandlestickPattern | null {
  if (candles.length < 3) return null;
  
  const first = candles[candles.length - 3];
  const second = candles[candles.length - 2];
  const third = candles[candles.length - 1];
  
  if (isBullish(first) &&
      isDoji(second) &&
      isBearish(third) &&
      third.close < (first.open + first.close) / 2) {
    return {
      name: "Evening Star",
      type: "bearish",
      strength: 1.5,
      description: "Strong bearish reversal pattern",
    };
  }
  
  return null;
}

function detectOrderBlock(candles: Candle[]): number {
  if (candles.length < 5) return 0;
  
  const recentCandles = candles.slice(-5);
  let bullishCount = 0;
  let bearishCount = 0;
  
  for (const candle of recentCandles) {
    if (isBullish(candle)) bullishCount++;
    if (isBearish(candle)) bearishCount++;
  }
  
  const lastCandle = recentCandles[recentCandles.length - 1];
  const lastBodySize = Math.abs(lastCandle.close - lastCandle.open);
  const avgBodySize = recentCandles
    .map(c => Math.abs(c.close - c.open))
    .reduce((a, b) => a + b, 0) / recentCandles.length;
  
  if (lastBodySize > avgBodySize * 1.5) {
    if (bullishCount >= 4) return 0.8;
    if (bearishCount >= 4) return 0.8;
  }
  
  if (bullishCount >= 3 || bearishCount >= 3) {
    return 0.5;
  }
  
  return 0.2;
}

function detectFVG(candles: Candle[]): boolean {
  if (candles.length < 3) return false;
  
  const first = candles[candles.length - 3];
  const third = candles[candles.length - 1];
  
  if (first.low > third.high) {
    return true;
  }
  
  if (first.high < third.low) {
    return true;
  }
  
  return false;
}

function determineBias(patterns: CandlestickPattern[]): "bullish" | "bearish" | "neutral" {
  let bullishScore = 0;
  let bearishScore = 0;
  
  for (const pattern of patterns) {
    if (pattern.type === "bullish") {
      bullishScore += pattern.strength;
    } else if (pattern.type === "bearish") {
      bearishScore += pattern.strength;
    }
  }
  
  const diff = bullishScore - bearishScore;
  if (diff > 0.3) return "bullish";
  if (diff < -0.3) return "bearish";
  return "neutral";
}

export function analyzePsychology(candles: Candle[]): PsychologyAnalysis {
  if (candles.length === 0) {
    return {
      bodyRatio: 0,
      upperWickRatio: 0,
      lowerWickRatio: 0,
      isDoji: false,
      patterns: [],
      bias: "neutral",
      orderBlockProbability: 0,
      fvgDetected: false,
    };
  }

  const lastCandle = candles[candles.length - 1];
  const patterns: CandlestickPattern[] = [];

  const bullishEngulfing = detectBullishEngulfing(candles);
  if (bullishEngulfing) patterns.push(bullishEngulfing);

  const bearishEngulfing = detectBearishEngulfing(candles);
  if (bearishEngulfing) patterns.push(bearishEngulfing);

  const hammer = detectHammer(lastCandle);
  if (hammer) patterns.push(hammer);

  const shootingStar = detectShootingStar(lastCandle);
  if (shootingStar) patterns.push(shootingStar);

  const dojiPattern = detectDojiPattern(lastCandle);
  if (dojiPattern) patterns.push(dojiPattern);

  const wickRejection = detectWickRejection(lastCandle);
  if (wickRejection) patterns.push(wickRejection);

  const morningStar = detectMorningStar(candles);
  if (morningStar) patterns.push(morningStar);

  const eveningStar = detectEveningStar(candles);
  if (eveningStar) patterns.push(eveningStar);

  const analysis: PsychologyAnalysis = {
    bodyRatio: calculateBodyRatio(lastCandle),
    upperWickRatio: calculateUpperWickRatio(lastCandle),
    lowerWickRatio: calculateLowerWickRatio(lastCandle),
    isDoji: isDoji(lastCandle),
    patterns,
    bias: determineBias(patterns),
    orderBlockProbability: detectOrderBlock(candles),
    fvgDetected: detectFVG(candles),
  };

  logger.debug("Psychology analysis", { patterns: patterns.length, bias: analysis.bias });
  
  return analysis;
}
