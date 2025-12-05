import {
  EMA,
  SMA,
  MACD,
  RSI,
  Stochastic,
  ATR,
  ADX,
  CCI,
  WilliamsR,
  BollingerBands,
  ROC,
  PSAR,
  OBV,
} from "technicalindicators";
import type { Candle, IndicatorValues } from "@shared/schema";
import { DEFAULT_INDICATOR_CONFIG } from "../config/indicators";
import { createLogger } from "../utils/logger";

const logger = createLogger("IndicatorEngine");

function extractPrices(candles: Candle[]): {
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
} {
  return {
    open: candles.map((c) => c.open),
    high: candles.map((c) => c.high),
    low: candles.map((c) => c.low),
    close: candles.map((c) => c.close),
    volume: candles.map((c) => c.tickCount || 1),
  };
}

function lastValue<T>(arr: T[]): T | undefined {
  return arr.length > 0 ? arr[arr.length - 1] : undefined;
}

function calculateEMA(values: number[], period: number): number | undefined {
  if (values.length < period) return undefined;
  const result = EMA.calculate({ period, values });
  return lastValue(result);
}

function calculateSMA(values: number[], period: number): number | undefined {
  if (values.length < period) return undefined;
  const result = SMA.calculate({ period, values });
  return lastValue(result);
}

function calculateMACD(
  values: number[],
  fast: number,
  slow: number,
  signal: number
): { macd: number; signal: number; histogram: number } | undefined {
  if (values.length < slow + signal) return undefined;
  const result = MACD.calculate({
    values,
    fastPeriod: fast,
    slowPeriod: slow,
    signalPeriod: signal,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });
  const last = lastValue(result);
  if (!last || last.MACD === undefined || last.signal === undefined || last.histogram === undefined) {
    return undefined;
  }
  return { macd: last.MACD, signal: last.signal, histogram: last.histogram };
}

function calculateRSI(values: number[], period: number): number | undefined {
  if (values.length < period + 1) return undefined;
  const result = RSI.calculate({ period, values });
  return lastValue(result);
}

function calculateStochastic(
  high: number[],
  low: number[],
  close: number[],
  period: number,
  signalPeriod: number
): { k: number; d: number } | undefined {
  if (close.length < period + signalPeriod) return undefined;
  const result = Stochastic.calculate({
    high,
    low,
    close,
    period,
    signalPeriod,
  });
  const last = lastValue(result);
  if (!last) return undefined;
  return { k: last.k, d: last.d };
}

function calculateATR(
  high: number[],
  low: number[],
  close: number[],
  period: number
): number | undefined {
  if (close.length < period + 1) return undefined;
  const result = ATR.calculate({ high, low, close, period });
  return lastValue(result);
}

function calculateADX(
  high: number[],
  low: number[],
  close: number[],
  period: number
): number | undefined {
  if (close.length < period * 2) return undefined;
  const result = ADX.calculate({ high, low, close, period });
  const last = lastValue(result);
  return last?.adx;
}

function calculateCCI(
  high: number[],
  low: number[],
  close: number[],
  period: number
): number | undefined {
  if (close.length < period) return undefined;
  const result = CCI.calculate({ high, low, close, period });
  return lastValue(result);
}

function calculateWilliamsR(
  high: number[],
  low: number[],
  close: number[],
  period: number
): number | undefined {
  if (close.length < period) return undefined;
  const result = WilliamsR.calculate({ high, low, close, period });
  return lastValue(result);
}

function calculateBollingerBands(
  values: number[],
  period: number,
  stdDev: number
): { upper: number; middle: number; lower: number } | undefined {
  if (values.length < period) return undefined;
  const result = BollingerBands.calculate({ period, values, stdDev });
  const last = lastValue(result);
  if (!last) return undefined;
  return { upper: last.upper, middle: last.middle, lower: last.lower };
}

function calculateKeltnerChannels(
  high: number[],
  low: number[],
  close: number[],
  period: number,
  multiplier: number
): { upper: number; middle: number; lower: number } | undefined {
  const ema = calculateEMA(close, period);
  const atr = calculateATR(high, low, close, period);
  if (ema === undefined || atr === undefined) return undefined;
  return {
    upper: ema + multiplier * atr,
    middle: ema,
    lower: ema - multiplier * atr,
  };
}

function calculateHullMA(values: number[], period: number): number | undefined {
  if (values.length < period) return undefined;
  
  const halfPeriod = Math.floor(period / 2);
  const sqrtPeriod = Math.floor(Math.sqrt(period));
  
  const emaHalf = EMA.calculate({ period: halfPeriod, values });
  const emaFull = EMA.calculate({ period, values });
  
  if (emaHalf.length === 0 || emaFull.length === 0) return undefined;
  
  const minLen = Math.min(emaHalf.length, emaFull.length);
  const rawHull: number[] = [];
  for (let i = 0; i < minLen; i++) {
    rawHull.push(2 * emaHalf[emaHalf.length - minLen + i] - emaFull[emaFull.length - minLen + i]);
  }
  
  if (rawHull.length < sqrtPeriod) return undefined;
  const hullResult = EMA.calculate({ period: sqrtPeriod, values: rawHull });
  return lastValue(hullResult);
}

function calculateSuperTrend(
  high: number[],
  low: number[],
  close: number[],
  period: number,
  multiplier: number
): { value: number; direction: "up" | "down" } | undefined {
  const atr = calculateATR(high, low, close, period);
  if (atr === undefined || close.length < period + 1) return undefined;
  
  const lastClose = close[close.length - 1];
  const lastHigh = high[high.length - 1];
  const lastLow = low[low.length - 1];
  const hl2 = (lastHigh + lastLow) / 2;
  
  const upperBand = hl2 + multiplier * atr;
  const lowerBand = hl2 - multiplier * atr;
  
  const prevClose = close[close.length - 2];
  const direction = lastClose > prevClose ? "up" : "down";
  const value = direction === "up" ? lowerBand : upperBand;
  
  return { value, direction };
}

function calculateROC(values: number[], period: number): number | undefined {
  if (values.length < period + 1) return undefined;
  const result = ROC.calculate({ period, values });
  return lastValue(result);
}

function calculateMomentum(values: number[], period: number): number | undefined {
  if (values.length < period + 1) return undefined;
  const current = values[values.length - 1];
  const past = values[values.length - 1 - period];
  return current - past;
}

function calculateDonchianChannels(
  high: number[],
  low: number[],
  period: number
): { upper: number; lower: number } | undefined {
  if (high.length < period) return undefined;
  const recentHigh = high.slice(-period);
  const recentLow = low.slice(-period);
  return {
    upper: Math.max(...recentHigh),
    lower: Math.min(...recentLow),
  };
}

function calculatePSAR(
  high: number[],
  low: number[],
  step: number,
  max: number
): number | undefined {
  if (high.length < 2) return undefined;
  const result = PSAR.calculate({ high, low, step, max });
  return lastValue(result);
}

function calculateOBV(close: number[], volume: number[]): number | undefined {
  if (close.length < 2) return undefined;
  const result = OBV.calculate({ close, volume });
  return lastValue(result);
}

function calculateUltimateOscillator(
  high: number[],
  low: number[],
  close: number[],
  period1: number,
  period2: number,
  period3: number
): number | undefined {
  if (close.length < period3 + 1) return undefined;
  
  const tr: number[] = [];
  const bp: number[] = [];
  
  for (let i = 1; i < close.length; i++) {
    const trueRange = Math.max(
      high[i] - low[i],
      Math.abs(high[i] - close[i - 1]),
      Math.abs(low[i] - close[i - 1])
    );
    const buyingPressure = close[i] - Math.min(low[i], close[i - 1]);
    tr.push(trueRange);
    bp.push(buyingPressure);
  }
  
  const avg1 = bp.slice(-period1).reduce((a, b) => a + b, 0) / 
               tr.slice(-period1).reduce((a, b) => a + b, 0);
  const avg2 = bp.slice(-period2).reduce((a, b) => a + b, 0) / 
               tr.slice(-period2).reduce((a, b) => a + b, 0);
  const avg3 = bp.slice(-period3).reduce((a, b) => a + b, 0) / 
               tr.slice(-period3).reduce((a, b) => a + b, 0);
  
  return 100 * ((4 * avg1 + 2 * avg2 + avg3) / 7);
}

function calculateMeanReversionZ(values: number[], period: number): number | undefined {
  if (values.length < period) return undefined;
  const recent = values.slice(-period);
  const mean = recent.reduce((a, b) => a + b, 0) / period;
  const variance = recent.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / period;
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return 0;
  return (values[values.length - 1] - mean) / stdDev;
}

function calculateLinRegSlope(values: number[], period: number): number | undefined {
  if (values.length < period) return undefined;
  const recent = values.slice(-period);
  const n = recent.length;
  const xMean = (n - 1) / 2;
  const yMean = recent.reduce((a, b) => a + b, 0) / n;
  
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (i - xMean) * (recent[i] - yMean);
    denominator += Math.pow(i - xMean, 2);
  }
  
  return denominator !== 0 ? numerator / denominator : 0;
}

function calculateFisherTransform(
  high: number[],
  low: number[],
  period: number
): number | undefined {
  if (high.length < period) return undefined;
  
  const recentHigh = high.slice(-period);
  const recentLow = low.slice(-period);
  const maxHigh = Math.max(...recentHigh);
  const minLow = Math.min(...recentLow);
  
  const hl2 = (high[high.length - 1] + low[low.length - 1]) / 2;
  const range = maxHigh - minLow;
  if (range === 0) return 0;
  
  let value = ((hl2 - minLow) / range - 0.5) * 2;
  value = Math.max(-0.999, Math.min(0.999, value));
  
  return 0.5 * Math.log((1 + value) / (1 - value));
}

function calculateATRBands(
  close: number[],
  high: number[],
  low: number[],
  period: number,
  multiplier: number = 2
): { upper: number; lower: number } | undefined {
  const atr = calculateATR(high, low, close, period);
  const sma = calculateSMA(close, period);
  if (atr === undefined || sma === undefined) return undefined;
  return {
    upper: sma + multiplier * atr,
    lower: sma - multiplier * atr,
  };
}

function calculateRangePercentile(
  high: number[],
  low: number[],
  period: number
): number | undefined {
  if (high.length < period) return undefined;
  
  const ranges: number[] = [];
  for (let i = high.length - period; i < high.length; i++) {
    ranges.push(high[i] - low[i]);
  }
  
  const currentRange = ranges[ranges.length - 1];
  const sortedRanges = [...ranges].sort((a, b) => a - b);
  const index = sortedRanges.indexOf(currentRange);
  
  return (index / (period - 1)) * 100;
}

function calculateEMARibbon(close: number[], periods: number[]): number | undefined {
  const emas: number[] = [];
  for (const period of periods) {
    const ema = calculateEMA(close, period);
    if (ema !== undefined) {
      emas.push(ema);
    }
  }
  if (emas.length === 0) return undefined;
  return emas.reduce((a, b) => a + b, 0) / emas.length;
}

export function computeIndicators(candles: Candle[]): IndicatorValues {
  if (candles.length === 0) {
    return {};
  }

  const { open, high, low, close, volume } = extractPrices(candles);
  const config = DEFAULT_INDICATOR_CONFIG;

  const indicators: IndicatorValues = {};

  try {
    indicators.ema5 = calculateEMA(close, 5);
    indicators.ema9 = calculateEMA(close, 9);
    indicators.ema12 = calculateEMA(close, 12);
    indicators.ema21 = calculateEMA(close, 21);
    indicators.ema50 = calculateEMA(close, 50);
    
    indicators.sma20 = calculateSMA(close, 20);
    indicators.sma50 = calculateSMA(close, 50);
    indicators.sma200 = calculateSMA(close, 200);
    
    indicators.macd = calculateMACD(
      close,
      config.macdFast,
      config.macdSlow,
      config.macdSignal
    );
    
    indicators.rsi14 = calculateRSI(close, config.rsiPeriod);
    
    indicators.stochastic = calculateStochastic(
      high,
      low,
      close,
      config.stochasticK,
      config.stochasticD
    );
    
    indicators.atr14 = calculateATR(high, low, close, config.atrPeriod);
    indicators.adx = calculateADX(high, low, close, config.adxPeriod);
    indicators.cci = calculateCCI(high, low, close, config.cciPeriod);
    indicators.williamsR = calculateWilliamsR(high, low, close, config.williamsRPeriod);
    
    indicators.bollingerBands = calculateBollingerBands(
      close,
      config.bollingerPeriod,
      config.bollingerStdDev
    );
    
    indicators.keltnerChannels = calculateKeltnerChannels(
      high,
      low,
      close,
      config.keltnerPeriod,
      config.keltnerMultiplier
    );
    
    indicators.hullMA = calculateHullMA(close, config.hullPeriod);
    
    indicators.superTrend = calculateSuperTrend(
      high,
      low,
      close,
      config.superTrendPeriod,
      config.superTrendMultiplier
    );
    
    indicators.roc = calculateROC(close, config.rocPeriod);
    indicators.momentum = calculateMomentum(close, config.momentumPeriod);
    
    indicators.donchianChannels = calculateDonchianChannels(
      high,
      low,
      config.donchianPeriod
    );
    
    indicators.psar = calculatePSAR(high, low, config.psarStep, config.psarMax);
    indicators.obv = calculateOBV(close, volume);
    
    indicators.ultimateOsc = calculateUltimateOscillator(
      high,
      low,
      close,
      config.ultimateOscPeriod1,
      config.ultimateOscPeriod2,
      config.ultimateOscPeriod3
    );
    
    indicators.meanReversionZ = calculateMeanReversionZ(close, config.meanReversionPeriod);
    indicators.linRegSlope = calculateLinRegSlope(close, config.linRegPeriod);
    indicators.fisherTransform = calculateFisherTransform(high, low, config.fisherPeriod);
    
    indicators.atrBands = calculateATRBands(close, high, low, config.atrPeriod);
    indicators.rangePercentile = calculateRangePercentile(high, low, 20);
    indicators.emaRibbon = calculateEMARibbon(close, config.emaPeriods);
    
  } catch (error) {
    logger.error("Error computing indicators", error);
  }

  return indicators;
}

export function checkVolatility(
  candles: Candle[],
  atrThreshold: number = 0.005
): { isVolatile: boolean; reason?: string } {
  if (candles.length < 15) {
    return { isVolatile: false };
  }

  const { high, low, close } = extractPrices(candles);
  const atr = calculateATR(high, low, close, 14);
  const currentPrice = close[close.length - 1];

  if (atr !== undefined && currentPrice > 0) {
    const atrRatio = atr / currentPrice;
    if (atrRatio > atrThreshold) {
      return {
        isVolatile: true,
        reason: `High ATR volatility: ${(atrRatio * 100).toFixed(2)}% (threshold: ${(atrThreshold * 100).toFixed(2)}%)`,
      };
    }
  }

  const recentCandles = candles.slice(-10);
  const ranges = recentCandles.map((c) => (c.high - c.low) / c.low);
  const avgRange = ranges.reduce((a, b) => a + b, 0) / ranges.length;
  const lastRange = ranges[ranges.length - 1];

  if (lastRange > avgRange * 2) {
    return {
      isVolatile: true,
      reason: `Sudden price spike detected: current range ${(lastRange * 100).toFixed(2)}% vs avg ${(avgRange * 100).toFixed(2)}%`,
    };
  }

  return { isVolatile: false };
}
