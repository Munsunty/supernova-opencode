import { decodeTelegramTaskSource } from "./telegram-source";

export type TaskChannelKind = "telegram" | "web" | "cli" | "unknown";

export interface ResolvedTaskChannel {
    kind: TaskChannelKind;
    source: string;
    baseSource: string;
    chatId: string | null;
    threadId: string | null;
}

export function resolveTaskChannel(source: string): ResolvedTaskChannel {
    const telegram = decodeTelegramTaskSource(source);
    if (telegram.chatId) {
        return {
            kind: "telegram",
            source,
            baseSource: telegram.baseSource,
            chatId: telegram.chatId,
            threadId: null,
        };
    }

    if (source.startsWith("web#thread:")) {
        const threadId = source.slice("web#thread:".length).trim() || "main";
        return {
            kind: "web",
            source,
            baseSource: "web",
            chatId: null,
            threadId,
        };
    }

    const trimmed = source.trim();
    if (!trimmed || trimmed === "cli") {
        return {
            kind: "cli",
            source,
            baseSource: trimmed || "cli",
            chatId: null,
            threadId: null,
        };
    }

    return {
        kind: "unknown",
        source,
        baseSource: trimmed || source,
        chatId: null,
        threadId: null,
    };
}
