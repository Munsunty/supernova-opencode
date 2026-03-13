/**
 * X₂ Queue — dispatch/finalize 분리 실행
 *
 * - dispatch: pending task를 claim 후 promptAsync 제출
 * - finalize: running task를 session status로 점검 후 completed/failed 확정
 *
 * prompt() 직접 대기를 피하고, running 상태를 비차단으로 관측/수렴한다.
 */

import { summarize, formatSummary, type Summary } from "./summarizer";
import { Store, type Task, type TaskType } from "./store";
import type { Eq1Client } from "../eq1/llm-client";
import { isEq1TaskType } from "../eq1/task-types";
import { createHash } from "node:crypto";
import {
    computeBackoffDelay,
    createLogger,
    extractTelegramChatIdFromTaskSource,
    opencodeAgent,
} from "../utils";
import type {
    OpenCodeServer,
    MessageWithParts,
} from "../opencode-server-wrapper";

type SessionStatusMap = Record<string, { type: string }>;
type TaskTransitionReason = string;

const logger = createLogger("X2.Queue");
const FINALIZE_RECENT_MESSAGE_LIMIT = 40;
const FINALIZE_EXPANDED_MESSAGE_LIMIT = 400;

interface FailureOptions {
    resetSession?: boolean;
    markCompletedAt?: boolean;
}

interface TaskEventMessageInfo {
    role: "user" | "assistant";
    sessionId: string;
    messageId: string;
    parentId: string | null;
    createdAt: number | null;
}

export type AgentRoutingMode = "fixed" | "auto";

export interface QueueOptions {
    eq1Client?: Eq1Client | null;
    maxRetries?: number;
    retryBaseDelayMs?: number;
    retryMaxDelayMs?: number;
    now?: () => number;
    bypassAgent?: string | null;
    x2Dispatcher?: ReturnType<(typeof opencodeAgent)["X2_dispatcher"]> | null;
    summarizerAgent?: string | null;
    agentRoutingMode?: AgentRoutingMode;
    simpleAgent?: string | null;
    complexAgent?: string | null;
}

function buildEq1RequestHash(task: Task): string {
    return createHash("sha256")
        .update(task.type)
        .update("\n")
        .update(task.source)
        .update("\n")
        .update(task.prompt)
        .digest("hex");
}

interface FormattedSummaryResult {
    text: string;
    summaryAgent: string;
    summaryModel: string | null;
}

function toText(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function toNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function formatProviderModel(provider: unknown, model: unknown): string | null {
    const modelText = toText(model);
    if (!modelText) return null;
    const providerText = toText(provider);
    return providerText ? `${providerText}/${modelText}` : modelText;
}

function normalizeResultText(value: string | null | undefined): string {
    if (typeof value !== "string") return "(empty result)";
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : "(empty result)";
}

interface PromptComplexity {
    level: "simple" | "complex";
    reason: string;
}

const COMPLEX_KEYWORDS = [
    "refactor",
    "architecture",
    "migrate",
    "migration",
    "workflow",
    "design",
    "risk",
    "rollback",
    "multi-file",
    "cross-file",
    "integration",
    "시스템",
    "구조",
    "아키텍처",
    "리팩터",
    "마이그레이션",
    "다중 파일",
    "복잡",
    "리스크",
    "장애",
    "복구",
];

function assessPromptComplexity(prompt: string): PromptComplexity {
    const text = prompt.trim();
    if (!text) {
        return {
            level: "simple",
            reason: "empty_prompt",
        };
    }

    const lineCount = text.split("\n").length;
    if (lineCount >= 8) {
        return {
            level: "complex",
            reason: "many_lines",
        };
    }

    if (text.length >= 320) {
        return {
            level: "complex",
            reason: "long_prompt",
        };
    }

    const lowered = text.toLowerCase();
    for (const keyword of COMPLEX_KEYWORDS) {
        if (lowered.includes(keyword)) {
            return {
                level: "complex",
                reason: `keyword:${keyword}`,
            };
        }
    }

    return {
        level: "simple",
        reason: "default_simple",
    };
}

interface DispatchRoute {
    agent: string | null;
    route:
        | "fixed"
        | "eq1_simple"
        | "eq1_complex"
        | "auto_simple"
        | "auto_complex"
        | "none";
    reason: string;
}

interface Eq1RoutingDecision {
    level: "simple" | "complex";
    reason: string;
    provider: string;
    model: string | null;
}

const EQ1_COMPLEX_CUES = [
    "complex",
    "high",
    "risk",
    "risky",
    "oholiab",
    "deep",
    "hard",
    "difficult",
    "복잡",
    "리스크",
    "고위험",
];

const EQ1_SIMPLE_CUES = [
    "simple",
    "low",
    "safe",
    "spark",
    "quick",
    "easy",
    "trivial",
    "단순",
    "저위험",
    "간단",
];

function normalizeCueText(raw: string): string {
    return raw.trim().toLowerCase();
}

function includesAnyCue(text: string, cues: string[]): boolean {
    return cues.some((cue) => text.includes(cue));
}

export class Queue {
    private store: Store;
    private server: OpenCodeServer;
    private eq1Client: Eq1Client | null;
    private loopTimer: ReturnType<typeof setInterval> | null = null;
    private processingCycle = false;
    private maxRetries: number;
    private retryBaseDelayMs: number;
    private retryMaxDelayMs: number;
    private now: () => number;
    private x2Dispatcher: ReturnType<(typeof opencodeAgent)["X2_dispatcher"]>;
    private bypassAgent: string | null;
    private summarizerAgent: string | null;
    private agentRoutingMode: AgentRoutingMode;
    private simpleAgent: string | null;
    private complexAgent: string | null;

    constructor(
        store: Store,
        server: OpenCodeServer,
        options: QueueOptions = {},
    ) {
        this.store = store;
        this.server = server;
        this.eq1Client = options.eq1Client ?? null;
        this.maxRetries = options.maxRetries ?? 1;
        this.retryBaseDelayMs = options.retryBaseDelayMs ?? 3_000;
        this.retryMaxDelayMs = options.retryMaxDelayMs ?? 60_000;
        this.now = options.now ?? (() => Date.now());
        this.x2Dispatcher =
            options.x2Dispatcher ?? opencodeAgent.X2_dispatcher(null);
        this.bypassAgent = options.bypassAgent
            ? options.bypassAgent.trim() || null
            : null;
        this.summarizerAgent = options.summarizerAgent
            ? options.summarizerAgent.trim() || null
            : null;
        this.agentRoutingMode =
            options.agentRoutingMode === "auto" ? "auto" : "fixed";
        this.simpleAgent = options.simpleAgent
            ? options.simpleAgent.trim() || null
            : null;
        this.complexAgent = options.complexAgent
            ? options.complexAgent.trim() || null
            : null;
    }

    enqueue(
        prompt: string,
        source: string = "cli",
        type: TaskType = "omo_request",
        sessionId?: string | null,
    ): Task {
        return this.store.createTask(prompt, source, type, sessionId);
    }

    ingestEvent(event: unknown): boolean {
        const info = this.extractEventMessageInfo(event);
        if (!info) return false;
        return this.bindEventMessageToRunningTask(info);
    }

    async dispatchNext(): Promise<Task | null> {
        const task = this.store.claimNextPending(this.now());
        if (!task) return null;
        this.logTaskTransition(
            task,
            "pending",
            "running",
            "claimed_for_dispatch",
        );

        if (task.type === "report") {
            // report는 X_oc 실행 대상이 아니라 전달 대상이므로 즉시 완료 처리한다.
            const updated = this.store.updateTask(task.id, {
                status: "completed",
                retryAt: null,
                rawResult: task.prompt,
                result: task.prompt,
                error: null,
                runAgent: "x4",
                runModel: null,
                summaryAgent: "x2-direct",
                summaryModel: null,
                completedAt: this.now(),
            });
            this.logTaskTransition(
                updated,
                "running",
                "completed",
                "report_auto_completed",
            );
            return updated;
        }

        if (isEq1TaskType(task.type)) {
            try {
                if (!this.eq1Client) {
                    throw new Error(
                        "Eq1 task cannot run: eq1Client is not configured",
                    );
                }

                const result = await this.eq1Client.run({
                    type: task.type,
                    input: task.prompt,
                    context: {
                        source: task.source,
                        taskId: task.id,
                    },
                });

                const stored = JSON.stringify(
                    {
                        schema_version: "eq1_result.v1",
                        request_hash: buildEq1RequestHash(task),
                        type: result.type,
                        provider: result.provider,
                        model: result.model,
                        attempts: result.attempts,
                        usage: result.usage,
                        latencyMs: result.latencyMs,
                        output: result.output,
                    },
                    null,
                    2,
                );

                const updated = this.store.updateTask(task.id, {
                    status: "completed",
                    retryAt: null,
                    rawResult: stored,
                    result: stored,
                    error: null,
                    runAgent: "eq1",
                    runModel: formatProviderModel(
                        result.provider,
                        result.model,
                    ),
                    summaryAgent: "eq1-direct",
                    summaryModel: formatProviderModel(
                        result.provider,
                        result.model,
                    ),
                    completedAt: this.now(),
                });
                this.logTaskTransition(
                    updated,
                    "running",
                    "completed",
                    "eq1_task_completed",
                    {
                        provider: result.provider,
                    },
                );
                return updated;
            } catch (error) {
                return this.handleFailure(task, error, {
                    resetSession: false,
                });
            }
        }

        try {
            const telegramChatId = extractTelegramChatIdFromTaskSource(
                task.source,
            );
            const reusedSessionId =
                task.sessionId ??
                (telegramChatId
                    ? this.store.findLatestSessionIdBySource(task.source, {
                          excludeTaskId: task.id,
                      })
                    : null);
            const session = reusedSessionId
                ? { id: reusedSessionId }
                : await this.server.createSession(task.prompt.slice(0, 80));

            if (task.sessionId !== session.id) {
                this.store.updateTask(task.id, { sessionId: session.id });
            }

            const route = await this.resolveDispatchRoute(task);
            this.store.updateTask(task.id, {
                requestMessageId: null,
                assistantMessageId: null,
                runAgent: route.agent,
                runModel: null,
                summaryAgent: null,
                summaryModel: null,
            });
            await this.x2Dispatcher.prompt(
                this.server,
                session.id,
                task.prompt,
                route.agent,
            );
            this.logTaskTransition(
                task,
                "running",
                "running",
                "opencode_prompt_dispatched",
                {
                    sessionId: session.id,
                    bypassAgent: route.agent,
                    bypassModel: this.x2Dispatcher.model,
                    agentRoute: route.route,
                    agentRouteReason: route.reason,
                },
            );
            // dispatch 성공 시 terminal 상태가 아니므로 null
            return null;
        } catch (error) {
            return this.handleFailure(task, error, {
                resetSession: true,
            });
        }
    }

    private preferredAgentForLevel(level: "simple" | "complex"): string | null {
        const complexPreferred =
            this.complexAgent ?? this.bypassAgent ?? this.simpleAgent ?? null;
        const simplePreferred =
            this.simpleAgent ?? this.bypassAgent ?? this.complexAgent ?? null;
        return level === "complex" ? complexPreferred : simplePreferred;
    }

    private selectEq1RoutingLevel(
        output: Record<string, unknown>,
    ): { level: "simple" | "complex"; reason: string } | null {
        const candidates = [
            toText(output.route),
            toText(output.level),
            toText(output.action),
            toText(output.agent),
            toText(output.agent_tier),
            toText(output.strategy),
        ];

        for (const candidate of candidates) {
            if (!candidate) continue;
            const normalized = normalizeCueText(candidate);
            if (includesAnyCue(normalized, EQ1_COMPLEX_CUES)) {
                return {
                    level: "complex",
                    reason: `eq1:${normalized}`,
                };
            }
            if (includesAnyCue(normalized, EQ1_SIMPLE_CUES)) {
                return {
                    level: "simple",
                    reason: `eq1:${normalized}`,
                };
            }
        }

        const scoreRaw =
            output.risk_score ??
            output.complexity_score ??
            output.score ??
            output.risk;
        const score = toNumber(scoreRaw);
        if (score !== null) {
            return {
                level: score >= 7 ? "complex" : "simple",
                reason: `eq1:score_${score}`,
            };
        }

        return null;
    }

    private buildEq1RoutingPrompt(task: Task): string {
        return JSON.stringify(
            {
                schema_version: "x2_agent_routing_request.v1",
                objective:
                    "Classify task complexity for execution agent routing only.",
                policy: {
                    simple: "route to spark",
                    complex_or_risky: "route to oholiab",
                },
                input: {
                    source: task.source,
                    prompt: task.prompt,
                },
                output_contract: {
                    required: ["route", "reason"],
                    route: ["simple", "complex"],
                },
            },
            null,
            2,
        );
    }

    private async resolveEq1RoutingDecision(
        task: Task,
    ): Promise<Eq1RoutingDecision | null> {
        if (!this.eq1Client) return null;

        try {
            const result = await this.eq1Client.classify(
                this.buildEq1RoutingPrompt(task),
                {
                    source: "x2_agent_routing",
                    taskId: task.id,
                    taskSource: task.source,
                },
            );
            const output = this.asRecord(result.output);
            if (!output) {
                logger.warn("x2_agent_routing_eq1_non_object", {
                    task: task.id.slice(0, 8),
                    provider: result.provider,
                    model: result.model ?? null,
                });
                return null;
            }

            const selected = this.selectEq1RoutingLevel(output);
            if (!selected) {
                logger.warn("x2_agent_routing_eq1_unrecognized", {
                    task: task.id.slice(0, 8),
                    provider: result.provider,
                    model: result.model ?? null,
                });
                return null;
            }

            return {
                level: selected.level,
                reason: selected.reason,
                provider: result.provider,
                model: result.model ?? null,
            };
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            logger.warn("x2_agent_routing_eq1_failed", {
                task: task.id.slice(0, 8),
                error: message,
            });
            return null;
        }
    }

    private async resolveDispatchRoute(task: Task): Promise<DispatchRoute> {
        if (task.type !== "omo_request") {
            return {
                agent: null,
                route: "none",
                reason: "non_omo_request",
            };
        }

        if (this.agentRoutingMode === "fixed") {
            return {
                agent: this.bypassAgent,
                route: "fixed",
                reason: "routing_mode_fixed",
            };
        }

        const eq1Decision = await this.resolveEq1RoutingDecision(task);
        if (eq1Decision) {
            const selected = this.preferredAgentForLevel(eq1Decision.level);
            logger.info("x2_agent_routing_eq1_selected", {
                task: task.id.slice(0, 8),
                level: eq1Decision.level,
                reason: eq1Decision.reason,
                provider: eq1Decision.provider,
                model: eq1Decision.model,
                selectedAgent: selected,
            });
            return {
                agent: selected,
                route:
                    eq1Decision.level === "complex"
                        ? "eq1_complex"
                        : "eq1_simple",
                reason: eq1Decision.reason,
            };
        }

        const complexity = assessPromptComplexity(task.prompt);
        const selected = this.preferredAgentForLevel(complexity.level);

        return {
            agent: selected,
            route:
                complexity.level === "complex" ? "auto_complex" : "auto_simple",
            reason: complexity.reason,
        };
    }

    async finalizeRunning(): Promise<Task | null> {
        const running = this.store.listTasks({
            status: "running",
            limit: 1,
        })[0];
        if (!running) return null;

        if (!running.sessionId) {
            const failed = this.handleFailure(
                running,
                new Error("Running task has no sessionId"),
                { resetSession: true },
            );
            if (failed) {
                this.logTaskTransition(
                    failed,
                    "running",
                    failed.status,
                    "finalization_pending_session",
                );
            }
            return failed;
        }

        let statuses: SessionStatusMap;
        try {
            statuses =
                (await this.server.getSessionStatuses()) as SessionStatusMap;
        } catch (error) {
            const failed = this.handleFailure(running, error, {
                resetSession: false,
                markCompletedAt: false,
            });
            if (failed) {
                this.logTaskTransition(
                    failed,
                    "running",
                    failed.status,
                    "finalization_no_status",
                );
            }
            return failed;
        }

        const status = statuses[running.sessionId];
        if (status && status.type !== "idle") {
            // omo_request는 X_oc 코딩 에이전트 실행이므로 시간 제한을 두지 않는다.
            // 완료 판단은 세션이 idle이 될 때까지 폴링으로 수렴한다.
            // stale 상태 복구는 worker 재시작 시 recoverRunningTasks가 담당한다.
            return null;
        }

        try {
            const taskStartedAt = running.startedAt ?? running.createdAt;
            let assistant = await this.findAssistantByTrackedMessage(
                running,
                taskStartedAt,
            );

            if (!assistant) {
                const recentMessages = await this.server.getMessages(
                    running.sessionId,
                    { limit: FINALIZE_RECENT_MESSAGE_LIMIT },
                );
                assistant = this.findAssistantForTask(
                    recentMessages,
                    taskStartedAt,
                );

                if (
                    !assistant &&
                    recentMessages.length >= FINALIZE_RECENT_MESSAGE_LIMIT
                ) {
                    const expandedMessages = await this.server.getMessages(
                        running.sessionId,
                        { limit: FINALIZE_EXPANDED_MESSAGE_LIMIT },
                    );
                    assistant = this.findAssistantForTask(
                        expandedMessages,
                        taskStartedAt,
                    );
                }
            }

            if (!assistant) {
                const failed = this.handleFailure(
                    running,
                    new Error("No assistant message found after session idle"),
                    { resetSession: true },
                );
                if (failed) {
                    this.logTaskTransition(
                        failed,
                        "running",
                        failed.status,
                        "finalization_no_assistant",
                    );
                }
                return failed;
            }

            const summary = summarize({
                info: assistant.info as never,
                parts: assistant.parts as never,
            });
            const rawResult = normalizeResultText(summary.text);
            const formatted = await this.formatResultSummary(running, summary);
            const observedRun = opencodeAgent.message_meta(assistant.info);

            const updated = this.store.updateTask(running.id, {
                status: "completed",
                retryAt: null,
                rawResult,
                result: formatted.text,
                error: null,
                runAgent:
                    observedRun.agent ??
                    running.runAgent ??
                    this.bypassAgent ??
                    this.simpleAgent ??
                    this.complexAgent ??
                    null,
                runModel: observedRun.model ?? running.runModel ?? null,
                summaryAgent: formatted.summaryAgent,
                summaryModel: formatted.summaryModel,
                completedAt: this.now(),
            });
            this.logTaskTransition(
                updated,
                "running",
                "completed",
                "finalization_idle_complete",
            );
            return updated;
        } catch (error) {
            const failed = this.handleFailure(running, error, {
                resetSession: true,
            });
            if (failed) {
                this.logTaskTransition(
                    failed,
                    "running",
                    failed.status,
                    "finalization_failed",
                );
            }
            return failed;
        }
    }

    private async formatResultSummary(
        task: Task,
        summary: Summary,
    ): Promise<FormattedSummaryResult> {
        const result = await opencodeAgent.X2_summarize(this.server, {
            task: {
                id: task.id,
                type: task.type,
                source: task.source,
            },
            summary: {
                text: summary.text,
                files: summary.files,
                tools: summary.tools,
                cost: summary.cost,
                tokens: summary.tokens,
                duration: summary.duration,
            },
            fallbackText: formatSummary(summary),
            summarizerAgent: this.summarizerAgent,
        });

        if (result.usedAgent) {
            logger.info("x2_summary_agent_applied", {
                task: task.id.slice(0, 8),
                agent: result.summaryAgent,
                model: result.summaryModel,
            });
        } else if (result.error) {
            logger.warn("x2_summary_agent_failed", {
                task: task.id.slice(0, 8),
                agent: this.summarizerAgent,
                error: result.error,
            });
        }

        return {
            text: result.text,
            summaryAgent: result.summaryAgent,
            summaryModel: result.summaryModel,
        };
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

    private findAssistantForTask(
        messages: MessageWithParts[],
        startedAt: number,
    ): MessageWithParts | null {
        for (let i = messages.length - 1; i >= 0; i--) {
            const message = messages[i];
            if (message?.info?.role !== "assistant") continue;

            const createdAt = this.messageCreatedAt(message);
            if (createdAt === null || createdAt >= startedAt) {
                return message;
            }
        }
        return null;
    }

    private messageCreatedAt(message: MessageWithParts): number | null {
        const info = message.info as {
            time?: {
                created?: unknown;
            };
        };
        const created = info.time?.created;
        if (typeof created !== "number" || !Number.isFinite(created)) {
            return null;
        }
        return created;
    }

    private async findAssistantByTrackedMessage(
        task: Task,
        startedAt: number,
    ): Promise<MessageWithParts | null> {
        if (!task.sessionId || !task.assistantMessageId) return null;

        try {
            const message = (await this.server.getMessage(
                task.sessionId,
                task.assistantMessageId,
            )) as MessageWithParts;

            if (message?.info?.role !== "assistant") return null;

            const createdAt = this.messageCreatedAt(message);
            if (createdAt !== null && createdAt < startedAt) {
                return null;
            }

            return message;
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            logger.warn("tracked_assistant_message_lookup_failed", {
                task: task.id.slice(0, 8),
                sessionId: task.sessionId,
                messageId: task.assistantMessageId,
                error: message,
            });
            return null;
        }
    }

    private bindEventMessageToRunningTask(info: TaskEventMessageInfo): boolean {
        const runningTasks = this.store.listTasks({
            status: "running",
            limit: 10,
        });

        for (const task of runningTasks) {
            if (!task.sessionId || task.sessionId !== info.sessionId) {
                continue;
            }

            const taskStartedAt = task.startedAt ?? task.createdAt;
            if (info.createdAt !== null && info.createdAt < taskStartedAt) {
                continue;
            }

            const updates: Partial<
                Pick<Task, "requestMessageId" | "assistantMessageId">
            > = {};

            if (info.role === "user") {
                if (task.requestMessageId !== info.messageId) {
                    updates.requestMessageId = info.messageId;
                }
            } else {
                if (task.assistantMessageId !== info.messageId) {
                    updates.assistantMessageId = info.messageId;
                }
                if (info.parentId && task.requestMessageId !== info.parentId) {
                    updates.requestMessageId = info.parentId;
                }
            }

            if (
                updates.requestMessageId === undefined &&
                updates.assistantMessageId === undefined
            ) {
                return false;
            }

            const updated = this.store.updateTask(task.id, updates);
            logger.debug("task_message_bound", {
                task: updated.id.slice(0, 8),
                sessionId: updated.sessionId,
                role: info.role,
                messageId: info.messageId,
                parentId: info.parentId,
                requestMessageId: updated.requestMessageId,
                assistantMessageId: updated.assistantMessageId,
            });
            return true;
        }

        return false;
    }

    private extractEventMessageInfo(
        event: unknown,
    ): TaskEventMessageInfo | null {
        const normalized = this.normalizeEventPayload(event);
        if (!normalized) return null;
        if (normalized.type !== "message.updated") return null;

        const properties = this.asRecord(normalized.properties);
        const info = this.asRecord(properties?.info);
        if (!info) return null;

        const role = info.role;
        if (role !== "user" && role !== "assistant") return null;

        const sessionId =
            typeof info.sessionID === "string" ? info.sessionID : null;
        const messageId = typeof info.id === "string" ? info.id : null;
        if (!sessionId || !messageId) return null;

        const parentId =
            typeof info.parentID === "string" ? info.parentID : null;

        const time = this.asRecord(info.time);
        const createdAtRaw = time?.created;
        const createdAt =
            typeof createdAtRaw === "number" && Number.isFinite(createdAtRaw)
                ? createdAtRaw
                : null;

        return {
            role,
            sessionId,
            messageId,
            parentId,
            createdAt,
        };
    }

    private normalizeEventPayload(
        event: unknown,
    ): { type?: unknown; properties?: unknown } | null {
        const root = this.asRecord(event);
        if (!root) return null;

        if (typeof root.type === "string") {
            return root as { type?: unknown; properties?: unknown };
        }

        const payload = this.asRecord(root.payload);
        if (!payload || typeof payload.type !== "string") return null;
        return payload as { type?: unknown; properties?: unknown };
    }

    private asRecord(value: unknown): Record<string, unknown> | null {
        return typeof value === "object" && value !== null
            ? (value as Record<string, unknown>)
            : null;
    }

    private handleFailure(
        task: Task,
        error: unknown,
        options: FailureOptions = {},
    ): Task | null {
        const latest = this.store.getTask(task.id);
        const attempts = (latest?.attempts ?? task.attempts) + 1;
        // Eq1 호출은 provider-level retry만 사용해 task-level retry 중첩을 방지한다.
        const shouldRetry =
            !isEq1TaskType(task.type) && attempts <= this.maxRetries;
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
        this.logTaskTransition(
            updated,
            task.status,
            updated.status,
            shouldRetry ? "retry_scheduled" : "final_status",
            {
                attempts,
                retryDelayMs: shouldRetry ? retryDelayMs : null,
                markCompletedAt: options.markCompletedAt ?? true,
            },
        );

        return shouldRetry ? null : updated;
    }

    private logTaskTransition(
        task: Task,
        from: "pending" | "running" | "completed" | "failed",
        to: "pending" | "running" | "completed" | "failed",
        reason: TaskTransitionReason,
        extra?: Record<string, string | number | null | boolean | undefined>,
    ): void {
        const payload = {
            trace_id: task.id,
            task_id: task.id,
            from,
            to,
            reason,
            type: task.type,
            source: task.source,
            ...(extra ?? {}),
        };
        logger.info("task_state_transition", payload);
        this.store.appendMetricEvent({
            eventType: "task_state_transition",
            traceId: task.id,
            taskId: task.id,
            taskType: task.type,
            status: to,
            from: from,
            to: to,
            reason,
            source: task.source,
            backlog: this.store.getStats().pending,
            payload: JSON.stringify(payload),
        });
    }

    private getRetryDelayMs(attempts: number): number {
        return computeBackoffDelay(attempts, {
            baseDelayMs: this.retryBaseDelayMs,
            maxDelayMs: this.retryMaxDelayMs,
            factor: 2,
        });
    }
}
