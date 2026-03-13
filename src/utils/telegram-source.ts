const CHAT_MARKER = "#chat:";

export function encodeTelegramTaskSource(
    baseSource: string,
    chatId: string | null,
): string {
    if (!chatId) return baseSource;
    return `${baseSource}${CHAT_MARKER}${chatId}`;
}

export function decodeTelegramTaskSource(source: string): {
    baseSource: string;
    chatId: string | null;
} {
    const markerIndex = source.lastIndexOf(CHAT_MARKER);
    if (markerIndex === -1) {
        return {
            baseSource: source,
            chatId: null,
        };
    }

    const baseSource = source.slice(0, markerIndex);
    const chatId = source.slice(markerIndex + CHAT_MARKER.length).trim();
    if (!chatId) {
        return {
            baseSource: source,
            chatId: null,
        };
    }

    return {
        baseSource,
        chatId,
    };
}

export function extractTelegramChatIdFromTaskSource(
    source: string,
): string | null {
    return decodeTelegramTaskSource(source).chatId;
}
