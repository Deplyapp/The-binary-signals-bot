import type { Candle, IndicatorValues, PsychologyAnalysis } from "@shared/schema";
import { computeIndicators, checkVolatility } from "./indicatorEngine";
import { analyzePsychology } from "./psychologyEngine";
import { createLogger } from "../utils/logger";

const logger = createLogger("PredictionEngine");

export interface PredictionResult {
  indicators: IndicatorValues;
  psychology: PsychologyAnalysis;
  volatility: {
    isVolatile: boolean;
    reason?: string;
  };
  estimatedClose: number;
}

export function estimateFormingCandle(formingCandle: Candle | null): Candle | null {
  if (!formingCandle) return null;
  
  return {
    ...formingCandle,
    isForming: true,
  };
}

export function predictWithFormingCandle(
  closedCandles: Candle[],
  formingCandle: Candle | null
): PredictionResult {
  let candlesForAnalysis = [...closedCandles];
  
  if (formingCandle) {
    const estimatedCandle = estimateFormingCandle(formingCandle);
    if (estimatedCandle) {
      candlesForAnalysis = [...closedCandles, estimatedCandle];
    }
  }
  
  const indicators = computeIndicators(candlesForAnalysis);
  const psychology = analyzePsychology(candlesForAnalysis);
  const volatility = checkVolatility(candlesForAnalysis);
  
  const estimatedClose = formingCandle?.close || 
    (closedCandles.length > 0 ? closedCandles[closedCandles.length - 1].close : 0);
  
  logger.debug("Prediction computed", {
    candlesCount: candlesForAnalysis.length,
    hasFormingCandle: !!formingCandle,
    estimatedClose,
  });
  
  return {
    indicators,
    psychology,
    volatility,
    estimatedClose,
  };
}

export function computeOnClosedCandles(closedCandles: Candle[]): PredictionResult {
  const indicators = computeIndicators(closedCandles);
  const psychology = analyzePsychology(closedCandles);
  const volatility = checkVolatility(closedCandles);
  
  const estimatedClose = closedCandles.length > 0 
    ? closedCandles[closedCandles.length - 1].close 
    : 0;
  
  return {
    indicators,
    psychology,
    volatility,
    estimatedClose,
  };
}
