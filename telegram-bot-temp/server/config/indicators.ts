export interface IndicatorWeight {
  name: string;
  weight: number;
  enabled: boolean;
}

export interface IndicatorConfig {
  emaPeriods: number[];
  smaPeriods: number[];
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  rsiPeriod: number;
  stochasticK: number;
  stochasticD: number;
  stochasticSmooth: number;
  atrPeriod: number;
  adxPeriod: number;
  cciPeriod: number;
  williamsRPeriod: number;
  bollingerPeriod: number;
  bollingerStdDev: number;
  keltnerPeriod: number;
  keltnerMultiplier: number;
  hullPeriod: number;
  superTrendPeriod: number;
  superTrendMultiplier: number;
  rocPeriod: number;
  momentumPeriod: number;
  donchianPeriod: number;
  psarStep: number;
  psarMax: number;
  ultimateOscPeriod1: number;
  ultimateOscPeriod2: number;
  ultimateOscPeriod3: number;
  linRegPeriod: number;
  fisherPeriod: number;
  meanReversionPeriod: number;
}

export const DEFAULT_INDICATOR_CONFIG: IndicatorConfig = {
  emaPeriods: [5, 9, 12, 21, 50],
  smaPeriods: [20, 50, 200],
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  rsiPeriod: 14,
  stochasticK: 14,
  stochasticD: 3,
  stochasticSmooth: 3,
  atrPeriod: 14,
  adxPeriod: 14,
  cciPeriod: 20,
  williamsRPeriod: 14,
  bollingerPeriod: 20,
  bollingerStdDev: 2,
  keltnerPeriod: 20,
  keltnerMultiplier: 2,
  hullPeriod: 9,
  superTrendPeriod: 10,
  superTrendMultiplier: 3,
  rocPeriod: 12,
  momentumPeriod: 10,
  donchianPeriod: 20,
  psarStep: 0.02,
  psarMax: 0.2,
  ultimateOscPeriod1: 7,
  ultimateOscPeriod2: 14,
  ultimateOscPeriod3: 28,
  linRegPeriod: 14,
  fisherPeriod: 10,
  meanReversionPeriod: 20,
};

export const DEFAULT_INDICATOR_WEIGHTS: IndicatorWeight[] = [
  { name: "ema_cross_5_21", weight: 1.2, enabled: true },
  { name: "ema_cross_9_21", weight: 1.1, enabled: true },
  { name: "ema_cross_12_50", weight: 1.3, enabled: true },
  { name: "sma_trend_20", weight: 0.8, enabled: true },
  { name: "sma_trend_50", weight: 0.9, enabled: true },
  { name: "sma_trend_200", weight: 1.0, enabled: true },
  { name: "macd_signal", weight: 1.4, enabled: true },
  { name: "macd_histogram", weight: 1.2, enabled: true },
  { name: "rsi_overbought", weight: 1.3, enabled: true },
  { name: "rsi_oversold", weight: 1.3, enabled: true },
  { name: "rsi_divergence", weight: 1.5, enabled: true },
  { name: "stochastic_cross", weight: 1.1, enabled: true },
  { name: "stochastic_extreme", weight: 1.0, enabled: true },
  { name: "adx_trend_strength", weight: 0.9, enabled: true },
  { name: "cci_signal", weight: 0.8, enabled: true },
  { name: "williams_r", weight: 0.7, enabled: true },
  { name: "bollinger_squeeze", weight: 1.2, enabled: true },
  { name: "bollinger_breakout", weight: 1.4, enabled: true },
  { name: "keltner_breakout", weight: 1.1, enabled: true },
  { name: "hull_ma_trend", weight: 1.0, enabled: true },
  { name: "supertrend_signal", weight: 1.5, enabled: true },
  { name: "roc_momentum", weight: 0.8, enabled: true },
  { name: "momentum_signal", weight: 0.7, enabled: true },
  { name: "donchian_breakout", weight: 1.1, enabled: true },
  { name: "psar_signal", weight: 1.2, enabled: true },
  { name: "ultimate_osc", weight: 0.9, enabled: true },
  { name: "mean_reversion", weight: 1.0, enabled: true },
  { name: "lin_reg_slope", weight: 0.8, enabled: true },
  { name: "fisher_transform", weight: 0.9, enabled: true },
  { name: "engulfing_pattern", weight: 1.5, enabled: true },
  { name: "hammer_pattern", weight: 1.3, enabled: true },
  { name: "shooting_star", weight: 1.3, enabled: true },
  { name: "doji_pattern", weight: 0.8, enabled: true },
  { name: "wick_rejection", weight: 1.1, enabled: true },
  { name: "order_block", weight: 1.4, enabled: true },
  { name: "fvg_signal", weight: 1.2, enabled: true },
];

export const VOLATILITY_CONFIG = {
  atrThreshold: 0.006,
  tickVolatilityThreshold: 0.003,
  tickVolatilityWindow: 10,
  minCandlesForSignal: 50,
  maxWickRatio: 0.65,
  maxRangeExpansion: 2.5,
};

export const SIGNAL_CONFIG = {
  minConfidence: 72,
  minAlignedIndicators: 4,
  minStrongSignals: 2,
  maxConflictRatio: 0.32,
  minTrendStrength: 0.42,
  preCloseSeconds: 1,
  sendSignalSeconds: 1,
  historyCandles: 300,
  chartCandles: 100,
  confidenceBoostThreshold: 0.60,
  momentumMultiplier: 1.25,
  confluenceBonus: 10,
  premiumConfidenceThreshold: 82,
};

export const MARKET_REGIME_CONFIG = {
  trendingAdxThreshold: 18,
  strongTrendAdxThreshold: 25,
  rangingAdxThreshold: 12,
  choppyVolatilityThreshold: 0.78,
  minTrendDuration: 1,
  momentumConfirmationRequired: false,
  allowRangingTrades: true,
  rangingConfidencePenalty: 0.85,
};

export const QUALITY_THRESHOLDS = {
  highQuality: 80,
  mediumQuality: 68,
  lowQuality: 55,
  rejectBelow: 45,
  maxNoTradeStreak: 8,
  minVotesForSignal: 5,
  strongVoteThreshold: 1.15,
};

export function getIndicatorWeight(name: string, customWeights?: Record<string, number>): number {
  if (customWeights && customWeights[name] !== undefined) {
    return customWeights[name];
  }
  const indicator = DEFAULT_INDICATOR_WEIGHTS.find(w => w.name === name);
  return indicator?.weight || 1.0;
}

export function isIndicatorEnabled(name: string, enabledIndicators?: string[]): boolean {
  if (!enabledIndicators) {
    const indicator = DEFAULT_INDICATOR_WEIGHTS.find(w => w.name === name);
    return indicator?.enabled ?? true;
  }
  return enabledIndicators.includes(name);
}
