import { candleAggregator } from "./candleAggregator";
import { derivFeed } from "./derivFeed";
import { computeIndicators } from "./indicatorEngine";
import { createLogger } from "../utils/logger";
import type { Candle, IndicatorValues } from "@shared/schema";

const logger = createLogger("MultiTimeframeEngine");

interface TimeframeMapping {
  primary: number;
  higher: number[];
}

const TIMEFRAME_MAPPINGS: TimeframeMapping[] = [
  { primary: 60, higher: [300, 900, 1800] },
  { primary: 300, higher: [900, 1800, 3600] },
  { primary: 900, higher: [1800, 3600] },
  { primary: 1800, higher: [3600, 14400] },
  { primary: 3600, higher: [14400, 86400] },
];

export interface MTFAnalysis {
  primaryTimeframe: number;
  higherTimeframes: HigherTimeframeResult[];
  overallBias: 'bullish' | 'bearish' | 'neutral';
  confluenceScore: number;
  confidenceBonus: number;
}

export interface HigherTimeframeResult {
  timeframe: number;
  bias: 'bullish' | 'bearish' | 'neutral';
  strength: number;
  trendDirection: 'up' | 'down' | 'sideways';
  keyLevels?: { support: number; resistance: number };
}

function getHigherTimeframes(primaryTimeframe: number): number[] {
  const mapping = TIMEFRAME_MAPPINGS.find(m => m.primary === primaryTimeframe);
  if (mapping) {
    return mapping.higher;
  }
  if (primaryTimeframe < 60) {
    return [60, 300, 900];
  }
  return [primaryTimeframe * 5, primaryTimeframe * 15];
}

function aggregateToHigherTimeframe(candles: Candle[], targetTimeframe: number): Candle[] {
  if (candles.length === 0) return [];
  
  const aggregated: Map<number, Candle> = new Map();
  
  for (const candle of candles) {
    const htfBoundary = Math.floor(candle.timestamp / targetTimeframe) * targetTimeframe;
    
    if (!aggregated.has(htfBoundary)) {
      aggregated.set(htfBoundary, {
        symbol: candle.symbol,
        timeframe: targetTimeframe,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        timestamp: htfBoundary,
        tickCount: candle.tickCount,
        isForming: false,
      });
    } else {
      const existing = aggregated.get(htfBoundary)!;
      existing.high = Math.max(existing.high, candle.high);
      existing.low = Math.min(existing.low, candle.low);
      existing.close = candle.close;
      existing.tickCount += candle.tickCount;
    }
  }
  
  return Array.from(aggregated.values()).sort((a, b) => a.timestamp - b.timestamp);
}

function analyzeHigherTimeframe(candles: Candle[]): HigherTimeframeResult | null {
  if (candles.length < 20) {
    return null;
  }
  
  const indicators = computeIndicators(candles);
  const lastCandle = candles[candles.length - 1];
  const price = lastCandle.close;
  
  let bullishScore = 0;
  let bearishScore = 0;
  
  if (indicators.ema21 !== undefined) {
    if (price > indicators.ema21) bullishScore += 1.5;
    else bearishScore += 1.5;
  }
  
  if (indicators.sma50 !== undefined) {
    if (price > indicators.sma50) bullishScore += 1.5;
    else bearishScore += 1.5;
  }
  
  if (indicators.ema9 !== undefined && indicators.ema21 !== undefined) {
    if (indicators.ema9 > indicators.ema21) bullishScore += 1;
    else bearishScore += 1;
  }
  
  if (indicators.macd) {
    if (indicators.macd.histogram > 0) bullishScore += 1;
    else bearishScore += 1;
    
    if (indicators.macd.macd > indicators.macd.signal) bullishScore += 0.5;
    else bearishScore += 0.5;
  }
  
  if (indicators.rsi14 !== undefined) {
    if (indicators.rsi14 > 50 && indicators.rsi14 < 70) bullishScore += 1;
    else if (indicators.rsi14 < 50 && indicators.rsi14 > 30) bearishScore += 1;
  }
  
  if (indicators.superTrend) {
    if (indicators.superTrend.direction === 'up') bullishScore += 1.5;
    else bearishScore += 1.5;
  }
  
  if (indicators.adx !== undefined && indicators.adx > 20) {
    const trendBonus = Math.min(indicators.adx / 50, 1);
    if (bullishScore > bearishScore) bullishScore += trendBonus;
    else bearishScore += trendBonus;
  }
  
  const totalScore = bullishScore + bearishScore;
  const strength = totalScore > 0 ? Math.abs(bullishScore - bearishScore) / totalScore : 0;
  
  let bias: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  let trendDirection: 'up' | 'down' | 'sideways' = 'sideways';
  
  if (bullishScore > bearishScore + 1) {
    bias = 'bullish';
    trendDirection = 'up';
  } else if (bearishScore > bullishScore + 1) {
    bias = 'bearish';
    trendDirection = 'down';
  }
  
  const recentCandles = candles.slice(-20);
  const support = Math.min(...recentCandles.map(c => c.low));
  const resistance = Math.max(...recentCandles.map(c => c.high));
  
  return {
    timeframe: candles[0]?.timeframe || 0,
    bias,
    strength,
    trendDirection,
    keyLevels: { support, resistance },
  };
}

export function analyzeMultiTimeframe(
  symbol: string,
  primaryTimeframe: number,
  closedCandles: Candle[]
): MTFAnalysis {
  const higherTimeframes = getHigherTimeframes(primaryTimeframe);
  const results: HigherTimeframeResult[] = [];
  
  let bullishCount = 0;
  let bearishCount = 0;
  let totalStrength = 0;
  
  for (const htf of higherTimeframes) {
    const htfCandles = aggregateToHigherTimeframe(closedCandles, htf);
    const analysis = analyzeHigherTimeframe(htfCandles);
    
    if (analysis) {
      analysis.timeframe = htf;
      results.push(analysis);
      
      if (analysis.bias === 'bullish') {
        bullishCount++;
        totalStrength += analysis.strength;
      } else if (analysis.bias === 'bearish') {
        bearishCount++;
        totalStrength += analysis.strength;
      }
    }
  }
  
  let overallBias: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  if (bullishCount > bearishCount) {
    overallBias = 'bullish';
  } else if (bearishCount > bullishCount) {
    overallBias = 'bearish';
  }
  
  const alignedCount = Math.max(bullishCount, bearishCount);
  const totalAnalyzed = results.length;
  
  let confluenceScore = 0;
  if (totalAnalyzed > 0) {
    confluenceScore = (alignedCount / totalAnalyzed) * 100;
  }
  
  let confidenceBonus = 0;
  if (totalAnalyzed >= 2) {
    if (alignedCount === totalAnalyzed) {
      confidenceBonus = 8 + Math.min(totalStrength * 3, 4);
    } else if (alignedCount >= totalAnalyzed * 0.66) {
      confidenceBonus = 4 + Math.min(totalStrength * 2, 3);
    } else if (alignedCount >= totalAnalyzed * 0.5) {
      confidenceBonus = 2;
    }
  }
  
  logger.debug(`MTF Analysis for ${symbol} ${primaryTimeframe}s: bias=${overallBias}, confluence=${confluenceScore.toFixed(1)}%, bonus=${confidenceBonus}`);
  
  return {
    primaryTimeframe,
    higherTimeframes: results,
    overallBias,
    confluenceScore,
    confidenceBonus,
  };
}

export function getConfluenceBonus(
  mtfAnalysis: MTFAnalysis,
  signalDirection: 'CALL' | 'PUT'
): number {
  if (!mtfAnalysis || mtfAnalysis.higherTimeframes.length === 0) {
    return 0;
  }
  
  const expectedBias = signalDirection === 'CALL' ? 'bullish' : 'bearish';
  
  if (mtfAnalysis.overallBias === expectedBias) {
    return mtfAnalysis.confidenceBonus;
  } else if (mtfAnalysis.overallBias === 'neutral') {
    return Math.floor(mtfAnalysis.confidenceBonus / 2);
  }
  
  return 0;
}
