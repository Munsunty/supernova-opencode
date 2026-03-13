import { createLogger } from "../utils/logging";
import {
    OpenCodeServer,
    type PromptOptions,
    type PromptResult,
} from "../opencode-server-wrapper";
import { parseTelegramMessage, type ParsedTelegramMessage } from "./telegram";

interface TelegramUpdate {
    update_id?: unknown;
    message?: unknown;
    edited_message?: unknown;
    channel_post?: unknown;
    edited_channel_post?: unknown;
}

interface TelegramGetUpdatesResponse {
    ok: boolean;
    result: TelegramUpdate[];
    description?: string;
    error_code?: number;
}

interface TelegramGetMeResponse {
    ok: boolean;
    result?: {
        id?: number;
        username?: string;
        first_name?: string;
        last_name?: string;
        can_read_all_group_messages?: boolean;
    };
    description?: string;
    error_code?: number;
}

interface TelegramSendMessageResponse {
    ok: boolean;
    description?: string;
    error_code?: number;
}

type SessionMode = "per-chat" | "oneshot";

interface DirectChatbotOptions {
    token: string;
    source: string;
    allowedUserIds: string[];
    pollIntervalMs: number;
    pollTimeoutSec: number;
    pollLimit: number;
    apiBase: string;
    opencodeBaseUrl: string;
    agent: string;
    system: string | null;
    sessionMode: SessionMode;
}

interface DirectChatbotArgs {
    token?: string;
    source: string;
    allowedUsers: string | null;
    pollIntervalMs: number;
    pollTimeoutSec: number;
    pollLimit: number;
    apiBase: string;
    opencodeBaseUrl: string;
    agent: string;
    system: string | null;
    sessionMode: SessionMode;
    help: boolean;
}

const logger = createLogger("X1.DirectChatbot");

const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_POLL_TIMEOUT_SEC = 25;
const DEFAULT_POLL_LIMIT = 100;
const DEFAULT_API_BASE = "https://api.telegram.org";
const DEFAULT_OPENCODE_BASE_URL = "http://127.0.0.1:4996";
const DEFAULT_AGENT = "spark";
const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;

function parseAllowedUserIds(raw: string | undefined): string[] {
    if (!raw) return [];
    return raw
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
}

function parseNumber(value: string | undefined, fallback: number): number {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 1) return fallback;
    return num;
}

function parseOptionalText(value: string | undefined): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function firstNonEmpty(
    ...values: Array<string | null | undefined>
): string | null {
    for (const value of values) {
        if (typeof value !== "string") continue;
        const trimmed = value.trim();
        if (trimmed.length > 0) return trimmed;
    }
    return null;
}

function parseSessionMode(
    value: string | undefined,
    fallback: SessionMode,
): SessionMode {
    if (!value) return fallback;
    const normalized = value.trim().toLowerCase();
    if (normalized === "per-chat" || normalized === "per_chat") {
        return "per-chat";
    }
    if (normalized === "oneshot" || normalized === "one-shot") {
        return "oneshot";
    }
    return fallback;
}

function parseArgs(argv: string[]): DirectChatbotArgs {
    const args: DirectChatbotArgs = {
        token: undefined,
        source:
            firstNonEmpty(
                process.env.OPENCODE_X1_DIRECT_SOURCE,
                process.env.X1_DIRECT_SOURCE,
                process.env.OPENCODE_X1_POLLER_SOURCE,
                process.env.X1_POLLER_SOURCE,
            ) ?? "x1_chatbot",
        allowedUsers: firstNonEmpty(
            process.env.OPENCODE_X1_DIRECT_ALLOWED_USER_IDS,
            process.env.X1_DIRECT_ALLOWED_USER_IDS,
            process.env.OPENCODE_X1_POLLER_ALLOWED_USER_IDS,
            process.env.X1_POLLER_ALLOWED_USER_IDS,
            process.env.OPENCODE_ALLOWED_USER_IDS,
            process.env.ALLOWED_USER_IDS,
        ),
        pollIntervalMs: parseNumber(
            process.env.OPENCODE_X1_DIRECT_POLL_INTERVAL_MS ??
                process.env.X1_DIRECT_POLL_INTERVAL_MS ??
                process.env.OPENCODE_X1_POLLER_POLL_INTERVAL_MS ??
                process.env.X1_POLLER_POLL_INTERVAL_MS ??
                process.env.OPENCODE_X1_POLL_INTERVAL_MS ??
                process.env.X1_POLL_INTERVAL_MS,
            DEFAULT_POLL_INTERVAL_MS,
        ),
        pollTimeoutSec: parseNumber(
            process.env.OPENCODE_X1_DIRECT_POLL_TIMEOUT_SEC ??
                process.env.X1_DIRECT_POLL_TIMEOUT_SEC ??
                process.env.OPENCODE_X1_POLLER_POLL_TIMEOUT_SEC ??
                process.env.X1_POLLER_POLL_TIMEOUT_SEC ??
                process.env.OPENCODE_X1_POLL_TIMEOUT_SEC ??
                process.env.X1_POLL_TIMEOUT_SEC,
            DEFAULT_POLL_TIMEOUT_SEC,
        ),
        pollLimit: parseNumber(
            process.env.OPENCODE_X1_DIRECT_POLL_LIMIT ??
                process.env.X1_DIRECT_POLL_LIMIT ??
                process.env.OPENCODE_X1_POLLER_POLL_LIMIT ??
                process.env.X1_POLLER_POLL_LIMIT ??
                process.env.OPENCODE_X1_POLL_LIMIT ??
                process.env.X1_POLL_LIMIT,
            DEFAULT_POLL_LIMIT,
        ),
        apiBase:
            firstNonEmpty(
                process.env.OPENCODE_X1_DIRECT_API_BASE,
                process.env.X1_DIRECT_API_BASE,
                process.env.OPENCODE_X1_POLLER_API_BASE,
                process.env.X1_POLLER_API_BASE,
                process.env.OPENCODE_X1_API_BASE,
                process.env.X1_TELEGRAM_API_BASE,
                process.env.TELEGRAM_API_BASE,
            ) ?? DEFAULT_API_BASE,
        opencodeBaseUrl:
            firstNonEmpty(
                process.env.OPENCODE_X1_DIRECT_BASE_URL,
                process.env.X1_DIRECT_BASE_URL,
                process.env.OPENCODE_BASE_URL,
            ) ?? DEFAULT_OPENCODE_BASE_URL,
        agent:
            firstNonEmpty(
                process.env.OPENCODE_X1_DIRECT_AGENT,
                process.env.X1_DIRECT_AGENT,
            ) ?? DEFAULT_AGENT,
        system:
            parseOptionalText(process.env.OPENCODE_X1_DIRECT_SYSTEM) ??
            parseOptionalText(process.env.X1_DIRECT_SYSTEM),
        sessionMode: parseSessionMode(
            process.env.OPENCODE_X1_DIRECT_SESSION_MODE ??
                process.env.X1_DIRECT_SESSION_MODE,
            "per-chat",
        ),
        help: false,
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const next = argv[i + 1];

        switch (arg) {
            case "--token":
                if (!next) throw new Error("--token requires a bot token");
                args.token = next;
                i++;
                break;
            case "--source":
                if (!next) throw new Error("--source requires a source label");
                args.source = next;
                i++;
                break;
            case "--allowed-users":
                if (!next) throw new Error("--allowed-users requires CSV list");
                args.allowedUsers = next;
                i++;
                break;
            case "--poll-interval":
                if (!next)
                    throw new Error("--poll-interval requires milliseconds");
                args.pollIntervalMs = parseNumber(next, args.pollIntervalMs);
                i++;
                break;
            case "--poll-timeout":
                if (!next) throw new Error("--poll-timeout requires seconds");
                args.pollTimeoutSec = parseNumber(next, args.pollTimeoutSec);
                i++;
                break;
            case "--poll-limit":
                if (!next) throw new Error("--poll-limit requires a number");
                args.pollLimit = parseNumber(next, args.pollLimit);
                i++;
                break;
            case "--api-base":
                if (!next) throw new Error("--api-base requires a URL");
                args.apiBase = next;
                i++;
                break;
            case "--base-url":
                if (!next) throw new Error("--base-url requires a URL");
                args.opencodeBaseUrl = next;
                i++;
                break;
            case "--agent":
                if (!next) throw new Error("--agent requires an agent name");
                args.agent = next;
                i++;
                break;
            case "--system":
                if (!next) throw new Error("--system requires text");
                args.system = parseOptionalText(next);
                i++;
                break;
            case "--session-mode":
                if (!next)
                    throw new Error(
                        "--session-mode requires per-chat | oneshot",
                    );
                args.sessionMode = parseSessionMode(next, "per-chat");
                i++;
                break;
            case "--help":
                args.help = true;
                break;
            default:
                throw new Error(`Unknown argument: ${arg}`);
        }
    }

    return args;
}

function printHelp(): void {
    console.log(`Usage:
  bun run .devserver/src/x1/direct-chatbot.ts [options]

Options:
  --token <bot token>            Telegram bot token (default: OPENCODE_X1_DIRECT_TOKEN)
  --source <name>                Source label for logs (default: x1_chatbot)
  --allowed-users <csv>          Allowed user IDs (default: OPENCODE_X1_DIRECT_ALLOWED_USER_IDS / ALLOWED_USER_IDS)
  --poll-interval <ms>           Delay between successful loops (default: 1000)
  --poll-timeout <sec>           Telegram long-poll timeout seconds (default: 25)
  --poll-limit <n>               Telegram getUpdates limit (default: 100)
  --api-base <url>               Telegram API base URL (default: https://api.telegram.org)
  --base-url <url>               OpenCode base URL (default: http://127.0.0.1:4996)
  --agent <name>                 OpenCode agent for direct prompt (default: spark)
  --system <text>                Optional system prompt for every request
  --session-mode <mode>          per-chat | oneshot (default: per-chat)
  --help                         Show this help`);
}

function parseUpdateId(update: TelegramUpdate): number | null {
    const id = update?.update_id;
    if (typeof id !== "number" || !Number.isFinite(id) || id < 0) return null;
    return Math.trunc(id);
}

function allowedByUserId(
    context: ParsedTelegramMessage["context"],
    allowList: Set<string>,
): boolean {
    if (allowList.size === 0) return true;
    if (!context.userId) return false;
    return allowList.has(context.userId);
}

async function requestJson<T>(url: string): Promise<T> {
    const response = await fetch(url);
    const text = await response.text();
    try {
        const parsed = JSON.parse(text) as T;
        return parsed;
    } catch {
        throw new Error(`Invalid Telegram API response: ${text.slice(0, 256)}`);
    }
}

async function verifyToken(token: string, apiBase: string): Promise<void> {
    const payload = await requestJson<TelegramGetMeResponse>(
        `${apiBase}/bot${encodeURIComponent(token)}/getMe`,
    );
    if (!payload.ok) {
        const code = payload.error_code;
        const reason = payload.description ?? "unknown";
        throw new Error(`telegram getMe failed (${code ?? "n/a"}): ${reason}`);
    }
    logger.info("telegram_bot_verified", {
        bot: payload.result?.username ?? "unknown",
        botId: payload.result?.id,
        name: `${payload.result?.first_name ?? ""} ${payload.result?.last_name ?? ""}`.trim(),
        canReadAllGroupMessages:
            payload.result?.can_read_all_group_messages ?? false,
    });
}

async function fetchUpdates(
    options: DirectChatbotOptions,
    offset?: number,
): Promise<TelegramUpdate[]> {
    const params = new URLSearchParams();
    params.set(
        "allowed_updates",
        "message,edited_message,channel_post,edited_channel_post",
    );
    params.set("limit", String(options.pollLimit));
    params.set("timeout", String(options.pollTimeoutSec));

    if (typeof offset === "number") {
        params.set("offset", String(offset));
    }

    const payload = await requestJson<TelegramGetUpdatesResponse>(
        `${options.apiBase}/bot${encodeURIComponent(options.token)}/getUpdates?${params.toString()}`,
    );

    if (!payload.ok) {
        const reason =
            payload.description ?? "telegram getUpdates returned ok=false";
        const code = payload.error_code ?? 0;
        throw new Error(`telegram getUpdates failed (${code}): ${reason}`);
    }

    return payload.result ?? [];
}

function splitTelegramMessage(text: string): string[] {
    if (text.length <= TELEGRAM_MAX_MESSAGE_LENGTH) return [text];
    const chunks: string[] = [];
    let cursor = 0;
    while (cursor < text.length) {
        chunks.push(text.slice(cursor, cursor + TELEGRAM_MAX_MESSAGE_LENGTH));
        cursor += TELEGRAM_MAX_MESSAGE_LENGTH;
    }
    return chunks;
}

async function sendTelegramMessage(
    token: string,
    apiBase: string,
    chatId: string,
    text: string,
): Promise<void> {
    const endpoint = `${apiBase}/bot${encodeURIComponent(token)}/sendMessage`;
    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            chat_id: chatId,
            text,
        }),
    });

    const payload = (await response
        .json()
        .catch(() => null)) as TelegramSendMessageResponse | null;
    if (!response.ok || !payload?.ok) {
        const reason =
            payload?.description ??
            `telegram sendMessage failed: ${response.status}`;
        throw new Error(reason);
    }
}

function extractText(parts: PromptResult["parts"]): string {
    const text = parts
        .filter((part) => part.type === "text")
        .map((part) => (part.type === "text" ? part.text : ""))
        .join("\n")
        .trim();
    return text.length > 0 ? text : "(empty response)";
}

function buildPromptOptions(options: DirectChatbotOptions): PromptOptions {
    const promptOptions: PromptOptions = {
        agent: options.agent,
    };
    if (options.system) {
        promptOptions.system = options.system;
    }
    return promptOptions;
}

function buildSessionTitle(chatId: string): string {
    return `x1-direct-chat:${chatId}`;
}

async function runDirectPrompt(
    server: OpenCodeServer,
    event: ParsedTelegramMessage,
    options: DirectChatbotOptions,
    chatSessions: Map<string, string>,
): Promise<PromptResult> {
    const promptOptions = buildPromptOptions(options);

    if (options.sessionMode === "oneshot") {
        return server.run(event.text, {
            ...promptOptions,
            deleteAfter: true,
            title: event.context.chatId
                ? buildSessionTitle(event.context.chatId)
                : "x1-direct-chat",
        });
    }

    const chatId = event.context.chatId;
    if (!chatId) {
        throw new Error("chat_id_missing");
    }

    const ensureSessionId = async (): Promise<string> => {
        const existing = chatSessions.get(chatId);
        if (existing) return existing;
        const created = await server.createSession(buildSessionTitle(chatId));
        chatSessions.set(chatId, created.id);
        return created.id;
    };

    const sessionId = await ensureSessionId();
    try {
        return await server.prompt(sessionId, event.text, promptOptions);
    } catch {
        // Recover once by recreating the chat session if previous session became invalid.
        chatSessions.delete(chatId);
        const recovered = await ensureSessionId();
        return await server.prompt(recovered, event.text, promptOptions);
    }
}

function buildOptions(args: DirectChatbotArgs): DirectChatbotOptions {
    const token =
        args.token ??
        process.env.OPENCODE_X1_DIRECT_TOKEN ??
        process.env.X1_DIRECT_TOKEN ??
        null;

    if (!token) {
        throw new Error("OPENCODE_X1_DIRECT_TOKEN is required (or --token)");
    }

    const normalizedAgent = args.agent.trim();
    if (!normalizedAgent) {
        throw new Error("--agent must not be empty");
    }

    return {
        token,
        source: args.source,
        allowedUserIds: parseAllowedUserIds(args.allowedUsers ?? undefined),
        pollIntervalMs: Math.max(args.pollIntervalMs, 200),
        pollTimeoutSec: Math.min(Math.max(args.pollTimeoutSec, 1), 50),
        pollLimit: Math.min(Math.max(args.pollLimit, 1), 100),
        apiBase: args.apiBase,
        opencodeBaseUrl: args.opencodeBaseUrl,
        agent: normalizedAgent,
        system: args.system,
        sessionMode: args.sessionMode,
    };
}

async function main(): Promise<void> {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        printHelp();
        return;
    }

    const options = buildOptions(args);
    const allowList = new Set<string>(options.allowedUserIds);
    const server = OpenCodeServer.getInstance(options.opencodeBaseUrl);
    const chatSessions = new Map<string, string>();

    logger.info("x1_direct_chatbot_config", {
        source: options.source,
        allowAllUsers: allowList.size === 0,
        pollIntervalMs: options.pollIntervalMs,
        pollTimeoutSec: options.pollTimeoutSec,
        pollLimit: options.pollLimit,
        apiBase: options.apiBase,
        opencodeBaseUrl: options.opencodeBaseUrl,
        agent: options.agent,
        sessionMode: options.sessionMode,
        hasSystemPrompt: !!options.system,
    });

    await verifyToken(options.token, options.apiBase);
    await server.health();

    let running = true;
    let offset: number | undefined;
    let processed = 0;
    let skipped = 0;
    let invalid = 0;
    let errors = 0;

    const shutdown = () => {
        if (!running) return;
        running = false;
        logger.info("x1_direct_chatbot_shutdown", {
            processed,
            skipped,
            invalid,
            errors,
        });
        process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    while (running) {
        const cycleStart = Date.now();
        try {
            const updates = await fetchUpdates(options, offset);
            if (updates.length === 0) {
                logger.debug("x1_direct_poll_cycle_empty");
            }

            for (const update of updates) {
                const parsed = parseTelegramMessage(update);
                const updateId = parseUpdateId(update);
                if (typeof updateId === "number") {
                    offset = updateId + 1;
                }

                if (!parsed.ok) {
                    invalid += 1;
                    logger.debug("x1_direct_update_invalid", {
                        reason: parsed.reason,
                        eventId: parsed.eventId,
                    });
                    continue;
                }

                const event = parsed.event;
                if (!allowedByUserId(event.context, allowList)) {
                    skipped += 1;
                    logger.info("x1_direct_update_skipped", {
                        reason: "user_not_allowed",
                        eventId: event.eventId,
                        userId: event.context.userId,
                    });
                    continue;
                }

                const chatId = event.context.chatId;
                if (!chatId) {
                    skipped += 1;
                    logger.warn("x1_direct_update_skipped", {
                        reason: "chat_id_missing",
                        eventId: event.eventId,
                    });
                    continue;
                }

                try {
                    const result = await runDirectPrompt(
                        server,
                        event,
                        options,
                        chatSessions,
                    );
                    const text = extractText(result.parts);
                    const messages = splitTelegramMessage(text);
                    for (const message of messages) {
                        await sendTelegramMessage(
                            options.token,
                            options.apiBase,
                            chatId,
                            message,
                        );
                    }
                    processed += 1;
                    logger.info("x1_direct_replied", {
                        eventId: event.eventId,
                        chatId,
                        messageCount: messages.length,
                    });
                } catch (error) {
                    errors += 1;
                    const message =
                        error instanceof Error ? error.message : String(error);
                    logger.error("x1_direct_reply_failed", {
                        eventId: event.eventId,
                        chatId,
                        error: message,
                    });
                    await sendTelegramMessage(
                        options.token,
                        options.apiBase,
                        chatId,
                        `처리 중 오류가 발생했습니다: ${message}`,
                    ).catch(() => {});
                }
            }
        } catch (error) {
            errors += 1;
            const message =
                error instanceof Error ? error.message : String(error);
            logger.error("x1_direct_poll_error", { error: message });
        }

        const elapsed = Date.now() - cycleStart;
        const waitMs = Math.max(options.pollIntervalMs - elapsed, 0);
        if (waitMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
    }
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`fatal: ${message}`);
    process.exit(1);
});
