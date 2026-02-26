/**
 * X₂ Queue — dispatch/finalize 분리 실행
 *
 * - dispatch: pending task를 claim 후 promptAsync 제출
 * - finalize: running task를 session status로 점검 후 completed/failed 확정
 *
 * prompt() 직접 대기를 피하고, running 상태를 비차단으로 관측/수렴한다.
 */

import { summarize, formatSummary } from "./summarizer";
import { Store, type Task } from "./store";
import { computeBackoffDelay } from "../utils/retry";
import type {
    OpenCodeServer,
    MessageWithParts,
} from "../opencode-server-wrapper";

type SessionStatusMap = Record<string, { type: string }>;

interface FailureOptions {
    resetSession?: boolean;
    markCompletedAt?: boolean;
}

export interface QueueOptions {
    maxRetries?: number;
    runningTimeoutMs?: number;
    retryBaseDelayMs?: number;
    retryMaxDelayMs?: number;
    now?: () => number;
}

export class Queue {
    private store: Store;
    private server: OpenCodeServer;
    private loopTimer: ReturnType<typeof setInterval> | null = null;
    private processingCycle = false;
    private maxRetries: number;
    private runningTimeoutMs: number;
    private retryBaseDelayMs: number;
    private retryMaxDelayMs: number;
    private now: () => number;

    constructor(
        store: Store,
        server: OpenCodeServer,
        options: QueueOptions = {},
    ) {
        this.store = store;
        this.server = server;
        this.maxRetries = options.maxRetries ?? 1;
        this.runningTimeoutMs = options.runningTimeoutMs ?? 120_000;
        this.retryBaseDelayMs = options.retryBaseDelayMs ?? 3_000;
        this.retryMaxDelayMs = options.retryMaxDelayMs ?? 60_000;
        this.now = options.now ?? (() => Date.now());
    }

    enqueue(prompt: string, source: string = "cli"): Task {
        return this.store.createTask(prompt, source);
    }

    async dispatchNext(): Promise<Task | null> {
        const task = this.store.claimNextPending(this.now());
        if (!task) return null;

        try {
            const session = task.sessionId
                ? { id: task.sessionId }
                : await this.server.createSession(task.prompt.slice(0, 80));

            if (!task.sessionId) {
                this.store.updateTask(task.id, { sessionId: session.id });
            }

            await this.server.promptAsync(session.id, task.prompt);
            // dispatch 성공 시 terminal 상태가 아니므로 null
            return null;
        } catch (error) {
            return this.handleFailure(task, error, {
                resetSession: true,
            });
        }
    }

    async finalizeRunning(): Promise<Task | null> {
        const running = this.store.listTasks({
            status: "running",
            limit: 1,
        })[0];
        if (!running) return null;

        if (!running.sessionId) {
            return this.handleFailure(
                running,
                new Error("Running task has no sessionId"),
                { resetSession: true },
            );
        }

        let statuses: SessionStatusMap;
        try {
            statuses =
                (await this.server.getSessionStatuses()) as SessionStatusMap;
        } catch (error) {
            return this.handleFailure(running, error, {
                resetSession: false,
                markCompletedAt: false,
            });
        }

        const status = statuses[running.sessionId];
        if (status && status.type !== "idle") {
            const startedAt = running.startedAt ?? running.createdAt;
            const elapsed = this.now() - startedAt;

            if (elapsed <= this.runningTimeoutMs) {
                return null;
            }

            await this.server.abortSession(running.sessionId).catch(() => {});
            return this.handleFailure(
                running,
                new Error(
                    `Running timeout exceeded ${this.runningTimeoutMs}ms`,
                ),
                { resetSession: true },
            );
        }

        try {
            const messages = await this.server.getMessages(running.sessionId);
            const assistant = this.findLastAssistant(messages);
            if (!assistant) {
                return this.handleFailure(
                    running,
                    new Error("No assistant message found after session idle"),
                    { resetSession: true },
                );
            }

            const summary = summarize({
                info: assistant.info as never,
                parts: assistant.parts as never,
            });
            const formatted = formatSummary(summary);

            return this.store.updateTask(running.id, {
                status: "completed",
                retryAt: null,
                result: formatted,
                error: null,
                completedAt: this.now(),
            });
        } catch (error) {
            return this.handleFailure(running, error, { resetSession: true });
        }
    }

    async processCycle(): Promise<Task | null> {
        if (this.processingCycle) return null;
        this.processingCycle = true;

        try {
            const finalized = await this.finalizeRunning();
            if (finalized) return finalized;
            return await this.dispatchNext();
        } finally {
            this.processingCycle = false;
        }
    }

    // 이전 인터페이스 호환
    async processNext(): Promise<Task | null> {
        return this.processCycle();
    }

    isRunning(): boolean {
        return this.processingCycle || this.store.hasRunning();
    }

    currentTask(): Task | null {
        return this.store.listTasks({ status: "running", limit: 1 })[0] ?? null;
    }

    getStats() {
        return this.store.getStats();
    }

    hasPending(): boolean {
        return this.store.getStats().pending > 0;
    }

    startLoop(
        options: {
            intervalMs?: number;
            onTaskProcessed?: (task: Task) => void | Promise<void>;
            onError?: (error: unknown) => void;
        } = {},
    ): void {
        if (this.loopTimer) return;
        const { intervalMs = 1000, onTaskProcessed, onError } = options;

        this.loopTimer = setInterval(async () => {
            try {
                const task = await this.processCycle();
                if (task && onTaskProcessed) {
                    await onTaskProcessed(task);
                }
            } catch (error) {
                onError?.(error);
            }
        }, intervalMs);
    }

    stopLoop(): void {
        if (!this.loopTimer) return;
        clearInterval(this.loopTimer);
        this.loopTimer = null;
    }

    private findLastAssistant(
        messages: MessageWithParts[],
    ): MessageWithParts | null {
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i]?.info?.role === "assistant") {
                return messages[i];
            }
        }
        return null;
    }

    private handleFailure(
        task: Task,
        error: unknown,
        options: FailureOptions = {},
    ): Task | null {
        const latest = this.store.getTask(task.id);
        const attempts = (latest?.attempts ?? task.attempts) + 1;
        const shouldRetry = attempts <= this.maxRetries;
        const message = error instanceof Error ? error.message : String(error);
        const now = this.now();
        const retryDelayMs = shouldRetry
            ? this.getRetryDelayMs(attempts)
            : null;
        const retryAt =
            shouldRetry && retryDelayMs !== null ? now + retryDelayMs : null;

        const updated = this.store.updateTask(task.id, {
            status: shouldRetry ? "pending" : "failed",
            attempts,
            error: message,
            retryAt,
            startedAt: shouldRetry ? null : task.startedAt,
            completedAt:
                options.markCompletedAt === false
                    ? task.completedAt
                    : shouldRetry
                      ? null
                      : now,
            sessionId: options.resetSession ? null : task.sessionId,
        });

        return shouldRetry ? null : updated;
    }

    private getRetryDelayMs(attempts: number): number {
        return computeBackoffDelay(attempts, {
            baseDelayMs: this.retryBaseDelayMs,
            maxDelayMs: this.retryMaxDelayMs,
            factor: 2,
        });
    }
}
