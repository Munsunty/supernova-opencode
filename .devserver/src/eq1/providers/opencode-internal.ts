import type {
    EqCompletionRequest,
    EqProvider,
    EqProviderResponse,
    EqPromptMessage,
    EqUsage,
} from "../types";
import {
    OpenCodeServer,
    type PromptOptions,
    type PromptResult,
} from "../../opencode-server-wrapper";
import { getEnvOptional, type ProviderEnv } from "./env";
import { createLogger } from "../../utils/logging";

interface ModelRef {
    providerID: string;
    modelID: string;
}

interface OpenCodeInternalProviderOptions {
    baseUrl?: string;
    agent?: string;
    model?: ModelRef | null;
    sessionTitle?: string;
    providerName?: string;
    server?: Pick<OpenCodeServer, "run">;
}

const logger = createLogger("Eq1.OpenCodeInternalProvider");
const DEFAULT_BASE_URL = "http://127.0.0.1:4996";
const DEFAULT_AGENT = "eq1-core";
const DEFAULT_SESSION_TITLE = "eq1-internal";

function toModelText(model: ModelRef | null | undefined): string | null {
    if (!model) return null;
    const provider = model.providerID.trim();
    const modelId = model.modelID.trim();
    if (!provider || !modelId) return null;
    return `${provider}/${modelId}`;
}

function parseModelRef(raw: string | undefined): ModelRef | null {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const splitAt = trimmed.indexOf("/");
    if (splitAt <= 0 || splitAt === trimmed.length - 1) return null;
    const providerID = trimmed.slice(0, splitAt).trim();
    const modelID = trimmed.slice(splitAt + 1).trim();
    if (!providerID || !modelID) return null;
    return {
        providerID,
        modelID,
    };
}

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    return value as Record<string, unknown>;
}

function asNumber(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
}

function modelFromInfo(info: unknown): string | null {
    const record = asRecord(info);
    if (!record) return null;

    const provider = typeof record.providerID === "string" ? record.providerID : null;
    const model = typeof record.modelID === "string" ? record.modelID : null;
    if (provider && model) return `${provider}/${model}`;

    const nested = asRecord(record.model);
    if (!nested) return null;
    const nestedProvider =
        typeof nested.providerID === "string" ? nested.providerID : null;
    const nestedModel =
        typeof nested.modelID === "string" ? nested.modelID : null;
    if (nestedProvider && nestedModel) {
        return `${nestedProvider}/${nestedModel}`;
    }
    return null;
}

function usageFromInfo(info: unknown): EqUsage | undefined {
    const record = asRecord(info);
    const tokens = record ? asRecord(record.tokens) : null;
    if (!tokens) return undefined;

    const inputTokens = asNumber(tokens.input ?? tokens.inputTokens);
    const outputTokens = asNumber(tokens.output ?? tokens.outputTokens);
    const totalTokens =
        asNumber(tokens.total ?? tokens.totalTokens) ??
        (inputTokens !== undefined && outputTokens !== undefined
            ? inputTokens + outputTokens
            : undefined);

    if (
        inputTokens === undefined &&
        outputTokens === undefined &&
        totalTokens === undefined
    ) {
        return undefined;
    }

    return {
        inputTokens,
        outputTokens,
        totalTokens,
    };
}

function extractText(parts: PromptResult["parts"]): string {
    return parts
        .filter((part) => part.type === "text")
        .map((part) => (part.type === "text" ? part.text : ""))
        .join("\n")
        .trim();
}

function buildPrompt(messages: EqPromptMessage[]): string {
    const system = messages
        .filter((message) => message.role === "system")
        .map((message) => message.content)
        .join("\n\n")
        .trim();

    const user = messages
        .filter((message) => message.role === "user")
        .map((message) => message.content)
        .join("\n\n")
        .trim();

    return [
        system ? `System instruction:\n${system}` : null,
        user ? `User payload:\n${user}` : null,
        "Return one JSON object only.",
    ]
        .filter((line): line is string => Boolean(line && line.trim()))
        .join("\n\n");
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
            reject(new Error(`opencode_internal timeout after ${timeoutMs}ms`));
        }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
    });
}

export class OpenCodeInternalProvider implements EqProvider {
    private readonly providerName: string;
    private readonly baseUrl: string;
    private readonly agent: string;
    private readonly model: ModelRef | null;
    private readonly modelText: string | null;
    private readonly sessionTitle: string;
    private readonly server: Pick<OpenCodeServer, "run">;

    constructor(options: OpenCodeInternalProviderOptions = {}) {
        this.providerName = options.providerName ?? "opencode_internal";
        this.baseUrl = options.baseUrl?.trim() || DEFAULT_BASE_URL;
        this.agent = options.agent?.trim() || DEFAULT_AGENT;
        this.model = options.model ?? null;
        this.modelText = toModelText(this.model);
        this.sessionTitle = options.sessionTitle?.trim() || DEFAULT_SESSION_TITLE;
        this.server = options.server ?? OpenCodeServer.getInstance(this.baseUrl);
    }

    async complete(request: EqCompletionRequest): Promise<EqProviderResponse> {
        const startedAt = Date.now();
        const promptText = buildPrompt(request.messages);
        const runOptions: PromptOptions & { title?: string; deleteAfter?: boolean } = {
            agent: this.agent,
            deleteAfter: true,
            title: this.sessionTitle,
            tools: {
                write: false,
                edit: false,
                bash: false,
            },
            ...(this.model ? { model: this.model } : {}),
        };

        const result = await withTimeout(
            this.server.run(promptText, runOptions),
            request.timeoutMs,
        );
        const text = extractText(result.parts);
        if (!text) {
            throw new Error("opencode_internal completion has no text output");
        }

        const latencyMs = Date.now() - startedAt;
        const observedModel = modelFromInfo(result.info);
        const usage = usageFromInfo(result.info);

        logger.info("provider_complete", {
            provider: this.providerName,
            agent: this.agent,
            model: observedModel ?? this.modelText,
            latencyMs,
        });

        return {
            text,
            provider: this.providerName,
            model: observedModel ?? this.modelText ?? undefined,
            usage,
            latencyMs,
        };
    }
}

export function createOpenCodeInternalProviderFromEnv(
    env: ProviderEnv = process.env,
): OpenCodeInternalProvider {
    const baseUrl =
        getEnvOptional(env, "EQ1_INTERNAL_BASE_URL") ??
        getEnvOptional(env, "OPENCODE_BASE_URL") ??
        DEFAULT_BASE_URL;
    const agent =
        getEnvOptional(env, "EQ1_INTERNAL_AGENT") ?? DEFAULT_AGENT;
    const model = parseModelRef(getEnvOptional(env, "EQ1_INTERNAL_MODEL"));
    const sessionTitle =
        getEnvOptional(env, "EQ1_INTERNAL_SESSION_TITLE") ??
        DEFAULT_SESSION_TITLE;

    return new OpenCodeInternalProvider({
        baseUrl,
        agent,
        model,
        sessionTitle,
    });
}
