import { OpenCodeServer } from "../opencode-server-wrapper";
import { createEq1ClientFromEnv } from "../eq1/create-client";
import { createLogger } from "../utils/logging";
import { Store } from "../x2/store";
import { InteractionDetector } from "./detector";
import { InteractionEvaluator } from "./evaluator";
import { InteractionProcessor } from "./processor";
import { InteractionResponder } from "./responder";
import { parseAutoReplyPolicy } from "./policy";
import { X4Router } from "../x4/router";

interface WorkerOptions {
    once: boolean;
    intervalMs: number;
    baseUrl: string;
    maxProcessPerTick: number;
    x4SummarizerAgent: string | null;
}

interface DetectorTickLogPayload {
    seen: number;
    enqueued: number;
    duplicate: number;
    invalid: number;
    processed: number;
    pending: number;
}

const logger = createLogger("X3.Worker");

function parseJsonPolicy(raw: string | undefined): unknown | undefined {
    if (!raw) return undefined;
    try {
        return JSON.parse(raw);
    } catch {
        return undefined;
    }
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

function parseArgs(argv: string[]): WorkerOptions {
    const options: WorkerOptions = {
        once: false,
        intervalMs: 3000,
        baseUrl: process.env.OPENCODE_BASE_URL ?? "http://127.0.0.1:4996",
        maxProcessPerTick: 10,
        x4SummarizerAgent: parseOptionalAgent(
            process.env.X4_SUMMARIZER_AGENT,
            "x4-summarizer",
        ),
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
            case "--max-process":
                if (!next) throw new Error("--max-process requires a number");
                options.maxProcessPerTick = Number(next);
                i++;
                break;
            case "--x4-summarizer-agent":
                if (!next)
                    throw new Error(
                        "--x4-summarizer-agent requires an agent name",
                    );
                options.x4SummarizerAgent = parseOptionalAgent(next, null);
                i++;
                break;
            case "--no-x4-summarizer-agent":
                options.x4SummarizerAgent = null;
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
    if (
        !Number.isFinite(options.maxProcessPerTick) ||
        options.maxProcessPerTick < 1
    ) {
        throw new Error("--max-process must be a number >= 1");
    }

    return options;
}

function printHelp() {
    console.log(`Usage:
  bun run .devserver/src/x3/worker.ts [options]

Options:
  --once                 Poll once and exit
  --interval <ms>        Poll interval for daemon mode (default: 3000)
  --base-url <url>       OpenCode base URL (default: http://127.0.0.1:4996)
  --max-process <n>      Max pending interactions to process per tick (default: 10)
  --x4-summarizer-agent <name> Use agent for X4 summary enrichment (default: x4-summarizer)
  --no-x4-summarizer-agent Disable X4 summary agent enrichment
  --help                 Show this help`);
}

function resolveAutoReplyPolicy() {
    let parseWarnings: string[] = [];
    const fromPolicyJson = parseJsonPolicy(process.env.X3_AUTO_REPLY_POLICY);
    if (process.env.X3_AUTO_REPLY_POLICY && fromPolicyJson === undefined) {
        parseWarnings = [
            "invalid X3_AUTO_REPLY_POLICY JSON; using default/legacy env values",
        ];
    }

    const policyInput = fromPolicyJson ?? {
        threshold: process.env.X3_AUTO_REPLY_THRESHOLD
            ? Number(process.env.X3_AUTO_REPLY_THRESHOLD)
            : undefined,
        fallback: process.env.X3_AUTO_REPLY_FALLBACK,
        auto_reply_strategy: process.env.X3_AUTO_REPLY_STRATEGY,
    };
    const parsed = parseAutoReplyPolicy(policyInput);
    if (parseWarnings.length > 0) {
        parsed.warnings = [...parseWarnings, ...parsed.warnings];
    }
    return parsed;
}

async function processPendingInteractions(
    processor: InteractionProcessor,
    maxProcessPerTick: number,
): Promise<number> {
    let processed = 0;
    while (processed < maxProcessPerTick) {
        const result = await processor.processNext();
        if (!result) break;
        processed += 1;
    }
    return processed;
}

function logDetectorTick(payload: DetectorTickLogPayload) {
    const isAllZero =
        payload.seen === 0 &&
        payload.enqueued === 0 &&
        payload.duplicate === 0 &&
        payload.invalid === 0 &&
        payload.processed === 0 &&
        payload.pending === 0;

    if (isAllZero) {
        logger.debug("detector_tick_done", payload);
        return;
    }
    logger.info("detector_tick_done", payload);
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const store = new Store();
    const server = OpenCodeServer.getInstance(options.baseUrl);
    const detector = new InteractionDetector(store, server);
    let processor: InteractionProcessor | null = null;

    try {
        const eq1Client = createEq1ClientFromEnv();
        const evaluator = new InteractionEvaluator(eq1Client);
        const x4Router = new X4Router(store, eq1Client, {
            server,
            summarizerAgent: options.x4SummarizerAgent,
        });
        const autoReplyPolicy = resolveAutoReplyPolicy();
        if (autoReplyPolicy.warnings.length > 0) {
            logger.warn("x3_auto_reply_policy_config", {
                warnings: autoReplyPolicy.warnings,
            });
        }
        const responder = new InteractionResponder(store, server, {
            x4Router,
            policy: autoReplyPolicy.policy,
        });
        processor = new InteractionProcessor(store, evaluator, responder);
        logger.info("x3_eq1_enabled", {
            provider: process.env.EQ1_PROVIDER ?? "cerebras",
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn("x3_eq1_disabled", {
            reason: message,
        });
    }

    if (options.once) {
        const stats = await detector.pollOnce();
        const processed = processor
            ? await processPendingInteractions(
                  processor,
                  options.maxProcessPerTick,
              )
            : 0;
        const queueStats = store.getInteractionStats();
        const oncePayload = {
            seen: stats.seen,
            enqueued: stats.enqueued,
            duplicate: stats.duplicate,
            invalid: stats.invalid,
            processed,
            pending: queueStats.pending,
            answered: queueStats.answered,
            rejected: queueStats.rejected,
        };
        const onceAllZero =
            oncePayload.seen === 0 &&
            oncePayload.enqueued === 0 &&
            oncePayload.duplicate === 0 &&
            oncePayload.invalid === 0 &&
            oncePayload.processed === 0 &&
            oncePayload.pending === 0 &&
            oncePayload.answered === 0 &&
            oncePayload.rejected === 0;
        if (onceAllZero) {
            logger.debug("detector_once_done", oncePayload);
        } else {
            logger.info("detector_once_done", oncePayload);
        }
        store.close();
        return;
    }

    const timer = setInterval(async () => {
        try {
            const stats = await detector.pollOnce();
            const processed = processor
                ? await processPendingInteractions(
                      processor,
                      options.maxProcessPerTick,
                  )
                : 0;
            const queueStats = store.getInteractionStats();
            logDetectorTick({
                seen: stats.seen,
                enqueued: stats.enqueued,
                duplicate: stats.duplicate,
                invalid: stats.invalid,
                processed,
                pending: queueStats.pending,
            });
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            logger.error("detector_tick_failed", {
                error: message,
            });
        }
    }, options.intervalMs);

    logger.info("detector_loop_started", {
        interval_ms: options.intervalMs,
        max_process: options.maxProcessPerTick,
        x4_summarizer_agent: options.x4SummarizerAgent,
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
