export interface ProjectRegistryEntry {
    id: string;
    name: string;
    rootDir: string;
    opencodeBaseUrl: string;
    stateDbPath: string;
    dashboardUrl?: string | null;
    tags?: string[];
    enabled?: boolean;
}

export interface RegisteredProject extends ProjectRegistryEntry {
    dashboardUrl: string | null;
    tags: string[];
    enabled: boolean;
}

export interface ProjectHealth {
    ok: boolean;
    version: string | null;
    error: string | null;
}

export interface TaskView {
    id: string;
    type: string;
    status: string;
    source: string;
    runAgent: string | null;
    summaryAgent: string | null;
    sessionId: string | null;
    createdAt: number;
    updatedAt: number;
    completedAt: number | null;
}

export interface InteractionView {
    id: string;
    type: string;
    status: string;
    origin: string;
    sessionId: string | null;
    requestId: string;
    createdAt: number;
    answeredAt: number | null;
}

export interface X4DecisionView {
    interactionId: string;
    interactionType: string;
    sessionId: string | null;
    score: number | null;
    route: string | null;
    reason: string | null;
    action: string | null;
    promptPresent: boolean;
    requestHash: string | null;
    parentId: string | null;
    reportTaskId: string | null;
    answeredAt: number | null;
}

export interface SessionListItem {
    id: string;
    title: string | null;
    status: string | null;
    createdAt: number | null;
    updatedAt: number | null;
}

export interface SessionMetricItem {
    id: string;
    role: string | null;
    agent: string | null;
    model: string | null;
    createdAt: number | null;
    completedAt: number | null;
    cost: number | null;
    tokens: {
        input: number;
        output: number;
        reasoning: number;
        cacheRead: number;
        cacheWrite: number;
    };
    toolNames: string[];
    textPartCount: number;
}

export interface SessionDetailView {
    session: SessionListItem;
    linkedTasks: Array<{
        id: string;
        source: string;
        status: string;
        createdAt: number;
        completedAt: number | null;
    }>;
    messages: {
        total: number;
        assistant: number;
        user: number;
    };
    execution: {
        observedAgents: string[];
        observedModels: string[];
    };
    tokens: {
        input: number;
        output: number;
        reasoning: number;
        cacheRead: number;
        cacheWrite: number;
    };
    cost: {
        totalUsd: number;
        assistantMessagesWithCost: number;
    };
    toolUsage: Array<{
        name: string;
        count: number;
    }>;
    timeline: SessionMetricItem[];
    todoCount: number | null;
    diffFileCount: number | null;
}

export interface WebThreadView {
    threadId: string;
    source: string;
    taskCount: number;
    pendingCount: number;
    runningCount: number;
    latestTaskAt: number | null;
    latestTaskId: string | null;
}

export interface ProjectOverview {
    project: RegisteredProject;
    health: ProjectHealth;
    sessions: {
        total: number;
        recent: SessionListItem[];
    };
    tasks: {
        stats: Record<string, number>;
        recent: TaskView[];
    };
    interactions: {
        stats: Record<string, number>;
        recent: InteractionView[];
        x4Recent: X4DecisionView[];
    };
    agents: {
        run: Array<{ name: string; count: number }>;
        summary: Array<{ name: string; count: number }>;
    };
    webThreads: WebThreadView[];
    metrics: {
        recent: Array<{
            id: string;
            eventType: string;
            source: string | null;
            status: string | null;
            reason: string | null;
            createdAt: number;
        }>;
    };
}
