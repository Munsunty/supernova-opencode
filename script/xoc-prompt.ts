/**
 * xoc-prompt — opencode server에 직접 동기 prompt를 보내는 스크립트
 *
 * Usage:
 *   bun run xoc:prompt --new "질문 내용"
 *   bun run xoc:prompt --session <id> "질문 내용"
 *   bun run xoc:prompt --session <id> --file <path>
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE_URL = process.env.OPENCODE_URL ?? "http://127.0.0.1:4996";

interface Options {
    session: string | null;
    file: string | null;
    prompt: string | null;
}

function parseArgs(argv: string[]): Options {
    const options: Options = {
        session: null,
        file: null,
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
            case "--new":
                options.session = null;
                break;
            case "--file":
                if (!next) throw new Error("--file requires a path");
                options.file = next;
                i++;
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
  bun run script/xoc-prompt.ts [options] "<prompt>"

Options:
  --session <id>    Use existing session
  --new             Create new session (default)
  --file <path>     Read prompt from file
  --help            Show this help

Examples:
  bun run xoc:prompt --new "헤파이토스 서브에이전트 사용 가능한지 확인해줘"
  bun run xoc:prompt --session ses_abc123 "이어서 질문"
  bun run xoc:prompt --session ses_abc123 --file prompt.md`);
}

function resolvePrompt(options: Options): string {
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

async function api(path: string, options?: RequestInit): Promise<unknown> {
    const res = await fetch(`${BASE_URL}${path}`, options);
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`${res.status} ${res.statusText}: ${body}`);
    }
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
        return res.json();
    }
    return res.text();
}

async function createSession(title: string): Promise<{ id: string }> {
    const data = await api("/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
    });
    return data as { id: string };
}

async function prompt(sessionId: string, text: string): Promise<unknown> {
    return api(`/session/${sessionId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            parts: [{ type: "text", text }],
        }),
    });
}

function extractText(result: unknown): string {
    if (typeof result === "string") {
        // text/html 응답 — JSON 파싱 시도
        try {
            const parsed = JSON.parse(result);
            return extractText(parsed);
        } catch {
            return result;
        }
    }

    const r = result as { parts?: Array<{ type: string; text?: string }> };
    if (!r.parts) return JSON.stringify(result, null, 2);

    const texts: string[] = [];
    for (const part of r.parts) {
        if (part.type === "text" && part.text) {
            texts.push(part.text);
        }
    }
    return texts.join("\n") || JSON.stringify(result, null, 2);
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const text = resolvePrompt(options);

    let sessionId = options.session;
    let created = false;

    if (!sessionId) {
        const session = await createSession(text.slice(0, 80));
        sessionId = session.id;
        created = true;
        console.error(`session: ${sessionId} (new)`);
    } else {
        console.error(`session: ${sessionId} (existing)`);
    }

    console.error(`prompt: ${text.length} chars`);
    console.error("waiting for response...\n");

    const result = await prompt(sessionId, text);
    console.log(extractText(result));

    if (created) {
        console.error(`\n--- session: ${sessionId}`);
    }
}

await main();
