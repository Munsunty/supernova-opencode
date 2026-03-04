import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Interaction } from "../../src/x2/store";
import { Store } from "../../src/x2/store";
import type { InteractionEvaluation } from "../../src/x3/evaluator";
import { X4Router } from "../../src/x4/router";

class FakeEq1Client {
    outputs: Array<Record<string, unknown>> = [];
    routeCalls = 0;
    routeInputs: string[] = [];

    async route() {
        this.routeCalls += 1;
        const output = this.outputs.shift() ?? {};
        this.routeInputs.push(String(arguments[0] ?? ""));
        return {
            type: "route" as const,
            output,
            rawText: JSON.stringify(output),
            attempts: 1,
            provider: "mock",
            model: "mock-model",
            usage: null,
            latencyMs: 1,
        };
    }
}

class FakeSummarizerServer {
    runCalls = 0;
    lastPrompt = "";
    lastOptions: Record<string, unknown> | null = null;
    summaryText =
        "요청 의도: 테스트\n현재 상태: 처리 가능\n리스크: 낮음\n권장 액션: 진행";

    async run(prompt: string, options?: Record<string, unknown>) {
        this.runCalls += 1;
        this.lastPrompt = prompt;
        this.lastOptions = options ?? null;
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
                    text: this.summaryText,
                    synthetic: false,
                    ignored: false,
                },
            ],
        };
    }
}

const tempDirs: string[] = [];

function createStore(): Store {
    const dir = mkdtempSync(join(tmpdir(), "homsa-x4-"));
    tempDirs.push(dir);
    return new Store(join(dir, "state.db"));
}

function createInteraction(store: Store): Interaction {
    const upsert = store.upsertInteraction({
        type: "question",
        requestId: "q-1",
        sessionId: "ses-1",
        payload: JSON.stringify({ requestID: "q-1", text: "question text" }),
    });
    return upsert.interaction;
}

function createEvaluation(
    score: number,
    route: "auto" | "user",
): InteractionEvaluation {
    return {
        score,
        reason: "evaluation reason",
        route,
        reply: null,
        raw: {},
    };
}

afterEach(() => {
    while (tempDirs.length > 0) {
        const dir = tempDirs.pop();
        if (!dir) continue;
        rmSync(dir, { recursive: true, force: true });
    }
});

describe("X4Router", () => {
    test("creates omo_request task on new_task decision", async () => {
        const store = createStore();
        const eq1 = new FakeEq1Client();
        eq1.outputs.push({
            action: "new_task",
            prompt: "run follow-up task",
            reason: "needs additional action",
        });
        const router = new X4Router(store, eq1 as never);

        const result = await router.routeInteraction(
            createInteraction(store),
            createEvaluation(9, "user"),
        );

        expect(result.decision.action).toBe("new_task");
        expect(result.task).toBeDefined();
        expect(result.task?.type).toBe("omo_request");
        expect(result.task?.prompt).toBe("run follow-up task");
        expect(result.decision.request_hash).toBeDefined();
        expect(result.decision.parent_id).toBeDefined();
        const routeInput = JSON.parse(eq1.routeInputs[0]!) as {
            schema_version: string;
            request_hash: string;
            parent_id: string;
            summary: {
                schema_version: string;
                request_hash: string;
                parent_id: string;
            };
        };
        expect(routeInput.schema_version).toBe("x4_route_request.v1");
        expect(routeInput.summary.schema_version).toBe("x4_summary.v1");
        expect(routeInput.request_hash).toBe(routeInput.summary.request_hash);
        store.close();
    });

    test("creates report task on report decision", async () => {
        const store = createStore();
        const eq1 = new FakeEq1Client();
        eq1.outputs.push({
            action: "report",
            reason: "notify user",
        });
        const router = new X4Router(store, eq1 as never);

        const result = await router.routeInteraction(
            createInteraction(store),
            createEvaluation(9, "user"),
        );

        expect(result.decision.action).toBe("report");
        expect(result.task).toBeDefined();
        expect(result.task?.type).toBe("report");
        expect(result.task?.prompt).toContain("X4 report");
        store.close();
    });

    test("normalizes legacy action aliases and preserves request hash", async () => {
        const store = createStore();
        const eq1 = new FakeEq1Client();
        const interaction = createInteraction(store);
        eq1.outputs.push({
            action: "enqueue",
            request_hash: "forced-hash",
            parent_id: "forced-parent",
            route_reason: "follow-up",
        });
        const router = new X4Router(store, eq1 as never);

        const result = await router.routeInteraction(
            interaction,
            createEvaluation(9, "user"),
        );

        expect(result.decision.action).toBe("new_task");
        expect(result.decision.schema_version).toBe("x4_route_response.v1");
        expect(result.decision.request_hash).toBe("forced-hash");
        expect(result.decision.parent_id).toBe("forced-parent");
        expect(result.task).toBeDefined();
        expect(result.task?.type).toBe("omo_request");
        expect(result.task?.prompt).toContain("Follow-up task generated by X4");

        const requestInput = JSON.parse(eq1.routeInputs[0]!) as {
            request_hash: string;
            parent_id: string;
            summary: { request_hash: string; parent_id: string };
        };
        expect(requestInput.request_hash).toBe(
            requestInput.summary.request_hash,
        );
        expect(requestInput.summary.request_hash).not.toBe("forced-hash");
        expect(requestInput.summary.parent_id).toBe(requestInput.parent_id);

        store.close();
    });

    test("falls back to skip/report when route output is missing", async () => {
        const store = createStore();
        const eq1 = new FakeEq1Client();
        const router = new X4Router(store, eq1 as never);

        const lowRisk = await router.routeInteraction(
            createInteraction(store),
            createEvaluation(3, "auto"),
        );
        expect(lowRisk.decision.action).toBe("skip");
        expect(lowRisk.task).toBeNull();

        const highRisk = await router.routeInteraction(
            createInteraction(store),
            createEvaluation(9, "user"),
        );
        expect(highRisk.decision.action).toBe("report");
        expect(highRisk.task?.type).toBe("report");
        store.close();
    });

    test("uses summary request_hash and parent_id as fallback when response omits them", async () => {
        const store = createStore();
        const eq1 = new FakeEq1Client();
        const interaction = createInteraction(store);
        const router = new X4Router(store, eq1 as never);

        const result = await router.routeInteraction(
            interaction,
            createEvaluation(3, "auto"),
        );

        expect(result.decision.action).toBe("skip");
        expect(result.task).toBeNull();
        expect(result.decision.request_hash).toBeDefined();
        expect(result.decision.parent_id).toBeDefined();

        const requestInput = JSON.parse(eq1.routeInputs[0]!) as {
            request_hash: string;
            parent_id: string;
            summary: { request_hash: string; parent_id: string };
        };
        expect(result.decision.request_hash).toBe(
            requestInput.summary.request_hash,
        );
        expect(result.decision.parent_id).toBe(requestInput.summary.parent_id);
        expect(result.decision.request_hash).toBe(requestInput.request_hash);
        expect(result.decision.parent_id).toBe(requestInput.parent_id);

        store.close();
    });

    test("enriches route summary with x4 summarizer agent when configured", async () => {
        const store = createStore();
        const eq1 = new FakeEq1Client();
        const summaryServer = new FakeSummarizerServer();
        const router = new X4Router(store, eq1 as never, {
            server: summaryServer as never,
            summarizerAgent: "x4-summarizer",
        });

        const result = await router.routeInteraction(
            createInteraction(store),
            createEvaluation(3, "auto"),
        );

        expect(result.decision.action).toBe("skip");
        expect(summaryServer.runCalls).toBe(1);
        expect(summaryServer.lastOptions).toMatchObject({
            agent: "x4-summarizer",
            deleteAfter: true,
        });

        const requestInput = JSON.parse(eq1.routeInputs[0]!) as {
            summary: {
                llm_summary?: string;
                llm_summary_agent?: string;
            };
        };
        expect(requestInput.summary.llm_summary).toBe(
            summaryServer.summaryText,
        );
        expect(requestInput.summary.llm_summary_agent).toBe("x4-summarizer");

        store.close();
    });
});
