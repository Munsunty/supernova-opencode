import { describe, expect, test } from "bun:test";
import { Eq1Client, buildEq1Messages } from "../.devserver/eq1/llm-client";
import { MockEqProvider } from "../.devserver/eq1/mock-provider";
import { assertEq1TaskType, isEq1TaskType } from "../.devserver/eq1/task-types";

describe("Eq1 task types", () => {
    test("validates known task types", () => {
        expect(isEq1TaskType("classify")).toBe(true);
        expect(isEq1TaskType("evaluate")).toBe(true);
        expect(isEq1TaskType("unknown")).toBe(false);
        expect(assertEq1TaskType("route")).toBe("route");
        expect(() => assertEq1TaskType("invalid")).toThrow(
            "Invalid Eq1 task type",
        );
    });
});

describe("Eq1Client", () => {
    test("builds system/user messages for request", () => {
        const messages = buildEq1Messages({
            type: "classify",
            input: "pending permission request",
            context: { source: "x3" },
        });

        expect(messages.length).toBe(2);
        expect(messages[0]?.role).toBe("system");
        expect(messages[1]?.role).toBe("user");
        expect(messages[1]?.content).toContain('"type": "classify"');
    });

    test("runs classify and parses JSON response", async () => {
        const provider = new MockEqProvider([
            {
                text: JSON.stringify({
                    action: "auto",
                    score: 3,
                    reason: "low-risk request",
                }),
            },
        ]);
        const client = new Eq1Client(provider, {
            retryAttempts: 1,
            timeoutMs: 5_000,
        });

        const result = await client.classify("permission request text");

        expect(result.type).toBe("classify");
        expect(result.attempts).toBe(1);
        expect(result.provider).toBe("mock");
        expect((result.output as { action?: string }).action).toBe("auto");
        expect(provider.calls.length).toBe(1);
        expect(provider.calls[0]?.responseFormat).toBe("json");
    });

    test("retries transient provider failure and succeeds", async () => {
        const provider = new MockEqProvider([
            { error: "temporary network error" },
            {
                text: JSON.stringify({
                    action: "report",
                    reason: "retry success",
                }),
            },
        ]);
        const client = new Eq1Client(provider, {
            retryAttempts: 2,
            retryBaseDelayMs: 0,
            retryMaxDelayMs: 0,
        });

        const result = await client.route("route this");

        expect(result.type).toBe("route");
        expect(result.attempts).toBe(2);
        expect((result.output as { action?: string }).action).toBe("report");
        expect(provider.calls.length).toBe(2);
    });

    test("retries on 500 server error and succeeds", async () => {
        const provider = new MockEqProvider([
            {
                error: "cerebras completion failed (500): internal server error",
            },
            { text: JSON.stringify({ action: "retry-ok" }) },
        ]);
        const client = new Eq1Client(provider, {
            retryAttempts: 2,
            retryBaseDelayMs: 0,
            retryMaxDelayMs: 0,
        });

        const result = await client.evaluate("evaluate this");
        expect(result.type).toBe("evaluate");
        expect((result.output as { action?: string }).action).toBe("retry-ok");
        expect(provider.calls.length).toBe(2);
    });

    test("retries on 429 rate limit and succeeds", async () => {
        const provider = new MockEqProvider([
            { error: "groq completion failed (429): rate limit exceeded" },
            { text: JSON.stringify({ action: "rate-limit-recovered" }) },
        ]);
        const client = new Eq1Client(provider, {
            retryAttempts: 2,
            retryBaseDelayMs: 0,
            retryMaxDelayMs: 0,
        });

        const result = await client.route("rate limited");
        expect((result.output as { action?: string }).action).toBe(
            "rate-limit-recovered",
        );
        expect(provider.calls.length).toBe(2);
    });

    test("retries on timeout error and succeeds", async () => {
        const provider = new MockEqProvider([
            { error: "request timeout" },
            { text: JSON.stringify({ action: "timeout-recovered" }) },
        ]);
        const client = new Eq1Client(provider, {
            retryAttempts: 2,
            retryBaseDelayMs: 0,
            retryMaxDelayMs: 0,
        });

        const result = await client.classify("timeout case");
        expect((result.output as { action?: string }).action).toBe(
            "timeout-recovered",
        );
        expect(provider.calls.length).toBe(2);
    });

    test("does not retry on 400 client error", async () => {
        const provider = new MockEqProvider([
            { error: "cerebras completion failed (400): bad request" },
            { text: JSON.stringify({ action: "should-not-run" }) },
        ]);
        const client = new Eq1Client(provider, {
            retryAttempts: 2,
            retryBaseDelayMs: 0,
            retryMaxDelayMs: 0,
        });

        await expect(client.route("bad input")).rejects.toThrow(
            "cerebras completion failed (400): bad request",
        );
        expect(provider.calls.length).toBe(1);
    });

    test("fails on non-JSON response", async () => {
        const provider = new MockEqProvider([{ text: "not-json" }]);
        const client = new Eq1Client(provider, { retryAttempts: 1 });

        await expect(client.summarize("summarize this")).rejects.toThrow(
            "Eq1 response is not valid JSON",
        );
    });
});
