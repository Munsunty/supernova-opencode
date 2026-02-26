import { Eq1Client, type Eq1ClientOptions } from "./llm-client";
import { createEq1ProviderFromEnv } from "./providers/factory";
import type { ProviderEnv } from "./providers/env";

export function createEq1ClientFromEnv(
    options: Eq1ClientOptions = {},
    env: ProviderEnv = process.env,
): Eq1Client {
    const provider = createEq1ProviderFromEnv(env);
    return new Eq1Client(provider, options);
}
