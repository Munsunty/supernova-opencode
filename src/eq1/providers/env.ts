export interface ProviderEnv {
    [key: string]: string | undefined;
}

export function getEnvOptional(
    env: ProviderEnv,
    key: string,
): string | undefined {
    const value = env[key];
    if (!value) return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

export function getEnvRequired(env: ProviderEnv, key: string): string {
    const value = getEnvOptional(env, key);
    if (!value) {
        throw new Error(`Missing required env: ${key}`);
    }
    return value;
}
