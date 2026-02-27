import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { OpenCodeServer } from "../../src/opencode-server-wrapper";
import { Store, type Task } from "../../src/x2/store";

type Role = "assistant" | "user";

interface ToolAgg {
    name: string;
    count: number;
    completed: number;
    running: number;
    pending: number;
    error: number;
    totalDurationMs: number;
}

interface SessionMeasureReport {
    schemaVersion: "xoc_session_measure.v1";
    measuredAt: number;
    sessionId: string;
    taskLinks: Array<{
        taskId: string;
        source: string;
        status: string;
        createdAt: number;
        completedAt: number | null;
    }>;
    session: {
        title: string | null;
        createdAt: number | null;
        updatedAt: number | null;
    };
    message: {
        total: number;
        assistant: number;
        user: number;
    };
    cost: {
        totalUsd: number;
        assistantMessagesWithCost: number;
    };
    tokens: {
        input: number;
        output: number;
        reasoning: number;
        cacheRead: number;
        cacheWrite: number;
    };
    assistantLatencyMs: {
        total: number;
        max: number | null;
        measuredMessages: number;
    };
    tools: {
        totalParts: number;
        byName: ToolAgg[];
    };
    textParts: {
        total: number;
        chars: number;
    };
    todoCount: number | null;
    diffSummary: {
        files: number | null;
    } | null;
}

interface Args {
    sessionId?: string;
    taskId?: string;
    source?: string;
    linkStore: boolean;
    includeDiff: boolean;
    baseUrl: string;
    out?: string;
}

function toNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    return null;
}

function toText(value: unknown): string | null {
    return typeof value === "string" && value.length > 0 ? value : null;
}

function toRole(value: unknown): Role | null {
    if (value === "assistant" || value === "user") return value;
    return null;
}

function parseArgs(argv: string[]): Args {
    const args: Args = {
        linkStore: false,
        includeDiff: false,
        baseUrl: process.env.OPENCODE_BASE_URL ?? "http://127.0.0.1:4996",
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const next = argv[i + 1];
        switch (arg) {
            case "--session":
                if (!next) throw new Error("--session requires a value");
                args.sessionId = next;
                i++;
                break;
            case "--task":
                if (!next) throw new Error("--task requires a task id");
                args.taskId = next;
                i++;
                break;
            case "--source":
                if (!next) throw new Error("--source requires a value");
                args.source = next;
                i++;
                break;
            case "--base-url":
                if (!next) throw new Error("--base-url requires a value");
                args.baseUrl = next;
                i++;
                break;
            case "--diff":
                args.includeDiff = true;
                break;
            case "--link-store":
                args.linkStore = true;
                break;
            case "--out":
                if (!next) throw new Error("--out requires a path");
                args.out = next;
                i++;
                break;
            case "--help":
                printHelp();
                process.exit(0);
            default:
                throw new Error(`Unknown argument: ${arg}`);
        }
    }

    return args;
}

function printHelp() {
    console.log(`Usage:
  bun run .devserver/dev_code/script/xoc-session-measure.ts [options]

Options:
  --session <id>         force this session id (X_oc only)
  --task <id>            resolve session id from task id
  --source <value>       fallback: latest task by source (default: any)
  --base-url <url>       opencode base url (default: http://127.0.0.1:4996)
  --link-store           include task links from state.db (optional)
  --diff                 include session diff summary
  --out <path>           write JSON report to file
  --help                 show this help`);
}

function findTaskById(tasks: Task[], id: string): Task | null {
    return tasks.find((t) => t.id === id) ?? null;
}

function resolveSessionIdFromStore(args: Args): {
    sessionId: string;
    linkedTasks: Task[];
} {
    // Forced mode: no store dependency unless explicitly requested.
    if (args.sessionId) {
        if (!args.linkStore) {
            return { sessionId: args.sessionId, linkedTasks: [] };
        }
        const store = new Store();
        try {
            const tasks = store.listTasks({ type: "omo_request" });
            const linked = tasks.filter((t) => t.sessionId === args.sessionId);
            return { sessionId: args.sessionId, linkedTasks: linked };
        } finally {
            store.close();
        }
    }

    const store = new Store();
    try {
        const tasks = store.listTasks({ type: "omo_request" });

        if (args.taskId) {
            const task = findTaskById(tasks, args.taskId);
            if (!task) throw new Error(`Task not found: ${args.taskId}`);
            if (!task.sessionId) {
                throw new Error(`Task has no sessionId yet: ${args.taskId}`);
            }
            return {
                sessionId: task.sessionId,
                linkedTasks: tasks.filter(
                    (t) => t.sessionId === task.sessionId,
                ),
            };
        }

        const sourceFiltered = args.source
            ? tasks.filter((t) => t.source === args.source)
            : tasks;
        const withSession = sourceFiltered
            .filter((t) => !!t.sessionId)
            .sort((a, b) => b.createdAt - a.createdAt);
        const latest = withSession[0];
        if (!latest || !latest.sessionId) {
            throw new Error("No task with sessionId found for requested scope");
        }
        return {
            sessionId: latest.sessionId,
            linkedTasks: tasks.filter((t) => t.sessionId === latest.sessionId),
        };
    } finally {
        store.close();
    }
}

function getToolAgg(map: Map<string, ToolAgg>, name: string): ToolAgg {
    const existing = map.get(name);
    if (existing) return existing;
    const created: ToolAgg = {
        name,
        count: 0,
        completed: 0,
        running: 0,
        pending: 0,
        error: 0,
        totalDurationMs: 0,
    };
    map.set(name, created);
    return created;
}

async function buildReport(args: Args): Promise<SessionMeasureReport> {
    const resolved = resolveSessionIdFromStore(args);
    const server = OpenCodeServer.getInstance(args.baseUrl);
    const sessionId = resolved.sessionId;

    const [sessionRaw, messagesRaw, todosRaw] = await Promise.all([
        server.getSession(sessionId),
        server.getMessages(sessionId),
        server.getSessionTodos(sessionId).catch(() => null),
    ]);
    const diffRaw = args.includeDiff
        ? await server.getSessionDiff(sessionId).catch(() => null)
        : null;

    const messages = Array.isArray(messagesRaw) ? messagesRaw : [];
    let assistantCount = 0;
    let userCount = 0;
    let totalCost = 0;
    let assistantCostCount = 0;
    let tokenIn = 0;
    let tokenOut = 0;
    let tokenReasoning = 0;
    let cacheRead = 0;
    let cacheWrite = 0;
    let assistantLatencyTotal = 0;
    let assistantLatencyMeasured = 0;
    let assistantLatencyMax: number | null = null;
    let totalToolParts = 0;
    const toolMap = new Map<string, ToolAgg>();
    let textPartCount = 0;
    let textChars = 0;

    for (const msg of messages as Array<Record<string, unknown>>) {
        const info = (msg.info as Record<string, unknown> | undefined) ?? {};
        const role = toRole(info.role);
        if (role === "assistant") assistantCount++;
        if (role === "user") userCount++;

        if (role === "assistant") {
            const cost = toNumber(info.cost);
            if (cost !== null) {
                totalCost += cost;
                assistantCostCount += 1;
            }
            const tokens =
                (info.tokens as Record<string, unknown> | undefined) ?? {};
            tokenIn += toNumber(tokens.input) ?? 0;
            tokenOut += toNumber(tokens.output) ?? 0;
            tokenReasoning += toNumber(tokens.reasoning) ?? 0;
            const cache =
                (tokens.cache as Record<string, unknown> | undefined) ?? {};
            cacheRead += toNumber(cache.read) ?? 0;
            cacheWrite += toNumber(cache.write) ?? 0;

            const time =
                (info.time as Record<string, unknown> | undefined) ?? {};
            const created = toNumber(time.created);
            const completed = toNumber(time.completed);
            if (
                created !== null &&
                completed !== null &&
                completed >= created
            ) {
                const latency = completed - created;
                assistantLatencyTotal += latency;
                assistantLatencyMeasured += 1;
                assistantLatencyMax =
                    assistantLatencyMax === null
                        ? latency
                        : Math.max(assistantLatencyMax, latency);
            }
        }

        const parts = Array.isArray(msg.parts) ? msg.parts : [];
        for (const part of parts as Array<Record<string, unknown>>) {
            const type = toText(part.type);
            if (type === "text") {
                textPartCount += 1;
                const text = toText(part.text) ?? "";
                textChars += text.length;
                continue;
            }

            if (type === "tool") {
                totalToolParts += 1;
                const toolName = toText(part.tool) ?? "unknown";
                const agg = getToolAgg(toolMap, toolName);
                agg.count += 1;

                const state =
                    (part.state as Record<string, unknown> | undefined) ?? {};
                const status = toText(state.status) ?? "unknown";
                if (status === "completed") agg.completed += 1;
                else if (status === "running") agg.running += 1;
                else if (status === "pending") agg.pending += 1;
                else if (status === "error") agg.error += 1;

                const time =
                    (state.time as Record<string, unknown> | undefined) ?? {};
                const start = toNumber(time.start);
                const end = toNumber(time.end);
                if (start !== null && end !== null && end >= start) {
                    agg.totalDurationMs += end - start;
                }
            }
        }
    }

    const sessionObj = (sessionRaw as Record<string, unknown> | null) ?? {};
    const sessionTime =
        (sessionObj.time as Record<string, unknown> | undefined) ?? {};
    const todoCount = Array.isArray(todosRaw) ? todosRaw.length : null;
    const diffSummary = diffRaw
        ? {
              files: Array.isArray(diffRaw) ? diffRaw.length : null,
          }
        : null;

    return {
        schemaVersion: "xoc_session_measure.v1",
        measuredAt: Date.now(),
        sessionId,
        taskLinks: resolved.linkedTasks.map((task) => ({
            taskId: task.id,
            source: task.source,
            status: task.status,
            createdAt: task.createdAt,
            completedAt: task.completedAt,
        })),
        session: {
            title: toText(sessionObj.title),
            createdAt: toNumber(sessionTime.created),
            updatedAt: toNumber(sessionTime.updated),
        },
        message: {
            total: messages.length,
            assistant: assistantCount,
            user: userCount,
        },
        cost: {
            totalUsd: Number(totalCost.toFixed(6)),
            assistantMessagesWithCost: assistantCostCount,
        },
        tokens: {
            input: tokenIn,
            output: tokenOut,
            reasoning: tokenReasoning,
            cacheRead,
            cacheWrite,
        },
        assistantLatencyMs: {
            total: assistantLatencyTotal,
            max: assistantLatencyMax,
            measuredMessages: assistantLatencyMeasured,
        },
        tools: {
            totalParts: totalToolParts,
            byName: [...toolMap.values()].sort((a, b) =>
                a.name.localeCompare(b.name),
            ),
        },
        textParts: {
            total: textPartCount,
            chars: textChars,
        },
        todoCount,
        diffSummary,
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const report = await buildReport(args);
    const json = JSON.stringify(report, null, 2);

    if (args.out) {
        writeFileSync(resolve(args.out), `${json}\n`, "utf8");
    }
    console.log(json);
}

await main();
