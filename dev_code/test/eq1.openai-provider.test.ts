import { afterEach, describe, expect, test } from "bun:test";
import { OpenAICompatibleProvider } from "../../src/eq1/providers/openai-compatible";

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
});

describe("OpenAICompatibleProvider", () => {
    test("sends chat completion request and parses response", async () => {
        let calledUrl = "";
        let calledBody = "";

        globalThis.fetch = (async (input, init) => {
            calledUrl = String(input);
            calledBody = String(init?.body ?? "");
            return new Response(
                JSON.stringify({
                    model: "llama-test",
                    choices: [
                        {
                            message: {
                                role: "assistant",
                                content: JSON.stringify({ action: "auto" }),
                            },
                        },
                    ],
                    usage: {
                        prompt_tokens: 10,
                        completion_tokens: 5,
                        total_tokens: 15,
                    },
                }),
                { status: 200, headers: { "Content-Type": "application/json" } },
            );
        }) as typeof fetch;

        const provider = new OpenAICompatibleProvider({
            name: "groq",
            baseUrl: "https://api.groq.com/openai/v1",
            apiKey: "test-key",
            model: "llama-test",
        });

        const response = await provider.complete({
            messages: [{ role: "user", content: "classify this" }],
            responseFormat: "json",
            timeoutMs: 1_000,
        });

        expect(calledUrl).toBe("https://api.groq.com/openai/v1/chat/completions");
        expect(calledBody).toContain("\"model\":\"llama-test\"");
        expect(calledBody).toContain("\"response_format\":{\"type\":\"json_object\"}");
        expect(response.provider).toBe("groq");
        expect(response.text).toContain("\"action\":\"auto\"");
        expect(response.usage?.totalTokens).toBe(15);
    });

    test("throws descriptive error on non-2xx response", async () => {
        globalThis.fetch = (async () => {
            return new Response(
                JSON.stringify({
                    error: {
                        message: "rate limit exceeded",
                    },
                }),
                { status: 429, headers: { "Content-Type": "application/json" } },
            );
        }) as typeof fetch;

        const provider = new OpenAICompatibleProvider({
            name: "groq",
            baseUrl: "https://api.groq.com/openai/v1",
            apiKey: "test-key",
            model: "llama-test",
        });

        await expect(
            provider.complete({
                messages: [{ role: "user", content: "classify this" }],
                responseFormat: "json",
                timeoutMs: 1_000,
            }),
        ).rejects.toThrow("groq completion failed (429): rate limit exceeded");
    });
});
