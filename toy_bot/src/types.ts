/**
 * Type definitions for toy_bot Telegram harness
 */

/**
 * Represents an incoming update from the Telegram Bot API
 * @see https://core.telegram.org/bots/api#update
 */
export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

/**
 * Represents a message sent to a Telegram chat
 * @see https://core.telegram.org/bots/api#message
 */
export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
}

/**
 * Represents a Telegram user or bot
 * @see https://core.telegram.org/bots/api#user
 */
export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

/**
 * Represents a Telegram chat
 * @see https://core.telegram.org/bots/api#chat
 */
export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
}

/**
 * X_oc payload format for omo_request type
 * Used for creating task payloads from Telegram messages
 */
export interface XocPayload {
  prompt: string;
  source: string;
  type: "omo_request";
  timestamp: string;
  metadata: {
    userId: number;
    username?: string;
    chatId: number;
    messageId: number;
  };
}

/**
 * Bot configuration interface
 * Contains settings for Telegram bot token and runtime behavior
 */
export interface BotConfig {
  telegramBotToken: string;
  allowedUserIds: number[];
  pollingIntervalMs: number;
}

/**
 * Artifact entry format for execution logging
 * Records significant events during bot operation
 */
export interface ArtifactEntry {
  timestamp: string;
  type: "update_received" | "command_handled" | "error" | "retry_attempt";
  data: unknown;
}

/**
 * Processing result from handling a Telegram update
 * Represents the outcome of bot message processing
 */
export interface ProcessedResult {
  success: boolean;
  payload?: XocPayload;
  response?: string;
  error?: string;
}

// ============================================================================
// Types for existing artifact and path handling system
// ============================================================================

/**
 * X_oc payload format used by ArtifactManager
 * Contains comprehensive request/response metadata
 */
export interface XOcPayload {
  requestId: string;
  timestamp: string;
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
  metadata: {
    path: 'success' | 'failed' | 'retry';
    attempt?: number;
    maxRetries?: number;
  };
}

/**
 * Artifact record for test execution results
 * Stored in toy_bot/artifacts/ as JSON files
 */
export interface ArtifactRecord {
  testId: string;
  timestamp: string;
  path: 'success' | 'failed' | 'retry';
  status: 'started' | 'completed' | 'error';
  userId: number;
  input: string;
  output?: string;
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };
  durationMs: number;
  payload: XOcPayload;
  retry?: {
    attempt: number;
    maxAttempts: number;
    nextRetryAt?: string;
  };
}

/**
 * Path execution result
 * Returned by success/failed/retry path simulators
 */
export interface PathResult {
  success: boolean;
  output?: string;
  error?: Error;
  retryable: boolean;
}
