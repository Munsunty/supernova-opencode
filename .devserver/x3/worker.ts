import { OpenCodeServer } from "../opencode-server-wrapper";
import { createLogger } from "../utils/logging";
import { Store } from "../x2/store";
import { InteractionDetector } from "./detector";

interface WorkerOptions {
    once: boolean;
    intervalMs: number;
    baseUrl: string;
}

const logger = createLogger("X3.Worker");

function parseArgs(argv: string[]): WorkerOptions {
    const options: WorkerOptions = {
        once: false,
        intervalMs: 3000,
        baseUrl: process.env.OPENCODE_BASE_URL ?? "http://127.0.0.1:4996",
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const next = argv[i + 1];

        switch (arg) {
            case "--once":
                options.once = true;
                break;
            case "--interval":
                if (!next) throw new Error("--interval requires milliseconds");
                options.intervalMs = Number(next);
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

    return options;
}

function printHelp() {
    console.log(`Usage:
  bun run .devserver/x3/worker.ts [options]

Options:
  --once                 Poll once and exit
  --interval <ms>        Poll interval for daemon mode (default: 3000)
  --base-url <url>       OpenCode base URL (default: http://127.0.0.1:4996)
  --help                 Show this help`);
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const store = new Store();
    const server = OpenCodeServer.getInstance(options.baseUrl);
    const detector = new InteractionDetector(store, server);

    if (options.once) {
        const stats = await detector.pollOnce();
        const queueStats = store.getInteractionStats();
        logger.info("detector_once_done", {
            seen: stats.seen,
            enqueued: stats.enqueued,
            duplicate: stats.duplicate,
            invalid: stats.invalid,
            pending: queueStats.pending,
            answered: queueStats.answered,
            rejected: queueStats.rejected,
        });
        store.close();
        return;
    }

    const timer = setInterval(async () => {
        try {
            const stats = await detector.pollOnce();
            const queueStats = store.getInteractionStats();
            logger.info("detector_tick_done", {
                seen: stats.seen,
                enqueued: stats.enqueued,
                duplicate: stats.duplicate,
                invalid: stats.invalid,
                pending: queueStats.pending,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error("detector_tick_failed", {
                error: message,
            });
        }
    }, options.intervalMs);

    logger.info("detector_loop_started", {
        interval_ms: options.intervalMs,
    });

    const shutdown = () => {
        clearInterval(timer);
        store.close();
        logger.info("detector_loop_stopped");
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
