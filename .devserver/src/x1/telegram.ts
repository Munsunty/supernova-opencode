import { createHash } from "node:crypto";
import { type InboundEventChannel, type Store } from "../x2/store";
import { encodeTelegramTaskSource } from "../utils/telegram-source";

interface TelegramWebhookRoot {
    update_id?: unknown;
    message?: TelegramMessagePayload | unknown;
    edited_message?: TelegramMessagePayload | unknown;
    channel_post?: TelegramMessagePayload | unknown;
    edited_channel_post?: TelegramMessagePayload | unknown;
    inline_query?: unknown;
}

interface TelegramMessagePayload {
    message_id?: unknown;
    text?: unknown;
    caption?: unknown;
    from?: {
        id?: unknown;
        username?: unknown;
        first_name?: unknown;
        last_name?: unknown;
    };
    chat?: {
        id?: unknown;
        type?: unknown;
        title?: unknown;
        username?: unknown;
    };
}

export interface TelegramMessageContext {
    chatId: string | null;
    userId: string | null;
    messageId: string | null;
    username: string | null;
    fullName: string | null;
    chatTitle: string | null;
    chatType: string | null;
}

export interface ParsedTelegramMessage {
    channel: "telegram";
    eventId: string;
    text: string;
    context: TelegramMessageContext;
    raw: unknown;
    receivedAt: number;
}

export interface ParseFailure {
    ok: false;
    reason: string;
    eventId: string;
}

export interface ParseSuccess {
    ok: true;
    event: ParsedTelegramMessage;
}

export type TelegramParseResult = ParseSuccess | ParseFailure;

export interface EnqueueResult {
    action: "enqueued" | "duplicate" | "invalid";
    eventId: string;
    taskId?: string;
    source: string;
    reason?: string;
}

export interface EnqueueTelegramOptions {
    source?: string;
    taskSource?: string;
    now?: () => number;
    parsed?: TelegramParseResult;
}

const DEFAULT_SOURCE = "x1_telegram";
const DEFAULT_TASK_SOURCE = "x1_telegram";
const DEFAULT_CHANNEL: InboundEventChannel = "telegram";

function toId(value: unknown): string | null {
    if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
    }
    return null;
}

function trimText(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function sha(text: string): string {
    return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function pickMessage(root: TelegramWebhookRoot): TelegramMessagePayload | null {
    if (!root || typeof root !== "object") return null;

    const candidates = [
        root.message,
        root.edited_message,
        root.channel_post,
        root.edited_channel_post,
        root,
    ];

    for (const candidate of candidates) {
        if (!candidate || typeof candidate !== "object") continue;
        const message = candidate as {
            text?: unknown;
            caption?: unknown;
            message_id?: unknown;
            from?: unknown;
            chat?: unknown;
        };

        if (message.text || message.caption) {
            return candidate as TelegramMessagePayload;
        }
    }

    return null;
}

function pickText(message: TelegramMessagePayload): string | null {
    return trimText(message.text) ?? trimText(message.caption);
}

function buildUserName(message: TelegramMessagePayload): string | null {
    const first = toId(message?.from?.first_name);
    const last = toId(message?.from?.last_name);
    if (first && last) return `${first} ${last}`;
    return first ?? last ?? toId(message?.from?.username);
}

function deriveEventId(
    root: TelegramWebhookRoot,
    message: TelegramMessagePayload,
    text: string,
): string {
    const updateId = toId(root.update_id);
    if (updateId) return updateId;

    const chatId = toId(message.chat?.id);
    const messageId = toId(message.message_id);
    if (chatId && messageId) return `${chatId}:${messageId}`;

    const userId = toId(message.from?.id);
    if (chatId && userId) return `${chatId}:${userId}:${text.length}`;
    if (userId && messageId) return `${userId}:${messageId}`;

    return `fallback-${sha(`${serializePayload(root)}|${text}|${chatId ?? ""}|${userId ?? ""}`)}`;
}

function buildPrompt(event: ParsedTelegramMessage): string {
    // Keep prompt payload minimal: user text only.
    // Telegram metadata is persisted in inbound events/metrics storage.
    return event.text;
}

function serializePayload(raw: unknown): string {
    try {
        const text = JSON.stringify(raw);
        return text ?? String(raw);
    } catch {
        return String(raw);
    }
}

export function parseTelegramMessage(
    raw: unknown,
    now: () => number = () => Date.now(),
): TelegramParseResult {
    if (!raw || typeof raw !== "object") {
        return {
            ok: false,
            reason: "invalid payload: expected object",
            eventId: `invalid-${sha(`${String(raw)}|non-object`)}`,
        };
    }

    const root = raw as TelegramWebhookRoot;
    const message = pickMessage(root);
    if (!message) {
        return {
            ok: false,
            reason: "invalid payload: no telegram message found",
            eventId:
                toId(root.update_id) ??
                `invalid-${sha(`missing-message|${serializePayload(root)}`)}`,
        };
    }

    const text = pickText(message);
    if (!text) {
        return {
            ok: false,
            reason: "invalid payload: empty message text",
            eventId: deriveEventId(root, message, ""),
        };
    }

    const context: TelegramMessageContext = {
        chatId: toId(message.chat?.id),
        userId: toId(message.from?.id),
        messageId: toId(message.message_id),
        username: toId(message.from?.username),
        fullName: buildUserName(message),
        chatTitle: toId(message.chat?.title),
        chatType: toId(message.chat?.type),
    };

    return {
        ok: true,
        event: {
            channel: "telegram",
            eventId: deriveEventId(root, message, text),
            text,
            context,
            raw,
            receivedAt: now(),
        },
    };
}

export function enqueueTelegramUpdate(
    store: Store,
    raw: unknown,
    options: EnqueueTelegramOptions = {},
): EnqueueResult {
    const now = options.now ?? (() => Date.now());
    const parsed = options.parsed ?? parseTelegramMessage(raw, now);
    const source = options.source ?? DEFAULT_SOURCE;
    const rawPayload = serializePayload(raw);

    const recordMetric = (
        eventType: "inbound_received" | "inbound_invalid" | "inbound_duplicate",
        eventId: string,
        details: Record<string, unknown> = {},
        reason?: string,
    ) => {
        store.appendMetricEvent({
            eventType,
            traceId: eventId,
            source,
            status: null,
            from: null,
            to: null,
            reason: reason ?? (parsed.ok ? "valid_payload" : parsed.reason),
            payload: JSON.stringify({
                channel: DEFAULT_CHANNEL,
                eventId,
                source,
                parsedAt: now(),
                details,
            }),
        });
    };

    if (!parsed.ok) {
        const registration = store.registerInboundEvent({
            channel: DEFAULT_CHANNEL,
            eventId: parsed.eventId,
            source,
            status: "invalid",
            payload: rawPayload,
        });

        if (!registration.created) {
            store.updateInboundEventStatus(registration.event.id, "duplicate");
        }

        recordMetric(
            registration.created ? "inbound_invalid" : "inbound_duplicate",
            parsed.eventId,
            { reason: parsed.reason },
            registration.created ? undefined : "event exists",
        );

        return {
            action: registration.created ? "invalid" : "duplicate",
            eventId: parsed.eventId,
            source,
            reason: registration.created
                ? parsed.reason
                : `event exists: ${registration.event.id}`,
        };
    }

    const parsedPayload = serializePayload(parsed.event.raw);
    const registration = store.registerInboundEvent({
        channel: DEFAULT_CHANNEL,
        eventId: parsed.event.eventId,
        source,
        payload: parsedPayload,
    });

    if (!registration.created) {
        store.updateInboundEventStatus(registration.event.id, "duplicate");
        recordMetric(
            "inbound_duplicate",
            parsed.event.eventId,
            {
                reason: "event exists",
                eventId: parsed.event.eventId,
            },
            "event exists",
        );
        return {
            action: "duplicate",
            eventId: parsed.event.eventId,
            source,
            reason: `event exists: ${registration.event.id}`,
        };
    }

    const task = store.createTask(
        buildPrompt(parsed.event),
        encodeTelegramTaskSource(
            options.taskSource ?? DEFAULT_TASK_SOURCE,
            parsed.event.context.chatId,
        ),
    );

    store.updateInboundEventStatus(registration.event.id, "received");
    recordMetric("inbound_received", parsed.event.eventId, {
        reason: "accepted",
        taskId: task.id,
        eventTextPreview: parsed.event.text.slice(0, 120),
    });

    return {
        action: "enqueued",
        eventId: parsed.event.eventId,
        taskId: task.id,
        source,
    };
}
