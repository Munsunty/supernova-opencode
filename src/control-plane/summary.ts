import { Store, type Interaction, type Task } from "../x2/store";
import { OpenCodeServer } from "../opencode-server-wrapper";
import type {
    ProjectHealth,
    ProjectOverview,
    RegisteredProject,
    SessionDetailView,
    SessionListItem,
    SessionMetricItem,
    WebThreadView,
    X4DecisionView,
} from "./types";

type UnknownRecord = Record<string, unknown>;

function toText(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function toNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    return null;
}

function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(raw: string | null): UnknownRecord | null {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as unknown;
        return isRecord(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function countBy<T extends string>(values: T[]): Array<{ name: string; count: number }> {
    const counts = new Map<string, number>();
    for (const value of values) {
        const next = counts.get(value) ?? 0;
        counts.set(value, next + 1);
    }
    return [...counts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
}

function normalizeSession(item: unknown, statuses: Record<string, { type?: unknown }>): SessionListItem | null {
    if (!isRecord(item)) return null;
    const id = toText(item.id);
    if (!id) return null;

    const time = isRecord(item.time) ? item.time : null;
    const title = toText(item.title);
    return {
        id,
        title,
        status: toText(statuses[id]?.type) ?? null,
        createdAt: toNumber(time?.created) ?? toNumber(item.createdAt),
        updatedAt: toNumber(time?.updated) ?? toNumber(item.updatedAt),
    };
}

function summarizeWebThreads(tasks: Task[]): WebThreadView[] {
    const grouped = new Map<string, WebThreadView>();

    for (const task of tasks) {
        if (!task.source.startsWith("web#thread:")) continue;
        const threadId = task.source.slice("web#thread:".length) || "main";
        const existing = grouped.get(task.source) ?? {
            threadId,
            source: task.source,
            taskCount: 0,
            pendingCount: 0,
            runningCount: 0,
            latestTaskAt: null,
            latestTaskId: null,
        };
        existing.taskCount += 1;
        if (task.status === "pending") existing.pendingCount += 1;
        if (task.status === "running") existing.runningCount += 1;
        if (existing.latestTaskAt === null || task.createdAt > existing.latestTaskAt) {
            existing.latestTaskAt = task.createdAt;
            existing.latestTaskId = task.id;
        }
        grouped.set(task.source, existing);
    }

    return [...grouped.values()].sort(
        (left, right) => (right.latestTaskAt ?? 0) - (left.latestTaskAt ?? 0),
    );
}

function parseX4Decision(interaction: Interaction): X4DecisionView | null {
    const answer = parseJson(interaction.answer);
    if (!answer) return null;
    const evaluation = isRecord(answer.evaluation) ? answer.evaluation : null;
    const decision = isRecord(answer.x4_decision) ? answer.x4_decision : null;

    if (!decision) return null;

    return {
        interactionId: interaction.id,
        interactionType: interaction.type,
        sessionId: interaction.sessionId,
        score: toNumber(evaluation?.score),
        route: toText(evaluation?.route),
        reason: toText(decision.reason) ?? toText(evaluation?.reason),
        action: toText(decision.action),
        promptPresent: typeof decision.prompt === "string" && decision.prompt.trim().length > 0,
        requestHash: toText(decision.request_hash),
        parentId: toText(decision.parent_id),
        reportTaskId: toText(answer.report_task_id),
        answeredAt: interaction.answeredAt,
    };
}

async function readHealth(project: RegisteredProject): Promise<ProjectHealth> {
    try {
        const server = OpenCodeServer.connect(project.opencodeBaseUrl);
        const health = await server.health();
        return {
            ok: !!health.healthy,
            version: health.version ?? null,
            error: null,
        };
    } catch (error) {
        return {
            ok: false,
            version: null,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

async function listRecentSessions(project: RegisteredProject): Promise<SessionListItem[]> {
    try {
        const server = OpenCodeServer.connect(project.opencodeBaseUrl);
        const [sessionsRaw, statusesRaw] = await Promise.all([
            server.listSessions({ directory: project.rootDir }).catch(() => []),
            server.getSessionStatuses().catch(() => ({})),
        ]);
        const statuses = isRecord(statusesRaw) ? (statusesRaw as Record<string, { type?: unknown }>) : {};
        const sessions = Array.isArray(sessionsRaw) ? sessionsRaw : [];
        return sessions
            .map((item) => normalizeSession(item, statuses))
            .filter((item): item is SessionListItem => item !== null)
            .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))
            .slice(0, 8);
    } catch {
        return [];
    }
}

function toolNamesFromMessage(item: UnknownRecord): string[] {
    const parts = Array.isArray(item.parts) ? item.parts : [];
    const names: string[] = [];
    for (const part of parts) {
        if (!isRecord(part)) continue;
        if (toText(part.type) !== "tool") continue;
        const toolName = toText(part.tool);
        if (toolName) names.push(toolName);
    }
    return names;
}

function textPartCount(item: UnknownRecord): number {
    const parts = Array.isArray(item.parts) ? item.parts : [];
    let count = 0;
    for (const part of parts) {
        if (!isRecord(part)) continue;
        if (toText(part.type) === "text") count += 1;
    }
    return count;
}

function tokensFromInfo(info: UnknownRecord | null) {
    const tokens = info && isRecord(info.tokens) ? info.tokens : null;
    const cache = tokens && isRecord(tokens.cache) ? tokens.cache : null;
    return {
        input: toNumber(tokens?.input) ?? 0,
        output: toNumber(tokens?.output) ?? 0,
        reasoning: toNumber(tokens?.reasoning) ?? 0,
        cacheRead: toNumber(cache?.read) ?? 0,
        cacheWrite: toNumber(cache?.write) ?? 0,
    };
}

function modelFromInfo(info: UnknownRecord | null): string | null {
    if (!info) return null;
    const directProvider = toText(info.providerID);
    const directModel = toText(info.modelID);
    if (directProvider && directModel) {
        return `${directProvider}/${directModel}`;
    }
    const model = isRecord(info.model) ? info.model : null;
    const provider = toText(model?.providerID);
    const modelId = toText(model?.modelID);
    if (provider && modelId) {
        return `${provider}/${modelId}`;
    }
    return null;
}

export async function createProjectOverview(
    project: RegisteredProject,
): Promise<ProjectOverview> {
    const store = new Store(project.stateDbPath);
    try {
        const tasks = [...store.listTasks()].sort((left, right) => right.createdAt - left.createdAt);
        const interactions = [...store.listInteractions()].sort(
            (left, right) => right.createdAt - left.createdAt,
        );
        const metrics = store.listMetricEvents({ limit: 20 });
        const [health, recentSessions] = await Promise.all([
            readHealth(project),
            listRecentSessions(project),
        ]);

        return {
            project,
            health,
            sessions: {
                total: recentSessions.length,
                recent: recentSessions,
            },
            tasks: {
                stats: store.getStats(),
                recent: tasks.slice(0, 12).map((task) => ({
                    id: task.id,
                    type: task.type,
                    status: task.status,
                    source: task.source,
                    runAgent: task.runAgent,
                    summaryAgent: task.summaryAgent,
                    sessionId: task.sessionId,
                    createdAt: task.createdAt,
                    updatedAt: task.updatedAt,
                    completedAt: task.completedAt,
                })),
            },
            interactions: {
                stats: store.getInteractionStats(),
                recent: interactions.slice(0, 12).map((interaction) => ({
                    id: interaction.id,
                    type: interaction.type,
                    status: interaction.status,
                    origin: interaction.origin,
                    sessionId: interaction.sessionId,
                    requestId: interaction.requestId,
                    createdAt: interaction.createdAt,
                    answeredAt: interaction.answeredAt,
                })),
                x4Recent: interactions
                    .map((interaction) => parseX4Decision(interaction))
                    .filter((item): item is X4DecisionView => item !== null)
                    .sort(
                        (left, right) =>
                            (right.answeredAt ?? 0) - (left.answeredAt ?? 0),
                    )
                    .slice(0, 12),
            },
            agents: {
                run: countBy(
                    tasks
                        .map((task) => task.runAgent)
                        .filter((value): value is string => typeof value === "string" && value.length > 0),
                ),
                summary: countBy(
                    tasks
                        .map((task) => task.summaryAgent)
                        .filter((value): value is string => typeof value === "string" && value.length > 0),
                ),
            },
            webThreads: summarizeWebThreads(tasks).slice(0, 12),
            metrics: {
                recent: metrics.map((metric) => ({
                    id: metric.id,
                    eventType: metric.eventType,
                    source: metric.source,
                    status: metric.status,
                    reason: metric.reason,
                    createdAt: metric.createdAt,
                })),
            },
        };
    } finally {
        store.close();
    }
}

export async function createSessionDetail(
    project: RegisteredProject,
    sessionId: string,
): Promise<SessionDetailView> {
    const store = new Store(project.stateDbPath);
    try {
        const server = OpenCodeServer.connect(project.opencodeBaseUrl);
        const [sessionRaw, messagesRaw, todosRaw, diffRaw] = await Promise.all([
            server.getSession(sessionId),
            server.getMessages(sessionId, { limit: 200 }),
            server.getSessionTodos(sessionId).catch(() => null),
            server.getSessionDiff(sessionId).catch(() => null),
        ]);

        const sessionRecord = isRecord(sessionRaw) ? sessionRaw : {};
        const statusesRaw = await server.getSessionStatuses().catch(() => ({}));
        const statuses = isRecord(statusesRaw) ? (statusesRaw as Record<string, { type?: unknown }>) : {};
        const session = normalizeSession(sessionRecord, statuses) ?? {
            id: sessionId,
            title: null,
            status: null,
            createdAt: null,
            updatedAt: null,
        };

        const messages = Array.isArray(messagesRaw) ? messagesRaw : [];
        const linkedTasks = store
            .listTasks()
            .filter((task) => task.sessionId === sessionId)
            .sort((left, right) => right.createdAt - left.createdAt);

        let assistant = 0;
        let user = 0;
        let cost = 0;
        let costCount = 0;
        const observedAgents = new Set<string>();
        const observedModels = new Set<string>();
        const toolCounts = new Map<string, number>();
        const timeline: SessionMetricItem[] = [];
        const tokenTotals = {
            input: 0,
            output: 0,
            reasoning: 0,
            cacheRead: 0,
            cacheWrite: 0,
        };

        for (const item of messages as UnknownRecord[]) {
            const info = isRecord(item.info) ? item.info : null;
            const role = toText(info?.role);
            if (role === "assistant") assistant += 1;
            if (role === "user") user += 1;

            const itemTokens = tokensFromInfo(info);
            tokenTotals.input += itemTokens.input;
            tokenTotals.output += itemTokens.output;
            tokenTotals.reasoning += itemTokens.reasoning;
            tokenTotals.cacheRead += itemTokens.cacheRead;
            tokenTotals.cacheWrite += itemTokens.cacheWrite;

            const agent = toText(info?.agent);
            const model = modelFromInfo(info);
            if (agent) observedAgents.add(agent);
            if (model) observedModels.add(model);

            const itemCost = toNumber(info?.cost);
            if (role === "assistant" && itemCost !== null) {
                cost += itemCost;
                costCount += 1;
            }

            const toolNames = toolNamesFromMessage(item);
            for (const toolName of toolNames) {
                const next = toolCounts.get(toolName) ?? 0;
                toolCounts.set(toolName, next + 1);
            }

            const time = info && isRecord(info.time) ? info.time : null;
            timeline.push({
                id: toText(info?.id) ?? crypto.randomUUID(),
                role,
                agent,
                model,
                createdAt: toNumber(time?.created),
                completedAt: toNumber(time?.completed),
                cost: itemCost,
                tokens: itemTokens,
                toolNames,
                textPartCount: textPartCount(item),
            });
        }

        const diffItems = Array.isArray(diffRaw) ? diffRaw : null;
        const todos = Array.isArray(todosRaw) ? todosRaw : null;

        return {
            session,
            linkedTasks: linkedTasks.map((task) => ({
                id: task.id,
                source: task.source,
                status: task.status,
                createdAt: task.createdAt,
                completedAt: task.completedAt,
            })),
            messages: {
                total: messages.length,
                assistant,
                user,
            },
            execution: {
                observedAgents: [...observedAgents].sort(),
                observedModels: [...observedModels].sort(),
            },
            tokens: tokenTotals,
            cost: {
                totalUsd: Number(cost.toFixed(6)),
                assistantMessagesWithCost: costCount,
            },
            toolUsage: [...toolCounts.entries()]
                .map(([name, count]) => ({ name, count }))
                .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name)),
            timeline: timeline
                .sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0))
                .slice(0, 30),
            todoCount: todos ? todos.length : null,
            diffFileCount: diffItems ? diffItems.length : null,
        };
    } finally {
        store.close();
    }
}

export function enqueueWebTask(
    project: RegisteredProject,
    input: {
        prompt: string;
        threadId?: string | null;
        type?: "omo_request" | "report";
    },
) {
    const prompt = input.prompt.trim();
    if (!prompt) {
        throw new Error("prompt is required");
    }

    const threadId = (input.threadId ?? "main").trim() || "main";
    const safeThreadId = threadId.replace(/[^a-zA-Z0-9:_-]/g, "-").slice(0, 80);
    const source = `web#thread:${safeThreadId}`;

    const store = new Store(project.stateDbPath);
    try {
        const task = store.createTask(
            prompt,
            source,
            input.type === "report" ? "report" : "omo_request",
        );
        store.appendMetricEvent({
            eventType: "web_channel_enqueue",
            traceId: task.id,
            taskId: task.id,
            taskType: task.type,
            source,
            status: "pending",
            reason: "web_prompt_enqueued",
            backlog: store.getStats().pending,
            payload: JSON.stringify({
                threadId: safeThreadId,
            }),
        });
        return {
            taskId: task.id,
            threadId: safeThreadId,
            source,
            createdAt: task.createdAt,
            status: task.status,
        };
    } finally {
        store.close();
    }
}
