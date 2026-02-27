import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type JsonObject = Record<string, unknown>;
type RuleMap = Record<string, "allow" | "ask" | "deny">;

interface CliOptions {
    projectDir: string;
    templatePath: string;
    outPath: string;
}

function parseArgs(argv: string[]): CliOptions {
    const options: Partial<CliOptions> = {};

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const next = argv[i + 1];

        switch (arg) {
            case "--project-dir":
                if (!next) throw new Error("--project-dir requires a value");
                options.projectDir = next;
                i++;
                break;
            case "--template":
                if (!next) throw new Error("--template requires a value");
                options.templatePath = next;
                i++;
                break;
            case "--out":
                if (!next) throw new Error("--out requires a value");
                options.outPath = next;
                i++;
                break;
            case "--help":
                printHelp();
                process.exit(0);
            default:
                throw new Error(`Unknown argument: ${arg}`);
        }
    }

    if (!options.projectDir) throw new Error("--project-dir is required");
    if (!options.templatePath) throw new Error("--template is required");
    if (!options.outPath) throw new Error("--out is required");

    return options as CliOptions;
}

function printHelp() {
    console.log(`Usage:
  bun run .devserver/src/scripts/generate-opencode-config.ts \\
    --project-dir "<abs-project-dir>" \\
    --template ".devserver/opencode.json" \\
    --out ".devserver/opencode.json"`);
}

function toPosixPath(path: string): string {
    return path.replace(/\\/g, "/");
}

function asObject(value: unknown): JsonObject {
    return value && typeof value === "object" && !Array.isArray(value)
        ? (value as JsonObject)
        : {};
}

function buildToolRule(projectGlob: string, devserverAbsGlob: string): RuleMap {
    return {
        "*": "deny",
        [projectGlob]: "allow",
        [devserverAbsGlob]: "deny",
        ".devserver/**": "deny",
    };
}

function main() {
    const { projectDir, templatePath, outPath } = parseArgs(
        process.argv.slice(2),
    );
    const projectReal = toPosixPath(realpathSync(projectDir));
    const templateReal = realpathSync(templatePath);
    const outReal = resolve(outPath);

    const base = JSON.parse(readFileSync(templateReal, "utf8")) as JsonObject;
    const basePermission = asObject(base.permission);
    const projectGlob = `${projectReal}/**`;
    const devserverAbsGlob = `${projectReal}/.devserver/**`;

    const runtimePermission: JsonObject = {
        ...basePermission,
        external_directory: {
            "*": "deny",
            [projectGlob]: "allow",
            [devserverAbsGlob]: "deny",
        },
        read: buildToolRule(projectGlob, devserverAbsGlob),
        edit: buildToolRule(projectGlob, devserverAbsGlob),
        glob: buildToolRule(projectGlob, devserverAbsGlob),
        grep: buildToolRule(projectGlob, devserverAbsGlob),
        list: buildToolRule(projectGlob, devserverAbsGlob),
        // bash는 명령 문자열 패턴 기반이라 안전하게 ask 기본값 사용
        bash: {
            "*": "ask",
            "*.devserver*": "deny",
        },
    };

    const runtime: JsonObject = {
        ...base,
        permission: runtimePermission,
    };

    mkdirSync(dirname(outReal), { recursive: true });
    writeFileSync(outReal, `${JSON.stringify(runtime, null, 2)}\n`, "utf8");

    console.log(
        `Generated ${outReal} with workspace allowlist: ${projectGlob}`,
    );
}

main();
