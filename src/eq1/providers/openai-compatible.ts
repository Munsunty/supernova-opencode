import { createLogger } from "../../utils/logging";
import type {
    EqCompletionRequest,
    EqProvider,
    EqProviderResponse,
    EqPromptMessage,
    EqUsage,
} from "../types";

interface OpenAICompatibleProviderOptions {
    name: string;
    baseUrl: string;
    apiKey: string;
    model: string;
    endpointPath?: string;
    temperature?: number;
    extraHeaders?: Record<string, string>;
}

interface OpenAICompletionUsage {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
}

interface OpenAICompletionChoice {
    message?: {
        role?: string;
        content?: string | null;
    };
}

interface OpenAICompletionResponse {
    model?: string;
    choices?: OpenAICompletionChoice[];
    usage?: OpenAICompletionUsage;
}

const logger = createLogger("Eq1.OpenAICompatProvider");

function trimTrailingSlash(url: string): string {
    return url.endsWith("/") ? url.slice(0, -1) : url;
}

function withTimeoutSignal(timeoutMs: number): {
    signal: AbortSignal;
    cancel: () => void;
} {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return {
        signal: controller.signal,
        cancel: () => clearTimeout(timer),
    };
}

function mapUsage(usage?: OpenAICompletionUsage): EqUsage | undefined {
    if (!usage) return undefined;
    return {
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
    };
}

function toOpenAIMessages(messages: EqPromptMessage[]) {
    return messages.map((m) => ({
        role: m.role,
        content: m.content,
    }));
}

function getErrorMessageFromBody(raw: string): string | null {
    try {
        const parsed = JSON.parse(raw) as {
            error?: { message?: string };
            message?: string;
        };
        if (parsed.error?.message) return parsed.error.message;
        if (parsed.message) return parsed.message;
        return null;
    } catch {
        return null;
    }
}

export class OpenAICompatibleProvider implements EqProvider {
    private readonly name: string;
    private readonly baseUrl: string;
    private readonly apiKey: string;
    private readonly model: string;
    private readonly endpointPath: string;
    private readonly temperature: number;
    private readonly extraHeaders: Record<string, string>;

    constructor(options: OpenAICompatibleProviderOptions) {
        this.name = options.name;
        this.baseUrl = trimTrailingSlash(options.baseUrl);
        this.apiKey = options.apiKey;
        this.model = options.model;
        this.endpointPath = options.endpointPath ?? "/chat/completions";
        this.temperature = options.temperature ?? 0;
        this.extraHeaders = options.extraHeaders ?? {};
    }

    async complete(request: EqCompletionRequest): Promise<EqProviderResponse> {
        const endpoint = `${this.baseUrl}${this.endpointPath}`;
        const startedAt = Date.now();
        const { signal, cancel } = withTimeoutSignal(request.timeoutMs);

        try {
            const response = await fetch(endpoint, {
                method: "POST",
                signal,
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    "Content-Type": "application/json",
                    ...this.extraHeaders,
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: toOpenAIMessages(request.messages),
                    temperature: this.temperature,
                    response_format:
                        request.responseFormat === "json"
                            ? { type: "json_object" }
                            : undefined,
                }),
            });

            const raw = await response.text();
            if (!response.ok) {
                const bodyMessage = getErrorMessageFromBody(raw);
                throw new Error(
                    `${this.name} completion failed (${response.status})${bodyMessage ? `: ${bodyMessage}` : ""}`,
                );
            }

            let parsed: OpenAICompletionResponse;
            try {
                parsed = JSON.parse(raw) as OpenAICompletionResponse;
            } catch {
                throw new Error(`${this.name} completion returned invalid JSON`);
            }

            const text = parsed.choices?.[0]?.message?.content;
            if (!text || typeof text !== "string") {
                throw new Error(
                    `${this.name} completion has no assistant text content`,
                );
            }

            const latencyMs = Date.now() - startedAt;
            logger.info("provider_complete", {
                provider: this.name,
                latencyMs,
            });

            return {
                text,
                provider: this.name,
                model: parsed.model ?? this.model,
                usage: mapUsage(parsed.usage),
                latencyMs,
            };
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            logger.warn("provider_complete_failed", {
                provider: this.name,
                error: message,
            });
            throw error;
        } finally {
            cancel();
        }
    }
}
