export { extractFeatures, createSequenceFeatures } from "./featureExtractor";
export type { FeatureVector, ExtractedFeatures } from "./featureExtractor";

export { EnsemblePredictor, getEnsemblePredictor } from "./ensembleModel";
export type { ModelPrediction } from "./ensembleModel";

export { getAdaptiveThresholdManager } from "./adaptiveThresholds";
export type { ThresholdState, PerformanceMetrics } from "./adaptiveThresholds";

import { extractFeatures, type ExtractedFeatures } from "./featureExtractor";
import { getEnsemblePredictor, type ModelPrediction } from "./ensembleModel";
import { getAdaptiveThresholdManager } from "./adaptiveThresholds";
import type { Candle } from "../signalEngine";
import { logger } from "../logger";

export interface MLEnhancedSignal {
  direction: "CALL" | "PUT" | "NO_TRADE";
  confidence: number;
  tier: "PREMIUM" | "STANDARD" | "LOW";
  mlProbability: number;
  components: {
    logistic: number;
    boosting: number;
    knn: number;
    pattern: number;
  };
  adaptiveAllowed: boolean;
  adaptiveReason: string;
  features?: ExtractedFeatures;
}

export function analyzeWithML(candles: Candle[]): MLEnhancedSignal | null {
  try {
    if (candles.length < 30) {
      logger.debug("ML: Not enough candles for analysis");
      return null;
    }
    
    // Extract features
    const features = extractFeatures(candles);
    
    // Get ensemble prediction
    const ensemble = getEnsemblePredictor();
    const prediction = ensemble.predict(features);
    
    // Check adaptive thresholds
    const thresholdManager = getAdaptiveThresholdManager();
    const adaptiveCheck = thresholdManager.isSignalAllowed(prediction.confidence);
    
    // Build result
    const result: MLEnhancedSignal = {
      direction: adaptiveCheck.allowed ? prediction.direction : "NO_TRADE",
      confidence: prediction.confidence,
      tier: prediction.tier,
      mlProbability: prediction.probability,
      components: prediction.components,
      adaptiveAllowed: adaptiveCheck.allowed,
      adaptiveReason: adaptiveCheck.reason,
      features
    };
    
    logger.debug(`ML Analysis: ${prediction.direction} @ ${prediction.confidence}% (${prediction.tier}), adaptive: ${adaptiveCheck.allowed}`);
    
    return result;
  } catch (error) {
    logger.error("ML analysis error:", error);
    return null;
  }
}

export function recordMLOutcome(
  features: ExtractedFeatures | undefined, 
  outcome: "WIN" | "LOSS",
  confidence: number
): void {
  try {
    // Update ensemble model
    if (features) {
      const ensemble = getEnsemblePredictor();
      ensemble.update(features, outcome);
    }
    
    // Update adaptive thresholds
    const thresholdManager = getAdaptiveThresholdManager();
    thresholdManager.recordOutcome(outcome === "WIN", confidence);
    
    logger.info(`ML outcome recorded: ${outcome} @ ${confidence}%`);
  } catch (error) {
    logger.error("Error recording ML outcome:", error);
  }
}

export function getMLStats(): {
  ensemble: {
    samplesProcessed: number;
    rollingAccuracy: number;
    patternCount: number;
    knnBufferSize: number;
  };
  adaptive: {
    currentThresholds: {
      minConfidence: number;
      maxConflictRatio: number;
      minTrendStrength: number;
      minAlignedIndicators: number;
    };
    metrics: {
      wins: number;
      losses: number;
      winRate: number;
      recentWinRate: number;
      streak: number;
      isWinStreak: boolean;
    };
    adjustmentCount: number;
    sampleCount: number;
  };
} {
  const ensemble = getEnsemblePredictor();
  const thresholdManager = getAdaptiveThresholdManager();
  
  return {
    ensemble: ensemble.getModelStats(),
    adaptive: thresholdManager.getStats()
  };
}

export function resetMLModels(): void {
  getAdaptiveThresholdManager().reset();
  logger.info("ML models reset");
}
