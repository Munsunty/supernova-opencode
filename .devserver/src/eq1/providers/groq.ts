import { getEnvOptional, getEnvRequired, type ProviderEnv } from "./env";
import { OpenAICompatibleProvider } from "./openai-compatible";

const DEFAULT_GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const DEFAULT_GROQ_MODEL = "openai/gpt-oss-20b";

export function createGroqProviderFromEnv(
    env: ProviderEnv = process.env,
): OpenAICompatibleProvider {
    const apiKey =
        getEnvOptional(env, "GROQ_API_KEY") ??
        getEnvOptional(env, "EQ1_API_KEY") ??
        getEnvRequired(env, "GROQ_API_KEY");

    const baseUrl =
        getEnvOptional(env, "GROQ_BASE_URL") ??
        getEnvOptional(env, "EQ1_BASE_URL") ??
        DEFAULT_GROQ_BASE_URL;

    const model =
        getEnvOptional(env, "GROQ_MODEL") ??
        getEnvOptional(env, "EQ1_MODEL") ??
        DEFAULT_GROQ_MODEL;

    return new OpenAICompatibleProvider({
        name: "groq",
        baseUrl,
        apiKey,
        model,
    });
}
