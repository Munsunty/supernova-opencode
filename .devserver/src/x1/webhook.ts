import { resolve } from "node:path";

import { createTelegramWebhookServer } from "./server";

interface WebhookArgs {
    host: string;
    port: number;
    path: string;
    source: string;
    taskSource: string;
    dbPath: string | null;
    secret: string | null;
    help: boolean;
}

function parseArgs(argv: string[]): WebhookArgs {
    const options: WebhookArgs = {
        host: process.env.X1_WEBHOOK_HOST ?? "0.0.0.0",
        port: Number(process.env.X1_WEBHOOK_PORT ?? "5100"),
        path: process.env.X1_WEBHOOK_PATH ?? "/webhook",
        source: process.env.X1_WEBHOOK_SOURCE ?? "x1_telegram",
        taskSource: process.env.X1_WEBHOOK_TASK_SOURCE ?? "x1_telegram",
        dbPath: process.env.X2_DB_PATH ?? null,
        secret: process.env.X1_WEBHOOK_SECRET ?? null,
        help: false,
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const next = argv[i + 1];

        switch (arg) {
            case "--host":
                if (!next) throw new Error("--host requires a value");
                options.host = next;
                i++;
                break;
            case "--port":
                if (!next) throw new Error("--port requires a number");
                options.port = Number(next);
                if (!Number.isFinite(options.port) || options.port <= 0) {
                    throw new Error("--port must be a positive number");
                }
                i++;
                break;
            case "--path":
                if (!next) throw new Error("--path requires a value");
                options.path = next;
                i++;
                break;
            case "--source":
                if (!next) throw new Error("--source requires a value");
                options.source = next;
                i++;
                break;
            case "--task-source":
                if (!next) throw new Error("--task-source requires a value");
                options.taskSource = next;
                i++;
                break;
            case "--db":
                if (!next) throw new Error("--db requires a path");
                options.dbPath = resolve(process.cwd(), next);
                i++;
                break;
            case "--secret":
                if (!next) throw new Error("--secret requires a value");
                options.secret = next;
                i++;
                break;
            case "--help":
                options.help = true;
                break;
            default:
                throw new Error(`Unknown argument: ${arg}`);
        }
    }

    return options;
}

function printHelp() {
    console.log(`Usage:
  bun run .devserver/src/x1/webhook.ts [options]

Options:
  --host <name>         Bind host (default: 0.0.0.0)
  --port <num>          Bind port (default: 5100)
  --path <path>         Webhook endpoint path (default: /webhook)
  --source <name>       Inbound source label (default: x1_telegram)
  --task-source <name>  Task source label (default: x1_telegram)
  --db <path>           Store db path override
  --secret <string>     Telegram webhook secret token (optional)
  --help                Show this help

Env:
  X1_WEBHOOK_HOST, X1_WEBHOOK_PORT, X1_WEBHOOK_PATH,
  X1_WEBHOOK_SOURCE, X1_WEBHOOK_TASK_SOURCE, X2_DB_PATH, X1_WEBHOOK_SECRET`);
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        printHelp();
        return;
    }

    if (!Number.isFinite(args.port) || args.port <= 0) {
        throw new Error(`Invalid port: ${args.port}`);
    }

    const webhook = createTelegramWebhookServer({
        host: args.host,
        port: args.port,
        path: args.path,
        source: args.source,
        taskSource: args.taskSource,
        dbPath: args.dbPath ?? undefined,
        secret: args.secret ?? undefined,
    });

    console.log(
        `x1 webhook listening on http://${args.host}:${webhook.server.port}${args.path}`,
    );
    console.log("Press Ctrl+C to stop");

    const stop = () => {
        webhook.close();
        process.exit(0);
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
}

await main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`fatal: ${message}`);
    process.exit(1);
});
