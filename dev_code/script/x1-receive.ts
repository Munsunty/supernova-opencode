/**
 * x1-receive — Telegram inbound webhook event를 task enqueue로 정규화
 *
 * Usage:
 *   bun run .devserver/dev_code/script/x1-receive.ts --stdin
 *   bun run .devserver/dev_code/script/x1-receive.ts --payload '{"update_id":123,"message":{"text":"hello"}}'
 *   bun run .devserver/dev_code/script/x1-receive.ts --payload-file /tmp/telegram_update.json
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Store } from "../../src/x2/store";
import {
    enqueueTelegramUpdate,
    parseTelegramMessage,
} from "../../src/x1/telegram";

interface ReceiveOptions {
    payloadText: string | null;
    payloadPath: string | null;
    source: string;
    taskSource: string;
    dbPath: string | null;
    readFromStdin: boolean;
    dryRun: boolean;
    help: boolean;
}

const DEFAULT_DB_PATH = process.env.X2_DB_PATH;

function parseArgs(argv: string[]): ReceiveOptions {
    const options: ReceiveOptions = {
        payloadText: null,
        payloadPath: null,
        source: "x1_telegram",
        taskSource: "x1_telegram",
        dbPath: null,
        readFromStdin: false,
        dryRun: false,
        help: false,
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const next = argv[i + 1];

        switch (arg) {
            case "--payload":
                if (!next) throw new Error("--payload requires JSON text");
                options.payloadText = next;
                i++;
                break;
            case "--payload-file":
                if (!next)
                    throw new Error("--payload-file requires a file path");
                options.payloadPath = resolve(process.cwd(), next);
                i++;
                break;
            case "--source":
                if (!next) throw new Error("--source requires a string");
                options.source = next;
                i++;
                break;
            case "--task-source":
                if (!next) throw new Error("--task-source requires a string");
                options.taskSource = next;
                i++;
                break;
            case "--db":
                if (!next) throw new Error("--db requires a path");
                options.dbPath = resolve(process.cwd(), next);
                i++;
                break;
            case "--stdin":
                options.readFromStdin = true;
                break;
            case "--dry-run":
                options.dryRun = true;
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
  bun run .devserver/dev_code/script/x1-receive.ts [options]

Options:
  --payload <json>      Telegram-style payload JSON string
  --payload-file <path> Read payload JSON from file
  --source <name>       Inbound source label (default: x1_telegram)
  --task-source <name>  Task source label (default: x1_telegram)
  --db <path>           Store db path override
  --stdin               Force read payload from stdin even if --payload-file is missing
  --dry-run             Parse only, no enqueue
  --help                Show this message

Usage examples:
  cat update.json | bun run .devserver/dev_code/script/x1-receive.ts
  bun run .devserver/dev_code/script/x1-receive.ts --payload '{"update_id":1,"message":{"text":"hello"}}'
  bun run .devserver/dev_code/script/x1-receive.ts --payload-file /tmp/update.json --source x1_telegram`);
}

function readInputFromStdin(): Promise<string> {
    const stdin = Bun.file("/dev/stdin");
    return stdin.text();
}

function loadPayloadText(options: ReceiveOptions): string | null {
    if (options.payloadText !== null) return options.payloadText;
    if (options.payloadPath !== null) {
        if (!existsSync(options.payloadPath)) {
            throw new Error(`Payload file not found: ${options.payloadPath}`);
        }
        return readFileSync(options.payloadPath, "utf8");
    }
    return null;
}

function normalizeInputText(input: string): string {
    return input.trim();
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        printHelp();
        process.exit(0);
    }

    const payloadPathText = loadPayloadText(options);
    const stdinText =
        options.readFromStdin || payloadPathText === null
            ? await readInputFromStdin()
            : "";
    const payloadText = normalizeInputText(payloadPathText ?? stdinText);

    if (!payloadText) {
        throw new Error(
            "No payload input. Use --payload, --payload-file, or pipe JSON via stdin.",
        );
    }

    let parsedPayload: unknown;
    try {
        parsedPayload = JSON.parse(payloadText);
    } catch {
        throw new Error("Invalid JSON payload input");
    }

    if (options.dryRun) {
        const parsed = parseTelegramMessage(parsedPayload);
        if (parsed.ok) {
            console.log(
                JSON.stringify(
                    {
                        action: "dry_run_enqueued",
                        eventId: parsed.event.eventId,
                        source: options.source,
                        prompt: parsed.event.text.slice(0, 200),
                    },
                    null,
                    2,
                ),
            );
        } else {
            console.log(
                JSON.stringify(
                    {
                        action: "dry_run_invalid",
                        eventId: parsed.eventId,
                        source: options.source,
                        reason: parsed.reason,
                    },
                    null,
                    2,
                ),
            );
        }
        return;
    }

    const store = new Store(options.dbPath ?? DEFAULT_DB_PATH);
    try {
        const result = enqueueTelegramUpdate(store, parsedPayload, {
            source: options.source,
            taskSource: options.taskSource,
        });
        console.log(JSON.stringify(result, null, 2));
    } finally {
        store.close();
    }
}

await main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`fatal: ${message}`);
    process.exit(1);
});
