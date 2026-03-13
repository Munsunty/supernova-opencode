import { OpenCodeServer } from "../opencode-server-wrapper";
import { Queue } from "./queue";
import {
    Router,
    ConsoleReporter,
    TelegramReporter,
    type Reporter,
} from "./router";
import { Store, type Task, type TaskType } from "./store";
import { createEq1ClientFromEnv } from "../eq1/create-client";
import { isEq1TaskType } from "../eq1/task-types";
import { createLogger, opencodeAgent, retryAsync } from "../utils";
import type { AgentRoutingMode } from "./queue";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface WorkerOptions {
    enqueuePrompt: string | null;
    enqueueType: TaskType;
    source: string;
    bypassAgent: string | null;
    bypassModel: string | null;
    agentRoutingMode: AgentRoutingMode;
    simpleAgent: string | null;
    complexAgent: string | null;
    summarizerAgent: string | null;
    eventSubscribe: boolean;
    once: boolean;
    intervalMs: number;
    maxRetries: number;
    retryBaseMs: number;
    retryMaxMs: number;
    baseUrl: string;
}

function parseOptionalAgent(
    raw: string | undefined,
    fallback: string | null,
): string | null {
    if (raw === undefined) return fallback;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const lowered = trimmed.toLowerCase();
    if (lowered === "off" || lowered === "none" || lowered === "null") {
        return null;
    }
    return trimmed;
}

function parseRoutingMode(
    raw: string | undefined,
    fallback: AgentRoutingMode,
): AgentRoutingMode {
    if (raw === undefined) return fallback;
    const normalized = raw.trim().toLowerCase();
    if (normalized === "auto") return "auto";
    if (normalized === "fixed") return "fixed";
    return fallback;
}

const logger = createLogger("X2.Worker");

function normalizeEnvValue(raw: string): string {
    const trimmed = raw.trim();
    if (
        (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
}

function loadDotEnvFile(envPath: string): number {
    if (!existsSync(envPath)) return 0;
    const text = readFileSync(envPath, "utf8");
    let loaded = 0;

    for (const rawLine of text.split("\n")) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        const eq = line.indexOf("=");
        if (eq <= 0) continue;

        const key = line.slice(0, eq).trim();
        if (!key || process.env[key] !== undefined) continue;

        const value = normalizeEnvValue(line.slice(eq + 1));
        process.env[key] = value;
        loaded += 1;
    }

    return loaded;
}

function bootstrapEnv() {
    const workerDir = dirname(fileURLToPath(import.meta.url));
    const localEnvPath = resolve(workerDir, "..", "..", ".env");
    const loaded = loadDotEnvFile(localEnvPath);
    if (loaded > 0) {
        logger.info("dotenv_loaded", {
            path: localEnvPath,
            count: loaded,
        });
    }
}

function parseBypassModel(raw: string): string {
    const normalized = opencodeAgent.X2_normalize_bypass_model(raw);
    if (!normalized) {
        throw new Error(`Invalid bypass model format: ${raw}`);
    }
    return normalized;
}

function parseOptionalBypassModel(raw: string | undefined): string | null {
    if (raw === undefined) return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
        return parseBypassModel(trimmed);
    } catch (error) {
        logger.warn("invalid_bypass_model", {
            raw: trimmed,
            fallback: null,
            reason:
                error instanceof Error
                    ? error.message
                    : "Invalid bypass model format",
        });
        return null;
    }
}

function parseBooleanEnv(raw: string | undefined, fallback: boolean): boolean {
    if (raw === undefined) return fallback;
    const normalized = raw.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
    return fallback;
}

function firstNonEmpty(
    ...values: Array<string | null | undefined>
): string | null {
    for (const value of values) {
        if (typeof value !== "string") continue;
        const trimmed = value.trim();
        if (trimmed.length > 0) return trimmed;
    }
    return null;
}

function createReporter(): Reporter {
    const fallback = new ConsoleReporter();
    const telegramReportEnabled = parseBooleanEnv(
        process.env.X2_TELEGRAM_REPORT,
        true,
    );
    if (!telegramReportEnabled) {
        logger.info("x2_reporter_console_only", {
            reason: "telegram_report_disabled",
        });
        return fallback;
    }

    const token = (
        process.env.OPENCODE_X1_BOT_TOKEN ??
        process.env.OPENCODE_X1_POLLER_TOKEN ??
        process.env.TELEGRAM_BOT_TOKEN ??
        ""
    ).trim();
    if (!token) {
        logger.info("x2_reporter_console_only", {
            reason: "telegram_token_missing",
        });
        return fallback;
    }

    const apiBase =
        firstNonEmpty(
            process.env.OPENCODE_X1_API_BASE,
            process.env.TELEGRAM_API_BASE,
        ) ?? "https://api.telegram.org";
    logger.info("x2_reporter_telegram_enabled", {
        apiBase,
    });
    return new TelegramReporter({
        token,
        apiBase,
        fallback,
    });
}

function isTaskType(value: string): value is TaskType {
    return (
        value === "omo_request" || value === "report" || isEq1TaskType(value)
    );
}

function assertTaskType(value: string): TaskType {
    if (!isTaskType(value)) {
        throw new Error(
            `--type must be one of: omo_request, classify, evaluate, summarize, route, report`,
        );
    }
    return value;
}

function parseArgs(argv: string[]): WorkerOptions {
    const options: WorkerOptions = {
        enqueuePrompt: null,
        enqueueType: "omo_request",
        source: "cli",
        bypassAgent: parseOptionalAgent(
            process.env.X2_AGENT_BYPASS_AGENT,
            null,
        ),
        bypassModel: parseOptionalBypassModel(
            process.env.X2_AGENT_BYPASS_MODEL,
        ),
        agentRoutingMode: parseRoutingMode(
            process.env.X2_AGENT_ROUTING,
            "auto",
        ),
        simpleAgent: parseOptionalAgent(
            process.env.X2_AGENT_SIMPLE_AGENT,
            "spark",
        ),
        complexAgent: parseOptionalAgent(
            process.env.X2_AGENT_COMPLEX_AGENT,
            "oholiab",
        ),
        summarizerAgent: parseOptionalAgent(
            process.env.X2_SUMMARIZER_AGENT,
            "x2-summarizer",
        ),
        eventSubscribe: parseBooleanEnv(process.env.X2_EVENT_SUBSCRIBE, true),
        once: false,
        intervalMs: 3000,
        maxRetries: 1,
        retryBaseMs: 3000,
        retryMaxMs: 60000,
        baseUrl:
            firstNonEmpty(process.env.OPENCODE_BASE_URL) ??
            "http://127.0.0.1:4996",
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const next = argv[i + 1];

        switch (arg) {
            case "--enqueue":
                if (!next) throw new Error("--enqueue requires a prompt");
                options.enqueuePrompt = next;
                i++;
                break;
            case "--source":
                if (!next) throw new Error("--source requires a value");
                options.source = next;
                i++;
                break;
            case "--type":
                if (!next) throw new Error("--type requires a task type");
                options.enqueueType = assertTaskType(next);
                i++;
                break;
            case "--once":
                options.once = true;
                break;
            case "--event-subscribe":
                options.eventSubscribe = true;
                break;
            case "--no-event-subscribe":
                options.eventSubscribe = false;
                break;
            case "--x2-summarizer-agent":
                if (!next)
                    throw new Error(
                        "--x2-summarizer-agent requires an agent name",
                    );
                options.summarizerAgent = parseOptionalAgent(next, null);
                i++;
                break;
            case "--no-x2-summarizer-agent":
                options.summarizerAgent = null;
                break;
            case "--interval":
                if (!next) throw new Error("--interval requires milliseconds");
                options.intervalMs = Number(next);
                i++;
                break;
            case "--max-retries":
                if (!next) throw new Error("--max-retries requires a number");
                options.maxRetries = Number(next);
                i++;
                break;
            case "--retry-base-ms":
                if (!next)
                    throw new Error("--retry-base-ms requires milliseconds");
                options.retryBaseMs = Number(next);
                i++;
                break;
            case "--retry-max-ms":
                if (!next)
                    throw new Error("--retry-max-ms requires milliseconds");
                options.retryMaxMs = Number(next);
                i++;
                break;
            case "--base-url":
                if (!next) throw new Error("--base-url requires a URL");
                options.baseUrl = next;
                i++;
                break;
            case "--bypass-agent":
                if (!next)
                    throw new Error("--bypass-agent requires an agent name");
                options.bypassAgent = next;
                options.agentRoutingMode = "fixed";
                i++;
                break;
            case "--bypass-model":
                if (!next)
                    throw new Error("--bypass-model requires a model value");
                options.bypassModel = parseBypassModel(next);
                i++;
                break;
            case "--agent-routing":
                if (!next)
                    throw new Error(
                        "--agent-routing requires one of: auto | fixed",
                    );
                options.agentRoutingMode = parseRoutingMode(next, "auto");
                i++;
                break;
            case "--simple-agent":
                if (!next)
                    throw new Error("--simple-agent requires an agent name");
                options.simpleAgent = parseOptionalAgent(next, null);
                i++;
                break;
            case "--complex-agent":
                if (!next)
                    throw new Error("--complex-agent requires an agent name");
                options.complexAgent = parseOptionalAgent(next, null);
                i++;
                break;
            case "--help":
                printHelp();
                process.exit(0);
            default:
                throw new Error(`Unknown argument: ${arg}`);
        }
    }

    if (!Number.isFinite(options.intervalMs) || options.intervalMs < 200) {
        throw new Error("--interval must be a number >= 200");
    }
    if (!Number.isFinite(options.maxRetries) || options.maxRetries < 0) {
        throw new Error("--max-retries must be a number >= 0");
    }
    if (!Number.isFinite(options.retryBaseMs) || options.retryBaseMs < 100) {
        throw new Error("--retry-base-ms must be a number >= 100");
    }
    if (!Number.isFinite(options.retryMaxMs) || options.retryMaxMs < 100) {
        throw new Error("--retry-max-ms must be a number >= 100");
    }
    if (options.retryMaxMs < options.retryBaseMs) {
        throw new Error("--retry-max-ms must be >= --retry-base-ms");
    }

    return options;
}

function printHelp() {
    console.log(`Usage:
  bun run .devserver/src/x2/worker.ts [options]

Options:
  --enqueue "<prompt>"   Create a new task before running
  --type <taskType>      Task type (omo_request|classify|evaluate|summarize|route|report)
  --source <name>        Task source label (default: cli)
  --event-subscribe      Enable OpenCode event.subscribe listener (default: on)
  --no-event-subscribe   Disable OpenCode event.subscribe listener
  --x2-summarizer-agent <name> Use agent for result summarization (default: x2-summarizer)
  --no-x2-summarizer-agent Disable agent-based result summarization
  --once                 Process until queue is idle, then exit
  --interval <ms>        Loop interval for daemon mode (default: 3000)
  --max-retries <n>      Max retries before failed (default: 1)
  --retry-base-ms <ms>   Retry base delay (default: 3000)
  --retry-max-ms <ms>    Retry max delay cap (default: 60000)
  --agent-routing <mode> Agent routing mode: auto(eq1-first)|fixed (default: auto)
  --simple-agent <name>  Agent for simple tasks (default: spark)
  --complex-agent <name> Agent for complex/risk tasks (default: oholiab)
  --bypass-agent <name>  Force fixed agent override (sets routing=fixed)
  --bypass-model <provider/model> Bypass model (optional)
  --base-url <url>       OpenCode base URL (default: http://127.0.0.1:4996)
  --help                 Show this help`);
}

function taskDurationMs(task: Task): number | null {
    if (task.completedAt === null) return null;
    const startedAt = task.startedAt ?? task.createdAt;
    return Math.max(0, task.completedAt - startedAt);
}

function classifyError(task: Task): string | null {
    if (task.status !== "failed" || !task.error) return null;
    const message = task.error.toLowerCase();
    if (message.includes("timeout")) return "timeout";
    if (message.includes("rate limit")) return "rate_limit";
    if (message.includes("json")) return "json_parse";
    if (message.includes("network") || message.includes("fetch"))
        return "network";
    if (message.includes("session")) return "session";
    return "unknown";
}

function appendReadinessMetric(
    store: Store,
    traceId: string,
    status: "healthy" | "unhealthy",
    reason: string,
    phase: "check_started" | "retry" | "check_succeeded" | "check_failed",
    details?: Record<string, string | number | boolean | null>,
) {
    store.appendMetricEvent({
        eventType: "readiness_check",
        traceId,
        status,
        source: "x2_worker",
        reason,
        payload: JSON.stringify({
            phase,
            ...details,
        }),
    });
}

function logObservability(task: Task, queue: Queue, store: Store) {
    const stats = queue.getStats();
    const durationMs = taskDurationMs(task);
    const errorClass = classifyError(task);
    logger.info("task_observability", {
        task: task.id.slice(0, 8),
        type: task.type,
        status: task.status,
        duration_ms: durationMs === null ? "n/a" : durationMs,
        backlog: stats.pending,
        error_class: errorClass,
    });
    store.appendMetricEvent({
        eventType: "task_terminal",
        taskId: task.id,
        taskType: task.type,
        status: task.status,
        traceId: task.id,
        source: task.source,
        durationMs,
        backlog: stats.pending,
        errorClass,
        payload: JSON.stringify({
            source: "x2_worker",
            type: task.type,
            sourceType: task.source,
            status: task.status,
            attempts: task.attempts,
        }),
    });
}

async function processUntilIdle(
    queue: Queue,
    router: Router,
    store: Store,
): Promise<number> {
    let processed = 0;

    while (true) {
        const task = await queue.processCycle();
        if (task) {
            await router.route(task);
            logObservability(task, queue, store);
            processed++;
            continue;
        }

        if (!queue.isRunning() && !queue.hasPending()) {
            break;
        }

        await Bun.sleep(200);
    }

    return processed;
}

async function runEventSubscribeLoop(
    server: OpenCodeServer,
    queue: Queue,
    signal: AbortSignal,
): Promise<void> {
    while (!signal.aborted) {
        try {
            const subscription = await server.subscribe();
            logger.info("event_subscribe_started");

            for await (const event of subscription.stream) {
                if (signal.aborted) break;
                queue.ingestEvent(event);
            }

            if (!signal.aborted) {
                logger.warn("event_subscribe_stream_ended");
            }
        } catch (error) {
            if (signal.aborted) break;
            const message =
                error instanceof Error ? error.message : String(error);
            logger.warn("event_subscribe_failed", { error: message });
        }

        if (signal.aborted) break;
        await Bun.sleep(1000);
    }

    logger.info("event_subscribe_stopped");
}

async function main() {
    bootstrapEnv();
    const options = parseArgs(process.argv.slice(2));
    const store = new Store();
    const recovered = store.recoverRunningTasks(
        "failed",
        "Interrupted while task was running",
    );
    const server = OpenCodeServer.getInstance(options.baseUrl);
    let eq1Client: ReturnType<typeof createEq1ClientFromEnv> | null = null;

    try {
        eq1Client = createEq1ClientFromEnv();
        logger.info("eq1_client_enabled", {
            provider: process.env.EQ1_PROVIDER ?? "cerebras",
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn("eq1_client_disabled", { reason: message });
    }

    const queue = new Queue(store, server, {
        eq1Client,
        maxRetries: options.maxRetries,
        retryBaseDelayMs: options.retryBaseMs,
        retryMaxDelayMs: options.retryMaxMs,
        bypassAgent: options.bypassAgent ?? null,
        x2Dispatcher: opencodeAgent.X2_dispatcher(options.bypassModel ?? null),
        agentRoutingMode: options.agentRoutingMode,
        simpleAgent: options.simpleAgent ?? null,
        complexAgent: options.complexAgent ?? null,
        summarizerAgent: options.summarizerAgent ?? null,
    });
    const router = new Router(createReporter());
    const eventSubscribeAbort = new AbortController();
    let eventSubscribeLoop: Promise<void> | null = null;

    if (recovered > 0) {
        logger.warn("stale_running_recovered", { recovered });
        store.appendMetricEvent({
            eventType: "stale_recovery",
            traceId: "x2_worker_stale_recovery",
            status: "failed",
            source: "x2_worker",
            payload: JSON.stringify({ recovered }),
            reason: "stale_running_recovered",
            backlog: store.getStats().pending,
        });
    }

    const readinessTraceId = `x2_worker_readiness_${Date.now()}`;
    appendReadinessMetric(
        store,
        readinessTraceId,
        "unhealthy",
        "readiness_check_started",
        "check_started",
    );
    try {
        const health = await retryAsync(() => server.health(), {
            attempts: 2,
            baseDelayMs: 200,
            maxDelayMs: 500,
            onRetry: ({ error, attempt, maxAttempts, nextDelayMs }) => {
                const message =
                    error instanceof Error ? error.message : String(error);
                logger.warn("health_retry", {
                    attempt,
                    maxAttempts,
                    nextDelayMs,
                    error: message,
                });
                appendReadinessMetric(
                    store,
                    readinessTraceId,
                    "unhealthy",
                    "opencode_health_retry",
                    "retry",
                    {
                        attempt,
                        maxAttempts,
                        nextDelayMs,
                        error: message,
                    },
                );
            },
        });
        logger.info("opencode_health", {
            healthy: health.healthy,
            version: health.version,
        });
        appendReadinessMetric(
            store,
            readinessTraceId,
            health.healthy ? "healthy" : "unhealthy",
            "opencode_health_succeeded",
            "check_succeeded",
            {
                healthy: health.healthy,
                version: health.version,
            },
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn("opencode_health_failed", { error: message });
        appendReadinessMetric(
            store,
            readinessTraceId,
            "unhealthy",
            "opencode_health_failed",
            "check_failed",
            {
                error: message,
            },
        );
    }

    if (options.enqueuePrompt) {
        const task = queue.enqueue(
            options.enqueuePrompt,
            options.source,
            options.enqueueType,
        );
        logger.info("task_enqueued", {
            id: task.id,
            type: task.type,
            source: task.source,
            status: task.status,
        });
    }

    if (options.eventSubscribe) {
        eventSubscribeLoop = runEventSubscribeLoop(
            server,
            queue,
            eventSubscribeAbort.signal,
        );
    } else {
        logger.info("event_subscribe_disabled");
    }

    if (options.once) {
        const processed = await processUntilIdle(queue, router, store);
        const stats = queue.getStats();
        logger.info("once_done", {
            processed,
            pending: stats.pending,
            running: stats.running,
            completed: stats.completed,
            failed: stats.failed,
        });
        eventSubscribeAbort.abort();
        await eventSubscribeLoop?.catch(() => {});
        store.close();
        return;
    }

    queue.startLoop({
        intervalMs: options.intervalMs,
        onTaskProcessed: async (task) => {
            await router.route(task);
            logObservability(task, queue, store);
        },
        onError: (error) => {
            const message =
                error instanceof Error ? error.message : String(error);
            logger.error("loop_error", { error: message });
        },
    });

    logger.info("loop_started", {
        interval_ms: options.intervalMs,
        max_retries: options.maxRetries,
        retry_base_ms: options.retryBaseMs,
        retry_max_ms: options.retryMaxMs,
        x2_agent_routing: options.agentRoutingMode,
        x2_simple_agent: options.simpleAgent,
        x2_complex_agent: options.complexAgent,
        x2_bypass_agent: options.bypassAgent,
        x2_summarizer_agent: options.summarizerAgent,
        event_subscribe: options.eventSubscribe,
    });

    const shutdown = () => {
        eventSubscribeAbort.abort();
        queue.stopLoop();
        store.close();
        logger.info("loop_stopped");
        process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}

main().catch((error) => {
    const message =
        error instanceof Error ? (error.stack ?? error.message) : String(error);
    logger.error("fatal", { error: message });
    process.exit(1);
});
