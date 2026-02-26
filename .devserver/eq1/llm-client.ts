import { createLogger } from "../utils/logging";
import { retryAsync } from "../utils/retry";
import type {
    EqCompletionRequest,
    EqPromptMessage,
    EqProvider,
    Eq1RunRequest,
    Eq1RunResult,
} from "./types";
import type { Eq1TaskType } from "./task-types";

export interface Eq1ClientOptions {
    retryAttempts?: number;
    retryBaseDelayMs?: number;
    retryMaxDelayMs?: number;
    timeoutMs?: number;
}

const TASK_SYSTEM_PROMPTS: Record<Eq1TaskType, string> = {
    classify:
        "You are an Eq1 classifier. Return JSON only with stable keys for downstream routing.",
    evaluate:
        "You are an Eq1 evaluator. Return JSON only with score/reason style decision output.",
    summarize:
        "You are an Eq1 summarizer. Return JSON only with concise summary fields.",
    route: "You are an Eq1 router. Return JSON only with deterministic next-action fields.",
};

const logger = createLogger("Eq1.Client");

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonObject(raw: string): Record<string, unknown> {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error("Eq1 response is not valid JSON");
    }

    if (!isRecord(parsed)) {
        throw new Error("Eq1 response JSON must be an object");
    }

    return parsed;
}

function isRetriableProviderError(error: unknown): boolean {
    const message =
        error instanceof Error
            ? error.message.toLowerCase()
            : String(error).toLowerCase();

    if (/\((429|408|5\d\d)\)/.test(message)) return true;
    if (message.includes("rate limit")) return true;
    if (message.includes("network")) return true;
    if (message.includes("fetch failed")) return true;
    if (message.includes("timeout")) return true;
    if (message.includes("timed out")) return true;
    if (message.includes("aborted")) return true;
    if (message.includes("econnreset") || message.includes("econnrefused"))
        return true;
    if (message.includes("temporary")) return true;

    return false;
}

export function buildEq1Messages(request: Eq1RunRequest): EqPromptMessage[] {
    const systemPrompt = TASK_SYSTEM_PROMPTS[request.type];
    const payload = {
        type: request.type,
        schemaVersion: request.schemaVersion ?? "v1",
        input: request.input,
        context: request.context ?? {},
        outputRequirement: "JSON object only",
    };

    return [
        {
            role: "system",
            content: systemPrompt,
        },
        {
            role: "user",
            content: JSON.stringify(payload, null, 2),
        },
    ];
}

export class Eq1Client {
    private provider: EqProvider;
    private retryAttempts: number;
    private retryBaseDelayMs: number;
    private retryMaxDelayMs: number;
    private timeoutMs: number;

    constructor(provider: EqProvider, options: Eq1ClientOptions = {}) {
        this.provider = provider;
        // Eq1는 task-level 재시도와 중첩을 피하기 위해 provider-level retry를 최소 기본값(1)으로 둔다.
        this.retryAttempts = Math.max(1, options.retryAttempts ?? 1);
        this.retryBaseDelayMs = options.retryBaseDelayMs ?? 300;
        this.retryMaxDelayMs = options.retryMaxDelayMs ?? 2_000;
        this.timeoutMs = options.timeoutMs ?? 20_000;
    }

    async run<TOutput = Record<string, unknown>>(
        request: Eq1RunRequest,
    ): Promise<Eq1RunResult<TOutput>> {
        const startedAt = Date.now();
        const completionRequest: EqCompletionRequest = {
            messages: buildEq1Messages(request),
            responseFormat: "json",
            timeoutMs: this.timeoutMs,
        };

        let attempts = 0;
        const response = await retryAsync(
            async (attempt) => {
                attempts = attempt;
                return this.provider.complete(completionRequest);
            },
            {
                attempts: this.retryAttempts,
                baseDelayMs: this.retryBaseDelayMs,
                maxDelayMs: this.retryMaxDelayMs,
                shouldRetry: (error) => isRetriableProviderError(error),
                onRetry: ({ error, attempt, maxAttempts, nextDelayMs }) => {
                    const message =
                        error instanceof Error ? error.message : String(error);
                    logger.warn("retry_provider_call", {
                        type: request.type,
                        attempt,
                        maxAttempts,
                        nextDelayMs,
                        error: message,
                    });
                },
            },
        );

        const output = parseJsonObject(response.text) as TOutput;
        const latencyMs = Date.now() - startedAt;

        logger.info("eq1_run_completed", {
            type: request.type,
            attempts,
            provider: response.provider,
            latencyMs,
        });

        return {
            type: request.type,
            output,
            rawText: response.text,
            attempts,
            provider: response.provider,
            model: response.model ?? null,
            usage: response.usage ?? null,
            latencyMs,
        };
    }

    classify<TOutput = Record<string, unknown>>(
        input: string,
        context?: Record<string, unknown>,
    ): Promise<Eq1RunResult<TOutput>> {
        return this.run<TOutput>({
            type: "classify",
            input,
            context,
        });
    }

    evaluate<TOutput = Record<string, unknown>>(
        input: string,
        context?: Record<string, unknown>,
    ): Promise<Eq1RunResult<TOutput>> {
        return this.run<TOutput>({
            type: "evaluate",
            input,
            context,
        });
    }

    summarize<TOutput = Record<string, unknown>>(
        input: string,
        context?: Record<string, unknown>,
    ): Promise<Eq1RunResult<TOutput>> {
        return this.run<TOutput>({
            type: "summarize",
            input,
            context,
        });
    }

    route<TOutput = Record<string, unknown>>(
        input: string,
        context?: Record<string, unknown>,
    ): Promise<Eq1RunResult<TOutput>> {
        return this.run<TOutput>({
            type: "route",
            input,
            context,
        });
    }
}
