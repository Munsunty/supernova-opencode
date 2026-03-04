import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Queue } from "../../src/x2/queue";
import { Store } from "../../src/x2/store";
import { opencodeAgent } from "../../src/utils";

type FakeMessage = {
    info: {
        id: string;
        sessionID: string;
        role: "assistant" | "user";
        parentID?: string;
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
    public createSessionCalls = 0;
    public promptCalls = 0;
    public lastPromptArgs: Array<{
        sessionId: string;
        text: string;
        options?: {
            agent?: string;
            model?: {
                providerID: string;
                modelID: string;
            };
        };
    }> = [];
    public abortCalls = 0;
    public getMessagesCalls: Array<{
        sessionId: string;
        limit: number | null;
    }> = [];
    public getMessageCalls: Array<{
        sessionId: string;
        messageId: string;
    }> = [];
    public runCalls: Array<{
        prompt: string;
        options?: Record<string, unknown>;
    }> = [];
    public throwOnPrompt = false;
    public throwOnRun = false;
    public sessions = new Map<
        string,
        {
            status: "busy" | "idle";
            messages: FakeMessage[];
        }
    >();

    async createSession(title?: string) {
        this.createSessionCalls++;
        const id = `ses_test_${++this.seq}`;
        this.sessions.set(id, {
            status: "idle",
            messages: [
                {
                    info: {
                        id: `msg_user_boot_${id}`,
                        sessionID: id,
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

    async promptAsync(
        sessionId: string,
        text: string,
        options?: {
            agent?: string;
            model?: {
                providerID: string;
                modelID: string;
            };
        },
    ): Promise<void> {
        this.promptCalls++;
        this.lastPromptArgs.push({ sessionId, text, options });
        if (this.throwOnPrompt) {
            throw new Error("promptAsync failed");
        }
        const s = this.sessions.get(sessionId);
        if (!s) throw new Error(`session not found: ${sessionId}`);
        const userMessageId = `msg_user_${++this.seq}`;
        s.messages.push({
            info: {
                id: userMessageId,
                sessionID: sessionId,
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
                    text,
                    synthetic: false,
                    ignored: false,
                },
            ],
        });
        s.status = "busy";
        const assistantMessageId = `msg_assistant_${++this.seq}`;
        s.messages.push({
            info: {
                id: assistantMessageId,
                sessionID: sessionId,
                role: "assistant",
                parentID: userMessageId,
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

    async getMessages(sessionId: string, options?: { limit?: number }) {
        const s = this.sessions.get(sessionId);
        if (!s) throw new Error(`session not found: ${sessionId}`);
        const limit =
            typeof options?.limit === "number" &&
            Number.isFinite(options.limit) &&
            options.limit > 0
                ? Math.trunc(options.limit)
                : null;
        this.getMessagesCalls.push({
            sessionId,
            limit,
        });
        if (limit === null) return s.messages as unknown[];
        return s.messages.slice(-limit) as unknown[];
    }

    async getMessage(sessionId: string, messageId: string) {
        this.getMessageCalls.push({
            sessionId,
            messageId,
        });
        const s = this.sessions.get(sessionId);
        if (!s) throw new Error(`session not found: ${sessionId}`);
        const message = s.messages.find((item) => item.info.id === messageId);
        if (!message) throw new Error(`message not found: ${messageId}`);
        return message as unknown;
    }

    async run(prompt: string, options?: Record<string, unknown>) {
        this.runCalls.push({
            prompt,
            options,
        });
        if (this.throwOnRun) {
            throw new Error("run failed");
        }
        return {
            info: {
                role: "assistant",
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
                    text: "summarized by x2 agent",
                    synthetic: false,
                    ignored: false,
                },
            ],
        };
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

class FakeEq1Client {
    public runCalls = 0;
    public classifyCalls = 0;
    public throwOnRun = false;
    public throwOnClassify = false;
    public classifyOutput: Record<string, unknown> = {
        route: "simple",
        reason: "default-simple",
    };

    async run(request: {
        type: "classify" | "evaluate" | "summarize" | "route";
        input: string;
        context?: Record<string, unknown>;
    }) {
        this.runCalls++;
        if (this.throwOnRun) {
            throw new Error("eq1 run failed");
        }

        return {
            type: request.type,
            output: {
                action: "auto",
                reason: `handled: ${request.input}`,
            },
            rawText: JSON.stringify({ action: "auto" }),
            attempts: 1,
            provider: "mock-eq1",
            model: "mock-model",
            usage: null,
            latencyMs: 1,
        };
    }

    async classify(
        _input: string,
        _context?: Record<string, unknown>,
    ): Promise<{
        type: "classify";
        output: Record<string, unknown>;
        rawText: string;
        attempts: number;
        provider: string;
        model: string | null;
        usage: null;
        latencyMs: number;
    }> {
        this.classifyCalls++;
        if (this.throwOnClassify) {
            throw new Error("eq1 classify failed");
        }
        return {
            type: "classify",
            output: this.classifyOutput,
            rawText: JSON.stringify(this.classifyOutput),
            attempts: 1,
            provider: "mock-eq1",
            model: "mock-model",
            usage: null,
            latencyMs: 1,
        };
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
    test("dispatchNext completes Eq1 task and stores JSON result", async () => {
        const store = createStore();
        const server = new FakeServer();
        const eq1Client = new FakeEq1Client();
        const queue = new Queue(store, server as never, {
            maxRetries: 0,
            eq1Client: eq1Client as never,
        });

        queue.enqueue("classify this", "eq1", "classify");
        const terminal = await queue.dispatchNext();

        expect(terminal).toBeDefined();
        expect(terminal?.status).toBe("completed");
        expect(terminal?.type).toBe("classify");
        expect(server.promptCalls).toBe(0);
        expect(eq1Client.runCalls).toBe(1);
        expect(terminal?.result).toBeString();

        const parsed = JSON.parse(terminal!.result!);
        expect(parsed.schema_version).toBe("eq1_result.v1");
        expect(parsed.request_hash).toBeString();
        expect(parsed.request_hash.length).toBe(64);
        expect(parsed.type).toBe("classify");
        expect(parsed.output.action).toBe("auto");
        expect(store.getStats().completed).toBe(1);

        store.close();
    });

    test("Eq1 task fails when eq1Client is not configured", async () => {
        const store = createStore();
        const server = new FakeServer();
        const queue = new Queue(store, server as never, {
            maxRetries: 0,
        });

        queue.enqueue("classify this", "eq1", "classify");
        const terminal = await queue.dispatchNext();

        expect(terminal).toBeDefined();
        expect(terminal?.status).toBe("failed");
        expect(terminal?.error).toContain("eq1Client is not configured");

        store.close();
    });

    test("report task completes without X_oc dispatch", async () => {
        const store = createStore();
        const server = new FakeServer();
        const eq1Client = new FakeEq1Client();
        const queue = new Queue(store, server as never, {
            maxRetries: 0,
            eq1Client: eq1Client as never,
        });

        queue.enqueue("report payload", "x4", "report");
        const terminal = await queue.dispatchNext();

        expect(terminal).toBeDefined();
        expect(terminal?.status).toBe("completed");
        expect(terminal?.type).toBe("report");
        expect(terminal?.result).toBe("report payload");
        expect(server.promptCalls).toBe(0);
        expect(eq1Client.runCalls).toBe(0);
        store.close();
    });

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

    test("dispatchNext sends agent+model bypass options for omo_request", async () => {
        const store = createStore();
        const server = new FakeServer();
        const queue = new Queue(store, server as never, {
            maxRetries: 0,
            bypassAgent: "spark",
            x2Dispatcher: opencodeAgent.X2_dispatcher(
                "openai/GPT-5.3-Codex-Spark",
            ),
        });

        queue.enqueue("spark path");
        await queue.dispatchNext();

        expect(server.promptCalls).toBe(1);
        expect(server.lastPromptArgs).toHaveLength(1);
        expect(server.lastPromptArgs[0]).toMatchObject({
            options: {
                agent: "spark",
                model: {
                    providerID: "openai",
                    modelID: "GPT-5.3-Codex-Spark",
                },
            },
        });

        store.close();
    });

    test("dispatchNext sends only agent when bypassModel is omitted", async () => {
        const store = createStore();
        const server = new FakeServer();
        const queue = new Queue(store, server as never, {
            maxRetries: 0,
            bypassAgent: "spark",
            x2Dispatcher: opencodeAgent.X2_dispatcher(null),
        });

        queue.enqueue("spark path");
        await queue.dispatchNext();

        expect(server.promptCalls).toBe(1);
        expect(server.lastPromptArgs).toHaveLength(1);
        expect(server.lastPromptArgs[0]).toMatchObject({
            options: {
                agent: "spark",
            },
        });
        expect(server.lastPromptArgs[0].options).not.toHaveProperty("model");

        store.close();
    });

    test("dispatchNext routes simple prompt to spark in auto mode", async () => {
        const store = createStore();
        const server = new FakeServer();
        const queue = new Queue(store, server as never, {
            maxRetries: 0,
            agentRoutingMode: "auto",
            simpleAgent: "spark",
            complexAgent: "sisyphus",
        });

        queue.enqueue("간단히 상태 알려줘");
        await queue.dispatchNext();

        expect(server.promptCalls).toBe(1);
        expect(server.lastPromptArgs[0]).toMatchObject({
            options: {
                agent: "spark",
            },
        });
        const running = store.listTasks({ status: "running", limit: 1 })[0];
        expect(running?.runAgent).toBe("spark");

        store.close();
    });

    test("dispatchNext routes complex/risk prompt to sisyphus in auto mode", async () => {
        const store = createStore();
        const server = new FakeServer();
        const queue = new Queue(store, server as never, {
            maxRetries: 0,
            agentRoutingMode: "auto",
            simpleAgent: "spark",
            complexAgent: "sisyphus",
        });

        queue.enqueue(
            "이번 변경은 리스크가 크니 롤백 계획까지 포함해 설계해줘",
        );
        await queue.dispatchNext();

        expect(server.promptCalls).toBe(1);
        expect(server.lastPromptArgs[0]).toMatchObject({
            options: {
                agent: "sisyphus",
            },
        });
        const running = store.listTasks({ status: "running", limit: 1 })[0];
        expect(running?.runAgent).toBe("sisyphus");

        store.close();
    });

    test("dispatchNext prefers eq1 routing decision in auto mode", async () => {
        const store = createStore();
        const server = new FakeServer();
        const eq1Client = new FakeEq1Client();
        eq1Client.classifyOutput = {
            route: "complex",
            reason: "eq1-risk",
        };
        const queue = new Queue(store, server as never, {
            maxRetries: 0,
            agentRoutingMode: "auto",
            simpleAgent: "spark",
            complexAgent: "sisyphus",
            eq1Client: eq1Client as never,
        });

        // 휴리스틱만 보면 simple이지만, eq1 판정을 우선 사용한다.
        queue.enqueue("짧게 답해줘");
        await queue.dispatchNext();

        expect(eq1Client.classifyCalls).toBe(1);
        expect(server.promptCalls).toBe(1);
        expect(server.lastPromptArgs[0]).toMatchObject({
            options: {
                agent: "sisyphus",
            },
        });

        store.close();
    });

    test("dispatchNext falls back to heuristic when eq1 routing output is invalid", async () => {
        const store = createStore();
        const server = new FakeServer();
        const eq1Client = new FakeEq1Client();
        eq1Client.classifyOutput = {
            unknown: "value",
        };
        const queue = new Queue(store, server as never, {
            maxRetries: 0,
            agentRoutingMode: "auto",
            simpleAgent: "spark",
            complexAgent: "sisyphus",
            eq1Client: eq1Client as never,
        });

        queue.enqueue("이번 변경은 리스크가 있어");
        await queue.dispatchNext();

        expect(eq1Client.classifyCalls).toBe(1);
        expect(server.promptCalls).toBe(1);
        expect(server.lastPromptArgs[0]).toMatchObject({
            options: {
                agent: "sisyphus",
            },
        });

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
        expect(terminal?.rawResult).toContain("OK: return ok");
        expect(terminal?.result).toContain("OK: return ok");
        expect(terminal?.result).toContain("Tokens:");
        expect(store.getStats().completed).toBe(1);
        expect(server.getMessagesCalls.length).toBe(1);
        expect(server.getMessagesCalls[0]).toMatchObject({
            sessionId: running!.sessionId!,
            limit: 40,
        });

        store.close();
    });

    test("event ingest binds message ids and finalizeRunning prefers getMessage", async () => {
        const store = createStore();
        const server = new FakeServer();
        const queue = new Queue(store, server as never, { maxRetries: 0 });

        queue.enqueue("track ids");
        await queue.dispatchNext();
        const running = store.listTasks({ status: "running" })[0];
        expect(running).toBeDefined();
        const session = server.sessions.get(running!.sessionId!);
        expect(session).toBeDefined();

        const latestAssistant = [...session!.messages]
            .reverse()
            .find((message) => message.info.role === "assistant");
        expect(latestAssistant).toBeDefined();

        const eventBound = queue.ingestEvent({
            type: "message.updated",
            properties: {
                info: {
                    id: latestAssistant!.info.id,
                    sessionID: running!.sessionId,
                    role: "assistant",
                    parentID: latestAssistant!.info.parentID,
                    time: {
                        created: latestAssistant!.info.time.created,
                    },
                },
            },
        });
        expect(eventBound).toBe(true);

        const tracked = store.getTask(running!.id);
        expect(tracked?.assistantMessageId).toBe(latestAssistant!.info.id);
        expect(tracked?.requestMessageId).toBe(latestAssistant!.info.parentID);

        server.markIdle(running!.sessionId!);
        const terminal = await queue.finalizeRunning();
        expect(terminal?.status).toBe("completed");
        expect(server.getMessageCalls.length).toBe(1);
        expect(server.getMessageCalls[0]).toMatchObject({
            sessionId: running!.sessionId!,
            messageId: latestAssistant!.info.id,
        });
        expect(server.getMessagesCalls.length).toBe(0);

        store.close();
    });

    test("finalizeRunning waits indefinitely while session is busy (no timeout)", async () => {
        const store = createStore();
        const server = new FakeServer();
        let now = 1_000;
        const queue = new Queue(store, server as never, {
            maxRetries: 0,
            now: () => now,
        });

        queue.enqueue("long task");
        await queue.dispatchNext();
        const running = store.listTasks({ status: "running" })[0];
        expect(running).toBeDefined();
        expect(running?.sessionId).toBeString();

        // 10분 경과해도 busy면 null 반환 (대기 계속)
        now = 600_000;
        const result = await queue.finalizeRunning();
        expect(result).toBeNull();
        expect(server.abortCalls).toBe(0);
        expect(store.getStats().running).toBe(1);

        // idle이 되면 완료 처리
        server.markIdle(running!.sessionId!);
        const terminal = await queue.finalizeRunning();
        expect(terminal).toBeDefined();
        expect(terminal?.status).toBe("completed");

        store.close();
    });

    test("dispatchNext reuses latest session for same source", async () => {
        const store = createStore();
        const server = new FakeServer();
        const queue = new Queue(store, server as never, { maxRetries: 0 });

        const source = "x1_telegram_task#chat:88";
        queue.enqueue("first", source, "omo_request");
        queue.enqueue("second", source, "omo_request");

        await queue.dispatchNext();
        const firstRunning = store.listTasks({ status: "running" })[0];
        expect(firstRunning).toBeDefined();
        expect(firstRunning?.sessionId).toBeString();

        server.markIdle(firstRunning!.sessionId!);
        const firstTerminal = await queue.finalizeRunning();
        expect(firstTerminal?.status).toBe("completed");

        await queue.dispatchNext();
        const secondRunning = store.listTasks({
            status: "running",
            limit: 1,
        })[0];
        expect(secondRunning).toBeDefined();
        expect(secondRunning?.sessionId).toBe(firstRunning?.sessionId);
        expect(server.createSessionCalls).toBe(1);

        store.close();
    });

    test("dispatchNext does not reuse session for non-telegram source", async () => {
        const store = createStore();
        const server = new FakeServer();
        const queue = new Queue(store, server as never, { maxRetries: 0 });

        queue.enqueue("first", "cli", "omo_request");
        queue.enqueue("second", "cli", "omo_request");

        await queue.dispatchNext();
        const firstRunning = store.listTasks({ status: "running" })[0];
        expect(firstRunning).toBeDefined();
        expect(firstRunning?.sessionId).toBeString();

        server.markIdle(firstRunning!.sessionId!);
        const firstTerminal = await queue.finalizeRunning();
        expect(firstTerminal?.status).toBe("completed");

        await queue.dispatchNext();
        const secondRunning = store.listTasks({
            status: "running",
            limit: 1,
        })[0];
        expect(secondRunning).toBeDefined();
        expect(secondRunning?.sessionId).not.toBe(firstRunning?.sessionId);
        expect(server.createSessionCalls).toBe(2);

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

    test("finalizeRunning uses x2 summarizer agent output when configured", async () => {
        const store = createStore();
        const server = new FakeServer();
        const queue = new Queue(store, server as never, {
            maxRetries: 0,
            summarizerAgent: "x2-summarizer",
        });

        queue.enqueue("summarize me");
        await queue.dispatchNext();
        const running = store.listTasks({ status: "running" })[0];
        expect(running).toBeDefined();
        server.markIdle(running!.sessionId!);

        const terminal = await queue.finalizeRunning();
        expect(terminal?.status).toBe("completed");
        expect(terminal?.rawResult).toContain("OK: summarize me");
        expect(terminal?.result).toBe("summarized by x2 agent");
        expect(terminal?.summaryAgent).toBe("x2-summarizer");
        expect(terminal?.summaryModel).toBeNull();
        expect(server.runCalls.length).toBe(1);
        expect(server.runCalls[0]?.options).toMatchObject({
            agent: "x2-summarizer",
            deleteAfter: true,
        });

        store.close();
    });
});
