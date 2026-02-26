import { assertEq1TaskType } from "./task-types";
import { createEq1ClientFromEnv } from "./create-client";

interface SmokeOptions {
    type: ReturnType<typeof assertEq1TaskType>;
    input: string;
}

function parseArgs(argv: string[]): SmokeOptions {
    let type = assertEq1TaskType("classify");
    let input = "Phase 3 smoke test input";

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const next = argv[i + 1];

        switch (arg) {
            case "--type":
                if (!next) throw new Error("--type requires a value");
                type = assertEq1TaskType(next);
                i++;
                break;
            case "--input":
                if (!next) throw new Error("--input requires a value");
                input = next;
                i++;
                break;
            case "--help":
                printHelp();
                process.exit(0);
            default:
                throw new Error(`Unknown argument: ${arg}`);
        }
    }

    return { type, input };
}

function printHelp() {
    console.log(`Usage:
  bun run eq1/smoke.ts [options]

Options:
  --type <classify|evaluate|summarize|route>
  --input "<text>"
  --help

Environment:
  EQ1_PROVIDER=groq|cerebras|openai_compatible (default: cerebras)
  GROQ_API_KEY / CEREBRAS_API_KEY / EQ1_API_KEY
  GROQ_MODEL(default: openai/gpt-oss-20b)
  CEREBRAS_MODEL(default: gpt-oss-120b)
  EQ1_MODEL`);
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const client = createEq1ClientFromEnv({
        retryAttempts: 2,
        retryBaseDelayMs: 300,
        retryMaxDelayMs: 1_500,
        timeoutMs: 20_000,
    });

    const result = await client.run({
        type: options.type,
        input: options.input,
        context: { source: "eq1-smoke" },
    });

    console.log(
        JSON.stringify(
            {
                type: result.type,
                provider: result.provider,
                attempts: result.attempts,
                output: result.output,
            },
            null,
            2,
        ),
    );
}

main().catch((error) => {
    const message =
        error instanceof Error ? (error.stack ?? error.message) : String(error);
    console.error(`[EQ1_SMOKE_ERROR] ${message}`);
    process.exit(1);
});
