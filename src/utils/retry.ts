export interface RetryOptions {
    attempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    factor?: number;
    shouldRetry?: (error: unknown, attempt: number, maxAttempts: number) => boolean;
    onRetry?: (context: {
        error: unknown;
        attempt: number;
        maxAttempts: number;
        nextDelayMs: number;
    }) => void | Promise<void>;
    sleep?: (ms: number) => Promise<void>;
}

export interface BackoffOptions {
    baseDelayMs: number;
    maxDelayMs: number;
    factor?: number;
}

function defaultSleep(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function computeBackoffDelay(
    attempt: number,
    options: BackoffOptions,
): number {
    const factor = options.factor ?? 2;
    const exponent = Math.max(0, attempt - 1);
    const calculated = options.baseDelayMs * Math.pow(factor, exponent);
    return Math.min(calculated, options.maxDelayMs);
}

export async function retryAsync<T>(
    operation: (attempt: number) => Promise<T>,
    options: RetryOptions = {},
): Promise<T> {
    const attempts = Math.max(1, options.attempts ?? 1);
    const baseDelayMs = options.baseDelayMs ?? 250;
    const maxDelayMs = options.maxDelayMs ?? 5_000;
    const factor = options.factor ?? 2;
    const shouldRetry = options.shouldRetry ?? (() => true);
    const sleep = options.sleep ?? defaultSleep;

    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            return await operation(attempt);
        } catch (error) {
            lastError = error;
            const canRetry =
                attempt < attempts && shouldRetry(error, attempt, attempts);
            if (!canRetry) break;

            const nextDelayMs = computeBackoffDelay(attempt, {
                baseDelayMs,
                maxDelayMs,
                factor,
            });

            if (options.onRetry) {
                await options.onRetry({
                    error,
                    attempt,
                    maxAttempts: attempts,
                    nextDelayMs,
                });
            }

            await sleep(nextDelayMs);
        }
    }

    throw lastError;
}
