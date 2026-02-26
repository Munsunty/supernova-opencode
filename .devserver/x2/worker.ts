import { OpenCodeServer } from "../opencode-server-wrapper";
import { Queue } from "./queue";
import { Router, ConsoleReporter } from "./router";
import { Store, type Task, type TaskType } from "./store";
import { createEq1ClientFromEnv } from "../eq1/create-client";
import { isEq1TaskType } from "../eq1/task-types";
import { createLogger } from "../utils/logging";
import { retryAsync } from "../utils/retry";

interface WorkerOptions {
    enqueuePrompt: string | null;
    enqueueType: TaskType;
    source: string;
    once: boolean;
    intervalMs: number;
    maxRetries: number;
    retryBaseMs: number;
    retryMaxMs: number;
    runningTimeoutMs: number;
    baseUrl: string;
}

const logger = createLogger("X2.Worker");

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
        once: false,
        intervalMs: 3000,
        maxRetries: 1,
        retryBaseMs: 3000,
        retryMaxMs: 60000,
        runningTimeoutMs: 120_000,
        baseUrl: process.env.OPENCODE_BASE_URL ?? "http://127.0.0.1:4996",
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
            case "--running-timeout":
                if (!next) {
                    throw new Error("--running-timeout requires milliseconds");
                }
                options.runningTimeoutMs = Number(next);
                i++;
                break;
            case "--base-url":
                if (!next) throw new Error("--base-url requires a URL");
                options.baseUrl = next;
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
    if (
        !Number.isFinite(options.runningTimeoutMs) ||
        options.runningTimeoutMs < 1000
    ) {
        throw new Error("--running-timeout must be a number >= 1000");
    }

    return options;
}

function printHelp() {
    console.log(`Usage:
  bun run .devserver/x2/worker.ts [options]

Options:
  --enqueue "<prompt>"   Create a new task before running
  --type <taskType>      Task type (omo_request|classify|evaluate|summarize|route|report)
  --source <name>        Task source label (default: cli)
  --once                 Process until queue is idle, then exit
  --interval <ms>        Loop interval for daemon mode (default: 3000)
  --max-retries <n>      Max retries before failed (default: 1)
  --retry-base-ms <ms>   Retry base delay (default: 3000)
  --retry-max-ms <ms>    Retry max delay cap (default: 60000)
  --running-timeout <ms> Timeout for running task before abort/fail (default: 120000)
  --base-url <url>       OpenCode base URL (default: http://127.0.0.1:4996)
  --help                 Show this help`);
}

function taskDurationMs(task: Task): number | null {
    if (task.completedAt === null) return null;
    const startedAt = task.startedAt ?? task.createdAt;
    return Math.max(0, task.completedAt - startedAt);
}

function logObservability(task: Task, queue: Queue) {
    const stats = queue.getStats();
    const durationMs = taskDurationMs(task);
    logger.info("task_observability", {
        task: task.id.slice(0, 8),
        status: task.status,
        duration_ms: durationMs === null ? "n/a" : durationMs,
        backlog: stats.pending,
    });
}

async function processUntilIdle(queue: Queue, router: Router): Promise<number> {
    let processed = 0;

    while (true) {
        const task = await queue.processCycle();
        if (task) {
            await router.route(task);
            logObservability(task, queue);
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

async function main() {
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
        runningTimeoutMs: options.runningTimeoutMs,
    });
    const router = new Router(new ConsoleReporter());

    if (recovered > 0) {
        logger.warn("stale_running_recovered", { recovered });
    }

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
            },
        });
        logger.info("opencode_health", {
            healthy: health.healthy,
            version: health.version,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn("opencode_health_failed", { error: message });
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

    if (options.once) {
        const processed = await processUntilIdle(queue, router);
        const stats = queue.getStats();
        logger.info("once_done", {
            processed,
            pending: stats.pending,
            running: stats.running,
            completed: stats.completed,
            failed: stats.failed,
        });
        store.close();
        return;
    }

    queue.startLoop({
        intervalMs: options.intervalMs,
        onTaskProcessed: async (task) => {
            await router.route(task);
            logObservability(task, queue);
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
        running_timeout_ms: options.runningTimeoutMs,
    });

    const shutdown = () => {
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
