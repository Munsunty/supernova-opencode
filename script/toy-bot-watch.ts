/**
 * toy-bot-watch — task 진행 상태를 폴링하면서 추적하는 watcher
 *
 * Usage:
 *   bun run toy:watch --task <id>
 *   bun run toy:watch --source toy_bot
 */

import { Store, type Task } from "../.devserver/x2/store";

const DEFAULT_SOURCE = "toy_bot";

interface WatchOptions {
    taskId: string | null;
    source: string;
    intervalMs: number;
}

function parseArgs(argv: string[]): WatchOptions {
    const options: WatchOptions = {
        taskId: null,
        source: DEFAULT_SOURCE,
        intervalMs: 3000,
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const next = argv[i + 1];

        switch (arg) {
            case "--task":
                if (!next) throw new Error("--task requires a task ID");
                options.taskId = next;
                i++;
                break;
            case "--source":
                if (!next) throw new Error("--source requires a value");
                options.source = next;
                i++;
                break;
            case "--interval":
                if (!next) throw new Error("--interval requires milliseconds");
                options.intervalMs = Number(next);
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
        !Number.isFinite(options.intervalMs) ||
        options.intervalMs < 500
    ) {
        throw new Error("--interval must be >= 500");
    }

    return options;
}

function printHelp() {
    console.log(`Usage:
  bun run script/toy-bot-watch.ts [options]

Options:
  --task <id>       Watch specific task by ID
  --source <name>   Watch latest task by source (default: ${DEFAULT_SOURCE})
  --interval <ms>   Poll interval (default: 3000, min: 500)
  --help            Show this help

Examples:
  bun run toy:watch --task 019c992b-92c2-7000-ab73-faf7a237aa3a
  bun run toy:watch --source toy_bot`);
}

function formatElapsed(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    const remainSec = sec % 60;
    return `${min}m${remainSec}s`;
}

function formatTimestamp(ms: number): string {
    return new Date(ms).toISOString().slice(11, 19);
}

function resolveTask(store: Store, options: WatchOptions): Task | null {
    if (options.taskId) {
        return store.getTask(options.taskId);
    }

    // source 기준으로 가장 최근 task
    const tasks = store.listTasks({ limit: 1 });
    // listTasks는 created_at ASC이므로 source 필터링 후 마지막 것을 찾아야 함
    const all = store.listTasks({});
    const filtered = all.filter((t) =>
        t.source.toLowerCase().includes(options.source.toLowerCase()),
    );
    return filtered[filtered.length - 1] ?? null;
}

function printStatus(task: Task, now: number) {
    const id = task.id.slice(0, 8);
    const session = task.sessionId ? task.sessionId.slice(0, 16) + "..." : "null";
    const elapsed = formatElapsed(now - task.createdAt);
    const time = formatTimestamp(now);

    if (task.status === "completed") {
        const duration = task.completedAt
            ? formatElapsed(task.completedAt - task.createdAt)
            : elapsed;
        const resultPreview = task.result
            ? task.result.slice(0, 200).replace(/\n/g, " ")
            : "(no result)";
        console.log(
            `[${time}] [completed] task=${id} session=${session} duration=${duration}`,
        );
        console.log(`  result: ${resultPreview}`);
        return;
    }

    if (task.status === "failed") {
        const errorPreview = task.error ?? "(no error)";
        console.log(
            `[${time}] [failed] task=${id} session=${session} elapsed=${elapsed} attempts=${task.attempts}`,
        );
        console.log(`  error: ${errorPreview}`);
        return;
    }

    console.log(
        `[${time}] [${task.status}] task=${id} session=${session} elapsed=${elapsed}`,
    );
}

function isTerminal(status: string): boolean {
    return status === "completed" || status === "failed";
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const store = new Store();

    try {
        const initial = resolveTask(store, options);
        if (!initial) {
            console.error(
                options.taskId
                    ? `Task not found: ${options.taskId}`
                    : `No tasks found for source: ${options.source}`,
            );
            process.exit(1);
        }

        const taskId = initial.id;
        console.log(
            `Watching task=${taskId.slice(0, 8)} source=${initial.source} session=${initial.sessionId ?? "null"}`,
        );

        let lastStatus = "";

        while (true) {
            const task = store.getTask(taskId);
            if (!task) {
                console.error(`Task disappeared: ${taskId}`);
                break;
            }

            // 상태 변화가 있거나 running 중이면 출력
            if (task.status !== lastStatus || task.status === "running") {
                printStatus(task, Date.now());
                lastStatus = task.status;
            }

            if (isTerminal(task.status)) {
                break;
            }

            await Bun.sleep(options.intervalMs);
        }
    } finally {
        store.close();
    }
}

main().catch((error) => {
    const message =
        error instanceof Error ? error.message : String(error);
    console.error(`fatal: ${message}`);
    process.exit(1);
});
