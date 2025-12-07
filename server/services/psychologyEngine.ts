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

function detectThreeWhiteSoldiers(candles: Candle[]): CandlestickPattern | null {
  if (candles.length < 3) return null;
  
  const c1 = candles[candles.length - 3];
  const c2 = candles[candles.length - 2];
  const c3 = candles[candles.length - 1];
  
  if (!isBullish(c1) || !isBullish(c2) || !isBullish(c3)) return null;
  
  const body1 = Math.abs(c1.close - c1.open);
  const body2 = Math.abs(c2.close - c2.open);
  const body3 = Math.abs(c3.close - c3.open);
  const avgBody = (body1 + body2 + body3) / 3;
  
  if (c2.open > c1.open && c2.close > c1.close &&
      c3.open > c2.open && c3.close > c2.close &&
      body1 > avgBody * 0.5 && body2 > avgBody * 0.5 && body3 > avgBody * 0.5) {
    const upperWick1 = calculateUpperWickRatio(c1);
    const upperWick2 = calculateUpperWickRatio(c2);
    const upperWick3 = calculateUpperWickRatio(c3);
    
    if (upperWick1 < 0.3 && upperWick2 < 0.3 && upperWick3 < 0.3) {
      return {
        name: "Three White Soldiers",
        type: "bullish",
        strength: 1.8,
        description: "Strong bullish continuation pattern - three consecutive bullish candles",
      };
    }
  }
  
  return null;
}

function detectThreeBlackCrows(candles: Candle[]): CandlestickPattern | null {
  if (candles.length < 3) return null;
  
  const c1 = candles[candles.length - 3];
  const c2 = candles[candles.length - 2];
  const c3 = candles[candles.length - 1];
  
  if (!isBearish(c1) || !isBearish(c2) || !isBearish(c3)) return null;
  
  const body1 = Math.abs(c1.close - c1.open);
  const body2 = Math.abs(c2.close - c2.open);
  const body3 = Math.abs(c3.close - c3.open);
  const avgBody = (body1 + body2 + body3) / 3;
  
  if (c2.open < c1.open && c2.close < c1.close &&
      c3.open < c2.open && c3.close < c2.close &&
      body1 > avgBody * 0.5 && body2 > avgBody * 0.5 && body3 > avgBody * 0.5) {
    const lowerWick1 = calculateLowerWickRatio(c1);
    const lowerWick2 = calculateLowerWickRatio(c2);
    const lowerWick3 = calculateLowerWickRatio(c3);
    
    if (lowerWick1 < 0.3 && lowerWick2 < 0.3 && lowerWick3 < 0.3) {
      return {
        name: "Three Black Crows",
        type: "bearish",
        strength: 1.8,
        description: "Strong bearish continuation pattern - three consecutive bearish candles",
      };
    }
  }
  
  return null;
}

function detectInsideBar(candles: Candle[]): CandlestickPattern | null {
  if (candles.length < 2) return null;
  
  const mother = candles[candles.length - 2];
  const inside = candles[candles.length - 1];
  
  if (inside.high < mother.high && inside.low > mother.low) {
    const motherRange = mother.high - mother.low;
    const insideRange = inside.high - inside.low;
    
    if (insideRange < motherRange * 0.7) {
      return {
        name: "Inside Bar",
        type: "neutral",
        strength: 1.2,
        description: "Consolidation pattern - breakout expected in direction of trend",
      };
    }
  }
  
  return null;
}

function detectOutsideBar(candles: Candle[]): CandlestickPattern | null {
  if (candles.length < 2) return null;
  
  const previous = candles[candles.length - 2];
  const current = candles[candles.length - 1];
  
  if (current.high > previous.high && current.low < previous.low) {
    const prevRange = previous.high - previous.low;
    const currRange = current.high - current.low;
    
    if (currRange > prevRange * 1.3) {
      const type = isBullish(current) ? "bullish" : isBearish(current) ? "bearish" : "neutral";
      return {
        name: "Outside Bar",
        type,
        strength: 1.4,
        description: `Engulfing range pattern - strong ${type} momentum`,
      };
    }
  }
  
  return null;
}

function detectTweezerTop(candles: Candle[]): CandlestickPattern | null {
  if (candles.length < 2) return null;
  
  const c1 = candles[candles.length - 2];
  const c2 = candles[candles.length - 1];
  
  const highDiff = Math.abs(c1.high - c2.high);
  const avgRange = ((c1.high - c1.low) + (c2.high - c2.low)) / 2;
  
  if (isBullish(c1) && isBearish(c2) && highDiff < avgRange * 0.1) {
    return {
      name: "Tweezer Top",
      type: "bearish",
      strength: 1.3,
      description: "Bearish reversal at resistance - matching highs rejected",
    };
  }
  
  return null;
}

function detectTweezerBottom(candles: Candle[]): CandlestickPattern | null {
  if (candles.length < 2) return null;
  
  const c1 = candles[candles.length - 2];
  const c2 = candles[candles.length - 1];
  
  const lowDiff = Math.abs(c1.low - c2.low);
  const avgRange = ((c1.high - c1.low) + (c2.high - c2.low)) / 2;
  
  if (isBearish(c1) && isBullish(c2) && lowDiff < avgRange * 0.1) {
    return {
      name: "Tweezer Bottom",
      type: "bullish",
      strength: 1.3,
      description: "Bullish reversal at support - matching lows held",
    };
  }
  
  return null;
}

function detectPiercingLine(candles: Candle[]): CandlestickPattern | null {
  if (candles.length < 2) return null;
  
  const c1 = candles[candles.length - 2];
  const c2 = candles[candles.length - 1];
  
  if (!isBearish(c1) || !isBullish(c2)) return null;
  
  const c1Body = Math.abs(c1.close - c1.open);
  const c1MidPoint = c1.open - c1Body * 0.5;
  
  if (c2.open < c1.low && c2.close > c1MidPoint && c2.close < c1.open) {
    return {
      name: "Piercing Line",
      type: "bullish",
      strength: 1.4,
      description: "Bullish reversal - gap down followed by strong close above midpoint",
    };
  }
  
  return null;
}

function detectDarkCloudCover(candles: Candle[]): CandlestickPattern | null {
  if (candles.length < 2) return null;
  
  const c1 = candles[candles.length - 2];
  const c2 = candles[candles.length - 1];
  
  if (!isBullish(c1) || !isBearish(c2)) return null;
  
  const c1Body = Math.abs(c1.close - c1.open);
  const c1MidPoint = c1.open + c1Body * 0.5;
  
  if (c2.open > c1.high && c2.close < c1MidPoint && c2.close > c1.open) {
    return {
      name: "Dark Cloud Cover",
      type: "bearish",
      strength: 1.4,
      description: "Bearish reversal - gap up followed by strong close below midpoint",
    };
  }
  
  return null;
}

function detectRisingThreeMethods(candles: Candle[]): CandlestickPattern | null {
  if (candles.length < 5) return null;
  
  const c1 = candles[candles.length - 5];
  const mid1 = candles[candles.length - 4];
  const mid2 = candles[candles.length - 3];
  const mid3 = candles[candles.length - 2];
  const c5 = candles[candles.length - 1];
  
  if (!isBullish(c1) || !isBullish(c5)) return null;
  
  const smallBodies = [mid1, mid2, mid3].every(c => {
    const body = Math.abs(c.close - c.open);
    const c1Body = Math.abs(c1.close - c1.open);
    return body < c1Body * 0.5 && c.high < c1.high && c.low > c1.low;
  });
  
  if (smallBodies && c5.close > c1.close) {
    return {
      name: "Rising Three Methods",
      type: "bullish",
      strength: 1.5,
      description: "Bullish continuation - consolidation within uptrend resolved higher",
    };
  }
  
  return null;
}

function detectFallingThreeMethods(candles: Candle[]): CandlestickPattern | null {
  if (candles.length < 5) return null;
  
  const c1 = candles[candles.length - 5];
  const mid1 = candles[candles.length - 4];
  const mid2 = candles[candles.length - 3];
  const mid3 = candles[candles.length - 2];
  const c5 = candles[candles.length - 1];
  
  if (!isBearish(c1) || !isBearish(c5)) return null;
  
  const smallBodies = [mid1, mid2, mid3].every(c => {
    const body = Math.abs(c.close - c.open);
    const c1Body = Math.abs(c1.close - c1.open);
    return body < c1Body * 0.5 && c.high < c1.open && c.low > c1.close;
  });
  
  if (smallBodies && c5.close < c1.close) {
    return {
      name: "Falling Three Methods",
      type: "bearish",
      strength: 1.5,
      description: "Bearish continuation - consolidation within downtrend resolved lower",
    };
  }
  
  return null;
}

function detectBullishHarami(candles: Candle[]): CandlestickPattern | null {
  if (candles.length < 2) return null;
  
  const c1 = candles[candles.length - 2];
  const c2 = candles[candles.length - 1];
  
  if (!isBearish(c1) || !isBullish(c2)) return null;
  
  const c1Body = Math.abs(c1.close - c1.open);
  const c2Body = Math.abs(c2.close - c2.open);
  
  if (c2.open > c1.close && c2.close < c1.open && c2Body < c1Body * 0.6) {
    return {
      name: "Bullish Harami",
      type: "bullish",
      strength: 1.2,
      description: "Potential bullish reversal - small bullish body inside large bearish body",
    };
  }
  
  return null;
}

function detectBearishHarami(candles: Candle[]): CandlestickPattern | null {
  if (candles.length < 2) return null;
  
  const c1 = candles[candles.length - 2];
  const c2 = candles[candles.length - 1];
  
  if (!isBullish(c1) || !isBearish(c2)) return null;
  
  const c1Body = Math.abs(c1.close - c1.open);
  const c2Body = Math.abs(c2.close - c2.open);
  
  if (c2.open < c1.close && c2.close > c1.open && c2Body < c1Body * 0.6) {
    return {
      name: "Bearish Harami",
      type: "bearish",
      strength: 1.2,
      description: "Potential bearish reversal - small bearish body inside large bullish body",
    };
  }
  
  return null;
}

function detectInvertedHammer(candle: Candle): CandlestickPattern | null {
  const upperWickRatio = calculateUpperWickRatio(candle);
  const lowerWickRatio = calculateLowerWickRatio(candle);
  const bodyRatio = calculateBodyRatio(candle);
  
  if (upperWickRatio >= WICK_REJECTION_THRESHOLD &&
      lowerWickRatio < 0.1 &&
      bodyRatio < 0.4 &&
      upperWickRatio > bodyRatio * HAMMER_WICK_RATIO) {
    return {
      name: "Inverted Hammer",
      type: "bullish",
      strength: 1.1,
      description: "Bullish reversal pattern with long upper wick (needs confirmation)",
    };
  }
  
  return null;
}

function detectHangingMan(candle: Candle): CandlestickPattern | null {
  const lowerWickRatio = calculateLowerWickRatio(candle);
  const upperWickRatio = calculateUpperWickRatio(candle);
  const bodyRatio = calculateBodyRatio(candle);
  
  if (lowerWickRatio >= WICK_REJECTION_THRESHOLD &&
      upperWickRatio < 0.1 &&
      bodyRatio < 0.4 &&
      lowerWickRatio > bodyRatio * HAMMER_WICK_RATIO &&
      isBearish(candle)) {
    return {
      name: "Hanging Man",
      type: "bearish",
      strength: 1.1,
      description: "Bearish reversal pattern - hammer shape at top of uptrend",
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

  const threeWhiteSoldiers = detectThreeWhiteSoldiers(candles);
  if (threeWhiteSoldiers) patterns.push(threeWhiteSoldiers);

  const threeBlackCrows = detectThreeBlackCrows(candles);
  if (threeBlackCrows) patterns.push(threeBlackCrows);

  const insideBar = detectInsideBar(candles);
  if (insideBar) patterns.push(insideBar);

  const outsideBar = detectOutsideBar(candles);
  if (outsideBar) patterns.push(outsideBar);

  const tweezerTop = detectTweezerTop(candles);
  if (tweezerTop) patterns.push(tweezerTop);

  const tweezerBottom = detectTweezerBottom(candles);
  if (tweezerBottom) patterns.push(tweezerBottom);

  const piercingLine = detectPiercingLine(candles);
  if (piercingLine) patterns.push(piercingLine);

  const darkCloudCover = detectDarkCloudCover(candles);
  if (darkCloudCover) patterns.push(darkCloudCover);

  const risingThree = detectRisingThreeMethods(candles);
  if (risingThree) patterns.push(risingThree);

  const fallingThree = detectFallingThreeMethods(candles);
  if (fallingThree) patterns.push(fallingThree);

  const bullishHarami = detectBullishHarami(candles);
  if (bullishHarami) patterns.push(bullishHarami);

  const bearishHarami = detectBearishHarami(candles);
  if (bearishHarami) patterns.push(bearishHarami);

  const invertedHammer = detectInvertedHammer(lastCandle);
  if (invertedHammer) patterns.push(invertedHammer);

  const hangingMan = detectHangingMan(lastCandle);
  if (hangingMan) patterns.push(hangingMan);

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
