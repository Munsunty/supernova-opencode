/**
 * Load Testing System
 * Simulates concurrent users and measures performance
 */

import { artifactManager } from '../artifacts';
import { executePath } from '../paths';
import type { XOcPayload, ArtifactRecord } from '../types';

export interface LoadTestConfig {
  concurrentUsers: number;
  requestsPerUser: number;
  paths: Array<'success' | 'failed' | 'retry'>;
  rampUpMs: number;
  maxLatencyMs: number;
  minThroughput: number;
  maxMemoryIncreaseMb: number;
}

export interface LoadTestMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  throughputPerSecond: number;
  durationMs: number;
  memoryUsedMb: number;
  artifactWritesPerSecond: number;
}

export interface LoadTestResult {
  timestamp: string;
  config: LoadTestConfig;
  metrics: LoadTestMetrics;
  status: 'pass' | 'warning' | 'fail';
  violations: string[];
}

export const defaultLoadTestConfig: LoadTestConfig = {
  concurrentUsers: 10,
  requestsPerUser: 5,
  paths: ['success', 'failed', 'retry'],
  rampUpMs: 1000,
  maxLatencyMs: 500,
  minThroughput: 10,
  maxMemoryIncreaseMb: 50,
};

export class LoadTester {
  private config: LoadTestConfig;

  constructor(config: Partial<LoadTestConfig> = {}) {
    this.config = { ...defaultLoadTestConfig, ...config };
  }

  async run(): Promise<LoadTestResult> {
    console.log(`[LoadTest] Starting with ${this.config.concurrentUsers} concurrent users`);
    
    const startTime = Date.now();
    const startMemory = this.getMemoryUsageMb();
    const latencies: number[] = [];
    let successCount = 0;
    let failCount = 0;
    let artifactCount = 0;

    await artifactManager.init();

    const userPromises: Promise<void>[] = [];
    
    for (let userId = 0; userId < this.config.concurrentUsers; userId++) {
      const delay = (userId / this.config.concurrentUsers) * this.config.rampUpMs;
      
      userPromises.push(
        this.simulateUser(userId, delay, latencies, () => successCount++, () => failCount++, () => artifactCount++)
      );
    }

    await Promise.all(userPromises);

    const durationMs = Date.now() - startTime;
    const endMemory = this.getMemoryUsageMb();

    const metrics = this.calculateMetrics(latencies, durationMs, successCount, failCount, artifactCount, startMemory, endMemory);
    const { status, violations } = this.evaluateResults(metrics);

    const result: LoadTestResult = {
      timestamp: new Date().toISOString(),
      config: this.config,
      metrics,
      status,
      violations,
    };

    console.log(`[LoadTest] Completed in ${durationMs}ms`);
    console.log(`[LoadTest] Status: ${status.toUpperCase()}`);
    
    if (violations.length > 0) {
      console.log(`[LoadTest] Violations: ${violations.join(', ')}`);
    }

    return result;
  }

  private async simulateUser(
    userId: number,
    startDelay: number,
    latencies: number[],
    onSuccess: () => void,
    onFail: () => void,
    onArtifact: () => void
  ): Promise<void> {
    await sleep(startDelay);

    for (let i = 0; i < this.config.requestsPerUser; i++) {
      const pathIndex = i % this.config.paths.length;
      const path = this.config.paths[pathIndex]!;
      const requestId = `load-${userId}-${i}-${Date.now()}`;
      const input = `Load test request from user ${userId}`;
      
      const requestStart = Date.now();

      try {
        const payload: XOcPayload = artifactManager.createPayload({
          requestId,
          updateId: Math.floor(Math.random() * 1000000),
          user: {
            id: userId,
            username: `load_user_${userId}`,
          },
          message: {
            type: 'text',
            content: input,
            chatId: userId,
          },
          path,
        });

        await artifactManager.save(
          artifactManager.createRecord({
            testId: requestId,
            path,
            status: 'started',
            userId,
            input,
            durationMs: 0,
            payload,
          })
        );
        onArtifact();

        const result = await executePath(path, input, 3);
        const latency = Date.now() - requestStart;
        latencies.push(latency);

        await artifactManager.save(
          artifactManager.createRecord({
            testId: requestId,
            path,
            status: result.success ? 'completed' : 'error',
            userId,
            input,
            output: result.output,
            error: result.finalError || result.error,
            durationMs: latency,
            payload,
            retry: result.attempts > 1 ? {
              attempt: result.attempts,
              maxAttempts: result.attempts,
            } : undefined,
          })
        );
        onArtifact();

        if (result.success) {
          onSuccess();
        } else {
          onFail();
        }
      } catch (error) {
        const latency = Date.now() - requestStart;
        latencies.push(latency);
        onFail();
      }
    }
  }

  private calculateMetrics(
    latencies: number[],
    durationMs: number,
    successCount: number,
    failCount: number,
    artifactCount: number,
    startMemory: number,
    endMemory: number
  ): LoadTestMetrics {
    const sorted = [...latencies].sort((a, b) => a - b);
    const total = latencies.length;

    return {
      totalRequests: total,
      successfulRequests: successCount,
      failedRequests: failCount,
      avgLatencyMs: total > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / total) : 0,
      p50LatencyMs: this.percentile(sorted, 0.5),
      p95LatencyMs: this.percentile(sorted, 0.95),
      p99LatencyMs: this.percentile(sorted, 0.99),
      minLatencyMs: sorted[0] || 0,
      maxLatencyMs: sorted[sorted.length - 1] || 0,
      throughputPerSecond: Math.round((total / durationMs) * 1000),
      durationMs,
      memoryUsedMb: Math.round((endMemory - startMemory) * 100) / 100,
      artifactWritesPerSecond: Math.round((artifactCount / durationMs) * 1000),
    };
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)] ?? 0;
  }

  private evaluateResults(metrics: LoadTestMetrics): { status: LoadTestResult['status']; violations: string[] } {
    const violations: string[] = [];

    if (metrics.p95LatencyMs > this.config.maxLatencyMs) {
      violations.push(`P95 latency ${metrics.p95LatencyMs}ms exceeds ${this.config.maxLatencyMs}ms`);
    }

    if (metrics.throughputPerSecond < this.config.minThroughput) {
      violations.push(`Throughput ${metrics.throughputPerSecond}/s below ${this.config.minThroughput}/s`);
    }

    if (metrics.memoryUsedMb > this.config.maxMemoryIncreaseMb) {
      violations.push(`Memory increase ${metrics.memoryUsedMb}MB exceeds ${this.config.maxMemoryIncreaseMb}MB`);
    }

    let status: LoadTestResult['status'] = 'pass';
    if (violations.length >= 2) {
      status = 'fail';
    } else if (violations.length === 1) {
      status = 'warning';
    }

    return { status, violations };
  }

  private getMemoryUsageMb(): number {
    if (process.memoryUsage) {
      return process.memoryUsage().heapUsed / 1024 / 1024;
    }
    return 0;
  }

  async saveResults(result: LoadTestResult): Promise<string> {
    const filename = `load-test-${Date.now()}.json`;
    const filepath = `${import.meta.dir}/../../artifacts/${filename}`;
    
    await Bun.write(filepath, JSON.stringify(result, null, 2));
    console.log(`[LoadTest] Results saved: ${filename}`);
    
    return filepath;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export const loadTester = new LoadTester();
