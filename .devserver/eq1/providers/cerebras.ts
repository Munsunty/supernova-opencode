import { getEnvOptional, getEnvRequired, type ProviderEnv } from "./env";
import { OpenAICompatibleProvider } from "./openai-compatible";

const DEFAULT_CEREBRAS_BASE_URL = "https://api.cerebras.ai/v1";
const DEFAULT_CEREBRAS_MODEL = "gpt-oss-120b";

export function createCerebrasProviderFromEnv(
    env: ProviderEnv = process.env,
): OpenAICompatibleProvider {
    const apiKey =
        getEnvOptional(env, "CEREBRAS_API_KEY") ??
        getEnvOptional(env, "EQ1_API_KEY") ??
        getEnvRequired(env, "CEREBRAS_API_KEY");

    const baseUrl =
        getEnvOptional(env, "CEREBRAS_BASE_URL") ??
        getEnvOptional(env, "EQ1_BASE_URL") ??
        DEFAULT_CEREBRAS_BASE_URL;

    const model =
        getEnvOptional(env, "CEREBRAS_MODEL") ??
        getEnvOptional(env, "EQ1_MODEL") ??
        DEFAULT_CEREBRAS_MODEL;

    return new OpenAICompatibleProvider({
        name: "cerebras",
        baseUrl,
        apiKey,
        model,
    });
}
