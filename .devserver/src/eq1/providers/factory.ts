import type { EqProvider } from "../types";
import { getEnvOptional, type ProviderEnv } from "./env";
import { createGroqProviderFromEnv } from "./groq";
import { createCerebrasProviderFromEnv } from "./cerebras";
import { OpenAICompatibleProvider } from "./openai-compatible";
import { createOpenCodeInternalProviderFromEnv } from "./opencode-internal";

export type Eq1ProviderName =
    | "groq"
    | "cerebras"
    | "openai_compatible"
    | "opencode_internal"
    | "opencode_internal_fallback";

export interface Eq1ProviderChain {
    primary: EqProvider;
    fallback: EqProvider | null;
}

function resolveProviderName(env: ProviderEnv): Eq1ProviderName {
    const raw = (
        getEnvOptional(env, "EQ1_PROVIDER") ?? "opencode_internal_fallback"
    ).toLowerCase();
    if (
        raw === "groq" ||
        raw === "cerebras" ||
        raw === "openai_compatible" ||
        raw === "opencode_internal" ||
        raw === "opencode_internal_fallback"
    ) {
        return raw;
    }
    throw new Error(
        `Unsupported EQ1_PROVIDER: ${raw}. Expected groq | cerebras | openai_compatible | opencode_internal | opencode_internal_fallback`,
    );
}

function createOpenAICompatibleProviderFromEnv(
    env: ProviderEnv = process.env,
): EqProvider {
    const baseUrl = getEnvOptional(env, "EQ1_BASE_URL");
    const apiKey = getEnvOptional(env, "EQ1_API_KEY");
    const model = getEnvOptional(env, "EQ1_MODEL");

    if (!baseUrl) throw new Error("Missing required env: EQ1_BASE_URL");
    if (!apiKey) throw new Error("Missing required env: EQ1_API_KEY");
    if (!model) throw new Error("Missing required env: EQ1_MODEL");

    return new OpenAICompatibleProvider({
        name: "openai_compatible",
        baseUrl,
        apiKey,
        model,
    });
}

function createSingleProviderByName(
    name: Exclude<Eq1ProviderName, "opencode_internal_fallback">,
    env: ProviderEnv = process.env,
): EqProvider {
    if (name === "groq") return createGroqProviderFromEnv(env);
    if (name === "cerebras") return createCerebrasProviderFromEnv(env);
    if (name === "opencode_internal") {
        return createOpenCodeInternalProviderFromEnv(env);
    }
    return createOpenAICompatibleProviderFromEnv(env);
}

function createFallbackProvider(
    env: ProviderEnv = process.env,
): EqProvider | null {
    const configured = (
        getEnvOptional(env, "EQ1_FALLBACK_PROVIDER") ?? "cerebras"
    ).toLowerCase();
    if (!configured) return null;
    if (configured === "none" || configured === "off") return null;
    if (configured === "opencode_internal_fallback") {
        throw new Error(
            "EQ1_FALLBACK_PROVIDER cannot be opencode_internal_fallback",
        );
    }
    if (
        configured !== "groq" &&
        configured !== "cerebras" &&
        configured !== "openai_compatible" &&
        configured !== "opencode_internal"
    ) {
        throw new Error(
            `Unsupported EQ1_FALLBACK_PROVIDER: ${configured}. Expected groq | cerebras | openai_compatible | opencode_internal | none`,
        );
    }

    try {
        return createSingleProviderByName(configured, env);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("Missing required env:")) {
            return null;
        }
        throw error;
    }
}

export function createEq1ProviderChainFromEnv(
    env: ProviderEnv = process.env,
): Eq1ProviderChain {
    const name = resolveProviderName(env);
    if (name === "opencode_internal_fallback") {
        return {
            primary: createOpenCodeInternalProviderFromEnv(env),
            fallback: createFallbackProvider(env),
        };
    }

    return {
        primary: createSingleProviderByName(name, env),
        fallback: null,
    };
}

export function createEq1ProviderFromEnv(
    env: ProviderEnv = process.env,
): EqProvider {
    return createEq1ProviderChainFromEnv(env).primary;
}
