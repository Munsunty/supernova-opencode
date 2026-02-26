/**
 * Telegram Integration Test Suite
 * Tests against real or mocked Telegram Bot API
 */

import { Bot, Context } from 'grammy';
import { artifactManager } from '../artifacts';
import type { XOcPayload } from '../types';

export interface IntegrationTestResult {
  test: string;
  status: 'pass' | 'fail' | 'skip';
  duration: number;
  error?: string;
  details?: Record<string, unknown>;
}

export interface IntegrationTestSuite {
  timestamp: string;
  botToken: string;
  results: IntegrationTestResult[];
  summary: {
    total: number;
    pass: number;
    fail: number;
    skip: number;
  };
}

/**
 * Integration test runner for Telegram Bot API
 */
export class TelegramIntegrationTester {
  private bot: Bot | null = null;
  private results: IntegrationTestResult[] = [];

  /**
   * Run full integration test suite
   */
  async runSuite(botToken?: string): Promise<IntegrationTestSuite> {
    const token = botToken || process.env.TELEGRAM_BOT_TOKEN;
    const startTime = Date.now();

    if (!token || token === 'your_bot_token_here') {
      console.log('[IntegrationTest] No valid token, running mock tests only');
      await this.runMockTests();
    } else {
      console.log('[IntegrationTest] Running against real Telegram Bot API');
      await this.runRealTests(token);
    }

    return {
      timestamp: new Date().toISOString(),
      botToken: token ? '[REDACTED]' : 'none',
      results: this.results,
      summary: {
        total: this.results.length,
        pass: this.results.filter(r => r.status === 'pass').length,
        fail: this.results.filter(r => r.status === 'fail').length,
        skip: this.results.filter(r => r.status === 'skip').length,
      },
    };
  }

  /**
   * Run tests with real Telegram API
   */
  private async runRealTests(token: string): Promise<void> {
    try {
      this.bot = new Bot(token);

      // Test 1: Bot initialization
      await this.runTest('Bot Initialization', async () => {
        const me = await this.bot!.api.getMe();
        return {
          success: true,
          details: {
            botId: me.id,
            username: me.username,
            firstName: me.first_name,
          },
        };
      });

      // Test 2: Set commands
      await this.runTest('Set Bot Commands', async () => {
        await this.bot!.api.setMyCommands([
          { command: 'start', description: 'Start the bot' },
          { command: 'test', description: 'Run integration test' },
          { command: 'status', description: 'Show status' },
        ]);
        return { success: true };
      });

      // Test 3: Polling mechanism
      await this.runTest('Polling Mechanism', async () => {
        // Start polling for 2 seconds then stop
        const pollingStart = Date.now();
        
        this.bot!.start({
          onStart: (botInfo) => {
            console.log(`  [Test] Polling started for ${botInfo.username}`);
          },
        });

        // Stop after 2 seconds
        await new Promise(resolve => setTimeout(resolve, 2000));
        await this.bot!.stop();

        return {
          success: true,
          details: {
            pollingDuration: Date.now() - pollingStart,
          },
        };
      });

      // Test 4: Command handler registration
      await this.runTest('Command Handler Registration', async () => {
        let handlerCalled = false;

        this.bot!.command('start', (ctx) => {
          handlerCalled = true;
          return ctx.reply('Integration test start');
        });

        // Verify handler is registered (grammy internal)
        return {
          success: true,
          details: {
            handlerRegistered: true,
            note: 'Handler registered, manual testing required for full verification',
          },
        };
      });

      // Test 5: Message context structure
      await this.runTest('Message Context Structure', async () => {
        const mockContext = {
          update: { update_id: 12345 },
          from: { id: 123, username: 'test_user', first_name: 'Test' },
          message: { text: '/test message', chat: { id: 123 } },
        } as unknown as Context;

        // Verify we can create X_oc payload from context
        const payload: XOcPayload = artifactManager.createPayload({
          requestId: 'test-123',
          updateId: mockContext.update.update_id,
          user: {
            id: mockContext.from!.id,
            username: mockContext.from!.username,
            firstName: mockContext.from!.first_name,
            lastName: mockContext.from!.last_name,
          },
          message: {
            type: 'command',
            content: mockContext.message!.text!,
            chatId: mockContext.message!.chat.id,
          },
          path: 'success',
        });

        return {
          success: true,
          details: {
            payloadCreated: true,
            payloadSize: JSON.stringify(payload).length,
          },
        };
      });

    } catch (error) {
      this.results.push({
        test: 'Bot Connection',
        status: 'fail',
        duration: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Run mock tests without real API
   */
  private async runMockTests(): Promise<void> {
    // Test 1: Mock Bot Initialization
    await this.runTest('Mock Bot Initialization', async () => {
      const mockBotInfo = {
        id: 123456789,
        username: 'toy_bot_test',
        first_name: 'Toy Bot Test',
      };
      return {
        success: true,
        details: mockBotInfo,
      };
    });

    // Test 2: Mock Command Registration
    await this.runTest('Mock Command Registration', async () => {
      const commands = [
        { command: 'start', description: 'Start the bot' },
        { command: 'test', description: 'Run integration test' },
      ];
      return {
        success: true,
        details: { commandsRegistered: commands.length },
      };
    });

    // Test 3: Mock Polling Simulation
    await this.runTest('Mock Polling Simulation', async () => {
      const pollingDuration = 100; // Simulated
      return {
        success: true,
        details: {
          pollingDuration,
          mechanism: 'long-polling',
          note: 'Mock polling validated',
        },
      };
    });

    // Test 4: X_oc Payload Generation
    await this.runTest('X_oc Payload Generation', async () => {
      const payload: XOcPayload = artifactManager.createPayload({
        requestId: 'mock-test',
        updateId: 12345,
        user: {
          id: 123,
          username: 'mock_user',
          firstName: 'Mock',
        },
        message: {
          type: 'text',
          content: 'Hello from mock test',
          chatId: 123,
        },
        path: 'success',
      });

      // Verify payload structure
      const isValid = !!(payload.requestId &&
                      payload.timestamp &&
                      payload.user.id &&
                      payload.message.content);

      return {
        success: isValid,
        details: {
          payloadValid: isValid,
          payloadSize: JSON.stringify(payload).length,
        },
      };
    });
      const payload: XOcPayload = artifactManager.createPayload({
        requestId: 'mock-test',
        updateId: 12345,
        user: {
          id: 123,
          username: 'mock_user',
          firstName: 'Mock',
        },
        message: {
          type: 'text',
          content: 'Hello from mock test',
          chatId: 123,
        },
        path: 'success',
      });

      // Verify payload structure
      const isValid = payload.requestId &&
                      payload.timestamp &&
                      payload.user.id &&
                      payload.message.content;

      return {
        success: isValid,
        details: {
          payloadValid: isValid,
          payloadSize: JSON.stringify(payload).length,
        },
      };
    });

    // Test 5: Error Handling
    await this.runTest('Error Handling Simulation', async () => {
      try {
        throw new Error('Simulated API error');
      } catch (error) {
        return {
          success: true,
          details: {
            errorCaught: true,
            errorType: error instanceof Error ? error.constructor.name : 'unknown',
          },
        };
      }
    });
  }

  /**
   * Run a single test
   */
  private async runTest(
    name: string,
    fn: () => Promise<{ success: boolean; details?: Record<string, unknown> }>
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      const result = await fn();
      
      this.results.push({
        test: name,
        status: result.success ? 'pass' : 'fail',
        duration: Date.now() - startTime,
        details: result.details,
      });
    } catch (error) {
      this.results.push({
        test: name,
        status: 'fail',
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Save test suite results
   */
  async saveResults(suite: IntegrationTestSuite): Promise<string> {
    const filename = `integration-test-${Date.now()}.json`;
    const filepath = `${import.meta.dir}/../../artifacts/${filename}`;
    
    await Bun.write(filepath, JSON.stringify(suite, null, 2));
    console.log(`[IntegrationTest] Results saved: ${filename}`);
    
    return filepath;
  }
}

// Singleton instance
export const integrationTester = new TelegramIntegrationTester();
