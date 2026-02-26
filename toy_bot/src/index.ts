/**
 * Main bot entry point
 * Telegram polling bot for X_oc pattern measurement
 */

import { Bot, GrammyError, HttpError } from 'grammy';
import { registerHandlers } from './handlers';
import { artifactManager } from './artifacts';

// Load configuration from environment
const config = {
  token: process.env.TELEGRAM_BOT_TOKEN || '',
  allowedUserIds: (process.env.ALLOWED_USER_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean)
    .map(Number),
  nodeEnv: (process.env.NODE_ENV || 'development') as 'development' | 'production' | 'test',
  logLevel: (process.env.LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error',
};

// Validate configuration
if (!config.token) {
  console.error('Error: TELEGRAM_BOT_TOKEN environment variable is required');
  console.error('Please copy .env.example to .env and set your bot token');
  process.exit(1);
}

// Initialize artifact manager
await artifactManager.init();

// Create bot instance
const bot = new Bot(config.token);

// Global error handler
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`);
  
  const e = err.error;
  if (e instanceof GrammyError) {
    console.error('Telegram API Error:', e.description);
    console.error('Error code:', e.error_code);
  } else if (e instanceof HttpError) {
    console.error('Network Error:', e);
  } else {
    console.error('Unknown Error:', e);
  }
});

// Register all handlers
registerHandlers(bot);

// Graceful shutdown handling
process.once('SIGINT', () => {
  console.log('\nReceived SIGINT, stopping bot...');
  bot.stop();
});

process.once('SIGTERM', () => {
  console.log('\nReceived SIGTERM, stopping bot...');
  bot.stop();
});

// Start the bot
console.log('='.repeat(50));
console.log('Toy Bot - X_oc Pattern Measurement Harness');
console.log('='.repeat(50));
console.log(`Environment: ${config.nodeEnv}`);
console.log(`Log Level: ${config.logLevel}`);
console.log(`Allowed Users: ${config.allowedUserIds.length > 0 ? config.allowedUserIds.join(', ') : 'All'}`);
console.log('-'.repeat(50));
console.log('Starting bot with long polling...');
console.log('Press Ctrl+C to stop\n');

bot.start();
