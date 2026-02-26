/**
 * X4 Calibration Configuration
 * Defines expected metrics and variance thresholds for X_oc pattern measurement
 */

export interface X4MetricConfig {
  expected: number;
  tolerancePercent: number;
  min?: number;
  max?: number;
}

export interface X4CalibrationConfig {
  version: string;
  updatedAt: string;
  metrics: {
    successLatencyMs: X4MetricConfig;
    failedLatencyMs: X4MetricConfig;
    retryLatencyMs: X4MetricConfig;
    payloadSizeBytes: X4MetricConfig;
    artifactCountPerPath: X4MetricConfig;
  };
  retry: {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
  };
}

// Default X4 baseline values based on initial harness measurements
export const defaultX4Config: X4CalibrationConfig = {
  version: '1.0.0',
  updatedAt: new Date().toISOString(),
  metrics: {
    successLatencyMs: {
      expected: 100,
      tolerancePercent: 50, // 50-150ms acceptable
      min: 50,
      max: 200,
    },
    failedLatencyMs: {
      expected: 50,
      tolerancePercent: 100, // 0-100ms acceptable (fast fail)
      min: 20,
      max: 150,
    },
    retryLatencyMs: {
      expected: 4000,
      tolerancePercent: 100, // 2000-8000ms acceptable
      min: 2000,
      max: 10000,
    },
    payloadSizeBytes: {
      expected: 700,
      tolerancePercent: 30, // 490-910B acceptable
      min: 500,
      max: 1000,
    },
    artifactCountPerPath: {
      expected: 2,
      tolerancePercent: 0, // Must be exactly 2
      min: 2,
      max: 2,
    },
  },
  retry: {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
  },
};

/**
 * Calibration result for a single metric
 */
export interface CalibrationResult {
  metric: string;
  observed: number;
  expected: number;
  variance: number; // Percentage difference
  varianceAbs: number; // Absolute difference
  status: 'pass' | 'warning' | 'fail';
  correctionFactor?: number;
}

/**
 * Full calibration report
 */
export interface CalibrationReport {
  timestamp: string;
  config: X4CalibrationConfig;
  results: CalibrationResult[];
  summary: {
    total: number;
    pass: number;
    warning: number;
    fail: number;
    overallStatus: 'pass' | 'warning' | 'fail';
  };
  recommendations: string[];
}
