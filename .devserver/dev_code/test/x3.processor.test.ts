import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { InteractionEvaluator } from "../../src/x3/evaluator";
import { InteractionProcessor } from "../../src/x3/processor";
import { InteractionResponder } from "../../src/x3/responder";
import { Store } from "../../src/x2/store";
import { encodeTelegramTaskSource } from "../../src/utils/telegram-source";

class FakeEq1Client {
    outputs: Array<Record<string, unknown>> = [];
    evaluateCalls = 0;

    async evaluate() {
        this.evaluateCalls += 1;
        const output = this.outputs.shift() ?? { score: 10, reason: "default" };
        return {
            type: "evaluate" as const,
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

class FakeInteractionServer {
    replyPermissionCalls = 0;
    replyQuestionCalls = 0;
    throwOnPermissionReply = false;

    async replyPermission(): Promise<boolean> {
        this.replyPermissionCalls += 1;
        if (this.throwOnPermissionReply) {
            throw new Error("permission reply failed");
        }
        return true;
    }

    async replyQuestion(): Promise<boolean> {
        this.replyQuestionCalls += 1;
        return true;
    }
}

const tempDirs: string[] = [];

function createStore(): Store {
    const dir = mkdtempSync(join(tmpdir(), "homsa-x3p-"));
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

describe("X3 processor (evaluator + responder)", () => {
    test("auto route replies permission and marks answered", async () => {
        const store = createStore();
        const eq1 = new FakeEq1Client();
        const server = new FakeInteractionServer();
        eq1.outputs.push({
            score: 2,
            reason: "safe action",
            route: "auto",
            reply: "approved",
        });

        store.upsertInteraction({
            type: "permission",
            requestId: "perm-1",
            sessionId: "ses-1",
            payload: JSON.stringify({ requestID: "perm-1" }),
        });

        const evaluator = new InteractionEvaluator(eq1 as never);
        const responder = new InteractionResponder(store, server as never);
        const processor = new InteractionProcessor(store, evaluator, responder);

        const processed = await processor.processNext();
        expect(processed).toBeDefined();
        expect(processed?.route).toBe("auto");
        expect(server.replyPermissionCalls).toBe(1);
        expect(server.replyQuestionCalls).toBe(0);
        expect(store.listInteractions({ status: "pending" }).length).toBe(0);
        const answered = store.listInteractions({ status: "answered" });
        expect(answered.length).toBe(1);
        const answerPayload = JSON.parse(answered[0]!.answer!);
        expect(answerPayload.schema_version).toBe("x3_interaction_result.v1");
        expect(answerPayload.source).toBe("w4");
        expect(answerPayload.route).toBe("auto");
        expect(answerPayload.evaluation.score).toBe(2);
        expect(store.listTasks({ type: "report" }).length).toBe(0);
        store.close();
    });

    test("user route creates report task and marks answered", async () => {
        const store = createStore();
        const eq1 = new FakeEq1Client();
        const server = new FakeInteractionServer();
        eq1.outputs.push({
            score: 9,
            reason: "needs human review",
            route: "user",
        });

        store.upsertInteraction({
            type: "question",
            requestId: "q-1",
            sessionId: "ses-2",
            payload: JSON.stringify({ requestID: "q-1" }),
        });

        const evaluator = new InteractionEvaluator(eq1 as never);
        const responder = new InteractionResponder(store, server as never);
        const processor = new InteractionProcessor(store, evaluator, responder);

        const processed = await processor.processNext();
        expect(processed).toBeDefined();
        expect(processed?.route).toBe("user");
        expect(processed?.reportTask).toBeDefined();
        expect(server.replyPermissionCalls).toBe(0);
        expect(server.replyQuestionCalls).toBe(0);
        expect(store.listTasks({ type: "report" }).length).toBe(1);
        const answered = store.listInteractions({ status: "answered" });
        expect(answered.length).toBe(1);
        const answerPayload = JSON.parse(answered[0]!.answer!);
        expect(answerPayload.schema_version).toBe("x3_interaction_result.v1");
        expect(answerPayload.source).toBe("w4");
        expect(answerPayload.route).toBe("user");
        expect(answerPayload.report_task_id).toBe(processed?.reportTask?.id);
        store.close();
    });

    test("user route fallback propagates telegram chat id when x4Router is missing", async () => {
        const store = createStore();
        const eq1 = new FakeEq1Client();
        const server = new FakeInteractionServer();
        eq1.outputs.push({
            score: 9,
            reason: "needs human review",
            route: "user",
        });
        store.createTask(
            "seed task",
            encodeTelegramTaskSource("x1_telegram", "555"),
            "omo_request",
            "ses-2-chat",
        );
        store.upsertInteraction({
            type: "question",
            requestId: "q-2-chat",
            sessionId: "ses-2-chat",
            payload: JSON.stringify({ requestID: "q-2-chat" }),
        });

        const evaluator = new InteractionEvaluator(eq1 as never);
        const responder = new InteractionResponder(store, server as never);
        const processor = new InteractionProcessor(store, evaluator, responder);

        const processed = await processor.processNext();
        expect(processed).toBeDefined();
        expect(processed?.route).toBe("user");
        expect(processed?.reportTask?.source).toBe("x3#chat:555");
        expect(processed?.reportTask?.sessionId).toBe("ses-2-chat");

        store.close();
    });

    test("auto route failure marks interaction rejected", async () => {
        const store = createStore();
        const eq1 = new FakeEq1Client();
        const server = new FakeInteractionServer();
        server.throwOnPermissionReply = true;
        eq1.outputs.push({
            score: 1,
            reason: "safe action",
            route: "auto",
        });

        store.upsertInteraction({
            type: "permission",
            requestId: "perm-2",
            sessionId: "ses-3",
            payload: JSON.stringify({ requestID: "perm-2" }),
        });

        const evaluator = new InteractionEvaluator(eq1 as never);
        const responder = new InteractionResponder(store, server as never);
        const processor = new InteractionProcessor(store, evaluator, responder);

        const processed = await processor.processNext();
        expect(processed).toBeDefined();
        expect(processed?.route).toBe("auto");
        expect(server.replyPermissionCalls).toBe(1);
        const rejected = store.listInteractions({ status: "rejected" });
        expect(rejected.length).toBe(1);
        const answerPayload = JSON.parse(rejected[0]!.answer!);
        expect(answerPayload.schema_version).toBe("x3_interaction_result.v1");
        expect(answerPayload.source).toBe("w4");
        expect(answerPayload.route).toBe("auto");
        expect(answerPayload.error).toContain("permission reply failed");
        store.close();
    });

    test("records interaction processing and transition metrics", async () => {
        const store = createStore();
        const eq1 = new FakeEq1Client();
        const server = new FakeInteractionServer();
        eq1.outputs.push({
            score: 2,
            reason: "safe action",
            route: "auto",
            reply: "approved",
        });

        const created = store.upsertInteraction({
            type: "permission",
            requestId: "perm-3",
            sessionId: "ses-4",
            payload: JSON.stringify({ requestID: "perm-3" }),
        });

        const evaluator = new InteractionEvaluator(eq1 as never);
        const responder = new InteractionResponder(store, server as never);
        const processor = new InteractionProcessor(store, evaluator, responder);

        const processed = await processor.processNext();
        expect(processed).toBeDefined();
        expect(processed?.route).toBe("auto");

        const events = store.listMetricEvents({
            interactionId: created.interaction.id,
        });
        expect(events.length).toBeGreaterThanOrEqual(2);

        const processing = events.find(
            (event) => event.eventType === "interaction_processing",
        );
        const transitions = events.filter(
            (event) => event.eventType === "interaction_state_transition",
        );
        expect(processing).toBeDefined();
        expect(transitions).toHaveLength(2);
        expect(transitions[0]?.reason).toBe("respond_auto");
        expect(
            transitions.some(
                (event) => event.reason === "interaction_auto_replied",
            ),
        ).toBe(true);

        expect(processing?.interactionId).toBe(created.interaction.id);
        expect(processing?.reason).toBe("processing_started");
        expect(processing?.fromState).toBe("pending");
        expect(processing?.toState).toBe("pending");

        const transition = transitions.find(
            (event) => event.reason === "respond_auto",
        );
        expect(transition?.interactionId).toBe(created.interaction.id);
        expect(transition?.fromState).toBe("pending");
        expect(transition?.toState).toBe("answered");
        const payload = JSON.parse(transition!.payload!);
        expect(payload.route).toBe("auto");
        expect(payload.source).toBe("x3_processor");
        expect(transition?.backlog).toBe(0);

        store.close();
    });

    test("processNext skips external pending interactions and handles managed first", async () => {
        const store = createStore();
        const eq1 = new FakeEq1Client();
        const server = new FakeInteractionServer();
        eq1.outputs.push({
            score: 2,
            reason: "safe action",
            route: "auto",
            reply: "approved",
        });

        store.upsertInteraction({
            type: "permission",
            requestId: "perm-ext-pending",
            sessionId: "ses-ext",
            origin: "external",
            status: "pending",
            payload: JSON.stringify({ requestID: "perm-ext-pending" }),
        });
        store.upsertInteraction({
            type: "permission",
            requestId: "perm-managed",
            sessionId: "ses-managed",
            origin: "managed",
            status: "pending",
            payload: JSON.stringify({ requestID: "perm-managed" }),
        });

        const evaluator = new InteractionEvaluator(eq1 as never);
        const responder = new InteractionResponder(store, server as never);
        const processor = new InteractionProcessor(store, evaluator, responder);

        const processed = await processor.processNext();
        expect(processed).toBeDefined();
        expect(processed?.interaction.requestId).toBe("perm-managed");
        expect(server.replyPermissionCalls).toBe(1);

        const external = store.getInteractionByRequest(
            "permission",
            "perm-ext-pending",
        );
        expect(external?.status).toBe("pending");

        store.close();
    });

    test("rejected auto reply records failure reason in transition metric", async () => {
        const store = createStore();
        const eq1 = new FakeEq1Client();
        const server = new FakeInteractionServer();
        server.throwOnPermissionReply = true;
        eq1.outputs.push({
            score: 2,
            reason: "safe action",
            route: "auto",
            reply: "approved",
        });

        const created = store.upsertInteraction({
            type: "permission",
            requestId: "perm-4",
            sessionId: "ses-5",
            payload: JSON.stringify({ requestID: "perm-4" }),
        });

        const evaluator = new InteractionEvaluator(eq1 as never);
        const responder = new InteractionResponder(store, server as never);
        const processor = new InteractionProcessor(store, evaluator, responder);

        const processed = await processor.processNext();
        expect(processed).toBeDefined();
        expect(processed?.route).toBe("auto");

        const events = store.listMetricEvents({
            interactionId: created.interaction.id,
        });
        expect(events.length).toBeGreaterThanOrEqual(2);

        const transitions = events.filter(
            (event) => event.eventType === "interaction_state_transition",
        );
        expect(transitions).toHaveLength(2);
        const processorFailure = transitions.find(
            (event) => event.reason === "respond_auto",
        );
        const responderFailure = transitions.find(
            (event) => event.errorClass === "auto_reply_failed",
        );

        expect(processorFailure?.toState).toBe("rejected");
        expect(processorFailure?.reason).toBe("respond_auto");
        expect(responderFailure?.reason).toBe("interaction_auto_reply_failed");
        expect(responderFailure?.errorClass).toBe("auto_reply_failed");
        expect(responderFailure?.payload).toContain("permission reply failed");

        store.close();
    });
});
