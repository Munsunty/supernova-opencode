import { afterEach, describe, expect, test } from "bun:test";
import {
    TelegramReporter,
    type Reporter,
    type ReportPayload,
} from "../../src/x2/router";
import type { Task } from "../../src/x2/store";

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
});

function buildTask(source: string): Task {
    const now = Date.now();
    return {
        id: "019cb800-0000-7000-8000-000000000001",
        type: "omo_request",
        prompt: "hello",
        status: "completed",
        attempts: 0,
        retryAt: null,
        sessionId: "ses_test",
        requestMessageId: null,
        assistantMessageId: null,
        rawResult: "raw output",
        result: "done",
        error: null,
        runAgent: "spark",
        runModel: "openai/gpt-5.3-codex-spark",
        summaryAgent: "x2-summarizer",
        summaryModel: "openai/gpt-5.3-codex-spark",
        source,
        startedAt: now,
        completedAt: now,
        createdAt: now,
        updatedAt: now,
    };
}

class CaptureReporter implements Reporter {
    calls: Array<{ taskId: string; payload: ReportPayload }> = [];

    async report(task: Task, payload: ReportPayload): Promise<void> {
        this.calls.push({ taskId: task.id, payload });
    }
}

describe("X2 TelegramReporter", () => {
    test("sends telegram message when task source includes chat id", async () => {
        let called = 0;
        let url = "";
        const bodies: string[] = [];

        globalThis.fetch = (async (input, init) => {
            called += 1;
            url = String(input);
            bodies.push(String(init?.body ?? ""));
            return new Response(JSON.stringify({ ok: true }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        }) as typeof fetch;

        const fallback = new CaptureReporter();
        const reporter = new TelegramReporter({
            token: "test-token",
            fallback,
        });

        await reporter.report(buildTask("x1_telegram_task#chat:5689387562"), {
            raw: "raw result text",
            summary: "summary result text",
            executionAgent: "spark",
            executionModel: "openai/gpt-5.3-codex-spark",
            summaryAgent: "x2-summarizer",
            summaryModel: "openai/gpt-5.3-codex-spark",
        });

        expect(called).toBe(2);
        expect(url).toBe("https://api.telegram.org/bottest-token/sendMessage");
        expect(bodies[0]).toContain('"chat_id":"5689387562"');
        expect(bodies[0]).toContain("[monitor/raw]");
        expect(bodies[0]).toContain("raw result text");
        expect(bodies[1]).toContain("[summary/meta]");
        expect(bodies[1]).toContain("summary result text");
        expect(bodies[1]).toContain("run_agent: spark");
        expect(bodies[1]).toContain("run_model: openai/gpt-5.3-codex-spark");
        expect(bodies[1]).toContain("summary_agent: x2-summarizer");
        expect(bodies[1]).toContain(
            "summary_model: openai/gpt-5.3-codex-spark",
        );
        expect(fallback.calls.length).toBe(0);
    });

    test("falls back when chat id is missing from source", async () => {
        let called = 0;
        globalThis.fetch = (async () => {
            called += 1;
            return new Response(JSON.stringify({ ok: true }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        }) as typeof fetch;

        const fallback = new CaptureReporter();
        const reporter = new TelegramReporter({
            token: "test-token",
            fallback,
        });

        await reporter.report(buildTask("x1_telegram_task"), {
            raw: "raw result text",
            summary: "summary result text",
            executionAgent: "spark",
            executionModel: "openai/gpt-5.3-codex-spark",
            summaryAgent: "x2-summarizer",
            summaryModel: "openai/gpt-5.3-codex-spark",
        });

        expect(called).toBe(0);
        expect(fallback.calls.length).toBe(1);
    });
});
