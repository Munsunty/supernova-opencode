import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { InteractionDetector } from "../../src/x3/detector";
import { Store } from "../../src/x2/store";

class FakeInteractionServer {
    permissions: unknown[] = [];
    questions: unknown[] = [];

    async listPermissions(): Promise<unknown[]> {
        return this.permissions;
    }

    async listQuestions(): Promise<unknown[]> {
        return this.questions;
    }
}

const tempDirs: string[] = [];

function createStore(): Store {
    const dir = mkdtempSync(join(tmpdir(), "homsa-x3-"));
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

describe("X3 InteractionDetector", () => {
    test("pollOnce enqueues permission/question interactions", async () => {
        const store = createStore();
        const server = new FakeInteractionServer();
        const detector = new InteractionDetector(store, server);

        server.permissions = [
            {
                requestID: "perm-1",
                sessionID: "ses-1",
                tool: "edit",
            },
        ];
        server.questions = [
            {
                requestID: "q-1",
                sessionID: "ses-2",
                question: "continue?",
            },
        ];

        const stats = await detector.pollOnce();
        expect(stats.seen).toBe(2);
        expect(stats.enqueued).toBe(2);
        expect(stats.duplicate).toBe(0);
        expect(stats.invalid).toBe(0);

        const pending = store.listInteractions({ status: "pending" });
        expect(pending.length).toBe(2);
        expect(pending[0]?.type).toBe("permission");
        expect(pending[0]?.requestId).toBe("perm-1");
        expect(pending[1]?.type).toBe("question");
        expect(pending[1]?.requestId).toBe("q-1");

        const queueStats = store.getInteractionStats();
        expect(queueStats.pending).toBe(2);
        expect(queueStats.answered).toBe(0);
        expect(queueStats.rejected).toBe(0);
        store.close();
    });

    test("pollOnce deduplicates already seen request ids", async () => {
        const store = createStore();
        const server = new FakeInteractionServer();
        const detector = new InteractionDetector(store, server);

        server.permissions = [
            { requestID: "perm-1", sessionID: "ses-1", action: "read" },
        ];
        server.questions = [
            { requestID: "q-1", sessionID: "ses-2", text: "?" },
        ];

        const first = await detector.pollOnce();
        const second = await detector.pollOnce();

        expect(first.enqueued).toBe(2);
        expect(second.enqueued).toBe(0);
        expect(second.duplicate).toBe(2);
        expect(second.invalid).toBe(0);

        const all = store.listInteractions();
        expect(all.length).toBe(2);
        store.close();
    });

    test("pollOnce counts invalid payloads without request id", async () => {
        const store = createStore();
        const server = new FakeInteractionServer();
        const detector = new InteractionDetector(store, server);

        server.permissions = [{ sessionID: "ses-1" }];
        server.questions = [42];

        const stats = await detector.pollOnce();
        expect(stats.seen).toBe(2);
        expect(stats.enqueued).toBe(0);
        expect(stats.duplicate).toBe(0);
        expect(stats.invalid).toBe(2);

        const all = store.listInteractions();
        expect(all.length).toBe(0);
        store.close();
    });

    test("pollOnce emits interaction_poll metric event with captured counters", async () => {
        const store = createStore();
        const server = new FakeInteractionServer();
        const detector = new InteractionDetector(store, server);

        server.permissions = [{ requestID: "perm-1", sessionID: "ses-1" }];
        server.questions = [{ requestID: "q-1", sessionID: "ses-2" }];

        const stats = await detector.pollOnce();
        expect(stats.seen).toBe(2);
        expect(stats.enqueued).toBe(2);

        const events = store.listMetricEvents({
            eventType: "interaction_poll",
        });
        expect(events.length).toBe(1);
        expect(events[0]).toBeDefined();
        expect(events[0]!.source).toBe("x3_worker");
        expect(events[0]!.status).toBe("healthy");
        expect(events[0]!.reason).toBe("poll_done");
        expect(events[0]!.fromState).toBeNull();
        expect(events[0]!.toState).toBeNull();
        expect(events[0]!.traceId).toStartWith("x3_detector_");
        expect(events[0]!.interactionId).toBeNull();
        expect(events[0]!.payload).toBeString();

        const payload = JSON.parse(events[0]!.payload!);
        expect(payload.source).toBe("x3_detector");
        expect(payload.seen).toBe(2);
        expect(payload.enqueued).toBe(2);
        expect(payload.type).toBe("poll_once");

        store.close();
    });
});
