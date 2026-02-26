import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Interaction } from "../.devserver/x2/store";
import { Store } from "../.devserver/x2/store";
import type { InteractionEvaluation } from "../.devserver/x3/evaluator";
import { X4Router } from "../.devserver/x4/router";

class FakeEq1Client {
    outputs: Array<Record<string, unknown>> = [];
    routeCalls = 0;

    async route() {
        this.routeCalls += 1;
        const output = this.outputs.shift() ?? {};
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

function createEvaluation(score: number, route: "auto" | "user"): InteractionEvaluation {
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
});
