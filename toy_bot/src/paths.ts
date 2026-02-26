/**
 * Path simulators for testing success/failed/retry scenarios
 */

import type { PathResult } from './types';

/**
 * Success path simulator
 * Always returns successful result
 */
export async function simulateSuccessPath(input: string): Promise<PathResult> {
  const startTime = Date.now();
  
  // Simulate processing time
  await sleep(100);
  
  const result: PathResult = {
    success: true,
    output: `Success: Processed "${input}" in ${Date.now() - startTime}ms`,
    retryable: false,
  };
  
  return result;
}

/**
 * Failed path simulator
 * Always returns failure result
 */
export async function simulateFailedPath(input: string): Promise<PathResult> {
  const startTime = Date.now();
  
  // Simulate processing time before failure
  await sleep(50);
  
  const error = new Error(`Failed to process "${input}": Simulated failure`);
  (error as Error & { code: string }).code = 'SIMULATED_FAILURE';
  
  const result: PathResult = {
    success: false,
    error,
    retryable: false, // Non-retryable failure
  };
  
  return result;
}

/**
 * Retry path simulator
 * Simulates transient failures that can be retried
 */
export async function simulateRetryPath(
  input: string,
  attempt: number = 1,
  maxAttempts: number = 3
): Promise<PathResult> {
  const startTime = Date.now();
  
  // Simulate processing time
  await sleep(50 * attempt); // Increasing delay per attempt
  
  // Simulate transient failure on early attempts
  if (attempt < maxAttempts) {
    const error = new Error(
      `Transient failure on attempt ${attempt}/${maxAttempts} for "${input}"`
    );
    (error as Error & { code: string }).code = 'TRANSIENT_ERROR';
    
    const nextRetryAt = new Date(Date.now() + computeBackoff(attempt)).toISOString();
    
    return {
      success: false,
      error,
      retryable: true,
    };
  }
  
  // Final attempt succeeds
  return {
    success: true,
    output: `Retry success: Processed "${input}" after ${attempt} attempts in ${Date.now() - startTime}ms`,
    retryable: false,
  };
}

/**
 * Execute a path with optional retries
 */
export async function executePath(
  pathType: 'success' | 'failed' | 'retry',
  input: string,
  maxRetries: number = 3
): Promise<PathResult & { attempts: number; finalError?: Error }> {
  let attempt = 1;
  let lastError: Error | undefined;
  
  while (attempt <= maxRetries) {
    let result: PathResult;
    
    switch (pathType) {
      case 'success':
        result = await simulateSuccessPath(input);
        break;
      case 'failed':
        result = await simulateFailedPath(input);
        break;
      case 'retry':
        result = await simulateRetryPath(input, attempt, maxRetries);
        break;
    }
    
    if (result.success) {
      return { ...result, attempts: attempt };
    }
    
    if (!result.retryable || attempt >= maxRetries) {
      return { ...result, attempts: attempt, finalError: result.error };
    }
    
    // Retryable failure - wait and retry
    lastError = result.error;
    const backoffMs = computeBackoff(attempt);
    console.log(`[PathSimulator] Retrying after ${backoffMs}ms (attempt ${attempt}/${maxRetries})`);
    await sleep(backoffMs);
    attempt++;
  }
  
  return {
    success: false,
    retryable: false,
    attempts: attempt,
    finalError: lastError,
  };
}

/**
 * Compute exponential backoff delay
 */
function computeBackoff(attempt: number, baseDelayMs: number = 1000): number {
  const maxDelayMs = 30000; // 30 seconds max
  const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
  // Add jitter to prevent thundering herd
  return delay + Math.random() * 1000;
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
