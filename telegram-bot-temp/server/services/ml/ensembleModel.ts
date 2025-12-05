import { ExtractedFeatures } from "./featureExtractor";
import { logger } from "../logger";

export interface ModelPrediction {
  probability: number;
  confidence: number;
  direction: "CALL" | "PUT" | "NO_TRADE";
  tier: "PREMIUM" | "STANDARD" | "LOW";
  components: {
    logistic: number;
    boosting: number;
    knn: number;
    pattern: number;
  };
}

interface OnlineLogisticModel {
  weights: number[];
  bias: number;
  learningRate: number;
  l2Lambda: number;
  nSamples: number;
}

interface DecisionStump {
  featureIndex: number;
  threshold: number;
  leftValue: number;
  rightValue: number;
  weight: number;
}

interface BoostingModel {
  stumps: DecisionStump[];
  maxStumps: number;
}

interface KNNBuffer {
  features: number[][];
  labels: number[];
  maxSize: number;
}

interface PatternMemory {
  patterns: Map<string, { wins: number; total: number }>;
  decayRate: number;
}

class OnlineLogisticRegression {
  private model: OnlineLogisticModel;
  
  constructor(numFeatures: number, learningRate: number = 0.01, l2Lambda: number = 0.001) {
    this.model = {
      weights: new Array(numFeatures).fill(0).map(() => (Math.random() - 0.5) * 0.1),
      bias: 0,
      learningRate,
      l2Lambda,
      nSamples: 0
    };
  }
  
  private sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, x))));
  }
  
  predict(features: number[]): number {
    let z = this.model.bias;
    for (let i = 0; i < features.length && i < this.model.weights.length; i++) {
      z += this.model.weights[i] * features[i];
    }
    return this.sigmoid(z);
  }
  
  update(features: number[], label: number): void {
    const prediction = this.predict(features);
    const error = label - prediction;
    
    // Adaptive learning rate decay
    const adaptiveLR = this.model.learningRate / (1 + this.model.nSamples * 0.0001);
    
    // Update weights with L2 regularization
    for (let i = 0; i < features.length && i < this.model.weights.length; i++) {
      const gradient = error * features[i] - this.model.l2Lambda * this.model.weights[i];
      this.model.weights[i] += adaptiveLR * gradient;
    }
    
    this.model.bias += adaptiveLR * error;
    this.model.nSamples++;
  }
  
  getWeights(): number[] {
    return [...this.model.weights];
  }
}

class GradientBoostingClassifier {
  private model: BoostingModel;
  private learningRate: number;
  
  constructor(maxStumps: number = 20, learningRate: number = 0.1) {
    this.model = {
      stumps: [],
      maxStumps
    };
    this.learningRate = learningRate;
  }
  
  private findBestStump(features: number[][], labels: number[], residuals: number[]): DecisionStump | null {
    if (features.length === 0 || features[0].length === 0) return null;
    
    const numFeatures = features[0].length;
    let bestStump: DecisionStump | null = null;
    let bestLoss = Infinity;
    
    // Sample features for speed (random subset)
    const featureIndices = [];
    for (let i = 0; i < Math.min(10, numFeatures); i++) {
      featureIndices.push(Math.floor(Math.random() * numFeatures));
    }
    
    for (const featureIndex of featureIndices) {
      // Get unique thresholds
      const values = features.map(f => f[featureIndex]).sort((a, b) => a - b);
      const thresholds = [...new Set(values)].slice(0, 5); // Limit thresholds
      
      for (const threshold of thresholds) {
        let leftSum = 0, leftCount = 0;
        let rightSum = 0, rightCount = 0;
        
        for (let i = 0; i < features.length; i++) {
          if (features[i][featureIndex] <= threshold) {
            leftSum += residuals[i];
            leftCount++;
          } else {
            rightSum += residuals[i];
            rightCount++;
          }
        }
        
        if (leftCount === 0 || rightCount === 0) continue;
        
        const leftValue = leftSum / leftCount;
        const rightValue = rightSum / rightCount;
        
        // Calculate loss
        let loss = 0;
        for (let i = 0; i < features.length; i++) {
          const pred = features[i][featureIndex] <= threshold ? leftValue : rightValue;
          loss += Math.pow(residuals[i] - pred, 2);
        }
        
        if (loss < bestLoss) {
          bestLoss = loss;
          bestStump = {
            featureIndex,
            threshold,
            leftValue: leftValue * this.learningRate,
            rightValue: rightValue * this.learningRate,
            weight: 1
          };
        }
      }
    }
    
    return bestStump;
  }
  
  train(features: number[][], labels: number[]): void {
    if (features.length < 5) return;
    
    // Initialize predictions
    const predictions = new Array(features.length).fill(0.5);
    
    for (let round = 0; round < this.model.maxStumps && this.model.stumps.length < this.model.maxStumps; round++) {
      // Calculate residuals
      const residuals = labels.map((l, i) => l - predictions[i]);
      
      // Find best stump
      const stump = this.findBestStump(features, labels, residuals);
      if (!stump) break;
      
      // Update predictions
      for (let i = 0; i < features.length; i++) {
        const pred = features[i][stump.featureIndex] <= stump.threshold ? 
                     stump.leftValue : stump.rightValue;
        predictions[i] = Math.max(0, Math.min(1, predictions[i] + pred));
      }
      
      this.model.stumps.push(stump);
    }
  }
  
  predict(features: number[]): number {
    if (this.model.stumps.length === 0) return 0.5;
    
    let prediction = 0.5;
    for (const stump of this.model.stumps) {
      if (stump.featureIndex < features.length) {
        const value = features[stump.featureIndex] <= stump.threshold ? 
                      stump.leftValue : stump.rightValue;
        prediction += value;
      }
    }
    
    return Math.max(0, Math.min(1, prediction));
  }
  
  updateOnline(features: number[], label: number): void {
    if (this.model.stumps.length === 0) return;
    
    const prediction = this.predict(features);
    const error = label - prediction;
    
    // Adjust stump weights based on error
    for (const stump of this.model.stumps) {
      if (stump.featureIndex < features.length) {
        const isLeft = features[stump.featureIndex] <= stump.threshold;
        const adjustment = error * 0.01;
        if (isLeft) {
          stump.leftValue += adjustment;
        } else {
          stump.rightValue += adjustment;
        }
      }
    }
  }
}

class KNNClassifier {
  private buffer: KNNBuffer;
  private k: number;
  
  constructor(maxSize: number = 200, k: number = 5) {
    this.buffer = {
      features: [],
      labels: [],
      maxSize
    };
    this.k = k;
  }
  
  private euclideanDistance(a: number[], b: number[]): number {
    let sum = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      sum += Math.pow(a[i] - b[i], 2);
    }
    return Math.sqrt(sum);
  }
  
  add(features: number[], label: number): void {
    this.buffer.features.push([...features]);
    this.buffer.labels.push(label);
    
    // Remove oldest if over capacity
    if (this.buffer.features.length > this.buffer.maxSize) {
      this.buffer.features.shift();
      this.buffer.labels.shift();
    }
  }
  
  predict(features: number[]): number {
    if (this.buffer.features.length < this.k) return 0.5;
    
    // Calculate distances
    const distances: { distance: number; label: number }[] = [];
    for (let i = 0; i < this.buffer.features.length; i++) {
      distances.push({
        distance: this.euclideanDistance(features, this.buffer.features[i]),
        label: this.buffer.labels[i]
      });
    }
    
    // Sort by distance and get k nearest
    distances.sort((a, b) => a.distance - b.distance);
    const kNearest = distances.slice(0, this.k);
    
    // Weighted voting (inverse distance)
    let weightedSum = 0;
    let weightTotal = 0;
    for (const neighbor of kNearest) {
      const weight = 1 / (neighbor.distance + 0.001);
      weightedSum += neighbor.label * weight;
      weightTotal += weight;
    }
    
    return weightTotal > 0 ? weightedSum / weightTotal : 0.5;
  }
}

class PatternRecognizer {
  private memory: PatternMemory;
  
  constructor(decayRate: number = 0.995) {
    this.memory = {
      patterns: new Map(),
      decayRate
    };
  }
  
  private discretizeFeatures(features: ExtractedFeatures): string {
    const raw = features.raw;
    
    // Create pattern signature from key features
    const parts = [
      raw.rsiValue > 0.7 ? "OH" : raw.rsiValue < 0.3 ? "OS" : "N",
      raw.macdCrossover > 0 ? "M+" : "M-",
      raw.trendDirection > 0 ? "T+" : "T-",
      raw.bullishPattern > 0.5 ? "B" : raw.bearishPattern > 0.5 ? "S" : "X",
      raw.isTrending > 0.5 ? "TR" : "RG",
      raw.volumeRatio > 0.7 ? "HV" : "LV"
    ];
    
    return parts.join("|");
  }
  
  recordOutcome(features: ExtractedFeatures, won: boolean): void {
    const pattern = this.discretizeFeatures(features);
    
    // Apply decay to all patterns
    for (const [key, stats] of this.memory.patterns) {
      stats.wins *= this.memory.decayRate;
      stats.total *= this.memory.decayRate;
      
      // Remove patterns with very low total
      if (stats.total < 0.1) {
        this.memory.patterns.delete(key);
      }
    }
    
    // Update current pattern
    const existing = this.memory.patterns.get(pattern) || { wins: 0, total: 0 };
    existing.total += 1;
    if (won) existing.wins += 1;
    this.memory.patterns.set(pattern, existing);
  }
  
  predict(features: ExtractedFeatures): number {
    const pattern = this.discretizeFeatures(features);
    const stats = this.memory.patterns.get(pattern);
    
    if (!stats || stats.total < 3) {
      return 0.5; // Neutral if not enough data
    }
    
    return stats.wins / stats.total;
  }
  
  getPatternStats(): Map<string, { wins: number; total: number; winRate: number }> {
    const stats = new Map();
    for (const [key, value] of this.memory.patterns) {
      if (value.total >= 3) {
        stats.set(key, {
          wins: value.wins,
          total: value.total,
          winRate: value.wins / value.total
        });
      }
    }
    return stats;
  }
}

export class EnsemblePredictor {
  private logistic: OnlineLogisticRegression;
  private boosting: GradientBoostingClassifier;
  private knn: KNNClassifier;
  private patterns: PatternRecognizer;
  
  private calibration: { buckets: Map<number, { correct: number; total: number }> };
  private rollingAccuracy: { predictions: Array<{ predicted: number; actual: number }> };
  
  private initialized: boolean = false;
  private trainingBuffer: { features: number[][]; labels: number[] };
  
  constructor() {
    this.logistic = new OnlineLogisticRegression(28, 0.02, 0.001);
    this.boosting = new GradientBoostingClassifier(15, 0.1);
    this.knn = new KNNClassifier(150, 7);
    this.patterns = new PatternRecognizer(0.99);
    
    this.calibration = { buckets: new Map() };
    this.rollingAccuracy = { predictions: [] };
    this.trainingBuffer = { features: [], labels: [] };
  }
  
  private calibrateProbability(rawProb: number): number {
    // Isotonic-like calibration using stored buckets
    const bucketKey = Math.floor(rawProb * 10);
    const bucket = this.calibration.buckets.get(bucketKey);
    
    if (bucket && bucket.total >= 5) {
      // Blend raw probability with calibrated estimate
      const calibrated = bucket.correct / bucket.total;
      return rawProb * 0.6 + calibrated * 0.4;
    }
    
    return rawProb;
  }
  
  private updateCalibration(predictedProb: number, actualOutcome: number): void {
    const bucketKey = Math.floor(predictedProb * 10);
    const bucket = this.calibration.buckets.get(bucketKey) || { correct: 0, total: 0 };
    
    bucket.total += 1;
    bucket.correct += actualOutcome;
    this.calibration.buckets.set(bucketKey, bucket);
    
    // Decay old data
    for (const [key, b] of this.calibration.buckets) {
      b.total *= 0.995;
      b.correct *= 0.995;
      if (b.total < 0.5) {
        this.calibration.buckets.delete(key);
      }
    }
  }
  
  predict(features: ExtractedFeatures): ModelPrediction {
    const normalized = features.normalized;
    
    // Get predictions from all models
    const logisticPred = this.logistic.predict(normalized);
    const boostingPred = this.boosting.predict(normalized);
    const knnPred = this.knn.predict(normalized);
    const patternPred = this.patterns.predict(features);
    
    // Weighted ensemble (adaptive weights based on recent performance)
    let logisticWeight = 0.30;
    let boostingWeight = 0.30;
    let knnWeight = 0.20;
    let patternWeight = 0.20;
    
    // Adjust weights if pattern recognizer has strong signal
    if (patternPred > 0.7 || patternPred < 0.3) {
      patternWeight = 0.35;
      logisticWeight = 0.25;
      boostingWeight = 0.25;
      knnWeight = 0.15;
    }
    
    // Ensemble prediction
    let rawProbability = 
      logisticPred * logisticWeight +
      boostingPred * boostingWeight +
      knnPred * knnWeight +
      patternPred * patternWeight;
    
    // Apply calibration
    const calibratedProb = this.calibrateProbability(rawProbability);
    
    // Determine direction and confidence
    const directionStrength = Math.abs(calibratedProb - 0.5) * 2;
    let direction: "CALL" | "PUT" | "NO_TRADE" = "NO_TRADE";
    
    if (directionStrength > 0.15) {
      direction = calibratedProb > 0.5 ? "CALL" : "PUT";
    }
    
    // Convert to confidence percentage (50-92 range)
    const confidence = 50 + directionStrength * 42;
    
    // Determine tier
    let tier: "PREMIUM" | "STANDARD" | "LOW" = "LOW";
    if (confidence >= 82) {
      tier = "PREMIUM";
    } else if (confidence >= 72) {
      tier = "STANDARD";
    }
    
    return {
      probability: calibratedProb,
      confidence: Math.round(confidence),
      direction,
      tier,
      components: {
        logistic: logisticPred,
        boosting: boostingPred,
        knn: knnPred,
        pattern: patternPred
      }
    };
  }
  
  update(features: ExtractedFeatures, outcome: "WIN" | "LOSS"): void {
    const label = outcome === "WIN" ? 1 : 0;
    const normalized = features.normalized;
    
    // Get prediction before update for calibration
    const prediction = this.predict(features);
    
    // Update all models
    this.logistic.update(normalized, label);
    this.boosting.updateOnline(normalized, label);
    this.knn.add(normalized, label);
    this.patterns.recordOutcome(features, label === 1);
    
    // Update calibration
    this.updateCalibration(prediction.probability, label);
    
    // Store for training buffer
    this.trainingBuffer.features.push(normalized);
    this.trainingBuffer.labels.push(label);
    
    // Limit buffer size
    if (this.trainingBuffer.features.length > 500) {
      this.trainingBuffer.features.shift();
      this.trainingBuffer.labels.shift();
    }
    
    // Retrain boosting periodically
    if (this.trainingBuffer.features.length >= 30 && 
        this.trainingBuffer.features.length % 10 === 0) {
      this.boosting = new GradientBoostingClassifier(15, 0.1);
      this.boosting.train(this.trainingBuffer.features, this.trainingBuffer.labels);
    }
    
    // Track rolling accuracy
    this.rollingAccuracy.predictions.push({
      predicted: prediction.probability > 0.5 ? 1 : 0,
      actual: label
    });
    
    if (this.rollingAccuracy.predictions.length > 50) {
      this.rollingAccuracy.predictions.shift();
    }
    
    logger.info(`ML model updated: outcome=${outcome}, buffer_size=${this.trainingBuffer.features.length}`);
  }
  
  getRollingAccuracy(): number {
    if (this.rollingAccuracy.predictions.length < 5) return 0.5;
    
    const correct = this.rollingAccuracy.predictions.filter(p => p.predicted === p.actual).length;
    return correct / this.rollingAccuracy.predictions.length;
  }
  
  getModelStats(): {
    samplesProcessed: number;
    rollingAccuracy: number;
    patternCount: number;
    knnBufferSize: number;
  } {
    return {
      samplesProcessed: this.trainingBuffer.features.length,
      rollingAccuracy: this.getRollingAccuracy(),
      patternCount: this.patterns.getPatternStats().size,
      knnBufferSize: this.knn["buffer"].features.length
    };
  }
}

// Singleton instance
let ensembleInstance: EnsemblePredictor | null = null;

export function getEnsemblePredictor(): EnsemblePredictor {
  if (!ensembleInstance) {
    ensembleInstance = new EnsemblePredictor();
    logger.info("ML Ensemble predictor initialized");
  }
  return ensembleInstance;
}
