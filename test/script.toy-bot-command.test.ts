import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "../.devserver/x2/store";
import { Queue } from "../.devserver/x2/queue";

const tempDirs: string[] = [];

function createStore(): Store {
    const dir = mkdtempSync(join(tmpdir(), "homsa-cmd-"));
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

class FakeServer {
    public promptCalls = 0;
    public lastSessionId: string | null = null;
    public sessions = new Map<string, { status: "busy" | "idle" }>();
    private seq = 0;

    async createSession(title?: string) {
        const id = `ses_new_${++this.seq}`;
        this.sessions.set(id, { status: "idle" });
        return { id };
    }

    async promptAsync(sessionId: string, text: string): Promise<void> {
        this.promptCalls++;
        this.lastSessionId = sessionId;
        const s = this.sessions.get(sessionId);
        if (s) s.status = "busy";
    }

    async getSessionStatuses(): Promise<Record<string, { type: string }>> {
        const out: Record<string, { type: string }> = {};
        for (const [id, s] of this.sessions.entries()) {
            out[id] = { type: s.status };
        }
        return out;
    }

    async getMessages() {
        return [];
    }

    async abortSession() {
        return true;
    }
}

describe("sessionId 전달", () => {
    test("Store.createTask에 sessionId를 지정하면 task에 반영된다", () => {
        const store = createStore();
        const task = store.createTask(
            "test prompt",
            "toy_bot",
            "omo_request",
            "ses_existing_123",
        );

        expect(task.sessionId).toBe("ses_existing_123");
        expect(task.status).toBe("pending");
        expect(task.source).toBe("toy_bot");

        const fetched = store.getTask(task.id);
        expect(fetched?.sessionId).toBe("ses_existing_123");
        store.close();
    });

    test("sessionId 없이 createTask하면 null이다", () => {
        const store = createStore();
        const task = store.createTask("test prompt", "cli", "omo_request");
        expect(task.sessionId).toBeNull();
        store.close();
    });

    test("Queue.enqueue에 sessionId를 전달하면 task에 반영된다", () => {
        const store = createStore();
        const server = new FakeServer();
        const queue = new Queue(store, server as never, { maxRetries: 0 });

        const task = queue.enqueue(
            "test prompt",
            "toy_bot",
            "omo_request",
            "ses_existing_456",
        );

        expect(task.sessionId).toBe("ses_existing_456");
        store.close();
    });

    test("dispatchNext가 기존 sessionId를 재사용하고 새 세션을 만들지 않는다", async () => {
        const store = createStore();
        const server = new FakeServer();
        // 기존 세션을 서버에 등록
        server.sessions.set("ses_existing_789", { status: "idle" });

        const queue = new Queue(store, server as never, { maxRetries: 0 });
        queue.enqueue("continue work", "toy_bot", "omo_request", "ses_existing_789");

        await queue.dispatchNext();

        // 기존 세션으로 prompt가 전송됨
        expect(server.promptCalls).toBe(1);
        expect(server.lastSessionId).toBe("ses_existing_789");
        // 새 세션이 생성되지 않음
        expect(server.sessions.size).toBe(1);

        const running = store.listTasks({ status: "running" })[0];
        expect(running?.sessionId).toBe("ses_existing_789");

        store.close();
    });

    test("sessionId 없는 task는 새 세션을 생성한다", async () => {
        const store = createStore();
        const server = new FakeServer();
        const queue = new Queue(store, server as never, { maxRetries: 0 });

        queue.enqueue("new work", "cli", "omo_request");
        await queue.dispatchNext();

        expect(server.promptCalls).toBe(1);
        expect(server.lastSessionId).toMatch(/^ses_new_/);
        expect(server.sessions.size).toBe(1);

        store.close();
    });
});
