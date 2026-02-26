import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Queue } from "../.devserver/x2/queue";
import { Store } from "../.devserver/x2/store";

type FakeMessage = {
    info: {
        role: "assistant" | "user";
        cost: number;
        tokens: {
            input: number;
            output: number;
            reasoning: number;
            cache: { read: number; write: number };
        };
        time: { created: number; completed: number | null };
    };
    parts: Array<
        | {
              type: "text";
              text: string;
              synthetic: boolean;
              ignored: boolean;
          }
        | {
              type: "tool";
              tool: string;
              state: { status: "completed"; title?: string; metadata?: object };
          }
    >;
};

class FakeServer {
    private seq = 0;
    public promptCalls = 0;
    public abortCalls = 0;
    public throwOnPrompt = false;
    public sessions = new Map<
        string,
        {
            status: "busy" | "idle";
            messages: FakeMessage[];
        }
    >();

    async createSession(title?: string) {
        const id = `ses_test_${++this.seq}`;
        this.sessions.set(id, {
            status: "idle",
            messages: [
                {
                    info: {
                        role: "user",
                        cost: 0,
                        tokens: {
                            input: 0,
                            output: 0,
                            reasoning: 0,
                            cache: { read: 0, write: 0 },
                        },
                        time: { created: Date.now(), completed: Date.now() },
                    },
                    parts: [
                        {
                            type: "text",
                            text: title ?? "session",
                            synthetic: false,
                            ignored: false,
                        },
                    ],
                },
            ],
        });
        return { id };
    }

    async promptAsync(sessionId: string, text: string): Promise<void> {
        this.promptCalls++;
        if (this.throwOnPrompt) {
            throw new Error("promptAsync failed");
        }
        const s = this.sessions.get(sessionId);
        if (!s) throw new Error(`session not found: ${sessionId}`);
        s.status = "busy";
        s.messages.push({
            info: {
                role: "assistant",
                cost: 0.001,
                tokens: {
                    input: 5,
                    output: 3,
                    reasoning: 0,
                    cache: { read: 0, write: 0 },
                },
                time: { created: Date.now(), completed: Date.now() },
            },
            parts: [
                {
                    type: "text",
                    text: `OK: ${text}`,
                    synthetic: false,
                    ignored: false,
                },
            ],
        });
    }

    async getSessionStatuses(): Promise<Record<string, { type: string }>> {
        const out: Record<string, { type: string }> = {};
        for (const [id, s] of this.sessions.entries()) {
            out[id] = { type: s.status };
        }
        return out;
    }

    async getMessages(sessionId: string) {
        const s = this.sessions.get(sessionId);
        if (!s) throw new Error(`session not found: ${sessionId}`);
        return s.messages as unknown[];
    }

    async abortSession(sessionId: string): Promise<boolean> {
        this.abortCalls++;
        const s = this.sessions.get(sessionId);
        if (!s) return false;
        s.status = "idle";
        return true;
    }

    markIdle(sessionId: string) {
        const s = this.sessions.get(sessionId);
        if (!s) throw new Error(`session not found: ${sessionId}`);
        s.status = "idle";
    }
}

const tempDirs: string[] = [];

function createStore(): Store {
    const dir = mkdtempSync(join(tmpdir(), "homsa-x2-"));
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

describe("X2 Queue", () => {
    test("dispatchNext claims pending and sends promptAsync", async () => {
        const store = createStore();
        const server = new FakeServer();
        const queue = new Queue(store, server as never, { maxRetries: 0 });

        queue.enqueue("hello");
        const terminal = await queue.dispatchNext();

        expect(terminal).toBeNull();
        const running = store.listTasks({ status: "running" });
        expect(running.length).toBe(1);
        expect(running[0]?.sessionId).toBeString();
        expect(server.promptCalls).toBe(1);

        store.close();
    });

    test("finalizeRunning completes task when session becomes idle", async () => {
        const store = createStore();
        const server = new FakeServer();
        const queue = new Queue(store, server as never, { maxRetries: 0 });

        queue.enqueue("return ok");
        await queue.dispatchNext();
        const running = store.listTasks({ status: "running" })[0];
        expect(running).toBeDefined();

        server.markIdle(running!.sessionId!);
        const terminal = await queue.finalizeRunning();

        expect(terminal).toBeDefined();
        expect(terminal?.status).toBe("completed");
        expect(terminal?.result).toContain("OK: return ok");
        expect(terminal?.result).toContain("Tokens:");
        expect(store.getStats().completed).toBe(1);

        store.close();
    });

    test("running timeout aborts session and marks failed when retries exhausted", async () => {
        const store = createStore();
        const server = new FakeServer();
        let now = 1_000;
        const queue = new Queue(store, server as never, {
            maxRetries: 0,
            runningTimeoutMs: 10,
            now: () => now,
        });

        queue.enqueue("long task");
        await queue.dispatchNext();
        const running = store.listTasks({ status: "running" })[0];
        expect(running).toBeDefined();
        expect(running?.sessionId).toBeString();
        store.updateTask(running!.id, { startedAt: 1_000 });

        now = 5_000; // timeout 초과
        const terminal = await queue.finalizeRunning();

        expect(terminal).toBeDefined();
        expect(terminal?.status).toBe("failed");
        expect(terminal?.error).toContain("timeout");
        expect(server.abortCalls).toBe(1);
        expect(store.getStats().failed).toBe(1);

        store.close();
    });

    test("dispatch failure retries once then fails", async () => {
        const store = createStore();
        const server = new FakeServer();
        server.throwOnPrompt = true;
        let now = 1_000;
        const queue = new Queue(store, server as never, {
            maxRetries: 1,
            retryBaseDelayMs: 500,
            retryMaxDelayMs: 500,
            now: () => now,
        });

        queue.enqueue("will fail");

        const first = await queue.dispatchNext();
        expect(first).toBeNull();
        const afterFirst = store.listTasks()[0];
        expect(afterFirst?.status).toBe("pending");
        expect(afterFirst?.attempts).toBe(1);
        expect(afterFirst?.retryAt).toBe(1_500);

        // backoff 이전에는 재시도 dispatch가 수행되지 않아야 함
        now = 1_200;
        const blocked = await queue.dispatchNext();
        expect(blocked).toBeNull();
        const stillPending = store.listTasks()[0];
        expect(stillPending?.status).toBe("pending");
        expect(stillPending?.attempts).toBe(1);

        now = 1_600;
        const second = await queue.dispatchNext();
        expect(second).toBeDefined();
        expect(second?.status).toBe("failed");
        expect(second?.attempts).toBe(2);
        expect(second?.error).toContain("promptAsync failed");

        store.close();
    });
});
