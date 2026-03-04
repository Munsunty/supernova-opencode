import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "../../src/x2/store";
import { createTelegramWebhookHandler } from "../../src/x1/server";

interface RunningHandler {
    handler: (req: Request) => Promise<Response>;
    close: () => void;
}

const tempDirs: string[] = [];

function createTempDbPath(): string {
    const dir = mkdtempSync(join(tmpdir(), "homsa-x1-webhook-"));
    tempDirs.push(dir);
    return join(dir, "state.db");
}

afterEach(() => {
    while (tempDirs.length > 0) {
        const dir = tempDirs.pop();
        if (!dir) continue;
        rmSync(dir, { recursive: true, force: true });
    }
});

function createHandler(
    dbPath: string,
    options: { secret?: string; path?: string } = {},
): RunningHandler {
    const store = new Store(dbPath);
    const handler = createTelegramWebhookHandler(store, {
        path: options.path ?? "/webhook",
        source: "x1_telegram",
        taskSource: "x1_telegram",
        secret: options.secret,
    });

    return {
        handler,
        close() {
            store.close();
        },
    };
}

describe("x1 webhook server", () => {
    test("health check returns ok", async () => {
        const dbPath = createTempDbPath();
        const { handler, close } = createHandler(dbPath);

        try {
            const req = new Request("http://127.0.0.1:0/health");
            const res = await handler(req);
            const body = (await res.json()) as Record<string, unknown>;

            expect(res.status).toBe(200);
            expect(body.ok).toBe(true);
            expect(body.ready).toBe(true);
        } finally {
            close();
        }
    });

    test("accepts valid telegram webhook payload", async () => {
        const dbPath = createTempDbPath();
        const { handler, close } = createHandler(dbPath);

        try {
            const req = new Request("http://127.0.0.1:0/webhook", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    update_id: 12001,
                    message: {
                        message_id: 11,
                        text: "hello from telegram",
                        from: {
                            id: 100,
                        },
                        chat: {
                            id: 200,
                        },
                    },
                }),
            });
            const res = await handler(req);
            const body = (await res.json()) as Record<string, unknown>;

            expect(res.status).toBe(200);
            expect(body.ok).toBe(true);
            expect(body.action).toBe("enqueued");
            expect(body.eventId).toBe("12001");
            expect(body.source).toBe("x1_telegram");
            expect(body.taskId).toBeDefined();

            const inspectStore = new Store(dbPath);
            const tasks = inspectStore.listTasks();
            expect(tasks.length).toBe(1);
            expect(tasks[0]?.prompt).toBe("hello from telegram");
            inspectStore.close();
        } finally {
            close();
        }
    });

    test("returns parse_error on invalid JSON", async () => {
        const dbPath = createTempDbPath();
        const { handler, close } = createHandler(dbPath);

        try {
            const req = new Request("http://127.0.0.1:0/webhook", {
                method: "POST",
                headers: { "content-type": "text/plain" },
                body: "this is not json",
            });
            const res = await handler(req);
            const body = (await res.json()) as Record<string, unknown>;

            expect(res.status).toBe(400);
            expect(body.ok).toBe(false);
            expect(body.action).toBe("parse_error");
        } finally {
            close();
        }
    });

    test("normalizes webhook path when missing leading slash", async () => {
        const dbPath = createTempDbPath();
        const { handler, close } = createHandler(dbPath, {
            path: "webhook",
        });

        try {
            const req = new Request("http://127.0.0.1:0/webhook", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    update_id: 12004,
                    message: {
                        message_id: 13,
                        text: "path normalization",
                        from: { id: 103 },
                        chat: { id: 203 },
                    },
                }),
            });
            const res = await handler(req);
            const body = (await res.json()) as Record<string, unknown>;

            expect(res.status).toBe(200);
            expect(body.ok).toBe(true);
            expect(body.action).toBe("enqueued");
        } finally {
            close();
        }
    });

    test("uses TELEGRAM_WEBHOOK_SECRET when secret option is not set", async () => {
        const dbPath = createTempDbPath();
        const previousSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
        process.env.TELEGRAM_WEBHOOK_SECRET = "env-secret";

        const { handler, close } = createHandler(dbPath, {});

        try {
            const reqUnauthorized = new Request("http://127.0.0.1:0/webhook", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    update_id: 12005,
                    message: {
                        message_id: 14,
                        text: "env secret check",
                        from: { id: 104 },
                        chat: { id: 204 },
                    },
                }),
            });
            const unauthorized = await handler(reqUnauthorized);
            expect(unauthorized.status).toBe(401);

            const reqAuthorized = new Request("http://127.0.0.1:0/webhook", {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "x-telegram-bot-api-secret-token": "env-secret",
                },
                body: JSON.stringify({
                    update_id: 12006,
                    message: {
                        message_id: 15,
                        text: "env secret check",
                        from: { id: 105 },
                        chat: { id: 205 },
                    },
                }),
            });
            const authorized = await handler(reqAuthorized);
            const authorizedBody = (await authorized.json()) as Record<
                string,
                unknown
            >;
            expect(authorized.status).toBe(200);
            expect(authorizedBody.ok).toBe(true);
            expect(authorizedBody.action).toBe("enqueued");
        } finally {
            if (previousSecret === undefined) {
                delete process.env.TELEGRAM_WEBHOOK_SECRET;
            } else {
                process.env.TELEGRAM_WEBHOOK_SECRET = previousSecret;
            }
            close();
        }
    });

    test("rejects requests without matching secret", async () => {
        const dbPath = createTempDbPath();
        const { handler, close } = createHandler(dbPath, {
            secret: "secret-token",
        });

        try {
            const req = new Request("http://127.0.0.1:0/webhook", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    update_id: 12002,
                    message: {
                        message_id: 10,
                        text: "blocked",
                        from: { id: 102 },
                        chat: { id: 202 },
                    },
                }),
            });
            const res = await handler(req);
            const body = (await res.json()) as Record<string, unknown>;

            expect(res.status).toBe(401);
            expect(body.ok).toBe(false);
            expect(body.action).toBe("unauthorized");
        } finally {
            close();
        }
    });

    test("returns duplicate for repeated valid payload", async () => {
        const dbPath = createTempDbPath();
        const { handler, close } = createHandler(dbPath);
        const payload = {
            update_id: 12003,
            message: {
                message_id: 12,
                text: "중복 테스트",
                from: { id: 101 },
                chat: { id: 201 },
            },
        };

        try {
            const req1 = new Request("http://127.0.0.1:0/webhook", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(payload),
            });
            const first = await handler(req1);
            const firstBody = (await first.json()) as Record<string, unknown>;
            expect(first.status).toBe(200);
            expect(firstBody.action).toBe("enqueued");

            const req2 = new Request("http://127.0.0.1:0/webhook", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(payload),
            });
            const second = await handler(req2);
            const secondBody = (await second.json()) as Record<string, unknown>;
            expect(second.status).toBe(200);
            expect(secondBody.action).toBe("duplicate");
        } finally {
            close();
        }
    });
});
