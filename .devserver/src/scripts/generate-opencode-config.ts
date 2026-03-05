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

    // 템플릿에 permission이 정의되어 있으면 그대로 존중하고,
    // 없는 경우에만 기존 안전 기본값을 채운다.
    const runtimePermission: JsonObject = { ...basePermission };
    if (!("external_directory" in runtimePermission)) {
        runtimePermission.external_directory = {
            "*": "deny",
            [projectGlob]: "allow",
            [devserverAbsGlob]: "deny",
        };
    }
    if (!("read" in runtimePermission)) {
        runtimePermission.read = buildToolRule(projectGlob, devserverAbsGlob);
    }
    if (!("edit" in runtimePermission)) {
        runtimePermission.edit = buildToolRule(projectGlob, devserverAbsGlob);
    }
    if (!("glob" in runtimePermission)) {
        runtimePermission.glob = buildToolRule(projectGlob, devserverAbsGlob);
    }
    if (!("grep" in runtimePermission)) {
        runtimePermission.grep = buildToolRule(projectGlob, devserverAbsGlob);
    }
    if (!("list" in runtimePermission)) {
        runtimePermission.list = buildToolRule(projectGlob, devserverAbsGlob);
    }
    if (!("bash" in runtimePermission)) {
        // bash는 명령 문자열 패턴 기반이라 기본값은 ask.
        runtimePermission.bash = {
            "*": "ask",
            "*.devserver*": "deny",
        };
    }

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
