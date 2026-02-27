/**
 * toy-bot-command — 기존 세션에 이어서 X_oc에 prompt를 적재하는 명령 스크립트
 *
 * Usage:
 *   bun run toy:cmd --session <id> "prompt text"
 *   bun run toy:cmd --session <id> --file <path>
 *   bun run toy:cmd --session <id> --dry-run "prompt text"
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Store } from "../../src/x2/store";

const DEFAULT_SESSION = "ses_366ba0e70ffegX7B00kGwNyMHI";
const DEFAULT_SOURCE = "toy_bot";

interface CmdOptions {
    session: string | null;
    source: string;
    file: string | null;
    dryRun: boolean;
    prompt: string | null;
}

function parseArgs(argv: string[]): CmdOptions {
    const options: CmdOptions = {
        session: DEFAULT_SESSION,
        source: DEFAULT_SOURCE,
        file: null,
        dryRun: false,
        prompt: null,
    };

    const positional: string[] = [];

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const next = argv[i + 1];

        switch (arg) {
            case "--session":
                if (!next) throw new Error("--session requires a session ID");
                options.session = next;
                i++;
                break;
            case "--source":
                if (!next) throw new Error("--source requires a value");
                options.source = next;
                i++;
                break;
            case "--file":
                if (!next) throw new Error("--file requires a path");
                options.file = next;
                i++;
                break;
            case "--new":
                options.session = null;
                break;
            case "--dry-run":
                options.dryRun = true;
                break;
            case "--help":
                printHelp();
                process.exit(0);
            default:
                positional.push(arg);
        }
    }

    if (positional.length > 0) {
        options.prompt = positional.join(" ");
    }

    return options;
}

function printHelp() {
    console.log(`Usage:
  bun run .devserver/dev_code/script/toy-bot-command.ts [options] "<prompt>"

Options:
  --session <id>    Session ID (default: ${DEFAULT_SESSION})
  --source <name>   Source label (default: ${DEFAULT_SOURCE})
  --new             Create new session (don't reuse existing)
  --file <path>     Read prompt from file
  --dry-run         Show what would be enqueued without creating task
  --help            Show this help

Examples:
  bun run toy:cmd "REPORT.md의 TODO 항목을 구현해줘"
  bun run toy:cmd --file toy_bot/HARNESS.md
  bun run toy:cmd --dry-run "test prompt"`);
}

function resolvePrompt(options: CmdOptions): string {
    if (options.file) {
        const filePath = resolve(process.cwd(), options.file);
        if (!existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }
        const content = readFileSync(filePath, "utf8").trimEnd();
        if (content.length === 0) {
            throw new Error(`File is empty: ${filePath}`);
        }
        return content;
    }

    if (options.prompt) {
        return options.prompt;
    }

    throw new Error("No prompt provided. Use inline text or --file <path>");
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const prompt = resolvePrompt(options);

    if (options.dryRun) {
        console.log(
            JSON.stringify(
                {
                    action: "dry_run",
                    session: options.session,
                    source: options.source,
                    type: "omo_request",
                    promptLength: prompt.length,
                    promptPreview: prompt.slice(0, 120),
                },
                null,
                2,
            ),
        );
        return;
    }

    const store = new Store();
    try {
        const task = store.createTask(
            prompt,
            options.source,
            "omo_request",
            options.session,
        );
        console.log(
            JSON.stringify(
                {
                    enqueued: true,
                    taskId: task.id,
                    sessionId: task.sessionId,
                    source: task.source,
                    type: task.type,
                    status: task.status,
                    promptLength: prompt.length,
                    createdAt: task.createdAt,
                    next: `bun run toy:watch --task ${task.id}`,
                },
                null,
                2,
            ),
        );
    } finally {
        store.close();
    }
}

await main();
