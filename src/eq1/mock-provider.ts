import type {
    EqCompletionRequest,
    EqProvider,
    EqProviderResponse,
} from "./types";

export interface MockProviderReply {
    text?: string;
    error?: string;
    provider?: string;
    model?: string;
    latencyMs?: number;
}

export class MockEqProvider implements EqProvider {
    public calls: EqCompletionRequest[] = [];
    private queue: MockProviderReply[];

    constructor(replies: MockProviderReply[] = []) {
        this.queue = [...replies];
    }

    enqueue(reply: MockProviderReply): void {
        this.queue.push(reply);
    }

    async complete(request: EqCompletionRequest): Promise<EqProviderResponse> {
        this.calls.push(request);

        const next = this.queue.shift();
        if (!next) {
            throw new Error("MockEqProvider has no queued reply");
        }

        const delay = Math.max(0, next.latencyMs ?? 0);
        if (delay > 0) {
            await new Promise((resolve) => setTimeout(resolve, delay));
        }

        if (next.error) {
            throw new Error(next.error);
        }

        return {
            text: next.text ?? "{}",
            provider: next.provider ?? "mock",
            model: next.model ?? "mock-model",
            latencyMs: delay,
        };
    }
}
