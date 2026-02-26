import { describe, expect, test } from "bun:test";
import { createEq1ProviderFromEnv } from "../.devserver/eq1/providers/factory";
import { OpenAICompatibleProvider } from "../.devserver/eq1/providers/openai-compatible";

describe("Eq1 provider factory", () => {
    test("defaults to cerebras provider", () => {
        const provider = createEq1ProviderFromEnv({
            CEREBRAS_API_KEY: "test-key",
        });
        expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
    });

    test("creates cerebras provider when selected", () => {
        const provider = createEq1ProviderFromEnv({
            EQ1_PROVIDER: "cerebras",
            CEREBRAS_API_KEY: "test-key",
        });
        expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
    });

    test("throws for unsupported provider", () => {
        expect(() =>
            createEq1ProviderFromEnv({
                EQ1_PROVIDER: "unknown",
            }),
        ).toThrow("Unsupported EQ1_PROVIDER");
    });

    test("throws when required key is missing", () => {
        expect(() =>
            createEq1ProviderFromEnv({
                EQ1_PROVIDER: "cerebras",
            }),
        ).toThrow("Missing required env: CEREBRAS_API_KEY");
    });
});
