import { describe, expect, test } from "bun:test";
import {
    createEq1ProviderFromEnv,
    createEq1ProviderChainFromEnv,
} from "../../src/eq1/providers/factory";
import { OpenAICompatibleProvider } from "../../src/eq1/providers/openai-compatible";
import { OpenCodeInternalProvider } from "../../src/eq1/providers/opencode-internal";

describe("Eq1 provider factory", () => {
    test("defaults to opencode internal provider", () => {
        const provider = createEq1ProviderFromEnv({});
        expect(provider).toBeInstanceOf(OpenCodeInternalProvider);
    });

    test("opencode_internal_fallback builds chain with optional fallback", () => {
        const chain = createEq1ProviderChainFromEnv({
            EQ1_PROVIDER: "opencode_internal_fallback",
            EQ1_FALLBACK_PROVIDER: "cerebras",
            CEREBRAS_API_KEY: "test-key",
        });
        expect(chain.primary).toBeInstanceOf(OpenCodeInternalProvider);
        expect(chain.fallback).toBeInstanceOf(OpenAICompatibleProvider);
    });

    test("opencode_internal_fallback keeps fallback null when key is missing", () => {
        const chain = createEq1ProviderChainFromEnv({
            EQ1_PROVIDER: "opencode_internal_fallback",
            EQ1_FALLBACK_PROVIDER: "cerebras",
        });
        expect(chain.primary).toBeInstanceOf(OpenCodeInternalProvider);
        expect(chain.fallback).toBeNull();
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
