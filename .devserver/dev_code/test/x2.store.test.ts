import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "../../src/x2/store";

const tempDirs: string[] = [];

function createStore(): Store {
    const dir = mkdtempSync(join(tmpdir(), "homsa-store-"));
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

describe("X2 Store", () => {
    test("createTask persists task type and list filter by type", () => {
        const store = createStore();
        store.createTask("xoc", "cli", "omo_request");
        const t2 = store.createTask("classify me", "eq1", "classify");

        const eq1Only = store.listTasks({ type: "classify" });
        expect(eq1Only.length).toBe(1);
        expect(eq1Only[0]?.id).toBe(t2.id);
        expect(eq1Only[0]?.type).toBe("classify");
        expect(eq1Only[0]?.rawResult).toBeNull();
        expect(eq1Only[0]?.runAgent).toBeNull();
        expect(eq1Only[0]?.runModel).toBeNull();
        expect(eq1Only[0]?.summaryAgent).toBeNull();
        expect(eq1Only[0]?.summaryModel).toBeNull();

        store.close();
    });

    test("claimNextPending atomically moves pending -> running", () => {
        const store = createStore();
        const t1 = store.createTask("a");
        store.createTask("b");

        const claimed = store.claimNextPending();
        expect(claimed?.id).toBe(t1.id);
        expect(claimed?.status).toBe("running");

        const stats = store.getStats();
        expect(stats.pending).toBe(1);
        expect(stats.running).toBe(1);

        store.close();
    });

    test("recoverRunningTasks marks stale running task as failed", () => {
        const store = createStore();
        const task = store.createTask("recover me");
        store.updateTask(task.id, { status: "running", startedAt: Date.now() });

        const recovered = store.recoverRunningTasks("failed", "interrupted");
        expect(recovered).toBe(1);

        const updated = store.getTask(task.id);
        expect(updated?.status).toBe("failed");
        expect(updated?.error).toContain("interrupted");
        expect(updated?.completedAt).toBeNumber();

        store.close();
    });

    test("claimNextPending skips pending tasks with future retryAt", () => {
        const store = createStore();
        const t1 = store.createTask("future");
        const t2 = store.createTask("now");

        store.updateTask(t1.id, { retryAt: 10_000 });
        store.updateTask(t2.id, { retryAt: null });

        const claimed = store.claimNextPending(1_000);
        expect(claimed?.id).toBe(t2.id);
        expect(claimed?.status).toBe("running");

        const t1Latest = store.getTask(t1.id);
        expect(t1Latest?.status).toBe("pending");
        expect(t1Latest?.retryAt).toBe(10_000);

        store.close();
    });

    test("upsertInteraction stores external observe-only interaction", () => {
        const store = createStore();
        const result = store.upsertInteraction({
            type: "permission",
            requestId: "perm-ext",
            sessionId: "ses-ext",
            origin: "external",
            status: "observed",
            payload: JSON.stringify({ requestID: "perm-ext" }),
        });

        expect(result.created).toBe(true);
        expect(result.interaction.origin).toBe("external");
        expect(result.interaction.status).toBe("observed");

        const stats = store.getInteractionStats();
        expect(stats.pending).toBe(0);
        expect(stats.observed).toBe(1);
        expect(stats.answered).toBe(0);
        expect(stats.rejected).toBe(0);

        store.close();
    });

    test("upsertInteraction upgrades legacy unknown pending to external observed", () => {
        const store = createStore();
        const first = store.upsertInteraction({
            type: "question",
            requestId: "q-legacy",
            sessionId: "ses-legacy",
            payload: JSON.stringify({ requestID: "q-legacy" }),
        });
        expect(first.created).toBe(true);
        expect(first.interaction.origin).toBe("unknown");
        expect(first.interaction.status).toBe("pending");

        const second = store.upsertInteraction({
            type: "question",
            requestId: "q-legacy",
            sessionId: "ses-legacy",
            origin: "external",
            status: "observed",
            payload: JSON.stringify({ requestID: "q-legacy" }),
        });
        expect(second.created).toBe(false);
        expect(second.interaction.origin).toBe("external");
        expect(second.interaction.status).toBe("observed");

        store.close();
    });

    test("getTaskSourceBySessionId returns latest source and handles missing session", () => {
        const store = createStore();
        store.createTask("first", "x1_telegram#chat:101", "omo_request", "s-1");
        store.createTask("second", "x4#chat:202", "report", "s-1");

        const latest = store.getTaskSourceBySessionId("s-1");
        expect(latest).toBe("x4#chat:202");
        expect(store.getTaskSourceBySessionId("missing")).toBeNull();
        expect(store.getTaskSourceBySessionId("   ")).toBeNull();

        store.close();
    });

    test("upsertInteraction preserves joshua_decision type", () => {
        const store = createStore();
        const created = store.upsertInteraction({
            type: "joshua_decision",
            requestId: "jd-type-1",
            sessionId: "ses-jd",
            payload: JSON.stringify({ requestID: "jd-type-1" }),
        });

        expect(created.interaction.type).toBe("joshua_decision");
        const fetched = store.getInteractionByRequest(
            "joshua_decision",
            "jd-type-1",
        );
        expect(fetched?.type).toBe("joshua_decision");

        store.close();
    });
});
