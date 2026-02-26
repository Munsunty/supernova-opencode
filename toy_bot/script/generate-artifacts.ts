/**
 * Generate execution artifacts for all 3 test paths
 * Run with: bun run script/generate-artifacts.ts
 */

import { artifactManager } from '../src/artifacts';
import { executePath } from '../src/paths';
import type { XOcPayload } from '../src/types';

async function generateArtifacts() {
  console.log('Generating execution artifacts for X_oc pattern measurement...\n');
  
  await artifactManager.init();
  
  const paths: Array<'success' | 'failed' | 'retry'> = ['success', 'failed', 'retry'];
  const results: Array<{
    path: string;
    status: string;
    duration: number;
    attempts: number;
  }> = [];
  
  for (const path of paths) {
    console.log(`\n--- Executing ${path.toUpperCase()} PATH ---`);
    const testId = `demo-${path}-${Date.now()}`;
    const startTime = Date.now();
    const input = `Demo test for ${path} path`;
    
    // Create payload
    const payload: XOcPayload = {
      requestId: testId,
      timestamp: new Date().toISOString(),
      updateId: Math.floor(Math.random() * 1000000),
      user: {
        id: 123456789,
        username: 'demo_user',
        firstName: 'Demo',
        lastName: 'User',
      },
      message: {
        type: 'command',
        content: `/test ${path} ${input}`,
        chatId: 123456789,
      },
      metadata: {
        path,
      },
    };
    
    // Save "started" artifact
    await artifactManager.save(
      artifactManager.createRecord({
        testId,
        path,
        status: 'started',
        userId: 123456789,
        input,
        durationMs: 0,
        payload,
      })
    );
    
    // Execute path
    const result = await executePath(path, input, 3);
    const durationMs = Date.now() - startTime;
    
    // Save final artifact
    await artifactManager.save(
      artifactManager.createRecord({
        testId,
        path,
        status: result.success ? 'completed' : 'error',
        userId: 123456789,
        input,
        output: result.output,
        error: result.finalError || result.error,
        durationMs,
        payload,
        retry: result.attempts > 1 ? {
          attempt: result.attempts,
          maxAttempts: result.attempts,
        } : undefined,
      })
    );
    
    results.push({
      path,
      status: result.success ? 'completed' : 'error',
      duration: durationMs,
      attempts: result.attempts,
    });
    
    console.log(`  Status: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
    console.log(`  Duration: ${durationMs}ms`);
    console.log(`  Attempts: ${result.attempts}`);
    if (result.output) console.log(`  Output: ${result.output}`);
    if (result.error) console.log(`  Error: ${result.error.message}`);
  }
  
  // Generate summary
  console.log('\n\n=== EXECUTION SUMMARY ===\n');
  const summary = await artifactManager.generateSummary();
  
  console.log(`Total artifacts: ${summary.total}`);
  console.log('\nBy path:');
  for (const [path, count] of Object.entries(summary.byPath)) {
    console.log(`  ${path}: ${count}`);
  }
  console.log('\nBy status:');
  for (const [status, count] of Object.entries(summary.byStatus)) {
    console.log(`  ${status}: ${count}`);
  }
  console.log(`\nAverage duration: ${Math.round(summary.averageDuration)}ms`);
  
  console.log('\n\nArtifacts saved to: toy_bot/artifacts/');
  console.log('Done!');
}

generateArtifacts().catch(console.error);
