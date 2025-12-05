import type { Candle, IndicatorValues, PsychologyAnalysis, Vote, SignalResult, SessionOptions } from "@shared/schema";
import { predictWithFormingCandle } from "./predictionEngine";
import { getIndicatorWeight, isIndicatorEnabled, SIGNAL_CONFIG, VOLATILITY_CONFIG, QUALITY_THRESHOLDS } from "../config/indicators";
import { enhanceSignalWithBrain, advancedAnalysis } from "./advancedBrain";
import { detectMarketRegime, shouldTradeInCurrentCondition, getMarketConditionPenalty, type MarketCondition } from "./marketRegimeDetector";
import { createLogger } from "../utils/logger";

const logger = createLogger("SignalEngine");

const lastConfidenceBySymbol: Map<string, { confidence: number; timestamp: number }> = new Map();
const CONFIDENCE_VARIATION_RANGE = 5;
const MIN_CONFIDENCE_DIFFERENCE = 2;

function voteFromEMACross(
  indicators: IndicatorValues,
  fastKey: keyof IndicatorValues,
  slowKey: keyof IndicatorValues,
  lastClose: number,
  name: string
): Vote | null {
  const fast = indicators[fastKey] as number | undefined;
  const slow = indicators[slowKey] as number | undefined;
  
  if (fast === undefined || slow === undefined) return null;
  
  const crossStrength = Math.abs(fast - slow) / slow;
  const priceStrength = Math.abs(lastClose - fast) / fast;
  
  if (fast > slow && lastClose > fast && crossStrength > 0.0005) {
    return { indicator: name, direction: "UP", weight: 1 + crossStrength * 10, reason: `${fastKey} > ${slowKey as string}, price above with strength ${(crossStrength * 100).toFixed(2)}%` };
  }
  if (fast < slow && lastClose < fast && crossStrength > 0.0005) {
    return { indicator: name, direction: "DOWN", weight: 1 + crossStrength * 10, reason: `${fastKey} < ${slowKey as string}, price below with strength ${(crossStrength * 100).toFixed(2)}%` };
  }
  return { indicator: name, direction: "NEUTRAL", weight: 0.2, reason: "No clear cross or weak signal" };
}

function voteFromSMATrend(
  indicators: IndicatorValues,
  smaKey: keyof IndicatorValues,
  lastClose: number,
  name: string
): Vote | null {
  const sma = indicators[smaKey] as number | undefined;
  if (sma === undefined) return null;
  
  const diff = (lastClose - sma) / sma;
  if (diff > 0.002) {
    return { indicator: name, direction: "UP", weight: 1 + Math.min(1, diff * 50), reason: `Price ${(diff * 100).toFixed(2)}% above ${smaKey as string}` };
  }
  if (diff < -0.002) {
    return { indicator: name, direction: "DOWN", weight: 1 + Math.min(1, Math.abs(diff) * 50), reason: `Price ${(Math.abs(diff) * 100).toFixed(2)}% below ${smaKey as string}` };
  }
  return { indicator: name, direction: "NEUTRAL", weight: 0.3, reason: `Near ${smaKey as string} (no clear trend)` };
}

function voteFromMACD(indicators: IndicatorValues): Vote[] {
  const votes: Vote[] = [];
  const macd = indicators.macd;
  
  if (!macd) return votes;
  
  const histogramStrength = Math.abs(macd.histogram) > 0.0001 ? Math.min(1.5, Math.abs(macd.histogram) * 1000) : 0;
  
  if (macd.macd > macd.signal && macd.histogram > 0.00005) {
    votes.push({ indicator: "macd_signal", direction: "UP", weight: 1 + histogramStrength * 0.5, reason: `MACD above signal, histogram: ${(macd.histogram * 10000).toFixed(2)}` });
  } else if (macd.macd < macd.signal && macd.histogram < -0.00005) {
    votes.push({ indicator: "macd_signal", direction: "DOWN", weight: 1 + histogramStrength * 0.5, reason: `MACD below signal, histogram: ${(macd.histogram * 10000).toFixed(2)}` });
  } else {
    votes.push({ indicator: "macd_signal", direction: "NEUTRAL", weight: 0.2, reason: "MACD and signal too close" });
  }
  
  if (macd.histogram > 0.0001) {
    votes.push({ indicator: "macd_histogram", direction: "UP", weight: 1 + histogramStrength, reason: "Strong positive histogram" });
  } else if (macd.histogram < -0.0001) {
    votes.push({ indicator: "macd_histogram", direction: "DOWN", weight: 1 + histogramStrength, reason: "Strong negative histogram" });
  } else {
    votes.push({ indicator: "macd_histogram", direction: "NEUTRAL", weight: 0.2 });
  }
  
  return votes;
}

function voteFromRSI(indicators: IndicatorValues): Vote[] {
  const votes: Vote[] = [];
  const rsi = indicators.rsi14;
  
  if (rsi === undefined) return votes;
  
  if (rsi < 25) {
    votes.push({ indicator: "rsi_oversold", direction: "UP", weight: 1.5, reason: `RSI extremely oversold: ${rsi.toFixed(1)}` });
  } else if (rsi < 35) {
    votes.push({ indicator: "rsi_oversold", direction: "UP", weight: 1.2, reason: `RSI oversold: ${rsi.toFixed(1)}` });
  } else if (rsi > 75) {
    votes.push({ indicator: "rsi_overbought", direction: "DOWN", weight: 1.5, reason: `RSI extremely overbought: ${rsi.toFixed(1)}` });
  } else if (rsi > 65) {
    votes.push({ indicator: "rsi_overbought", direction: "DOWN", weight: 1.2, reason: `RSI overbought: ${rsi.toFixed(1)}` });
  } else if (rsi > 55) {
    votes.push({ indicator: "rsi_trend", direction: "UP", weight: 0.7, reason: `RSI bullish: ${rsi.toFixed(1)}` });
  } else if (rsi < 45) {
    votes.push({ indicator: "rsi_trend", direction: "DOWN", weight: 0.7, reason: `RSI bearish: ${rsi.toFixed(1)}` });
  } else {
    votes.push({ indicator: "rsi_trend", direction: "NEUTRAL", weight: 0.2, reason: `RSI neutral: ${rsi.toFixed(1)}` });
  }
  
  return votes;
}

function voteFromStochastic(indicators: IndicatorValues): Vote[] {
  const votes: Vote[] = [];
  const stoch = indicators.stochastic;
  
  if (!stoch) return votes;
  
  const crossStrength = Math.abs(stoch.k - stoch.d);
  
  if (stoch.k > stoch.d && stoch.k < 75 && crossStrength > 3) {
    votes.push({ indicator: "stochastic_cross", direction: "UP", weight: 1 + crossStrength * 0.03, reason: "Bullish stochastic cross with strength" });
  } else if (stoch.k < stoch.d && stoch.k > 25 && crossStrength > 3) {
    votes.push({ indicator: "stochastic_cross", direction: "DOWN", weight: 1 + crossStrength * 0.03, reason: "Bearish stochastic cross with strength" });
  }
  
  if (stoch.k < 15) {
    votes.push({ indicator: "stochastic_extreme", direction: "UP", weight: 1.4, reason: "Stochastic extremely oversold" });
  } else if (stoch.k < 25) {
    votes.push({ indicator: "stochastic_extreme", direction: "UP", weight: 1.1, reason: "Stochastic oversold" });
  } else if (stoch.k > 85) {
    votes.push({ indicator: "stochastic_extreme", direction: "DOWN", weight: 1.4, reason: "Stochastic extremely overbought" });
  } else if (stoch.k > 75) {
    votes.push({ indicator: "stochastic_extreme", direction: "DOWN", weight: 1.1, reason: "Stochastic overbought" });
  }
  
  return votes;
}

function voteFromBollinger(indicators: IndicatorValues, lastClose: number): Vote[] {
  const votes: Vote[] = [];
  const bb = indicators.bollingerBands;
  
  if (!bb) return votes;
  
  const bandwidth = (bb.upper - bb.lower) / bb.middle;
  const pricePosition = (lastClose - bb.lower) / (bb.upper - bb.lower);
  
  if (bandwidth < 0.015) {
    votes.push({ indicator: "bollinger_squeeze", direction: "NEUTRAL", weight: 0.5, reason: "Bollinger squeeze - high probability of breakout" });
  }
  
  if (pricePosition > 1.02) {
    votes.push({ indicator: "bollinger_breakout", direction: "UP", weight: 1.3, reason: "Price broke above upper band - strong momentum" });
  } else if (pricePosition < -0.02) {
    votes.push({ indicator: "bollinger_breakout", direction: "DOWN", weight: 1.3, reason: "Price broke below lower band - strong momentum" });
  } else if (pricePosition > 0.85 && bandwidth > 0.02) {
    votes.push({ indicator: "bollinger_reversion", direction: "DOWN", weight: 0.6, reason: "Price near upper band - potential reversion" });
  } else if (pricePosition < 0.15 && bandwidth > 0.02) {
    votes.push({ indicator: "bollinger_reversion", direction: "UP", weight: 0.6, reason: "Price near lower band - potential reversion" });
  }
  
  return votes;
}

function voteFromSuperTrend(indicators: IndicatorValues): Vote | null {
  const st = indicators.superTrend;
  if (!st) return null;
  
  if (st.direction === "up") {
    return { indicator: "supertrend_signal", direction: "UP", weight: 1.4, reason: "SuperTrend bullish - price above trend line" };
  }
  return { indicator: "supertrend_signal", direction: "DOWN", weight: 1.4, reason: "SuperTrend bearish - price below trend line" };
}

function voteFromPSAR(indicators: IndicatorValues, lastClose: number): Vote | null {
  const psar = indicators.psar;
  if (psar === undefined) return null;
  
  const distance = Math.abs(lastClose - psar) / lastClose;
  
  if (lastClose > psar && distance > 0.001) {
    return { indicator: "psar_signal", direction: "UP", weight: 1 + distance * 50, reason: `Price ${(distance * 100).toFixed(2)}% above PSAR` };
  }
  if (lastClose < psar && distance > 0.001) {
    return { indicator: "psar_signal", direction: "DOWN", weight: 1 + distance * 50, reason: `Price ${(distance * 100).toFixed(2)}% below PSAR` };
  }
  return { indicator: "psar_signal", direction: "NEUTRAL", weight: 0.2, reason: "Price too close to PSAR" };
}

function voteFromADX(indicators: IndicatorValues): Vote | null {
  const adx = indicators.adx;
  if (adx === undefined) return null;
  
  if (adx < 20) {
    return { indicator: "adx_trend_strength", direction: "NEUTRAL", weight: 0.3, reason: `Very weak trend ADX: ${adx.toFixed(1)} - avoid trading` };
  }
  if (adx < 25) {
    return { indicator: "adx_trend_strength", direction: "NEUTRAL", weight: 0.5, reason: `Weak trend ADX: ${adx.toFixed(1)}` };
  }
  if (adx >= 40) {
    return { indicator: "adx_trend_strength", direction: "NEUTRAL", weight: 1.5, reason: `Very strong trend ADX: ${adx.toFixed(1)} - high confidence` };
  }
  return { indicator: "adx_trend_strength", direction: "NEUTRAL", weight: 1.0, reason: `Good trend ADX: ${adx.toFixed(1)}` };
}

function voteFromCCI(indicators: IndicatorValues): Vote | null {
  const cci = indicators.cci;
  if (cci === undefined) return null;
  
  if (cci > 150) {
    return { indicator: "cci_signal", direction: "UP", weight: 1.3, reason: `CCI strongly bullish: ${cci.toFixed(1)}` };
  }
  if (cci > 100) {
    return { indicator: "cci_signal", direction: "UP", weight: 1.0, reason: `CCI bullish: ${cci.toFixed(1)}` };
  }
  if (cci < -150) {
    return { indicator: "cci_signal", direction: "DOWN", weight: 1.3, reason: `CCI strongly bearish: ${cci.toFixed(1)}` };
  }
  if (cci < -100) {
    return { indicator: "cci_signal", direction: "DOWN", weight: 1.0, reason: `CCI bearish: ${cci.toFixed(1)}` };
  }
  return { indicator: "cci_signal", direction: "NEUTRAL", weight: 0.2 };
}

function voteFromWilliamsR(indicators: IndicatorValues): Vote | null {
  const wr = indicators.williamsR;
  if (wr === undefined) return null;
  
  if (wr < -85) {
    return { indicator: "williams_r", direction: "UP", weight: 1.3, reason: "Williams %R extremely oversold" };
  }
  if (wr < -80) {
    return { indicator: "williams_r", direction: "UP", weight: 1.0, reason: "Williams %R oversold" };
  }
  if (wr > -15) {
    return { indicator: "williams_r", direction: "DOWN", weight: 1.3, reason: "Williams %R extremely overbought" };
  }
  if (wr > -20) {
    return { indicator: "williams_r", direction: "DOWN", weight: 1.0, reason: "Williams %R overbought" };
  }
  return { indicator: "williams_r", direction: "NEUTRAL", weight: 0.2 };
}

function voteFromHullMA(indicators: IndicatorValues, lastClose: number): Vote | null {
  const hull = indicators.hullMA;
  if (hull === undefined) return null;
  
  const diff = (lastClose - hull) / hull;
  
  if (diff > 0.001) {
    return { indicator: "hull_ma_trend", direction: "UP", weight: 1 + Math.min(0.5, diff * 50), reason: `Price above Hull MA by ${(diff * 100).toFixed(2)}%` };
  }
  if (diff < -0.001) {
    return { indicator: "hull_ma_trend", direction: "DOWN", weight: 1 + Math.min(0.5, Math.abs(diff) * 50), reason: `Price below Hull MA by ${(Math.abs(diff) * 100).toFixed(2)}%` };
  }
  return { indicator: "hull_ma_trend", direction: "NEUTRAL", weight: 0.2, reason: "Price at Hull MA" };
}

function voteFromMeanReversion(indicators: IndicatorValues): Vote | null {
  const z = indicators.meanReversionZ;
  if (z === undefined) return null;
  
  if (z < -2.5) {
    return { indicator: "mean_reversion", direction: "UP", weight: 1.5, reason: `Extreme oversold (z=${z.toFixed(2)}) - strong reversion likely` };
  }
  if (z < -2) {
    return { indicator: "mean_reversion", direction: "UP", weight: 1.2, reason: `Oversold (z=${z.toFixed(2)}) - reversion possible` };
  }
  if (z > 2.5) {
    return { indicator: "mean_reversion", direction: "DOWN", weight: 1.5, reason: `Extreme overbought (z=${z.toFixed(2)}) - strong reversion likely` };
  }
  if (z > 2) {
    return { indicator: "mean_reversion", direction: "DOWN", weight: 1.2, reason: `Overbought (z=${z.toFixed(2)}) - reversion possible` };
  }
  return null;
}

function voteFromPsychology(psychology: PsychologyAnalysis): Vote[] {
  const votes: Vote[] = [];
  
  for (const pattern of psychology.patterns) {
    let vote: Vote;
    const weightMultiplier = pattern.strength > 0.8 ? 1.3 : pattern.strength > 0.6 ? 1.1 : 1.0;
    
    if (pattern.type === "bullish") {
      vote = { indicator: pattern.name.toLowerCase().replace(/\s+/g, "_"), direction: "UP", weight: pattern.strength * weightMultiplier, reason: pattern.description };
      if (pattern.name.includes("Engulfing")) vote.indicator = "engulfing_pattern";
      if (pattern.name.includes("Hammer")) vote.indicator = "hammer_pattern";
    } else if (pattern.type === "bearish") {
      vote = { indicator: pattern.name.toLowerCase().replace(/\s+/g, "_"), direction: "DOWN", weight: pattern.strength * weightMultiplier, reason: pattern.description };
      if (pattern.name.includes("Engulfing")) vote.indicator = "engulfing_pattern";
      if (pattern.name.includes("Shooting")) vote.indicator = "shooting_star";
    } else {
      vote = { indicator: "doji_pattern", direction: "NEUTRAL", weight: pattern.strength * 0.3, reason: pattern.description };
    }
    votes.push(vote);
  }
  
  if (psychology.orderBlockProbability > 0.7) {
    const direction = psychology.bias === "bullish" ? "UP" : psychology.bias === "bearish" ? "DOWN" : "NEUTRAL";
    votes.push({ indicator: "order_block", direction, weight: psychology.orderBlockProbability * 1.2, reason: "Strong order block detected" });
  }
  
  if (psychology.fvgDetected && psychology.bias !== "neutral") {
    votes.push({ indicator: "fvg_signal", direction: psychology.bias === "bullish" ? "UP" : "DOWN", weight: 1.0, reason: "Fair Value Gap detected - imbalance zone" });
  }
  
  if (psychology.upperWickRatio > 0.7) {
    votes.push({ indicator: "wick_rejection", direction: "DOWN", weight: psychology.upperWickRatio * 1.1, reason: "Strong upper wick rejection" });
  }
  if (psychology.lowerWickRatio > 0.7) {
    votes.push({ indicator: "wick_rejection", direction: "UP", weight: psychology.lowerWickRatio * 1.1, reason: "Strong lower wick rejection" });
  }
  
  return votes;
}

function collectVotes(
  indicators: IndicatorValues,
  psychology: PsychologyAnalysis,
  lastClose: number,
  options?: SessionOptions
): Vote[] {
  const votes: Vote[] = [];
  const enabledIndicators = options?.enabledIndicators;
  const customWeights = options?.customWeights;
  
  const addVote = (vote: Vote | null, name: string) => {
    if (vote && isIndicatorEnabled(name, enabledIndicators)) {
      vote.weight *= getIndicatorWeight(name, customWeights);
      votes.push(vote);
    }
  };
  
  const addVotes = (voteList: Vote[], prefix: string = "") => {
    for (const vote of voteList) {
      const name = prefix || vote.indicator;
      if (isIndicatorEnabled(name, enabledIndicators)) {
        vote.weight *= getIndicatorWeight(name, customWeights);
        votes.push(vote);
      }
    }
  };
  
  addVote(voteFromEMACross(indicators, "ema5", "ema21", lastClose, "ema_cross_5_21"), "ema_cross_5_21");
  addVote(voteFromEMACross(indicators, "ema9", "ema21", lastClose, "ema_cross_9_21"), "ema_cross_9_21");
  addVote(voteFromEMACross(indicators, "ema12", "ema50", lastClose, "ema_cross_12_50"), "ema_cross_12_50");
  
  addVote(voteFromSMATrend(indicators, "sma20", lastClose, "sma_trend_20"), "sma_trend_20");
  addVote(voteFromSMATrend(indicators, "sma50", lastClose, "sma_trend_50"), "sma_trend_50");
  addVote(voteFromSMATrend(indicators, "sma200", lastClose, "sma_trend_200"), "sma_trend_200");
  
  addVotes(voteFromMACD(indicators));
  addVotes(voteFromRSI(indicators));
  addVotes(voteFromStochastic(indicators));
  addVotes(voteFromBollinger(indicators, lastClose));
  
  addVote(voteFromSuperTrend(indicators), "supertrend_signal");
  addVote(voteFromPSAR(indicators, lastClose), "psar_signal");
  addVote(voteFromADX(indicators), "adx_trend_strength");
  addVote(voteFromCCI(indicators), "cci_signal");
  addVote(voteFromWilliamsR(indicators), "williams_r");
  addVote(voteFromHullMA(indicators, lastClose), "hull_ma_trend");
  addVote(voteFromMeanReversion(indicators), "mean_reversion");
  
  addVotes(voteFromPsychology(psychology));
  
  return votes;
}

interface EnhancedScores {
  finalUp: number;
  finalDown: number;
  pUp: number;
  confidence: number;
  alignedIndicators: number;
  totalIndicators: number;
  strongSignals: number;
  conflictingSignals: number;
  qualityScore: number;
  marketConditionPenalty: number;
}

function calculateScores(votes: Vote[], marketCondition: MarketCondition): EnhancedScores {
  let finalUp = 0;
  let finalDown = 0;
  let alignedUp = 0;
  let alignedDown = 0;
  let strongUp = 0;
  let strongDown = 0;
  
  const significantVotes = votes.filter(v => v.direction !== "NEUTRAL" && v.weight >= 0.7);
  
  for (const vote of votes) {
    if (vote.direction === "UP") {
      finalUp += vote.weight;
      alignedUp++;
      if (vote.weight >= 1.0) strongUp++;
    } else if (vote.direction === "DOWN") {
      finalDown += vote.weight;
      alignedDown++;
      if (vote.weight >= 1.0) strongDown++;
    }
  }
  
  const total = finalUp + finalDown + 1e-9;
  const pUp = finalUp / total;
  
  const dominantDirection = pUp > 0.5 ? "UP" : "DOWN";
  const alignedIndicators = dominantDirection === "UP" ? alignedUp : alignedDown;
  const opposingIndicators = dominantDirection === "UP" ? alignedDown : alignedUp;
  const strongSignals = dominantDirection === "UP" ? strongUp : strongDown;
  const totalIndicators = alignedUp + alignedDown;
  
  const alignmentRatio = totalIndicators > 0 ? alignedIndicators / totalIndicators : 0;
  const conflictRatio = totalIndicators > 0 ? opposingIndicators / totalIndicators : 0;
  
  let baseConfidence = Math.abs(pUp - 0.5) * 180;
  
  if (alignmentRatio < 0.55) {
    baseConfidence *= 0.5;
  } else if (alignmentRatio < 0.65) {
    baseConfidence *= 0.7;
  } else if (alignmentRatio < 0.75) {
    baseConfidence *= 0.85;
  } else if (alignmentRatio >= 0.85) {
    baseConfidence *= 1.15;
  }
  
  if (strongSignals < SIGNAL_CONFIG.minStrongSignals) {
    baseConfidence *= 0.6;
  } else if (strongSignals >= 6) {
    baseConfidence *= 1.1;
  }
  
  if (conflictRatio > SIGNAL_CONFIG.maxConflictRatio) {
    baseConfidence *= 0.5;
  } else if (conflictRatio > 0.2) {
    baseConfidence *= 0.75;
  }
  
  const marketConditionPenalty = getMarketConditionPenalty(marketCondition);
  baseConfidence *= marketConditionPenalty;
  
  let qualityScore = 0;
  qualityScore += alignmentRatio * 30;
  qualityScore += Math.min(1, strongSignals / 6) * 25;
  qualityScore += (1 - conflictRatio) * 20;
  qualityScore += marketConditionPenalty * 25;
  
  const confidence = Math.min(95, Math.max(0, Math.round(baseConfidence)));
  
  return { 
    finalUp, 
    finalDown, 
    pUp, 
    confidence,
    alignedIndicators,
    totalIndicators,
    strongSignals,
    conflictingSignals: opposingIndicators,
    qualityScore: Math.round(qualityScore),
    marketConditionPenalty
  };
}

function applyConfidenceVariation(symbol: string, rawConfidence: number): number {
  const now = Date.now();
  const lastEntry = lastConfidenceBySymbol.get(symbol);
  
  const marketNoise = (Math.random() - 0.5) * CONFIDENCE_VARIATION_RANGE;
  let adjustedConfidence = Math.round(rawConfidence + marketNoise);
  
  if (lastEntry && (now - lastEntry.timestamp) < 300000) {
    const difference = Math.abs(adjustedConfidence - lastEntry.confidence);
    
    if (difference < MIN_CONFIDENCE_DIFFERENCE) {
      const direction = Math.random() > 0.5 ? 1 : -1;
      adjustedConfidence = lastEntry.confidence + (direction * (MIN_CONFIDENCE_DIFFERENCE + Math.floor(Math.random() * 3)));
    }
  }
  
  adjustedConfidence = Math.min(95, Math.max(0, adjustedConfidence));
  
  lastConfidenceBySymbol.set(symbol, { confidence: adjustedConfidence, timestamp: now });
  
  if (lastConfidenceBySymbol.size > 50) {
    const entries = Array.from(lastConfidenceBySymbol.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    for (let i = 0; i < 20; i++) {
      lastConfidenceBySymbol.delete(entries[i][0]);
    }
  }
  
  return adjustedConfidence;
}

function determineDirection(scores: EnhancedScores, marketCondition: MarketCondition): "CALL" | "PUT" | "NO_TRADE" {
  if (scores.confidence < SIGNAL_CONFIG.minConfidence) {
    return "NO_TRADE";
  }
  
  if (scores.alignedIndicators < SIGNAL_CONFIG.minAlignedIndicators) {
    return "NO_TRADE";
  }
  
  if (scores.strongSignals < SIGNAL_CONFIG.minStrongSignals) {
    return "NO_TRADE";
  }
  
  if (scores.conflictingSignals > scores.alignedIndicators * SIGNAL_CONFIG.maxConflictRatio) {
    return "NO_TRADE";
  }
  
  if (scores.qualityScore < QUALITY_THRESHOLDS.rejectBelow) {
    return "NO_TRADE";
  }
  
  const direction: "CALL" | "PUT" = scores.pUp > 0.5 ? "CALL" : "PUT";
  
  if (!shouldTradeInCurrentCondition(marketCondition, direction)) {
    if (marketCondition.regime === "CHOPPY" || marketCondition.volatilityLevel === "HIGH") {
      return "NO_TRADE";
    }
  }
  
  return direction;
}

export function generateSignal(
  sessionId: string,
  symbol: string,
  timeframe: number,
  closedCandles: Candle[],
  formingCandle: Candle | null,
  candleCloseTime: number,
  options?: SessionOptions
): SignalResult {
  const timestamp = Math.floor(Date.now() / 1000);
  
  if (closedCandles.length < VOLATILITY_CONFIG.minCandlesForSignal) {
    logger.warn(`Not enough candles for signal: ${closedCandles.length} < ${VOLATILITY_CONFIG.minCandlesForSignal}`);
    return {
      sessionId,
      symbol,
      timeframe,
      timestamp,
      candleCloseTime,
      direction: "NO_TRADE",
      confidence: 0,
      pUp: 0.5,
      pDown: 0.5,
      votes: [],
      indicators: {},
      psychology: {
        bodyRatio: 0,
        upperWickRatio: 0,
        lowerWickRatio: 0,
        isDoji: false,
        patterns: [],
        bias: "neutral",
        orderBlockProbability: 0,
        fvgDetected: false,
      },
      volatilityOverride: false,
      closedCandlesCount: closedCandles.length,
      formingCandle: formingCandle || undefined,
    };
  }
  
  const marketCondition = detectMarketRegime(closedCandles);
  logger.info(`Market condition for ${symbol}: ${marketCondition.regime} (tradeable: ${marketCondition.isTradeable}, volatility: ${marketCondition.volatilityLevel})`);
  
  if (marketCondition.regime === "CHOPPY" || 
      (marketCondition.volatilityLevel === "HIGH" && marketCondition.priceAction !== "CLEAN")) {
    logger.info(`Skipping signal due to unfavorable market condition: ${marketCondition.reason}`);
    return {
      sessionId,
      symbol,
      timeframe,
      timestamp,
      candleCloseTime,
      direction: "NO_TRADE",
      confidence: 0,
      pUp: 0.5,
      pDown: 0.5,
      votes: [],
      indicators: {},
      psychology: {
        bodyRatio: 0,
        upperWickRatio: 0,
        lowerWickRatio: 0,
        isDoji: false,
        patterns: [],
        bias: "neutral",
        orderBlockProbability: 0,
        fvgDetected: false,
      },
      volatilityOverride: true,
      volatilityReason: `Market condition: ${marketCondition.reason}`,
      closedCandlesCount: closedCandles.length,
      formingCandle: formingCandle || undefined,
    };
  }
  
  const prediction = predictWithFormingCandle(closedCandles, formingCandle);
  
  if (prediction.volatility.isVolatile) {
    logger.info(`Volatility override for ${symbol}: ${prediction.volatility.reason}`);
    return {
      sessionId,
      symbol,
      timeframe,
      timestamp,
      candleCloseTime,
      direction: "NO_TRADE",
      confidence: 0,
      pUp: 0.5,
      pDown: 0.5,
      votes: [],
      indicators: prediction.indicators,
      psychology: prediction.psychology,
      volatilityOverride: true,
      volatilityReason: prediction.volatility.reason,
      closedCandlesCount: closedCandles.length,
      formingCandle: formingCandle || undefined,
    };
  }
  
  const lastClose = prediction.estimatedClose;
  const votes = collectVotes(prediction.indicators, prediction.psychology, lastClose, options);
  const scores = calculateScores(votes, marketCondition);
  
  const variedConfidence = applyConfidenceVariation(symbol, scores.confidence);
  const adjustedScores = { ...scores, confidence: variedConfidence };
  
  const direction = determineDirection(adjustedScores, marketCondition);
  
  let suggestedDirection: "CALL" | "PUT" | undefined;
  let isLowConfidence = false;
  
  if (direction === "NO_TRADE" && adjustedScores.alignedIndicators >= 4 && adjustedScores.confidence >= 50) {
    suggestedDirection = adjustedScores.pUp > 0.5 ? "CALL" : "PUT";
    isLowConfidence = true;
  }
  
  logger.info(`Signal analysis for ${symbol}: ${direction} (confidence: ${variedConfidence}% [raw: ${scores.confidence}%], aligned: ${adjustedScores.alignedIndicators}, strong: ${adjustedScores.strongSignals}, conflicts: ${adjustedScores.conflictingSignals}, quality: ${adjustedScores.qualityScore})`);
  
  const baseSignal: SignalResult = {
    sessionId,
    symbol,
    timeframe,
    timestamp,
    candleCloseTime,
    direction,
    confidence: variedConfidence,
    pUp: scores.pUp,
    pDown: 1 - scores.pUp,
    votes,
    indicators: prediction.indicators,
    psychology: prediction.psychology,
    volatilityOverride: false,
    closedCandlesCount: closedCandles.length,
    formingCandle: formingCandle || undefined,
    suggestedDirection,
    isLowConfidence,
  };
  
  if (direction === "NO_TRADE") {
    return baseSignal;
  }
  
  const enhancedSignal = enhanceSignalWithBrain(
    baseSignal,
    closedCandles,
    prediction.indicators,
    prediction.psychology
  );
  
  if (enhancedSignal.confidence < SIGNAL_CONFIG.minConfidence) {
    enhancedSignal.direction = "NO_TRADE";
    enhancedSignal.isLowConfidence = true;
    enhancedSignal.suggestedDirection = scores.pUp > 0.5 ? "CALL" : "PUT";
  }
  
  logger.info(`Final signal for ${symbol}: ${enhancedSignal.direction} (${enhancedSignal.confidence}% confidence)`);
  
  return enhancedSignal;
}
