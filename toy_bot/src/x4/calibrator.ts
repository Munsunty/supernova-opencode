/**
 * X4 Calibration Engine
 * Compares observed X_oc measurements against X4 expectations
 */

import {
  type X4CalibrationConfig,
  type CalibrationResult,
  type CalibrationReport,
  defaultX4Config,
} from './config';
import { artifactManager } from '../artifacts';
import type { ArtifactRecord } from '../types';

/**
 * Calibration engine for X4 pattern measurement
 */
export class X4Calibrator {
  private config: X4CalibrationConfig;

  constructor(config: X4CalibrationConfig = defaultX4Config) {
    this.config = config;
  }

  /**
   * Update calibration configuration
   */
  updateConfig(config: Partial<X4CalibrationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): X4CalibrationConfig {
    return { ...this.config };
  }

  /**
   * Calibrate against observed artifacts
   */
  async calibrate(): Promise<CalibrationReport> {
    const artifacts = await this.loadArtifacts();
    const results: CalibrationResult[] = [];
    
    // Calculate metrics from artifacts
    const metrics = this.calculateMetrics(artifacts);
    
    // Compare each metric against X4 expectations
    for (const [key, observed] of Object.entries(metrics)) {
      const config = this.config.metrics[key as keyof typeof this.config.metrics];
      if (config) {
        const result = this.compareMetric(key, observed, config);
        results.push(result);
      }
    }

    // Generate report
    const report = this.generateReport(results);
    
    return report;
  }

  /**
   * Load and filter artifacts for calibration
   */
  private async loadArtifacts(): Promise<ArtifactRecord[]> {
    const files = await artifactManager.list();
    const artifacts: ArtifactRecord[] = [];

    for (const file of files) {
      const record = await artifactManager.read(file);
      if (record) artifacts.push(record);
    }

    return artifacts;
  }

  /**
   * Calculate observed metrics from artifacts
   */
  private calculateMetrics(artifacts: ArtifactRecord[]): Record<string, number> {
    const completed = artifacts.filter(a => a.status === 'completed');
    const errors = artifacts.filter(a => a.status === 'error');

    // Success latency (average)
    const successArtifacts = completed.filter(a => a.path === 'success');
    const successLatency = successArtifacts.length > 0
      ? successArtifacts.reduce((sum, a) => sum + a.durationMs, 0) / successArtifacts.length
      : 0;

    // Failed latency (average)
    const failedArtifacts = errors.filter(a => a.path === 'failed');
    const failedLatency = failedArtifacts.length > 0
      ? failedArtifacts.reduce((sum, a) => sum + a.durationMs, 0) / failedArtifacts.length
      : 0;

    // Retry latency (average)
    const retryArtifacts = completed.filter(a => a.path === 'retry');
    const retryLatency = retryArtifacts.length > 0
      ? retryArtifacts.reduce((sum, a) => sum + a.durationMs, 0) / retryArtifacts.length
      : 0;

    // Payload size (average)
    const payloadSizes = artifacts.map(a => a.payload ? JSON.stringify(a.payload).length : 0);
    const avgPayloadSize = payloadSizes.length > 0
      ? payloadSizes.reduce((sum, s) => sum + s, 0) / payloadSizes.length
      : 0;

    // Artifact count per path
    const pathGroups = this.groupBy(artifacts, 'path');
    const avgArtifactCount = Object.values(pathGroups).reduce(
      (sum, group) => sum + group.length, 0
    ) / Object.keys(pathGroups).length || 0;

    return {
      successLatencyMs: Math.round(successLatency),
      failedLatencyMs: Math.round(failedLatency),
      retryLatencyMs: Math.round(retryLatency),
      payloadSizeBytes: Math.round(avgPayloadSize),
      artifactCountPerPath: Math.round(avgArtifactCount),
    };
  }

  /**
   * Compare observed metric against expected
   */
  private compareMetric(
    name: string,
    observed: number,
    config: { expected: number; tolerancePercent: number; min?: number; max?: number }
  ): CalibrationResult {
    const variance = ((observed - config.expected) / config.expected) * 100;
    const varianceAbs = Math.abs(observed - config.expected);
    
    let status: CalibrationResult['status'];
    let correctionFactor: number | undefined;

    if (config.min !== undefined && observed < config.min) {
      status = 'fail';
    } else if (config.max !== undefined && observed > config.max) {
      status = 'fail';
    } else if (Math.abs(variance) <= config.tolerancePercent) {
      status = 'pass';
    } else if (Math.abs(variance) <= config.tolerancePercent * 2) {
      status = 'warning';
    } else {
      status = 'fail';
    }

    // Calculate correction factor for tuning
    if (status !== 'pass') {
      correctionFactor = config.expected / observed;
    }

    return {
      metric: name,
      observed,
      expected: config.expected,
      variance: Math.round(variance * 100) / 100,
      varianceAbs,
      status,
      correctionFactor,
    };
  }

  /**
   * Generate calibration report
   */
  private generateReport(results: CalibrationResult[]): CalibrationReport {
    const summary = {
      total: results.length,
      pass: results.filter(r => r.status === 'pass').length,
      warning: results.filter(r => r.status === 'warning').length,
      fail: results.filter(r => r.status === 'fail').length,
      overallStatus: this.determineOverallStatus(results),
    };

    const recommendations = this.generateRecommendations(results);

    return {
      timestamp: new Date().toISOString(),
      config: this.getConfig(),
      results,
      summary,
      recommendations,
    };
  }

  /**
   * Determine overall calibration status
   */
  private determineOverallStatus(results: CalibrationResult[]): CalibrationReport['summary']['overallStatus'] {
    if (results.some(r => r.status === 'fail')) return 'fail';
    if (results.some(r => r.status === 'warning')) return 'warning';
    return 'pass';
  }

  /**
   * Generate tuning recommendations
   */
  private generateRecommendations(results: CalibrationResult[]): string[] {
    const recommendations: string[] = [];

    for (const result of results) {
      if (result.status === 'fail') {
        if (result.metric.includes('Latency') && result.observed > result.expected) {
          recommendations.push(
            `${result.metric}: Latency ${result.varianceAbs}ms above expected. ` +
            `Consider optimizing processing or increasing timeout thresholds.`
          );
        } else if (result.metric.includes('Latency') && result.observed < result.expected) {
          recommendations.push(
            `${result.metric}: Latency ${result.varianceAbs}ms below expected. ` +
            `May indicate insufficient processing depth.`
          );
        } else if (result.metric === 'payloadSizeBytes') {
          recommendations.push(
            `${result.metric}: Payload size variance of ${result.variance}%. ` +
            `Review payload structure for consistency.`
          );
        }
      } else if (result.status === 'warning') {
        recommendations.push(
          `${result.metric}: Near threshold (${result.variance}% variance). ` +
          `Monitor for drift.`
        );
      }
    }

    if (recommendations.length === 0) {
      recommendations.push('All metrics within expected ranges. No action required.');
    }

    return recommendations;
  }

  /**
   * Group array by key
   */
  private groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
    return array.reduce((groups, item) => {
      const value = String(item[key]);
      groups[value] = groups[value] || [];
      groups[value].push(item);
      return groups;
    }, {} as Record<string, T[]>);
  }

  /**
   * Save calibration report to artifacts
   */
  async saveReport(report: CalibrationReport): Promise<string> {
    const filename = `x4-calibration-${Date.now()}.json`;
    const filepath = `${import.meta.dir}/../../artifacts/${filename}`;
    
    await Bun.write(filepath, JSON.stringify(report, null, 2));
    console.log(`[X4Calibrator] Report saved: ${filename}`);
    
    return filepath;
  }
}

// Singleton instance
export const x4Calibrator = new X4Calibrator();
