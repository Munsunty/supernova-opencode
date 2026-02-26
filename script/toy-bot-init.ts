import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Store } from "../.devserver/x2/store";

function parseArgs(argv: string[]) {
    return {
        dryRun: argv.includes("--dry-run"),
        printPrompt: argv.includes("--print-prompt"),
    };
}

function buildPrompt(harnessPath: string): string {
    if (!existsSync(harnessPath)) {
        throw new Error(`Harness file not found: ${harnessPath}`);
    }

    const raw = readFileSync(harnessPath, "utf8").trimEnd();
    if (raw.length === 0) {
        throw new Error(`Harness file is empty: ${harnessPath}`);
    }

    return `${raw}\n\nulw`;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const harnessPath = resolve(process.cwd(), "toy_bot/HARNESS.md");
    const prompt = buildPrompt(harnessPath);
    const source = "toy_bot";

    if (args.printPrompt) {
        console.log(prompt);
    }

    if (args.dryRun) {
        console.log(
            JSON.stringify(
                {
                    action: "enqueue_only",
                    type: "omo_request",
                    source,
                    promptLength: prompt.length,
                },
                null,
                2,
            ),
        );
        return;
    }

    const store = new Store();
    try {
        const task = store.createTask(prompt, source, "omo_request");
        console.log(
            JSON.stringify(
                {
                    enqueued: true,
                    taskId: task.id,
                    status: task.status,
                    type: task.type,
                    source: task.source,
                    createdAt: task.createdAt,
                    next: "bun run xoc:monitor --limit 5",
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
