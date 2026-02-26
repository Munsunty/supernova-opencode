/**
 * Artifact logging system for X_oc pattern measurement
 * Logs execution results to toy_bot/artifacts/
 */

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { ArtifactRecord, XOcPayload } from './types';

const ARTIFACT_DIR = join(import.meta.dir, '..', 'artifacts');

/**
 * Artifact manager for logging test execution results
 */
export class ArtifactManager {
  private initialized = false;

  /**
   * Initialize the artifact directory
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    
    try {
      await mkdir(ARTIFACT_DIR, { recursive: true });
      this.initialized = true;
      console.log(`[ArtifactManager] Initialized: ${ARTIFACT_DIR}`);
    } catch (error) {
      console.error('[ArtifactManager] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Save an artifact record to file
   */
  async save(record: ArtifactRecord): Promise<string> {
    await this.init();

    const filename = `${record.testId}-${record.status}.json`;
    const filepath = join(ARTIFACT_DIR, filename);
    
    const data = JSON.stringify(record, null, 2);
    await Bun.write(filepath, data);
    
    console.log(`[ArtifactManager] Saved: ${filename}`);
    return filepath;
  }

  /**
   * Create an X_oc payload from message context
   */
  createPayload(params: {
    requestId: string;
    updateId: number;
    user: {
      id: number;
      username?: string;
      firstName?: string;
      lastName?: string;
    };
    message: {
      type: 'text' | 'command' | 'other';
      content: string;
      chatId: number;
    };
    path: 'success' | 'failed' | 'retry';
    attempt?: number;
    maxRetries?: number;
  }): XOcPayload {
    return {
      requestId: params.requestId,
      timestamp: new Date().toISOString(),
      updateId: params.updateId,
      user: {
        id: params.user.id,
        username: params.user.username,
        firstName: params.user.firstName,
        lastName: params.user.lastName,
      },
      message: {
        type: params.message.type,
        content: params.message.content,
        chatId: params.message.chatId,
      },
      metadata: {
        path: params.path,
        attempt: params.attempt,
        maxRetries: params.maxRetries,
      },
    };
  }

  /**
   * Create an artifact record
   */
  createRecord(params: {
    testId: string;
    path: 'success' | 'failed' | 'retry';
    status: 'started' | 'completed' | 'error';
    userId: number;
    input: string;
    output?: string;
    error?: Error;
    durationMs: number;
    payload: XOcPayload;
    retry?: {
      attempt: number;
      maxAttempts: number;
      nextRetryAt?: string;
    };
  }): ArtifactRecord {
    return {
      testId: params.testId,
      timestamp: new Date().toISOString(),
      path: params.path,
      status: params.status,
      userId: params.userId,
      input: params.input,
      output: params.output,
      error: params.error ? {
        message: params.error.message,
        code: (params.error as Error & { code?: string }).code,
        stack: params.error.stack,
      } : undefined,
      durationMs: params.durationMs,
      payload: params.payload,
      retry: params.retry,
    };
  }

  /**
   * List all artifacts
   */
  async list(): Promise<string[]> {
    await this.init();
    
    try {
      const entries: string[] = [];
      for await (const entry of new Bun.Glob('*.json').scan(ARTIFACT_DIR)) {
        entries.push(entry);
      }
      return entries.sort();
    } catch {
      return [];
    }
  }

  /**
   * Read a specific artifact
   */
  async read(filename: string): Promise<ArtifactRecord | null> {
    const filepath = join(ARTIFACT_DIR, filename);
    
    try {
      const file = Bun.file(filepath);
      if (!(await file.exists())) return null;
      
      const content = await file.text();
      return JSON.parse(content) as ArtifactRecord;
    } catch (error) {
      console.error(`[ArtifactManager] Failed to read ${filename}:`, error);
      return null;
    }
  }

  /**
   * Generate summary report
   */
  async generateSummary(): Promise<{
    total: number;
    byPath: Record<string, number>;
    byStatus: Record<string, number>;
    averageDuration: number;
  }> {
    const files = await this.list();
    const records: ArtifactRecord[] = [];

    for (const file of files) {
      const record = await this.read(file);
      if (record) records.push(record);
    }

    const byPath: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    let totalDuration = 0;

    for (const record of records) {
      byPath[record.path] = (byPath[record.path] || 0) + 1;
      byStatus[record.status] = (byStatus[record.status] || 0) + 1;
      totalDuration += record.durationMs;
    }

    return {
      total: records.length,
      byPath,
      byStatus,
      averageDuration: records.length > 0 ? totalDuration / records.length : 0,
    };
  }
}

// Singleton instance
export const artifactManager = new ArtifactManager();
