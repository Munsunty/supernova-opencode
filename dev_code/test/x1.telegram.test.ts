import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "../../src/x2/store";
import {
    enqueueTelegramUpdate,
    parseTelegramMessage,
} from "../../src/x1/telegram";

const tempDirs: string[] = [];

function createStore(): Store {
    const dir = mkdtempSync(join(tmpdir(), "homsa-x1-"));
    tempDirs.push(dir);
    return new Store(join(dir, "state.db"));
}

afterEach(() => {
    while (tempDirs.length > 0) {
        const dir = tempDirs.pop();
        if (!dir) continue;
        rmSync(dir, { recursive: true, force: true });
    }
});

describe("Telegram ingress adapter", () => {
    test("parseTelegramMessage extracts normalized event from webhook update", () => {
        const parsed = parseTelegramMessage({
            update_id: 9001,
            message: {
                message_id: 12,
                text: "진행 중인 TODO를 반영해줘",
                from: {
                    id: 777,
                    username: "dev",
                },
                chat: {
                    id: 88,
                    type: "private",
                },
            },
        });

        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(parsed.event.channel).toBe("telegram");
        expect(parsed.event.eventId).toBe("9001");
        expect(parsed.event.text).toBe("진행 중인 TODO를 반영해줘");
        expect(parsed.event.context.chatId).toBe("88");
        expect(parsed.event.context.userId).toBe("777");
    });

    test("parseTelegramMessage rejects empty text payload", () => {
        const parsed = parseTelegramMessage({
            update_id: 9002,
            message: {
                message_id: 13,
                text: "   ",
                from: {
                    id: 777,
                },
                chat: {
                    id: 88,
                },
            },
        });

        expect(parsed.ok).toBe(false);
        if (parsed.ok) return;
        expect(parsed.reason).toBe("invalid payload: empty message text");
        expect(parsed.eventId).toBe("9002");
    });

    test("parseTelegramMessage uses deterministic fallback event id without update_id", () => {
        const payload = {
            message: {
                text: "fallback event id",
                chat: {
                    type: "private",
                },
                from: {
                    username: "reporter",
                },
            },
        };

        const first = parseTelegramMessage(payload, () => 1000);
        const second = parseTelegramMessage(payload, () => 9999);

        expect(first.ok).toBe(true);
        expect(second.ok).toBe(true);
        if (!first.ok || !second.ok) return;
        expect(second.event.eventId).toBe(first.event.eventId);
    });

    test("enqueueTelegramUpdate stores task and deduplicates by event id", () => {
        const store = createStore();
        const payload = {
            update_id: 9003,
            message: {
                message_id: 14,
                text: "build a markdown report",
                from: {
                    id: 777,
                    username: "reporter",
                },
                chat: {
                    id: 88,
                    type: "private",
                },
            },
        };

        const first = enqueueTelegramUpdate(store, payload, {
            source: "x1_telegram",
            taskSource: "x1_telegram_task",
        });
        expect(first.action).toBe("enqueued");
        expect(first.taskId).toBeDefined();

        const second = enqueueTelegramUpdate(store, payload, {
            source: "x1_telegram",
            taskSource: "x1_telegram_task",
        });
        expect(second.action).toBe("duplicate");
        expect(second.taskId).toBeUndefined();

        const tasks = store.listTasks();
        expect(tasks.length).toBe(1);
        expect(tasks[0]?.source).toBe("x1_telegram_task#chat:88");
        expect(tasks[0]?.prompt).toBe("build a markdown report");

        const inbound = store.listInboundEvents({
            channel: "telegram",
        });
        expect(inbound.length).toBe(1);
        expect(inbound[0]!.status).toBe("duplicate");
        expect(inbound[0]!.eventId).toBe("9003");

        const receivedMetric = store.listMetricEvents({
            eventType: "inbound_received",
        });
        expect(receivedMetric.length).toBe(1);

        store.close();
    });

    test("enqueueTelegramUpdate records invalid payload and duplicate as separate states", () => {
        const store = createStore();
        const payload = {
            update_id: 9004,
            message: {
                message_id: 15,
                text: "   ",
                from: {
                    id: 777,
                },
                chat: {
                    id: 88,
                },
            },
        };

        const first = enqueueTelegramUpdate(store, payload, {
            source: "x1_telegram",
            taskSource: "x1_telegram_task",
        });
        expect(first.action).toBe("invalid");
        expect(first.reason).toBe("invalid payload: empty message text");

        const invalidInbound = store.listInboundEvents({
            status: "invalid",
            channel: "telegram",
            eventId: "9004",
        });
        expect(invalidInbound.length).toBe(1);
        expect(invalidInbound[0]!.status).toBe("invalid");

        const invalidMetric = store.listMetricEvents({
            eventType: "inbound_invalid",
        });
        expect(invalidMetric.length).toBe(1);

        const second = enqueueTelegramUpdate(store, payload, {
            source: "x1_telegram",
            taskSource: "x1_telegram_task",
        });
        expect(second.action).toBe("duplicate");

        const duplicateInbound = store.listInboundEvents({
            channel: "telegram",
            eventId: "9004",
        });
        expect(duplicateInbound.length).toBe(1);
        expect(duplicateInbound[0]!.status).toBe("duplicate");

        const duplicateMetric = store.listMetricEvents({
            eventType: "inbound_duplicate",
        });
        expect(duplicateMetric.length).toBe(1);

        const tasks = store.listTasks();
        expect(tasks.length).toBe(0);

        store.close();
    });

    test("enqueueTelegramUpdate deduplicates messages without numeric ids", () => {
        const store = createStore();
        const payload = {
            message: {
                text: "deduplicate fallback ids",
                chat: {
                    type: "private",
                },
                from: {
                    username: "reporter",
                },
            },
        };

        const first = enqueueTelegramUpdate(store, payload, {
            source: "x1_telegram",
            taskSource: "x1_telegram_task",
        });
        const second = enqueueTelegramUpdate(store, payload, {
            source: "x1_telegram",
            taskSource: "x1_telegram_task",
        });

        expect(first.action).toBe("enqueued");
        expect(second.action).toBe("duplicate");
        expect(first.eventId).toBe(second.eventId);

        const tasks = store.listTasks();
        expect(tasks.length).toBe(1);
        expect(tasks[0]?.source).toBe("x1_telegram_task");
        expect(tasks[0]?.prompt).toBe("deduplicate fallback ids");

        const inbound = store.listInboundEvents({
            channel: "telegram",
            eventId: first.eventId,
        });
        expect(inbound.length).toBe(1);
        expect(inbound[0]!.status).toBe("duplicate");

        store.close();
    });
});
