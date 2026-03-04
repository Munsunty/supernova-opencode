import { Eq1Client, type Eq1ClientOptions } from "./llm-client";
import { createEq1ProviderChainFromEnv } from "./providers/factory";
import type { ProviderEnv } from "./providers/env";

export function createEq1ClientFromEnv(
    options: Eq1ClientOptions = {},
    env: ProviderEnv = process.env,
): Eq1Client {
    const chain = createEq1ProviderChainFromEnv(env);
    return new Eq1Client(chain.primary, {
        ...options,
        fallbackProvider: options.fallbackProvider ?? chain.fallback,
    });
}
