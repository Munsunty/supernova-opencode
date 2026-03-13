import { createLogger } from "../utils/logging";
import { resolveTaskChannel } from "../utils/task-source";
import type { Task } from "../x2/store";

const logger = createLogger("Channels.TaskAck");

interface TelegramSendMessageResponse {
    ok?: boolean;
    description?: string;
}

export interface QueuedTaskAckInput {
    taskId: string;
    taskSource: string;
    pendingCount: number;
    runningCount: number;
    chatId?: string | null;
    replyToMessageId?: string | null;
}

export interface StartedTaskAckInput {
    task: Task;
    pendingCount: number;
    runningCount: number;
}

export interface TaskAckNotifier {
    notifyQueued(input: QueuedTaskAckInput): Promise<void>;
    notifyStarted(input: StartedTaskAckInput): Promise<void>;
}

export class NoopTaskAckNotifier implements TaskAckNotifier {
    async notifyQueued(_input: QueuedTaskAckInput): Promise<void> {}

    async notifyStarted(_input: StartedTaskAckInput): Promise<void> {}
}

export class ConsoleTaskAckNotifier implements TaskAckNotifier {
    async notifyQueued(input: QueuedTaskAckInput): Promise<void> {
        logger.info("task_queued_ack_console", {
            task: input.taskId.slice(0, 8),
            source: input.taskSource,
            pending: input.pendingCount,
            running: input.runningCount,
        });
    }

    async notifyStarted(input: StartedTaskAckInput): Promise<void> {
        logger.info("task_started_ack_console", {
            task: input.task.id.slice(0, 8),
            source: input.task.source,
            attempts: input.task.attempts + 1,
            pending: input.pendingCount,
            running: input.runningCount,
        });
    }
}

interface TelegramTaskAckNotifierOptions {
    token: string;
    apiBase?: string;
    fallback?: TaskAckNotifier | null;
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

function toReplyMessageId(
    messageId: string | null | undefined,
): number | undefined {
    if (!messageId) return undefined;
    if (!/^\d+$/.test(messageId)) return undefined;
    const parsed = Number(messageId);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
}

async function sendTelegramTextMessage(input: {
    token: string;
    apiBase: string;
    chatId: string;
    text: string;
    replyToMessageId?: string | null;
}): Promise<void> {
    const endpoint = `${input.apiBase.replace(/\/+$/, "")}/bot${encodeURIComponent(input.token)}/sendMessage`;
    const replyToMessageId = toReplyMessageId(input.replyToMessageId);
    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            chat_id: input.chatId,
            text: input.text,
            ...(replyToMessageId
                ? { reply_to_message_id: replyToMessageId }
                : {}),
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

function formatQueuedAckMessage(input: QueuedTaskAckInput): string {
    return [
        "작업을 접수했습니다.",
        `task: ${input.taskId.slice(0, 8)}`,
        `queue: pending ${input.pendingCount} / running ${input.runningCount}`,
        "처리 후 결과를 다시 보내드리겠습니다.",
    ].join("\n");
}

function formatStartedAckMessage(input: StartedTaskAckInput): string {
    const firstAttempt = input.task.attempts === 0;
    return [
        firstAttempt
            ? "작업 실행을 시작했습니다."
            : "작업 재시도를 시작했습니다.",
        `task: ${input.task.id.slice(0, 8)}`,
        `attempt: ${input.task.attempts + 1}`,
        `queue: pending ${input.pendingCount} / running ${input.runningCount}`,
    ].join("\n");
}

export class TelegramTaskAckNotifier implements TaskAckNotifier {
    private token: string;
    private apiBase: string;
    private fallback: TaskAckNotifier | null;

    constructor(options: TelegramTaskAckNotifierOptions) {
        this.token = options.token;
        this.apiBase = (options.apiBase ?? "https://api.telegram.org").replace(
            /\/+$/,
            "",
        );
        this.fallback = options.fallback ?? null;
    }

    async notifyQueued(input: QueuedTaskAckInput): Promise<void> {
        const route = resolveTaskChannel(input.taskSource);
        const chatId = input.chatId ?? route.chatId;
        if (route.kind !== "telegram" || !chatId) {
            await this.fallback?.notifyQueued(input);
            return;
        }

        await sendTelegramTextMessage({
            token: this.token,
            apiBase: this.apiBase,
            chatId,
            text: formatQueuedAckMessage(input),
            replyToMessageId: input.replyToMessageId,
        });
    }

    async notifyStarted(input: StartedTaskAckInput): Promise<void> {
        const route = resolveTaskChannel(input.task.source);
        if (route.kind !== "telegram" || !route.chatId) {
            await this.fallback?.notifyStarted(input);
            return;
        }

        await sendTelegramTextMessage({
            token: this.token,
            apiBase: this.apiBase,
            chatId: route.chatId,
            text: formatStartedAckMessage(input),
        });
    }
}

interface ChannelTaskAckNotifierOptions {
    telegram?: TaskAckNotifier | null;
    web?: TaskAckNotifier | null;
    cli?: TaskAckNotifier | null;
    fallback?: TaskAckNotifier | null;
}

export class ChannelTaskAckNotifier implements TaskAckNotifier {
    private telegram: TaskAckNotifier | null;
    private web: TaskAckNotifier | null;
    private cli: TaskAckNotifier | null;
    private fallback: TaskAckNotifier | null;

    constructor(options: ChannelTaskAckNotifierOptions = {}) {
        this.telegram = options.telegram ?? null;
        this.web = options.web ?? null;
        this.cli = options.cli ?? null;
        this.fallback = options.fallback ?? null;
    }

    private pick(source: string): TaskAckNotifier | null {
        const route = resolveTaskChannel(source);
        switch (route.kind) {
            case "telegram":
                return this.telegram ?? this.fallback;
            case "web":
                return this.web ?? this.fallback;
            case "cli":
                return this.cli ?? this.fallback;
            default:
                return this.fallback;
        }
    }

    async notifyQueued(input: QueuedTaskAckInput): Promise<void> {
        await this.pick(input.taskSource)?.notifyQueued(input);
    }

    async notifyStarted(input: StartedTaskAckInput): Promise<void> {
        await this.pick(input.task.source)?.notifyStarted(input);
    }
}

export function createTaskAckNotifierFromEnv(): TaskAckNotifier {
    const consoleNotifier = new ConsoleTaskAckNotifier();
    const noop = new NoopTaskAckNotifier();
    const token = firstNonEmpty(
        process.env.OPENCODE_X1_BOT_TOKEN,
        process.env.OPENCODE_X1_POLLER_TOKEN,
        process.env.X1_BOT_TOKEN,
        process.env.TELEGRAM_BOT_TOKEN,
    );
    const apiBase =
        firstNonEmpty(
            process.env.OPENCODE_X1_API_BASE,
            process.env.X1_TELEGRAM_API_BASE,
            process.env.TELEGRAM_API_BASE,
        ) ?? "https://api.telegram.org";

    return new ChannelTaskAckNotifier({
        telegram: token
            ? new TelegramTaskAckNotifier({
                  token,
                  apiBase,
                  fallback: consoleNotifier,
              })
            : consoleNotifier,
        web: noop,
        cli: consoleNotifier,
        fallback: consoleNotifier,
    });
}
