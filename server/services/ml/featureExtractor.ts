import type { Candle } from "../signalEngine";

export interface FeatureVector {
  // Price features
  priceChange: number;
  priceChangePercent: number;
  volatility: number;
  avgTrueRange: number;
  
  // Momentum features
  rsiValue: number;
  rsiSlope: number;
  macdHistogram: number;
  macdCrossover: number;
  stochK: number;
  stochD: number;
  
  // Trend features
  trendStrength: number;
  trendDirection: number;
  ema9Slope: number;
  ema21Slope: number;
  emaCrossover: number;
  
  // Volume features
  volumeRatio: number;
  volumeTrend: number;
  
  // Candlestick features
  bodyRatio: number;
  upperWickRatio: number;
  lowerWickRatio: number;
  bullishPattern: number;
  bearishPattern: number;
  
  // Market regime features
  isRanging: number;
  isTrending: number;
  regimeStrength: number;
  
  // Composite features
  buyPressure: number;
  sellPressure: number;
  momentum: number;
  confluence: number;
}

export interface ExtractedFeatures {
  vector: number[];
  labels: string[];
  normalized: number[];
  raw: FeatureVector;
}

function calculateEMA(values: number[], period: number): number[] {
  const ema: number[] = [];
  const multiplier = 2 / (period + 1);
  
  ema[0] = values[0];
  for (let i = 1; i < values.length; i++) {
    ema[i] = (values[i] - ema[i - 1]) * multiplier + ema[i - 1];
  }
  return ema;
}

function calculateRSI(closes: number[], period: number = 14): number {
  if (closes.length < period + 1) return 50;
  
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - (100 / (1 + rs));
}

function calculateMACD(closes: number[]): { macd: number; signal: number; histogram: number } {
  if (closes.length < 26) return { macd: 0, signal: 0, histogram: 0 };
  
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signal = calculateEMA(macdLine.slice(-9), 9);
  
  const macd = macdLine[macdLine.length - 1];
  const signalValue = signal[signal.length - 1];
  
  return {
    macd,
    signal: signalValue,
    histogram: macd - signalValue
  };
}

function calculateStochastic(candles: Candle[], period: number = 14): { k: number; d: number } {
  if (candles.length < period) return { k: 50, d: 50 };
  
  const recent = candles.slice(-period);
  const high = Math.max(...recent.map(c => c.high));
  const low = Math.min(...recent.map(c => c.low));
  const close = candles[candles.length - 1].close;
  
  const k = high === low ? 50 : ((close - low) / (high - low)) * 100;
  
  // Calculate %D as 3-period SMA of %K
  const kValues: number[] = [];
  for (let i = Math.max(0, candles.length - 3); i < candles.length; i++) {
    const slice = candles.slice(Math.max(0, i - period + 1), i + 1);
    const h = Math.max(...slice.map(c => c.high));
    const l = Math.min(...slice.map(c => c.low));
    const c = candles[i].close;
    kValues.push(h === l ? 50 : ((c - l) / (h - l)) * 100);
  }
  
  const d = kValues.reduce((a, b) => a + b, 0) / kValues.length;
  
  return { k, d };
}

function calculateATR(candles: Candle[], period: number = 14): number {
  if (candles.length < period + 1) return 0;
  
  let atr = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    atr += tr;
  }
  
  return atr / period;
}

function detectCandlePatterns(candles: Candle[]): { bullish: number; bearish: number } {
  if (candles.length < 3) return { bullish: 0, bearish: 0 };
  
  const curr = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const prev2 = candles[candles.length - 3];
  
  let bullish = 0, bearish = 0;
  
  const currBody = curr.close - curr.open;
  const prevBody = prev.close - prev.open;
  const currRange = curr.high - curr.low;
  
  // Bullish engulfing
  if (currBody > 0 && prevBody < 0 && curr.close > prev.open && curr.open < prev.close) {
    bullish += 0.8;
  }
  
  // Bearish engulfing
  if (currBody < 0 && prevBody > 0 && curr.close < prev.open && curr.open > prev.close) {
    bearish += 0.8;
  }
  
  // Hammer (bullish)
  const lowerWick = Math.min(curr.open, curr.close) - curr.low;
  const upperWick = curr.high - Math.max(curr.open, curr.close);
  if (lowerWick > Math.abs(currBody) * 2 && upperWick < Math.abs(currBody) * 0.3) {
    bullish += 0.6;
  }
  
  // Shooting star (bearish)
  if (upperWick > Math.abs(currBody) * 2 && lowerWick < Math.abs(currBody) * 0.3) {
    bearish += 0.6;
  }
  
  // Morning star (bullish)
  if (prev2.close < prev2.open && 
      Math.abs(prevBody) < Math.abs(prev2.close - prev2.open) * 0.3 &&
      curr.close > curr.open) {
    bullish += 0.7;
  }
  
  // Evening star (bearish)
  if (prev2.close > prev2.open && 
      Math.abs(prevBody) < Math.abs(prev2.close - prev2.open) * 0.3 &&
      curr.close < curr.open) {
    bearish += 0.7;
  }
  
  // Three white soldiers
  if (curr.close > curr.open && prev.close > prev.open && prev2.close > prev2.open &&
      curr.close > prev.close && prev.close > prev2.close) {
    bullish += 0.9;
  }
  
  // Three black crows
  if (curr.close < curr.open && prev.close < prev.open && prev2.close < prev2.open &&
      curr.close < prev.close && prev.close < prev2.close) {
    bearish += 0.9;
  }
  
  return { bullish: Math.min(1, bullish), bearish: Math.min(1, bearish) };
}

function calculateVolatility(candles: Candle[], period: number = 20): number {
  if (candles.length < period) return 0;
  
  const returns = [];
  for (let i = candles.length - period; i < candles.length; i++) {
    returns.push((candles[i].close - candles[i - 1].close) / candles[i - 1].close);
  }
  
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
  
  return Math.sqrt(variance);
}

function detectMarketRegime(candles: Candle[], period: number = 20): { isRanging: number; isTrending: number; strength: number } {
  if (candles.length < period) return { isRanging: 0.5, isTrending: 0.5, strength: 0 };
  
  const closes = candles.slice(-period).map(c => c.close);
  const highs = candles.slice(-period).map(c => c.high);
  const lows = candles.slice(-period).map(c => c.low);
  
  // ADX-like calculation
  let plusDM = 0, minusDM = 0, tr = 0;
  for (let i = 1; i < closes.length; i++) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    
    if (upMove > downMove && upMove > 0) plusDM += upMove;
    if (downMove > upMove && downMove > 0) minusDM += downMove;
    
    tr += Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
  }
  
  const plusDI = tr > 0 ? (plusDM / tr) * 100 : 0;
  const minusDI = tr > 0 ? (minusDM / tr) * 100 : 0;
  const dx = (plusDI + minusDI) > 0 ? Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100 : 0;
  
  // Trend strength from price direction
  const priceChange = (closes[closes.length - 1] - closes[0]) / closes[0];
  const trendStrength = Math.abs(priceChange) * 100;
  
  // Combined regime detection
  const adxLike = dx;
  const isTrending = adxLike > 25 ? 1 : adxLike > 20 ? 0.7 : adxLike > 15 ? 0.4 : 0.2;
  const isRanging = 1 - isTrending;
  
  return { isRanging, isTrending, strength: Math.min(1, trendStrength) };
}

export function extractFeatures(candles: Candle[]): ExtractedFeatures {
  if (candles.length < 30) {
    throw new Error("Need at least 30 candles for feature extraction");
  }
  
  const closes = candles.map(c => c.close);
  const curr = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  
  // Price features
  const priceChange = curr.close - prev.close;
  const priceChangePercent = priceChange / prev.close;
  const volatility = calculateVolatility(candles);
  const atr = calculateATR(candles);
  
  // Momentum features
  const rsiValue = calculateRSI(closes);
  const rsiPrev = calculateRSI(closes.slice(0, -1));
  const rsiSlope = rsiValue - rsiPrev;
  const macd = calculateMACD(closes);
  const stoch = calculateStochastic(candles);
  
  // Trend features
  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);
  const ema9Slope = ema9.length > 1 ? ema9[ema9.length - 1] - ema9[ema9.length - 2] : 0;
  const ema21Slope = ema21.length > 1 ? ema21[ema21.length - 1] - ema21[ema21.length - 2] : 0;
  const emaCrossover = ema9[ema9.length - 1] > ema21[ema21.length - 1] ? 1 : -1;
  
  const trendDirection = priceChange > 0 ? 1 : -1;
  const trendStrength = Math.abs(priceChangePercent) / (volatility + 0.0001);
  
  // Volume features
  const volumes = candles.map(c => c.volume || 1);
  const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const currVolume = curr.volume || avgVolume;
  const volumeRatio = currVolume / (avgVolume + 0.0001);
  const volumeTrend = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5 > avgVolume ? 1 : -1;
  
  // Candlestick features
  const body = Math.abs(curr.close - curr.open);
  const range = curr.high - curr.low;
  const bodyRatio = range > 0 ? body / range : 0;
  const upperWick = curr.high - Math.max(curr.open, curr.close);
  const lowerWick = Math.min(curr.open, curr.close) - curr.low;
  const upperWickRatio = range > 0 ? upperWick / range : 0;
  const lowerWickRatio = range > 0 ? lowerWick / range : 0;
  
  const patterns = detectCandlePatterns(candles);
  
  // Market regime
  const regime = detectMarketRegime(candles);
  
  // Composite features
  const buyPressure = (rsiValue > 50 ? 0.3 : 0) + 
                      (macd.histogram > 0 ? 0.3 : 0) + 
                      (stoch.k > stoch.d ? 0.2 : 0) + 
                      (patterns.bullish * 0.2);
  
  const sellPressure = (rsiValue < 50 ? 0.3 : 0) + 
                       (macd.histogram < 0 ? 0.3 : 0) + 
                       (stoch.k < stoch.d ? 0.2 : 0) + 
                       (patterns.bearish * 0.2);
  
  const momentum = (rsiValue - 50) / 50 * 0.4 + 
                   Math.tanh(macd.histogram * 10) * 0.3 + 
                   (stoch.k - 50) / 50 * 0.3;
  
  const confluence = Math.abs(buyPressure - sellPressure);
  
  const raw: FeatureVector = {
    priceChange: priceChangePercent,
    priceChangePercent,
    volatility,
    avgTrueRange: atr / curr.close,
    rsiValue: rsiValue / 100,
    rsiSlope: rsiSlope / 10,
    macdHistogram: Math.tanh(macd.histogram * 100),
    macdCrossover: macd.macd > macd.signal ? 1 : -1,
    stochK: stoch.k / 100,
    stochD: stoch.d / 100,
    trendStrength: Math.min(1, trendStrength),
    trendDirection,
    ema9Slope: Math.tanh(ema9Slope / curr.close * 1000),
    ema21Slope: Math.tanh(ema21Slope / curr.close * 1000),
    emaCrossover,
    volumeRatio: Math.min(3, volumeRatio) / 3,
    volumeTrend,
    bodyRatio,
    upperWickRatio,
    lowerWickRatio,
    bullishPattern: patterns.bullish,
    bearishPattern: patterns.bearish,
    isRanging: regime.isRanging,
    isTrending: regime.isTrending,
    regimeStrength: regime.strength,
    buyPressure,
    sellPressure,
    momentum,
    confluence
  };
  
  const vector = Object.values(raw);
  const labels = Object.keys(raw);
  
  // Normalize to [-1, 1] range
  const normalized = vector.map(v => {
    if (v >= -1 && v <= 1) return v;
    return Math.tanh(v);
  });
  
  return { vector, labels, normalized, raw };
}

export function createSequenceFeatures(candles: Candle[], lookback: number = 5): number[][] {
  const sequences: number[][] = [];
  
  for (let i = lookback; i <= candles.length; i++) {
    const slice = candles.slice(i - lookback, i);
    try {
      const features = extractFeatures(slice.length >= 30 ? slice : candles.slice(0, i));
      sequences.push(features.normalized);
    } catch {
      // Skip if not enough data
    }
  }
  
  return sequences;
}
