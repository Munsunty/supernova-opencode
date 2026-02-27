import type { EqProvider } from "../types";
import { getEnvOptional, type ProviderEnv } from "./env";
import { createGroqProviderFromEnv } from "./groq";
import { createCerebrasProviderFromEnv } from "./cerebras";
import { OpenAICompatibleProvider } from "./openai-compatible";

export type Eq1ProviderName = "groq" | "cerebras" | "openai_compatible";

function resolveProviderName(env: ProviderEnv): Eq1ProviderName {
    const raw = (
        getEnvOptional(env, "EQ1_PROVIDER") ?? "cerebras"
    ).toLowerCase();
    if (raw === "groq" || raw === "cerebras" || raw === "openai_compatible") {
        return raw;
    }
    throw new Error(
        `Unsupported EQ1_PROVIDER: ${raw}. Expected groq | cerebras | openai_compatible`,
    );
}

export function createEq1ProviderFromEnv(
    env: ProviderEnv = process.env,
): EqProvider {
    const name = resolveProviderName(env);
    if (name === "groq") return createGroqProviderFromEnv(env);
    if (name === "cerebras") return createCerebrasProviderFromEnv(env);

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
