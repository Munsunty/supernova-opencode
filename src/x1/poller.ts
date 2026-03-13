import { createLogger } from "../utils/logging";
import { Store } from "../x2/store";
import {
    enqueueTelegramUpdate,
    parseTelegramMessage,
    type ParsedTelegramMessage,
} from "./telegram";

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

interface PollerOptions {
    token: string;
    source: string;
    taskSource: string;
    dbPath: string | null;
    allowedUserIds: string[];
    pollIntervalMs: number;
    pollTimeoutSec: number;
    pollLimit: number;
    apiBase: string;
}

interface PollerArgs {
    token?: string;
    source: string;
    taskSource: string;
    dbPath: string | null;
    allowedUsers: string | null;
    pollIntervalMs: number;
    pollTimeoutSec: number;
    pollLimit: number;
    apiBase: string;
    help: boolean;
}

const logger = createLogger("X1.Poller");

const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_POLL_TIMEOUT_SEC = 25;
const DEFAULT_POLL_LIMIT = 100;
const DEFAULT_API_BASE = "https://api.telegram.org";

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

function parseArgs(argv: string[]): PollerArgs {
    const args: PollerArgs = {
        token: undefined,
        source:
            firstNonEmpty(
                process.env.OPENCODE_X1_POLLER_SOURCE,
                process.env.X1_POLLER_SOURCE,
                process.env.OPENCODE_X1_WEBHOOK_SOURCE,
                process.env.X1_WEBHOOK_SOURCE,
            ) ?? "x1_telegram",
        taskSource:
            firstNonEmpty(
                process.env.OPENCODE_X1_POLLER_TASK_SOURCE,
                process.env.X1_POLLER_TASK_SOURCE,
                process.env.OPENCODE_X1_WEBHOOK_TASK_SOURCE,
                process.env.X1_WEBHOOK_TASK_SOURCE,
            ) ?? "x1_telegram",
        dbPath:
            process.env.X2_DB_PATH ?? process.env.OPENCODE_X1_DB_PATH ?? null,
        allowedUsers: firstNonEmpty(
            process.env.OPENCODE_X1_POLLER_ALLOWED_USER_IDS,
            process.env.X1_POLLER_ALLOWED_USER_IDS,
            process.env.OPENCODE_ALLOWED_USER_IDS,
            process.env.ALLOWED_USER_IDS,
        ),
        pollIntervalMs: parseNumber(
            process.env.OPENCODE_X1_POLLER_POLL_INTERVAL_MS ??
                process.env.OPENCODE_X1_POLL_INTERVAL_MS ??
                process.env.X1_POLLER_POLL_INTERVAL_MS ??
                process.env.X1_POLL_INTERVAL_MS ??
                process.env.POLLING_INTERVAL_MS,
            DEFAULT_POLL_INTERVAL_MS,
        ),
        pollTimeoutSec: parseNumber(
            process.env.OPENCODE_X1_POLLER_POLL_TIMEOUT_SEC ??
                process.env.OPENCODE_X1_POLL_TIMEOUT_SEC ??
                process.env.X1_POLLER_POLL_TIMEOUT_SEC ??
                process.env.X1_POLL_TIMEOUT_SEC ??
                process.env.TELEGRAM_POLL_TIMEOUT_SEC,
            DEFAULT_POLL_TIMEOUT_SEC,
        ),
        pollLimit: parseNumber(
            process.env.OPENCODE_X1_POLLER_POLL_LIMIT ??
                process.env.OPENCODE_X1_POLL_LIMIT ??
                process.env.X1_POLLER_POLL_LIMIT ??
                process.env.X1_POLL_LIMIT,
            DEFAULT_POLL_LIMIT,
        ),
        apiBase:
            firstNonEmpty(
                process.env.OPENCODE_X1_POLLER_API_BASE,
                process.env.OPENCODE_X1_API_BASE,
                process.env.X1_POLLER_API_BASE,
                process.env.X1_TELEGRAM_API_BASE,
                process.env.TELEGRAM_API_BASE,
            ) ?? DEFAULT_API_BASE,
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
            case "--task-source":
                if (!next)
                    throw new Error("--task-source requires a source label");
                args.taskSource = next;
                i++;
                break;
            case "--db":
                if (!next) throw new Error("--db requires a DB path");
                args.dbPath = next;
                i++;
                break;
            case "--allowed-users": {
                if (!next) throw new Error("--allowed-users requires CSV list");
                args.allowedUsers = next;
                i++;
                break;
            }
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
  bun run .devserver/src/x1/poller.ts [options]

Options:
  --token <bot token>            Telegram bot token (default: OPENCODE_X1_POLLER_TOKEN)
  --allowed-users <csv>          Allowed user IDs (default: OPENCODE_X1_POLLER_ALLOWED_USER_IDS / ALLOWED_USER_IDS)
  --source <name>                Source label (default: x1_telegram)
  --task-source <name>           Task source label (default: x1_telegram)
  --db <path>                    Store DB path override (default: X2_DB_PATH)
  --poll-interval <ms>           Delay between successful loops (default: 1000)
  --poll-timeout <sec>           Telegram long-poll timeout seconds (default: 25)
  --poll-limit <n>               Telegram getUpdates limit (default: 100)
  --api-base <url>               Telegram API base URL (default: https://api.telegram.org)
  --help                         Show this help`);
}

function parseUpdateId(update: TelegramUpdate): number | null {
    const id = update?.update_id;
    if (typeof id !== "number" || !Number.isFinite(id) || id < 0) return null;
    return Math.trunc(id);
}

function allowedByUserId(
    context: ParsedTelegramMessage["event"]["context"],
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
    options: PollerOptions,
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

function buildPollerOptions(args: PollerArgs): PollerOptions {
    const token =
        args.token ??
        process.env.OPENCODE_X1_POLLER_TOKEN ??
        process.env.OPENCODE_TELEGRAM_BOT_TOKEN ??
        process.env.TELEGRAM_BOT_TOKEN ??
        process.env.OPENCODE_X1_TOKEN ??
        process.env.X1_BOT_TOKEN;

    if (!token) {
        throw new Error(
            "TELEGRAM_BOT_TOKEN is required (or --token / OPENCODE_X1_POLLER_TOKEN)",
        );
    }

    return {
        token,
        source: args.source,
        taskSource: args.taskSource,
        dbPath: args.dbPath,
        allowedUserIds: parseAllowedUserIds(args.allowedUsers ?? undefined),
        pollIntervalMs: Math.max(args.pollIntervalMs, 200),
        pollTimeoutSec: Math.min(Math.max(args.pollTimeoutSec, 1), 50),
        pollLimit: Math.min(Math.max(args.pollLimit, 1), 100),
        apiBase: args.apiBase,
    };
}

async function main(): Promise<void> {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        printHelp();
        return;
    }

    const options = buildPollerOptions(args);
    const allowList = new Set<string>(options.allowedUserIds);

    const store = new Store(options.dbPath ?? undefined);

    logger.info("x1_poller_config", {
        source: options.source,
        taskSource: options.taskSource,
        allowAllUsers: allowList.size === 0,
        pollIntervalMs: options.pollIntervalMs,
        pollTimeoutSec: options.pollTimeoutSec,
        pollLimit: options.pollLimit,
        apiBase: options.apiBase,
        dbPath: options.dbPath ?? "default",
    });

    await verifyToken(options.token, options.apiBase);

    let running = true;
    let offset: number | undefined;
    let processed = 0;
    let skipped = 0;
    let duplicated = 0;
    let invalid = 0;
    let errors = 0;

    const shutdown = () => {
        if (!running) return;
        running = false;
        try {
            store.close();
        } finally {
            logger.info("x1_poller_shutdown", {
                processed,
                skipped,
                duplicated,
                invalid,
                errors,
            });
            process.exit(0);
        }
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    while (running) {
        const cycleStart = Date.now();
        try {
            const updates = await fetchUpdates(options, offset);
            if (updates.length === 0) {
                logger.debug("x1_poll_cycle_empty");
            }

            for (const update of updates) {
                const parsedAt = Date.now();
                const parsed = parseTelegramMessage(update, () => parsedAt);
                const updateId = parseUpdateId(update);

                if (!parsed.ok) {
                    invalid += 1;
                    const registerResult = enqueueTelegramUpdate(
                        store,
                        update,
                        {
                            source: options.source,
                            taskSource: options.taskSource,
                            parsed,
                        },
                    );
                    if (registerResult.action === "duplicate") {
                        duplicated += 1;
                    }
                    continue;
                }

                if (!allowedByUserId(parsed.event.context, allowList)) {
                    skipped += 1;
                    store.appendMetricEvent({
                        eventType: "inbound_invalid",
                        traceId: parsed.event.eventId,
                        source: options.source,
                        reason: "user_not_allowed",
                        payload: JSON.stringify({
                            channel: "telegram",
                            eventId: parsed.event.eventId,
                            userId: parsed.event.context.userId,
                        }),
                    });
                    continue;
                }

                const result = enqueueTelegramUpdate(store, update, {
                    source: options.source,
                    taskSource: options.taskSource,
                    parsed,
                });

                if (result.action === "enqueued") {
                    processed += 1;
                    logger.info("x1_update_enqueued", {
                        action: result.action,
                        eventId: result.eventId,
                        taskId: result.taskId,
                    });
                } else if (result.action === "duplicate") {
                    duplicated += 1;
                    logger.debug("x1_update_duplicate", {
                        eventId: result.eventId,
                    });
                }
            }

            if (updates.length > 0) {
                const last = updates[updates.length - 1];
                const lastUpdateId = parseUpdateId(last);
                if (lastUpdateId !== null) {
                    offset = lastUpdateId + 1;
                }
            }
        } catch (error) {
            errors += 1;
            const message =
                error instanceof Error ? error.message : String(error);
            logger.error("x1_poll_error", { error: message });
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
