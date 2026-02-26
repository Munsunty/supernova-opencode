/**
 * Bot command and message handlers
 */

import { Bot, Context } from 'grammy';
import type { XOcPayload } from './types';
import { artifactManager } from './artifacts';
import { executePath } from './paths';

/**
 * Handle /start command
 */
export async function handleStart(ctx: Context): Promise<void> {
  const user = ctx.from;
  if (!user) {
    await ctx.reply('Error: Could not identify user');
    return;
  }

  const welcomeMessage = [
    '👋 Welcome to the Toy Bot!',
    '',
    'This is a testing harness for X_oc pattern measurement.',
    '',
    'Available commands:',
    '/start - Show this message',
    '/test success <message> - Test success path',
    '/test failed <message> - Test failed path',
    '/test retry <message> - Test retry path',
    '/status - Show execution summary',
    '',
    'Or simply send any text to trigger the default handler.',
  ].join('\n');

  await ctx.reply(welcomeMessage);
}

/**
 * Handle /test command with path simulation
 */
export async function handleTest(ctx: Context): Promise<void> {
  const user = ctx.from;
  const message = ctx.message;
  
  if (!user || !message?.text) {
    await ctx.reply('Error: Invalid request');
    return;
  }

  // Parse command: /test <path> <message>
  const parts = message.text.split(' ');
  const pathType = parts[1] as 'success' | 'failed' | 'retry';
  const input = parts.slice(2).join(' ') || 'default test input';

  if (!['success', 'failed', 'retry'].includes(pathType)) {
    await ctx.reply(
      'Usage: /test <success|failed|retry> <message>\n' +
      'Example: /test success hello world'
    );
    return;
  }

  const testId = `test-${ctx.update.update_id}-${Date.now()}`;
  const startTime = Date.now();

  await ctx.reply(`🔄 Starting ${pathType} path test...`);

  try {
    // Create X_oc payload
    const payload: XOcPayload = artifactManager.createPayload({
      requestId: testId,
      updateId: ctx.update.update_id,
      user: {
        id: user.id,
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
      },
      message: {
        type: 'command',
        content: message.text,
        chatId: ctx.chat?.id || 0,
      },
      path: pathType,
    });

    // Save "started" artifact
    await artifactManager.save(
      artifactManager.createRecord({
        testId,
        path: pathType,
        status: 'started',
        userId: user.id,
        input,
        durationMs: 0,
        payload,
      })
    );

    // Execute the path
    const result = await executePath(pathType, input);
    const durationMs = Date.now() - startTime;

    if (result.success) {
      // Success artifact
      await artifactManager.save(
        artifactManager.createRecord({
          testId,
          path: pathType,
          status: 'completed',
          userId: user.id,
          input,
          output: result.output,
          durationMs,
          payload,
          retry: result.attempts > 1 ? {
            attempt: result.attempts,
            maxAttempts: result.attempts,
          } : undefined,
        })
      );

      await ctx.reply(
        `✅ ${pathType.toUpperCase()} PATH COMPLETED\n` +
        `Attempts: ${result.attempts}\n` +
        `Duration: ${durationMs}ms\n` +
        `Output: ${result.output}`
      );
    } else {
      // Failure artifact
      await artifactManager.save(
        artifactManager.createRecord({
          testId,
          path: pathType,
          status: 'error',
          userId: user.id,
          input,
          error: result.finalError || result.error,
          durationMs,
          payload,
          retry: result.attempts > 1 ? {
            attempt: result.attempts,
            maxAttempts: result.attempts,
          } : undefined,
        })
      );

      await ctx.reply(
        `❌ ${pathType.toUpperCase()} PATH FAILED\n` +
        `Attempts: ${result.attempts}\n` +
        `Duration: ${durationMs}ms\n` +
        `Error: ${result.finalError?.message || result.error?.message}`
      );
    }
  } catch (error) {
    const durationMs = Date.now() - startTime;
    
    await ctx.reply(
      `💥 UNEXPECTED ERROR\n` +
      `Duration: ${durationMs}ms\n` +
      `Error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Handle text messages (default handler)
 */
export async function handleTextMessage(ctx: Context): Promise<void> {
  const user = ctx.from;
  const message = ctx.message;
  
  if (!user || !message?.text) {
    await ctx.reply('Error: Invalid message');
    return;
  }

  const testId = `msg-${ctx.update.update_id}-${Date.now()}`;
  const startTime = Date.now();
  const input = message.text;

  try {
    // Default to success path for regular messages
    const payload: XOcPayload = artifactManager.createPayload({
      requestId: testId,
      updateId: ctx.update.update_id,
      user: {
        id: user.id,
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
      },
      message: {
        type: 'text',
        content: input,
        chatId: ctx.chat?.id || 0,
      },
      path: 'success',
    });

    // Execute success path
    const result = await executePath('success', input);
    const durationMs = Date.now() - startTime;

    // Save artifact
    await artifactManager.save(
      artifactManager.createRecord({
        testId,
        path: 'success',
        status: 'completed',
        userId: user.id,
        input,
        output: result.output,
        durationMs,
        payload,
      })
    );

    await ctx.reply(
      `📨 Received: "${input}"\n` +
      `⏱️ Processed in ${durationMs}ms\n` +
      `📝 Test ID: ${testId}`
    );
  } catch (error) {
    await ctx.reply(
      `❌ Error processing message: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Handle /status command
 */
export async function handleStatus(ctx: Context): Promise<void> {
  try {
    const summary = await artifactManager.generateSummary();
    
    const message = [
      '📊 Execution Summary',
      '',
      `Total artifacts: ${summary.total}`,
      '',
      'By path:',
      ...Object.entries(summary.byPath).map(([path, count]) => 
        `  ${path}: ${count}`
      ),
      '',
      'By status:',
      ...Object.entries(summary.byStatus).map(([status, count]) => 
        `  ${status}: ${count}`
      ),
      '',
      `Average duration: ${Math.round(summary.averageDuration)}ms`,
    ].join('\n');

    await ctx.reply(message);
  } catch (error) {
    await ctx.reply(
      `❌ Error generating status: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Register all handlers on the bot
 */
export function registerHandlers(bot: Bot): void {
  // /start command
  bot.command('start', handleStart);
  
  // /test command
  bot.command('test', handleTest);
  
  // /status command
  bot.command('status', handleStatus);
  
  // Text messages
  bot.on('message:text', handleTextMessage);
  
  console.log('[Handlers] Registered: /start, /test, /status, message:text');
}
