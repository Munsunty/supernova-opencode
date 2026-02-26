import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Store, type Task, type TaskStatus } from "../.devserver/x2/store";

export interface XocX4MonitorOptions {
    dbPath?: string;
    sinceMs?: number;
    limit?: number;
    source?: string;
    opencodeLogPath?: string;
}

export interface XocTaskMeasurement {
    taskId: string;
    sessionId: string | null;
    source: string;
    status: TaskStatus;
    createdAt: number;
    completedAt: number | null;
    durationMs: number | null;
    attempts: number;
    errorClass: string | null;
    costUsd: number | null;
    tokensIn: number | null;
    tokensOut: number | null;
    summaryText: string;
    logMatched: boolean;
    logLastEventAt: string | null;
    logProvider: string | null;
    logPromptLoops: number;
    logExitedLoop: boolean;
    logStatusPolls: number;
    recommendedX4Action: "report" | "new_task" | "skip";
}

export interface XocX4MetricsReport {
    schemaVersion: "xoc_x4_metrics.v1";
    measuredAt: number;
    sinceMs: number | null;
    sourceFilter: string | null;
    opencodeLogPath: string | null;
    totalTasks: number;
    statusCounts: Record<TaskStatus, number>;
    recommendedActionCounts: {
        report: number;
        new_task: number;
        skip: number;
    };
    latencyMs: {
        p50: number | null;
        p90: number | null;
        max: number | null;
    };
    cost: {
        totalUsd: number;
        measuredCount: number;
    };
    tokens: {
        totalIn: number;
        totalOut: number;
        measuredCount: number;
    };
    logSummary: {
        loaded: boolean;
        lines: number;
        sessions: number;
        matchedRows: number;
    };
    rows: XocTaskMeasurement[];
}

interface ParsedSummary {
    summaryText: string;
    rawText: string;
    costUsd: number | null;
    tokensIn: number | null;
    tokensOut: number | null;
}

interface SessionLogStats {
    sessionId: string;
    lastEventAt: string | null;
    provider: string | null;
    promptLoops: number;
    exitedLoop: boolean;
    statusPolls: number;
}

interface LogSummary {
    loaded: boolean;
    path: string | null;
    lines: number;
    sessions: Map<string, SessionLogStats>;
}

const DEFAULT_LOG_PATH = ".devserver/data/opencode/log/2026-02-26T032706.log";

function parseSessionId(line: string): string | null {
    const byLabel = line.match(/sessionID=(ses_[A-Za-z0-9]+)/);
    if (byLabel?.[1]) return byLabel[1];
    const byPath = line.match(/\/session\/(ses_[A-Za-z0-9]+)/);
    if (byPath?.[1]) return byPath[1];
    const byCreate = line.match(/service=session id=(ses_[A-Za-z0-9]+)/);
    if (byCreate?.[1]) return byCreate[1];
    return null;
}

function parseTimestampIso(line: string): string | null {
    const m = line.match(/^\w+\s+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
    return m?.[1] ? `${m[1]}Z` : null;
}

function upsertSession(
    sessions: Map<string, SessionLogStats>,
    sessionId: string,
): SessionLogStats {
    const existing = sessions.get(sessionId);
    if (existing) return existing;
    const created: SessionLogStats = {
        sessionId,
        lastEventAt: null,
        provider: null,
        promptLoops: 0,
        exitedLoop: false,
        statusPolls: 0,
    };
    sessions.set(sessionId, created);
    return created;
}

function loadOpencodeLogSummary(pathInput?: string): LogSummary {
    const path = pathInput ?? DEFAULT_LOG_PATH;
    if (!existsSync(path)) {
        return {
            loaded: false,
            path,
            lines: 0,
            sessions: new Map<string, SessionLogStats>(),
        };
    }

    const text = readFileSync(path, "utf8");
    const lines = text.split("\n");
    const sessions = new Map<string, SessionLogStats>();

    for (const line of lines) {
        if (!line.trim()) continue;
        const sessionId = parseSessionId(line);
        if (!sessionId) continue;
        const stats = upsertSession(sessions, sessionId);
        const ts = parseTimestampIso(line);
        if (ts) stats.lastEventAt = ts;

        if (line.includes("service=llm ") && line.includes("providerID=")) {
            const providerMatch = line.match(/providerID=([^\s]+)/);
            if (providerMatch?.[1]) {
                stats.provider = providerMatch[1];
            }
        }
        if (
            line.includes("service=session.prompt") &&
            line.includes(" step=") &&
            line.includes(" loop")
        ) {
            stats.promptLoops += 1;
        }
        if (
            line.includes("service=session.prompt") &&
            line.includes(" exiting loop")
        ) {
            stats.exitedLoop = true;
        }
        if (
            line.includes(
                "service=server method=GET path=/session/status request",
            )
        ) {
            stats.statusPolls += 1;
        }
    }

    return {
        loaded: true,
        path,
        lines: lines.length,
        sessions,
    };
}

function parseNumber(value: string | undefined): number | null {
    if (!value) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function parseXocResult(result: string | null): ParsedSummary {
    if (!result) {
        return {
            summaryText: "",
            rawText: "",
            costUsd: null,
            tokensIn: null,
            tokensOut: null,
        };
    }

    const costMatch = result.match(/Cost:\s*\$([0-9]+(?:\.[0-9]+)?)/i);
    const tokenMatch = result.match(/Tokens:\s*(\d+)in\s*\/\s*(\d+)out/i);

    const summaryText = result.split("\n\n")[0] ?? "";
    return {
        summaryText,
        rawText: result,
        costUsd: parseNumber(costMatch?.[1]),
        tokensIn: parseNumber(tokenMatch?.[1]),
        tokensOut: parseNumber(tokenMatch?.[2]),
    };
}

function percentile(values: number[], p: number): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(
        sorted.length - 1,
        Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
    );
    return sorted[index] ?? null;
}

function getDurationMs(task: Task): number | null {
    if (task.completedAt === null) return null;
    const started = task.startedAt ?? task.createdAt;
    return Math.max(0, task.completedAt - started);
}

function hasFollowUpSignal(text: string): boolean {
    const lowered = text.toLowerCase();
    const keywords = ["todo", "fixme", "다음 단계", "추가 작업", "follow-up"];
    return keywords.some((keyword) => lowered.includes(keyword.toLowerCase()));
}

function suggestX4Action(
    task: Task,
    text: string,
): XocTaskMeasurement["recommendedX4Action"] {
    if (task.status === "failed") return "report";
    if (task.status !== "completed") return "skip";
    if (hasFollowUpSignal(text)) return "new_task";
    return "skip";
}

function mapTaskToMeasurement(
    store: Store,
    task: Task,
    logSummary: LogSummary,
): XocTaskMeasurement {
    const metric =
        store.listMetricEvents({
            eventType: "task_terminal",
            taskId: task.id,
            limit: 1,
        })[0] ?? null;
    const parsed = parseXocResult(task.result);
    const logStats = task.sessionId
        ? (logSummary.sessions.get(task.sessionId) ?? null)
        : null;

    return {
        taskId: task.id,
        sessionId: task.sessionId,
        source: task.source,
        status: task.status,
        createdAt: task.createdAt,
        completedAt: task.completedAt,
        durationMs: metric?.durationMs ?? getDurationMs(task),
        attempts: task.attempts,
        errorClass: metric?.errorClass ?? null,
        costUsd: parsed.costUsd,
        tokensIn: parsed.tokensIn,
        tokensOut: parsed.tokensOut,
        summaryText: parsed.summaryText,
        logMatched: logStats !== null,
        logLastEventAt: logStats?.lastEventAt ?? null,
        logProvider: logStats?.provider ?? null,
        logPromptLoops: logStats?.promptLoops ?? 0,
        logExitedLoop: logStats?.exitedLoop ?? false,
        logStatusPolls: logStats?.statusPolls ?? 0,
        recommendedX4Action: suggestX4Action(task, parsed.rawText),
    };
}

export function collectXocX4Metrics(
    options: XocX4MonitorOptions = {},
): XocX4MetricsReport {
    const store = new Store(options.dbPath);
    try {
        const logSummary = loadOpencodeLogSummary(options.opencodeLogPath);
        const allTasks = store.listTasks({ type: "omo_request" });
        const sourceQuery =
            options.source && options.source.trim().length > 0
                ? options.source.trim().toLowerCase()
                : null;
        const filtered = allTasks.filter((task) => {
            const sinceMatched =
                options.sinceMs === undefined
                    ? true
                    : task.createdAt >= options.sinceMs;
            const sourceMatched =
                sourceQuery === null
                    ? true
                    : task.source.toLowerCase().includes(sourceQuery);
            return sinceMatched && sourceMatched;
        });
        const rows = (
            options.limit ? filtered.slice(-options.limit) : filtered
        ).map((task) => mapTaskToMeasurement(store, task, logSummary));

        const statusCounts: Record<TaskStatus, number> = {
            pending: 0,
            running: 0,
            completed: 0,
            failed: 0,
        };
        const actionCounts = {
            report: 0,
            new_task: 0,
            skip: 0,
        };

        const durations: number[] = [];
        let totalCost = 0;
        let costMeasuredCount = 0;
        let totalIn = 0;
        let totalOut = 0;
        let tokenMeasuredCount = 0;

        for (const row of rows) {
            statusCounts[row.status] += 1;
            actionCounts[row.recommendedX4Action] += 1;
            if (typeof row.durationMs === "number") {
                durations.push(row.durationMs);
            }
            if (typeof row.costUsd === "number") {
                totalCost += row.costUsd;
                costMeasuredCount += 1;
            }
            if (
                typeof row.tokensIn === "number" &&
                typeof row.tokensOut === "number"
            ) {
                totalIn += row.tokensIn;
                totalOut += row.tokensOut;
                tokenMeasuredCount += 1;
            }
        }

        return {
            schemaVersion: "xoc_x4_metrics.v1",
            measuredAt: Date.now(),
            sinceMs: options.sinceMs ?? null,
            sourceFilter: options.source ?? null,
            opencodeLogPath: logSummary.loaded ? logSummary.path : null,
            totalTasks: rows.length,
            statusCounts,
            recommendedActionCounts: actionCounts,
            latencyMs: {
                p50: percentile(durations, 50),
                p90: percentile(durations, 90),
                max: durations.length > 0 ? Math.max(...durations) : null,
            },
            cost: {
                totalUsd: Number(totalCost.toFixed(6)),
                measuredCount: costMeasuredCount,
            },
            tokens: {
                totalIn,
                totalOut,
                measuredCount: tokenMeasuredCount,
            },
            logSummary: {
                loaded: logSummary.loaded,
                lines: logSummary.lines,
                sessions: logSummary.sessions.size,
                matchedRows: rows.filter((row) => row.logMatched).length,
            },
            rows,
        };
    } finally {
        store.close();
    }
}

function parseArgs(argv: string[]) {
    const args = {
        dbPath: undefined as string | undefined,
        sinceHours: undefined as number | undefined,
        limit: undefined as number | undefined,
        source: undefined as string | undefined,
        opencodeLogPath: undefined as string | undefined,
        out: undefined as string | undefined,
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const next = argv[i + 1];

        switch (arg) {
            case "--db":
                if (!next) throw new Error("--db requires a path");
                args.dbPath = next;
                i++;
                break;
            case "--since-hours":
                if (!next) throw new Error("--since-hours requires a number");
                args.sinceHours = Number(next);
                i++;
                break;
            case "--limit":
                if (!next) throw new Error("--limit requires a number");
                args.limit = Number(next);
                i++;
                break;
            case "--source":
                if (!next) throw new Error("--source requires a value");
                args.source = next;
                i++;
                break;
            case "--opencode-log":
                if (!next)
                    throw new Error("--opencode-log requires a file path");
                args.opencodeLogPath = next;
                i++;
                break;
            case "--out":
                if (!next) throw new Error("--out requires a file path");
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

    if (
        args.sinceHours !== undefined &&
        (!Number.isFinite(args.sinceHours) || args.sinceHours < 0)
    ) {
        throw new Error("--since-hours must be a number >= 0");
    }
    if (
        args.limit !== undefined &&
        (!Number.isFinite(args.limit) || args.limit < 1)
    ) {
        throw new Error("--limit must be a number >= 1");
    }

    return args;
}

function printHelp() {
    console.log(`Usage:
  bun run script/xoc-x4-monitor.ts [options]

Options:
  --db <path>            state.db path (default: .devserver/x2/store default path)
  --since-hours <n>      measure tasks created in last N hours
  --limit <n>            output most recent N tasks only
  --source <text>        source contains filter (case-insensitive)
  --opencode-log <path>  parse opencode log and enrich per-session metrics
  --out <path>           write JSON report to file
  --help                 show this help`);
}

function formatLineReport(report: XocX4MetricsReport): string {
    const lines = [
        `[xoc_x4_metrics.v1] measured_at=${new Date(report.measuredAt).toISOString()}`,
        `source_filter=${report.sourceFilter ?? "n/a"}`,
        `opencode_log=${report.opencodeLogPath ?? "n/a"}`,
        `total_tasks=${report.totalTasks}`,
        `status pending=${report.statusCounts.pending} running=${report.statusCounts.running} completed=${report.statusCounts.completed} failed=${report.statusCounts.failed}`,
        `action report=${report.recommendedActionCounts.report} new_task=${report.recommendedActionCounts.new_task} skip=${report.recommendedActionCounts.skip}`,
        `latency_ms p50=${report.latencyMs.p50 ?? "n/a"} p90=${report.latencyMs.p90 ?? "n/a"} max=${report.latencyMs.max ?? "n/a"}`,
        `cost total_usd=${report.cost.totalUsd} measured=${report.cost.measuredCount}`,
        `tokens in=${report.tokens.totalIn} out=${report.tokens.totalOut} measured=${report.tokens.measuredCount}`,
        `log loaded=${report.logSummary.loaded} lines=${report.logSummary.lines} sessions=${report.logSummary.sessions} matched_rows=${report.logSummary.matchedRows}`,
    ];
    return lines.join("\n");
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const sinceMs =
        args.sinceHours === undefined
            ? undefined
            : Date.now() - args.sinceHours * 60 * 60 * 1000;

    const report = collectXocX4Metrics({
        dbPath: args.dbPath,
        sinceMs,
        limit: args.limit,
        source: args.source,
        opencodeLogPath: args.opencodeLogPath,
    });

    const json = JSON.stringify(report, null, 2);
    if (args.out) {
        writeFileSync(resolve(args.out), `${json}\n`, "utf8");
    }

    console.log(formatLineReport(report));
    if (!args.out) {
        console.log(json);
    }
}

if (import.meta.main) {
    await main();
}
