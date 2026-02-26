/**
 * Test suite for toy_bot
 * Validates path simulators and artifact generation
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { artifactManager } from '../src/artifacts';
import { simulateSuccessPath, simulateFailedPath, simulateRetryPath, executePath } from '../src/paths';
import type { XOcPayload } from '../src/types';

const TEST_ARTIFACT_DIR = join(import.meta.dir, '..', 'artifacts');

describe('Path Simulators', () => {
  it('should return success result for success path', async () => {
    const result = await simulateSuccessPath('test input');
    
    expect(result.success).toBe(true);
    expect(result.output).toContain('test input');
    expect(result.output).toContain('Success');
    expect(result.retryable).toBe(false);
  });

  it('should return failure result for failed path', async () => {
    const result = await simulateFailedPath('test input');
    
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error?.message).toContain('test input');
    expect(result.retryable).toBe(false);
  });

  it('should eventually succeed on retry path', async () => {
    const result = await simulateRetryPath('test input', 3, 3);
    
    expect(result.success).toBe(true);
    expect(result.output).toContain('Retry success');
    expect(result.retryable).toBe(false);
  });

  it('should fail on early retry attempts', async () => {
    const result = await simulateRetryPath('test input', 1, 3);
    
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.retryable).toBe(true);
  });
});

describe('Path Execution', () => {
  it('should execute success path without retries', async () => {
    const result = await executePath('success', 'hello', 3);
    
    expect(result.success).toBe(true);
    expect(result.attempts).toBe(1);
    expect(result.output).toBeDefined();
  });

  it('should execute failed path without retries', async () => {
    const result = await executePath('failed', 'hello', 3);
    
    expect(result.success).toBe(false);
    expect(result.attempts).toBe(1);
    expect(result.finalError).toBeDefined();
  });

  it('should retry and eventually succeed on retry path', async () => {
    const result = await executePath('retry', 'hello', 3);
    
    expect(result.success).toBe(true);
    expect(result.attempts).toBe(3);
    expect(result.output).toContain('Retry success');
  }, 15000); // Allow 15s for retries
});

describe('Artifact Manager', () => {
  beforeEach(async () => {
    try {
      await rm(TEST_ARTIFACT_DIR, { recursive: true });
    } catch {
      // Directory might not exist
    }
    await mkdir(TEST_ARTIFACT_DIR, { recursive: true });
    artifactManager['initialized'] = false;
  });

  afterEach(async () => {
    try {
      await rm(TEST_ARTIFACT_DIR, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should create X_oc payload', () => {
    const payload = artifactManager.createPayload({
      requestId: 'test-123',
      updateId: 456,
      user: {
        id: 789,
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
      },
      message: {
        type: 'text',
        content: 'Hello',
        chatId: 101112,
      },
      path: 'success',
    });

    expect(payload.requestId).toBe('test-123');
    expect(payload.user.id).toBe(789);
    expect(payload.message.content).toBe('Hello');
    expect(payload.metadata.path).toBe('success');
    expect(payload.timestamp).toBeDefined();
  });

  it('should save and read artifact', async () => {
    const payload: XOcPayload = {
      requestId: 'test-save',
      timestamp: new Date().toISOString(),
      updateId: 1,
      user: { id: 1 },
      message: { type: 'text', content: 'test', chatId: 1 },
      metadata: { path: 'success' },
    };

    const record = artifactManager.createRecord({
      testId: 'test-001',
      path: 'success',
      status: 'completed',
      userId: 1,
      input: 'test input',
      output: 'test output',
      durationMs: 100,
      payload,
    });

    await artifactManager.save(record);
    const files = await artifactManager.list();
    
    expect(files.length).toBeGreaterThan(0);
    
    const readRecord = await artifactManager.read(files[0]!);
    expect(readRecord).not.toBeNull();
    expect(readRecord?.testId).toBe('test-001');
    expect(readRecord?.status).toBe('completed');
  });

  it('should generate summary', async () => {
    // Create multiple artifacts
    const payload: XOcPayload = {
      requestId: 'summary-test',
      timestamp: new Date().toISOString(),
      updateId: 1,
      user: { id: 1 },
      message: { type: 'text', content: 'test', chatId: 1 },
      metadata: { path: 'success' },
    };

    for (let i = 0; i < 3; i++) {
      await artifactManager.save(
        artifactManager.createRecord({
          testId: `summary-${i}`,
          path: i % 2 === 0 ? 'success' : 'failed',
          status: 'completed',
          userId: 1,
          input: `input ${i}`,
          durationMs: 100 * (i + 1),
          payload,
        })
      );
    }

    const summary = await artifactManager.generateSummary();
    
    expect(summary.total).toBe(3);
    expect(summary.byPath.success).toBe(2);
    expect(summary.byPath.failed).toBe(1);
    expect(summary.averageDuration).toBeGreaterThan(0);
  });
});

describe('Integration', () => {
  beforeEach(async () => {
    try {
      await rm(TEST_ARTIFACT_DIR, { recursive: true });
    } catch {
      // Directory might not exist
    }
    await mkdir(TEST_ARTIFACT_DIR, { recursive: true });
    artifactManager['initialized'] = false;
  });

  afterEach(async () => {
    try {
      await rm(TEST_ARTIFACT_DIR, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should create artifacts for all three paths', async () => {
    const payload: XOcPayload = {
      requestId: 'integration-test',
      timestamp: new Date().toISOString(),
      updateId: 1,
      user: { id: 1 },
      message: { type: 'text', content: 'test', chatId: 1 },
      metadata: { path: 'success' },
    };

    // Execute all three paths
    const paths: Array<'success' | 'failed' | 'retry'> = ['success', 'failed', 'retry'];
    
    for (const path of paths) {
      const result = await executePath(path, `test ${path}`, 3);
      const record = artifactManager.createRecord({
        testId: `integration-${path}`,
        path,
        status: result.success ? 'completed' : 'error',
        userId: 1,
        input: `test ${path}`,
        output: result.output,
        error: result.finalError,
        durationMs: 100,
        payload: { ...payload, metadata: { ...payload.metadata, path } },
      });
      await artifactManager.save(record);
    }

    const summary = await artifactManager.generateSummary();
    expect(summary.total).toBe(3);
    expect(summary.byPath.success).toBe(1);
    expect(summary.byPath.failed).toBe(1);
    expect(summary.byPath.retry).toBe(1);
    expect(summary.byPath.failed).toBe(1);
  }, 20000);
});
