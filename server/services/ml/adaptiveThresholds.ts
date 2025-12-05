import { logger } from "../logger";

export interface ThresholdState {
  minConfidence: number;
  maxConflictRatio: number;
  minTrendStrength: number;
  minAlignedIndicators: number;
}

export interface PerformanceMetrics {
  wins: number;
  losses: number;
  winRate: number;
  recentWins: number;
  recentLosses: number;
  recentWinRate: number;
  streak: number;
  isWinStreak: boolean;
}

interface AdaptiveState {
  currentThresholds: ThresholdState;
  baseThresholds: ThresholdState;
  performanceWindow: Array<{ won: boolean; timestamp: number; confidence: number }>;
  lastAdjustment: number;
  adjustmentCount: number;
}

class AdaptiveThresholdManager {
  private state: AdaptiveState;
  private readonly windowSize = 30;
  private readonly adjustmentCooldown = 300000; // 5 minutes
  
  constructor() {
    const baseThresholds: ThresholdState = {
      minConfidence: 72,
      maxConflictRatio: 0.32,
      minTrendStrength: 0.42,
      minAlignedIndicators: 4
    };
    
    this.state = {
      currentThresholds: { ...baseThresholds },
      baseThresholds,
      performanceWindow: [],
      lastAdjustment: 0,
      adjustmentCount: 0
    };
  }
  
  recordOutcome(won: boolean, confidence: number): void {
    const now = Date.now();
    
    this.state.performanceWindow.push({
      won,
      timestamp: now,
      confidence
    });
    
    // Remove old entries (older than 2 hours)
    const cutoff = now - 7200000;
    this.state.performanceWindow = this.state.performanceWindow.filter(
      entry => entry.timestamp > cutoff
    );
    
    // Limit window size
    if (this.state.performanceWindow.length > this.windowSize * 2) {
      this.state.performanceWindow = this.state.performanceWindow.slice(-this.windowSize);
    }
    
    // Try to adjust thresholds
    this.maybeAdjustThresholds();
  }
  
  private maybeAdjustThresholds(): void {
    const now = Date.now();
    
    // Check cooldown
    if (now - this.state.lastAdjustment < this.adjustmentCooldown) {
      return;
    }
    
    // Need minimum samples
    if (this.state.performanceWindow.length < 10) {
      return;
    }
    
    const metrics = this.getPerformanceMetrics();
    const recentWindow = this.state.performanceWindow.slice(-15);
    const recentWinRate = recentWindow.filter(e => e.won).length / recentWindow.length;
    
    let adjusted = false;
    const thresholds = this.state.currentThresholds;
    const base = this.state.baseThresholds;
    
    if (recentWinRate < 0.65) {
      // Losing too much - tighten thresholds
      thresholds.minConfidence = Math.min(85, thresholds.minConfidence + 2);
      thresholds.maxConflictRatio = Math.max(0.20, thresholds.maxConflictRatio - 0.02);
      thresholds.minTrendStrength = Math.min(0.55, thresholds.minTrendStrength + 0.03);
      thresholds.minAlignedIndicators = Math.min(6, thresholds.minAlignedIndicators + 1);
      adjusted = true;
      logger.info(`Adaptive: Tightening thresholds due to low win rate ${(recentWinRate * 100).toFixed(1)}%`);
    } else if (recentWinRate > 0.80 && this.state.performanceWindow.length >= 15) {
      // Winning consistently - can slightly relax
      thresholds.minConfidence = Math.max(base.minConfidence, thresholds.minConfidence - 1);
      thresholds.maxConflictRatio = Math.min(base.maxConflictRatio, thresholds.maxConflictRatio + 0.01);
      thresholds.minTrendStrength = Math.max(base.minTrendStrength, thresholds.minTrendStrength - 0.02);
      adjusted = true;
      logger.info(`Adaptive: Relaxing thresholds due to high win rate ${(recentWinRate * 100).toFixed(1)}%`);
    }
    
    // Check for losing streaks
    if (metrics.isWinStreak === false && metrics.streak >= 3) {
      // On a losing streak - emergency tightening
      thresholds.minConfidence = Math.min(88, thresholds.minConfidence + 3);
      thresholds.minAlignedIndicators = Math.min(7, thresholds.minAlignedIndicators + 1);
      adjusted = true;
      logger.warn(`Adaptive: Emergency tightening due to ${metrics.streak} loss streak`);
    }
    
    if (adjusted) {
      this.state.lastAdjustment = now;
      this.state.adjustmentCount++;
    }
  }
  
  getPerformanceMetrics(): PerformanceMetrics {
    const window = this.state.performanceWindow;
    const wins = window.filter(e => e.won).length;
    const losses = window.length - wins;
    
    const recent = window.slice(-10);
    const recentWins = recent.filter(e => e.won).length;
    const recentLosses = recent.length - recentWins;
    
    // Calculate streak
    let streak = 0;
    let isWinStreak = true;
    if (window.length > 0) {
      isWinStreak = window[window.length - 1].won;
      for (let i = window.length - 1; i >= 0; i--) {
        if (window[i].won === isWinStreak) {
          streak++;
        } else {
          break;
        }
      }
    }
    
    return {
      wins,
      losses,
      winRate: window.length > 0 ? wins / window.length : 0,
      recentWins,
      recentLosses,
      recentWinRate: recent.length > 0 ? recentWins / recent.length : 0,
      streak,
      isWinStreak
    };
  }
  
  getCurrentThresholds(): ThresholdState {
    return { ...this.state.currentThresholds };
  }
  
  getBaseThresholds(): ThresholdState {
    return { ...this.state.baseThresholds };
  }
  
  isSignalAllowed(confidence: number): { allowed: boolean; reason: string } {
    const thresholds = this.state.currentThresholds;
    const metrics = this.getPerformanceMetrics();
    
    // Check if we're on a bad streak
    if (!metrics.isWinStreak && metrics.streak >= 4) {
      // Require higher confidence during losing streaks
      const requiredConfidence = Math.min(90, thresholds.minConfidence + 5);
      if (confidence < requiredConfidence) {
        return {
          allowed: false,
          reason: `Losing streak (${metrics.streak}): need ${requiredConfidence}% confidence, have ${confidence}%`
        };
      }
    }
    
    // Check recent performance
    if (metrics.recentWinRate < 0.50 && this.state.performanceWindow.length >= 10) {
      // Poor recent performance - suspend signals temporarily
      return {
        allowed: false,
        reason: `Poor recent performance: ${(metrics.recentWinRate * 100).toFixed(0)}% win rate`
      };
    }
    
    // Standard confidence check
    if (confidence < thresholds.minConfidence) {
      return {
        allowed: false,
        reason: `Below adaptive threshold: ${confidence}% < ${thresholds.minConfidence}%`
      };
    }
    
    return { allowed: true, reason: "Signal meets adaptive criteria" };
  }
  
  reset(): void {
    this.state.currentThresholds = { ...this.state.baseThresholds };
    this.state.performanceWindow = [];
    this.state.lastAdjustment = 0;
    logger.info("Adaptive thresholds reset to base values");
  }
  
  getStats(): {
    currentThresholds: ThresholdState;
    metrics: PerformanceMetrics;
    adjustmentCount: number;
    sampleCount: number;
  } {
    return {
      currentThresholds: this.getCurrentThresholds(),
      metrics: this.getPerformanceMetrics(),
      adjustmentCount: this.state.adjustmentCount,
      sampleCount: this.state.performanceWindow.length
    };
  }
}

// Singleton instance
let thresholdManagerInstance: AdaptiveThresholdManager | null = null;

export function getAdaptiveThresholdManager(): AdaptiveThresholdManager {
  if (!thresholdManagerInstance) {
    thresholdManagerInstance = new AdaptiveThresholdManager();
    logger.info("Adaptive threshold manager initialized");
  }
  return thresholdManagerInstance;
}
