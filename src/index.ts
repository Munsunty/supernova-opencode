import { createLogger } from "./utils/logging";

type X1Mode = "poller" | "webhook" | "direct" | "both" | "off";
type ChildHandle = ReturnType<typeof Bun.spawn>;

interface ChildSpec {
    name: string;
    cmd: string[];
}

const logger = createLogger("Runtime.Index");

function parseBoolEnv(value: string | undefined, fallback: boolean): boolean {
    if (value === undefined) return fallback;
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
    return fallback;
}

function toOptionalText(value: string | undefined): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function parseX1Mode(raw: string | undefined): X1Mode {
    const normalized = raw?.trim().toLowerCase();
    if (
        normalized === "poller" ||
        normalized === "webhook" ||
        normalized === "direct" ||
        normalized === "both" ||
        normalized === "off"
    ) {
        return normalized;
    }
    return "both";
}

function child(
    name: string,
    cmd: string[],
    specs: ChildSpec[],
    skipReason?: string | null,
) {
    if (skipReason) {
        logger.info("child_skipped", { name, reason: skipReason });
        return;
    }
    specs.push({ name, cmd });
}

function buildChildren(): ChildSpec[] {
    const specs: ChildSpec[] = [];
    const x2Enabled = parseBoolEnv(process.env.OPENCODE_X2_ENABLED, true);
    const x1Enabled = parseBoolEnv(process.env.OPENCODE_X1_ENABLED, true);
    const x3Enabled = parseBoolEnv(process.env.OPENCODE_X3_ENABLED, true);

    const opencodePort = process.env.OPENCODE_PORT ?? "4996";
    const opencodeBaseUrl =
        toOptionalText(process.env.OPENCODE_BASE_URL) ??
        `http://127.0.0.1:${opencodePort}`;
    const x3Interval = process.env.OPENCODE_X3_INTERVAL_MS ?? "3000";
    const x3MaxProcess = process.env.OPENCODE_X3_MAX_PROCESS ?? "10";

    if (x2Enabled) {
        child(
            "x2_worker",
            [
                "bun",
                "run",
                process.env.OPENCODE_X2_WORKER_SCRIPT ??
                    "/opt/opencode/src/x2/worker.ts",
                "--base-url",
                opencodeBaseUrl,
            ],
            specs,
        );
    }

    if (x1Enabled) {
        const x1Mode = parseX1Mode(process.env.OPENCODE_X1_MODE);
        const pollerToken = toOptionalText(
            process.env.OPENCODE_X1_POLLER_TOKEN,
        );
        const pollerSource =
            process.env.OPENCODE_X1_POLLER_SOURCE ??
            process.env.OPENCODE_X1_WEBHOOK_SOURCE ??
            "x1_telegram";
        const pollerTaskSource =
            process.env.OPENCODE_X1_POLLER_TASK_SOURCE ??
            process.env.OPENCODE_X1_WEBHOOK_TASK_SOURCE ??
            "x1_telegram";
        const pollerAllowed = toOptionalText(
            process.env.OPENCODE_X1_POLLER_ALLOWED_USER_IDS,
        );
        const pollerInterval = toOptionalText(
            process.env.OPENCODE_X1_POLL_INTERVAL_MS,
        );
        const pollerTimeout = toOptionalText(
            process.env.OPENCODE_X1_POLL_TIMEOUT_SEC,
        );
        const pollerLimit = toOptionalText(process.env.OPENCODE_X1_POLL_LIMIT);
        const pollerApiBase = toOptionalText(process.env.OPENCODE_X1_API_BASE);
        const dbPath = toOptionalText(process.env.X2_DB_PATH);

        if (x1Mode === "poller" || x1Mode === "both") {
            const cmd = [
                "bun",
                "run",
                process.env.OPENCODE_X1_POLLER_SCRIPT ??
                    "/opt/opencode/src/x1/poller.ts",
            ];
            if (pollerToken) cmd.push("--token", pollerToken);
            cmd.push(
                "--source",
                pollerSource,
                "--task-source",
                pollerTaskSource,
            );
            if (pollerAllowed) cmd.push("--allowed-users", pollerAllowed);
            if (pollerInterval) cmd.push("--poll-interval", pollerInterval);
            if (pollerTimeout) cmd.push("--poll-timeout", pollerTimeout);
            if (pollerLimit) cmd.push("--poll-limit", pollerLimit);
            if (pollerApiBase) cmd.push("--api-base", pollerApiBase);
            if (dbPath) cmd.push("--db", dbPath);
            child("x1_poller", cmd, specs);
        }

        if (x1Mode === "webhook") {
            const cmd = [
                "bun",
                "run",
                process.env.OPENCODE_X1_WEBHOOK_SCRIPT ??
                    "/opt/opencode/src/x1/webhook.ts",
                "--host",
                process.env.OPENCODE_X1_WEBHOOK_HOST ?? "0.0.0.0",
                "--port",
                process.env.OPENCODE_X1_WEBHOOK_PORT ?? "5100",
                "--path",
                process.env.OPENCODE_X1_WEBHOOK_PATH ?? "/webhook",
                "--source",
                process.env.OPENCODE_X1_WEBHOOK_SOURCE ?? "x1_telegram",
                "--task-source",
                process.env.OPENCODE_X1_WEBHOOK_TASK_SOURCE ?? "x1_telegram",
            ];
            if (dbPath) cmd.push("--db", dbPath);
            const webhookSecret = toOptionalText(process.env.X1_WEBHOOK_SECRET);
            if (webhookSecret) cmd.push("--secret", webhookSecret);
            child("x1_webhook", cmd, specs);
        }

        if (x1Mode === "direct" || x1Mode === "both") {
            const directToken = toOptionalText(
                process.env.OPENCODE_X1_DIRECT_TOKEN,
            );
            const skipReason = directToken ? null : "direct_token_empty";
            const cmd = [
                "bun",
                "run",
                process.env.OPENCODE_X1_DIRECT_SCRIPT ??
                    "/opt/opencode/src/x1/direct-chatbot.ts",
            ];
            if (directToken) cmd.push("--token", directToken);
            cmd.push(
                "--source",
                process.env.OPENCODE_X1_DIRECT_SOURCE ?? "x1_chatbot",
                "--agent",
                process.env.OPENCODE_X1_DIRECT_AGENT ?? "spark",
                "--base-url",
                process.env.OPENCODE_X1_DIRECT_BASE_URL ??
                    `http://127.0.0.1:${opencodePort}`,
                "--session-mode",
                process.env.OPENCODE_X1_DIRECT_SESSION_MODE ?? "per-chat",
            );
            const directAllowed = toOptionalText(
                process.env.OPENCODE_X1_DIRECT_ALLOWED_USER_IDS,
            );
            const directInterval = toOptionalText(
                process.env.OPENCODE_X1_DIRECT_POLL_INTERVAL_MS,
            );
            const directTimeout = toOptionalText(
                process.env.OPENCODE_X1_DIRECT_POLL_TIMEOUT_SEC,
            );
            const directLimit = toOptionalText(
                process.env.OPENCODE_X1_DIRECT_POLL_LIMIT,
            );
            const directApiBase = toOptionalText(
                process.env.OPENCODE_X1_DIRECT_API_BASE,
            );
            const directSystem = toOptionalText(
                process.env.OPENCODE_X1_DIRECT_SYSTEM,
            );
            if (directAllowed) cmd.push("--allowed-users", directAllowed);
            if (directInterval) cmd.push("--poll-interval", directInterval);
            if (directTimeout) cmd.push("--poll-timeout", directTimeout);
            if (directLimit) cmd.push("--poll-limit", directLimit);
            if (directApiBase) cmd.push("--api-base", directApiBase);
            if (directSystem) cmd.push("--system", directSystem);
            child("x1_direct_chatbot", cmd, specs, skipReason);
        }

        if (x1Mode === "off") {
            logger.info("x1_disabled", { mode: x1Mode });
        }
    }

    if (x3Enabled) {
        child(
            "x3_worker",
            [
                "bun",
                "run",
                process.env.OPENCODE_X3_WORKER_SCRIPT ??
                    "/opt/opencode/src/x3/worker.ts",
                "--base-url",
                opencodeBaseUrl,
                "--interval",
                x3Interval,
                "--max-process",
                x3MaxProcess,
            ],
            specs,
        );
    }

    return specs;
}

function spawnChild(spec: ChildSpec): ChildHandle {
    logger.info("child_starting", {
        name: spec.name,
        cmd: spec.cmd.join(" "),
    });
    return Bun.spawn({
        cmd: spec.cmd,
        env: process.env,
        stdout: "inherit",
        stderr: "inherit",
        stdin: "inherit",
    });
}

function holdProcessOpen(): Promise<never> {
    return new Promise(() => {
        setInterval(() => {
            // Keep supervisor event loop alive until a signal/exit path.
        }, 3_600_000);
    });
}

async function main() {
    const specs = buildChildren();
    const children = new Map<string, ChildHandle>();
    let shuttingDown = false;

    const terminateAll = (signal: "SIGTERM" | "SIGKILL") => {
        for (const [name, proc] of children.entries()) {
            try {
                proc.kill(signal);
            } catch {
                logger.debug("child_kill_ignored", { name, signal });
            }
        }
    };

    const gracefulShutdown = (signal: string) => {
        if (shuttingDown) return;
        shuttingDown = true;
        logger.info("supervisor_shutdown_signal", { signal });
        terminateAll("SIGTERM");
        setTimeout(() => {
            terminateAll("SIGKILL");
            process.exit(0);
        }, 1500);
    };

    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

    if (specs.length === 0) {
        logger.warn("no_children_enabled");
        // Keep supervisor alive until signaled.
        await holdProcessOpen();
        return;
    }

    for (const spec of specs) {
        const proc = spawnChild(spec);
        children.set(spec.name, proc);
        void proc.exited.then((code) => {
            if (shuttingDown) return;
            shuttingDown = true;
            const exitCode = Number.isFinite(code) ? code : 1;
            logger.error("child_exited", {
                name: spec.name,
                code: exitCode,
            });
            terminateAll("SIGTERM");
            setTimeout(() => {
                terminateAll("SIGKILL");
                process.exit(exitCode);
            }, 500);
        });
    }

    logger.info("supervisor_ready", { childCount: specs.length });
    await holdProcessOpen();
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("supervisor_fatal", { error: message });
    process.exit(1);
});
