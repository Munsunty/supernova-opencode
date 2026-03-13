import type { Eq1TaskType } from "./task-types";

export type EqMessageRole = "system" | "user";

export interface EqPromptMessage {
    role: EqMessageRole;
    content: string;
}

export interface EqCompletionRequest {
    messages: EqPromptMessage[];
    responseFormat: "json";
    timeoutMs: number;
}

export interface EqUsage {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
}

export interface EqProviderResponse {
    text: string;
    provider: string;
    model?: string;
    usage?: EqUsage;
    latencyMs?: number;
}

export interface EqProvider {
    complete(request: EqCompletionRequest): Promise<EqProviderResponse>;
}

export interface Eq1RunRequest {
    type: Eq1TaskType;
    input: string;
    context?: Record<string, unknown>;
    schemaVersion?: string;
}

export interface Eq1RunResult<TOutput = Record<string, unknown>> {
    type: Eq1TaskType;
    output: TOutput;
    rawText: string;
    attempts: number;
    provider: string;
    model: string | null;
    usage: EqUsage | null;
    latencyMs: number;
}
