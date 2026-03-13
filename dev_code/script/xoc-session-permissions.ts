/**
 * xoc-session-permissions — query permission/question requests for a session
 * using OpenCodeServer wrapper.
 *
 * Usage:
 *   bun run .devserver/dev_code/script/xoc-session-permissions.ts \
 *     --session ses_123 --kind both --json
 *
 *   bun run .devserver/dev_code/script/xoc-session-permissions.ts \
 *     --session ses_123 --kind ask --watch --poll-interval 2000 --poll-timeout 15000
 *
 *   bun run .devserver/dev_code/script/xoc-session-permissions.ts \
 *     --session ses_123 --reply permission_id --response once
 */

import {
    OpenCodeServer,
    type MessageWithParts,
    type Permission,
} from "../../src/opencode-server-wrapper";

type ReplyAction = "once" | "always" | "reject";
type QueryKind = "permission" | "question" | "both";

interface Args {
    sessionId: string;
    baseUrl: string;
    json: boolean;
    watch: boolean;
    kind: QueryKind;
    pollIntervalMs: number;
    pollTimeoutMs: number;
    includeMessage: boolean;
    debug: boolean;
    replyId?: string;
    replyAction?: ReplyAction;
}

interface NormalizedPermission {
    kind: "permission";
    id: string;
    type: string;
    title: string;
    pattern?: string | string[];
    sessionId: string;
    messageId?: string;
    callId?: string;
    createdAt?: number;
    metadata: Record<string, unknown>;
    raw: Permission | Record<string, unknown>;
}

interface NormalizedQuestion {
    kind: "question";
    id: string;
    type: string;
    prompt: string;
    questionCount: number;
    sessionId: string;
    messageId?: string;
    callId?: string;
    createdAt?: number;
    raw: Record<string, unknown>;
}

interface InteractionResult {
    permissions: NormalizedPermission[];
    questions: NormalizedQuestion[];
}

interface MessageRef {
    kind: "permission" | "question";
    id: string;
    messageId?: string;
}

function parseArgs(argv: string[]): Args {
    const args: Args = {
        sessionId: "",
        baseUrl: process.env.OPENCODE_URL ?? "http://127.0.0.1:4996",
        json: false,
        watch: false,
        kind: "permission",
        pollIntervalMs: 2000,
        pollTimeoutMs: 15000,
        includeMessage: false,
        debug: false,
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const next = argv[i + 1];

        switch (arg) {
            case "--session":
                if (!next) throw new Error("--session requires a session id/url");
                args.sessionId = extractSessionIdFromArg(next);
                i++;
                break;
            case "--base-url":
                if (!next) throw new Error("--base-url requires a URL");
                args.baseUrl = next;
                i++;
                break;
            case "--kind":
                if (!next)
                    throw new Error(
                        "--kind requires permission|question|ask|both",
                    );
                args.kind = parseKind(next);
                i++;
                break;
            case "--json":
                args.json = true;
                break;
            case "--watch":
                args.watch = true;
                break;
            case "--poll-interval":
                if (!next)
                    throw new Error("--poll-interval requires a number in ms");
                args.pollIntervalMs = Number.parseInt(next, 10);
                if (
                    !Number.isFinite(args.pollIntervalMs) ||
                    args.pollIntervalMs <= 0
                ) {
                    throw new Error("--poll-interval must be > 0");
                }
                i++;
                break;
            case "--poll-timeout":
                if (!next)
                    throw new Error("--poll-timeout requires a number in ms");
                args.pollTimeoutMs = Number.parseInt(next, 10);
                if (
                    !Number.isFinite(args.pollTimeoutMs) ||
                    args.pollTimeoutMs <= 0
                ) {
                    throw new Error("--poll-timeout must be > 0");
                }
                i++;
                break;
            case "--include-message":
                args.includeMessage = true;
                break;
            case "--debug":
                args.debug = true;
                break;
            case "--reply":
                if (!next) throw new Error("--reply requires permission id");
                args.replyId = next;
                i++;
                break;
            case "--response": {
                if (!next)
                    throw new Error("--response requires once|always|reject");
                const action = next as ReplyAction;
                if (
                    action !== "once" &&
                    action !== "always" &&
                    action !== "reject"
                ) {
                    throw new Error(
                        "--response must be once, always, or reject",
                    );
                }
                args.replyAction = action;
                i++;
                break;
            }
            case "--help":
                printHelp();
                process.exit(0);
            default:
                throw new Error(`Unknown argument: ${arg}`);
        }
    }

    if (!args.sessionId) {
        throw new Error("--session is required");
    }

    if (args.replyAction && !args.replyId) {
        throw new Error("--response requires --reply <permission-id>");
    }
    if (args.replyId && !args.replyAction) {
        throw new Error("--reply requires --response once|always|reject");
    }
    if (args.replyId && args.kind === "question") {
        throw new Error("--reply is permission-only. Use --kind permission|both");
    }

    return args;
}

function parseKind(value: string): QueryKind {
    const lowered = value.toLowerCase();
    if (lowered === "permission" || lowered === "permissions") {
        return "permission";
    }
    if (
        lowered === "question" ||
        lowered === "questions" ||
        lowered === "ask" ||
        lowered === "asks"
    ) {
        return "question";
    }
    if (lowered === "both" || lowered === "all") {
        return "both";
    }
    throw new Error("--kind must be permission, question(ask), or both");
}

function extractSessionIdFromArg(input: string): string {
    const trimmed = input.trim();
    if (!trimmed) {
        return "";
    }
    if (trimmed.startsWith("ses_")) {
        return trimmed;
    }

    const fromPathMatch = trimmed.match(/\/session\/([^/?#]+)/);
    if (fromPathMatch?.[1]) {
        return safeDecode(fromPathMatch[1]);
    }

    try {
        const url = new URL(trimmed);
        const urlMatch = url.pathname.match(/\/session\/([^/?#]+)/);
        if (urlMatch?.[1]) {
            return safeDecode(urlMatch[1]);
        }
    } catch {
        // Not a URL; use the original value as session id.
    }

    return trimmed;
}

function safeDecode(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function printHelp() {
    console.log(`Usage:
  bun run .devserver/dev_code/script/xoc-session-permissions.ts [options]

Options:
  --session <id|url>       required, target session id or /session/... URL
  --base-url <url>         server base url (default: http://127.0.0.1:4996)
  --kind <type>            permission | question(ask) | both (default: permission)
  --json                   print normalized entries as JSON
  --watch                  poll until an entry appears (or timeout)
  --poll-interval <ms>     polling interval when --watch (default: 2000)
  --poll-timeout <ms>      max watch duration when --watch (default: 15000)
  --include-message        include related message metadata (messageID only)
  --debug                  print raw endpoint payload shape and matching stats
  --reply <permission-id>  permission id to respond
  --response <once|always|reject>   required with --reply
  --help                   show this help

Examples:
  bun run .devserver/dev_code/script/xoc-session-permissions.ts \\
    --session ses_123 --kind permission

  bun run .devserver/dev_code/script/xoc-session-permissions.ts \\
    --session http://localhost:4996/.../session/ses_123 --kind ask --json

  bun run .devserver/dev_code/script/xoc-session-permissions.ts \\
    --session ses_123 --kind both --watch
`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickString(value: unknown): string | null {
    return typeof value === "string" && value.length > 0 ? value : null;
}

function getFieldString(
    record: Record<string, unknown>,
    keys: string[],
): string | null {
    for (const key of keys) {
        const candidate = pickString(record[key]);
        if (candidate) return candidate;
    }
    return null;
}

function nestedRecord(
    record: Record<string, unknown>,
    keys: string[],
): Record<string, unknown> | null {
    let current: unknown = record;
    for (const key of keys) {
        if (!isRecord(current)) return null;
        current = current[key];
    }
    return isRecord(current) ? current : null;
}

function getFieldStringDeep(
    record: Record<string, unknown>,
    keys: string[],
): string | null {
    const direct = getFieldString(record, keys);
    if (direct) return direct;

    if (keys.length > 1) {
        const nested = nestedRecord(record, keys.slice(0, -1));
        if (nested) {
            return pickString(nested[keys[keys.length - 1]]);
        }
    }

    return null;
}

function getField(
    record: Record<string, unknown>,
    keys: string[],
): unknown[] | undefined {
    for (const key of keys) {
        const value = record[key];
        if (Array.isArray(value)) return value;
    }
    return undefined;
}

function extractList(raw: unknown): unknown[] {
    if (Array.isArray(raw)) return raw;
    if (!isRecord(raw)) return [];

    if (Array.isArray(raw.permissions)) return raw.permissions;
    if (Array.isArray(raw.questions)) return raw.questions;
    if (Array.isArray(raw.data)) return raw.data;
    if (Array.isArray(raw.items)) return raw.items;
    if (Array.isArray(raw.result)) return raw.result;
    return [];
}

function getSessionId(value: unknown): string | null {
    if (!isRecord(value)) return null;

    const direct = getFieldString(value, [
        "sessionID",
        "sessionId",
        "session_id",
    ]);
    if (direct) return direct;

    const nested = value.request;
    if (isRecord(nested)) {
        return getFieldString(nested, ["sessionID", "sessionId", "session_id"]);
    }

    return null;
}

function extractCreatedAt(record: Record<string, unknown>): number | undefined {
    const time = record.time;
    if (isRecord(time)) {
        const created = time.created;
        if (typeof created === "number" && Number.isFinite(created)) {
            return created;
        }
    }
    return undefined;
}

function extractToolIds(record: Record<string, unknown>): {
    messageId?: string;
    callId?: string;
} {
    const directMessage = getFieldString(record, ["messageID", "messageId"]);
    const directCall = getFieldString(record, ["callID", "callId"]);

    const tool = isRecord(record.tool) ? record.tool : null;
    const toolMessage = tool
        ? getFieldString(tool, ["messageID", "messageId"])
        : null;
    const toolCall = tool ? getFieldString(tool, ["callID", "callId"]) : null;

    return {
        messageId: directMessage ?? toolMessage ?? undefined,
        callId: directCall ?? toolCall ?? undefined,
    };
}

function extractPermissionRecord(
    value: unknown,
): Record<string, unknown> | null {
    if (!isRecord(value)) return null;
    if (isRecord(value.permission))
        return value.permission as Record<string, unknown>;
    return value;
}

function normalizePermission(raw: unknown): NormalizedPermission | null {
    const candidate = extractPermissionRecord(raw);
    if (!candidate) return null;

    const id =
        getFieldString(candidate, ["id", "permissionID", "permissionId"]) ??
        getFieldString(candidate, ["requestID", "requestId"]);
    if (!id) return null;

    const sessionId =
        getSessionId(candidate) ??
        getFieldStringDeep(candidate, ["session"]) ??
        getFieldStringDeep(candidate, ["request", "session"]) ??
        getFieldStringDeep(candidate, ["request", "session_id"]);
    if (!sessionId) return null;

    const type = "permission";
    const title =
        getFieldString(candidate, ["title", "permission", "action"]) ??
        "<no title>";
    const { messageId, callId } = extractToolIds(candidate);

    const patternValues = getField(candidate, ["patterns", "pattern"]);
    const parsedPatterns = patternValues
        ?.filter((value): value is string => typeof value === "string")
        .filter((value) => value.length > 0);
    const pattern =
        parsedPatterns && parsedPatterns.length > 0
            ? parsedPatterns
            : (getFieldString(candidate, ["pattern"]) ?? undefined);

    const metadata = isRecord(candidate.metadata)
        ? (candidate.metadata as Record<string, unknown>)
        : {};

    return {
        kind: "permission",
        id,
        type,
        title,
        pattern,
        sessionId,
        messageId,
        callId,
        createdAt: extractCreatedAt(candidate),
        metadata,
        raw: candidate as Permission,
    };
}

function extractQuestionRecord(value: unknown): Record<string, unknown> | null {
    if (!isRecord(value)) return null;
    if (isRecord(value.question)) return value.question as Record<string, unknown>;
    return value;
}

function extractPromptAndCount(record: Record<string, unknown>): {
    prompt: string;
    questionCount: number;
} {
    const list = getField(record, ["questions"]);
    if (list && list.length > 0) {
        const questionItems = list.filter(isRecord);
        if (questionItems.length > 0) {
            const first = questionItems[0]!;
            const prompt =
                getFieldString(first, ["question", "title", "text", "header"]) ??
                "<no question>";
            return {
                prompt,
                questionCount: questionItems.length,
            };
        }
    }

    const prompt =
        getFieldString(record, ["question", "title", "text"]) ?? "<no question>";
    const questionCount = prompt === "<no question>" ? 0 : 1;
    return { prompt, questionCount };
}

function normalizeQuestion(raw: unknown): NormalizedQuestion | null {
    const candidate = extractQuestionRecord(raw);
    if (!candidate) return null;

    const id =
        getFieldString(candidate, ["id", "questionID", "questionId"]) ??
        getFieldString(candidate, ["requestID", "requestId"]);
    if (!id) return null;

    const sessionId =
        getSessionId(candidate) ??
        getFieldStringDeep(candidate, ["session"]) ??
        getFieldStringDeep(candidate, ["request", "session"]) ??
        getFieldStringDeep(candidate, ["request", "session_id"]);
    if (!sessionId) return null;

    const { prompt, questionCount } = extractPromptAndCount(candidate);
    const { messageId, callId } = extractToolIds(candidate);

    return {
        kind: "question",
        id,
        type: "question",
        prompt,
        questionCount,
        sessionId,
        messageId,
        callId,
        createdAt: extractCreatedAt(candidate),
        raw: candidate,
    };
}

function matchSession(sessionId: string, targetSession: string) {
    return sessionId === targetSession;
}

function sortByTimeDesc<T extends { createdAt?: number }>(a: T, b: T) {
    const av = a.createdAt ?? 0;
    const bv = b.createdAt ?? 0;
    return bv - av;
}

async function fetchPermissions(
    server: OpenCodeServer,
    sessionId: string,
    debug: boolean,
) {
    const all = await server.listPermissions();
    const extracted = extractList(all);
    const permissions = extracted
        .map(normalizePermission)
        .filter((item): item is NormalizedPermission => Boolean(item))
        .filter((item) => matchSession(item.sessionId, sessionId));
    permissions.sort(sortByTimeDesc);

    if (debug) {
        console.error(
            `[debug] /permission entries=${extracted.length} matched=${permissions.length}`,
        );
    }
    return permissions;
}

async function fetchQuestions(
    server: OpenCodeServer,
    sessionId: string,
    debug: boolean,
) {
    const all = await server.listQuestions();
    const extracted = extractList(all);
    const questions = extracted
        .map(normalizeQuestion)
        .filter((item): item is NormalizedQuestion => Boolean(item))
        .filter((item) => matchSession(item.sessionId, sessionId));
    questions.sort(sortByTimeDesc);

    if (debug) {
        console.error(
            `[debug] /question entries=${extracted.length} matched=${questions.length}`,
        );
    }
    return questions;
}

async function fetchInteractions(
    server: OpenCodeServer,
    args: Args,
): Promise<InteractionResult> {
    const fetchPermissionPromise =
        args.kind === "question"
            ? Promise.resolve([] as NormalizedPermission[])
            : fetchPermissions(server, args.sessionId, args.debug);
    const fetchQuestionPromise =
        args.kind === "permission"
            ? Promise.resolve([] as NormalizedQuestion[])
            : fetchQuestions(server, args.sessionId, args.debug);

    const [permissions, questions] = await Promise.all([
        fetchPermissionPromise,
        fetchQuestionPromise,
    ]);

    return { permissions, questions };
}

function hasAnyResult(result: InteractionResult, kind: QueryKind) {
    if (kind === "permission") return result.permissions.length > 0;
    if (kind === "question") return result.questions.length > 0;
    return result.permissions.length > 0 || result.questions.length > 0;
}

async function waitForInteractions(
    server: OpenCodeServer,
    args: Args,
): Promise<InteractionResult> {
    const deadline = Date.now() + args.pollTimeoutMs;

    while (Date.now() < deadline) {
        const current = await fetchInteractions(server, args);
        if (hasAnyResult(current, args.kind)) {
            return current;
        }
        await new Promise((resolve) => setTimeout(resolve, args.pollIntervalMs));
    }

    return {
        permissions: [],
        questions: [],
    };
}

function formatPermissionLine(item: NormalizedPermission): string {
    const created = item.createdAt
        ? new Date(item.createdAt).toISOString()
        : "n/a";
    const pattern = item.pattern
        ? ` pattern=${
              Array.isArray(item.pattern)
                  ? item.pattern.join(",")
                  : String(item.pattern)
          }`
        : "";
    const msg = item.messageId ? ` messageID=${item.messageId}` : "";
    const call = item.callId ? ` callID=${item.callId}` : "";
    return [
        `id=${item.id}`,
        `type=${item.type}`,
        `title=${item.title}`,
        `created=${created}`,
        `session=${item.sessionId}`,
        pattern,
        msg,
        call,
    ].join(" ");
}

function formatQuestionLine(item: NormalizedQuestion): string {
    const created = item.createdAt
        ? new Date(item.createdAt).toISOString()
        : "n/a";
    const msg = item.messageId ? ` messageID=${item.messageId}` : "";
    const call = item.callId ? ` callID=${item.callId}` : "";
    return [
        `id=${item.id}`,
        `type=${item.type}`,
        `prompt=${item.prompt}`,
        `questions=${item.questionCount}`,
        `created=${created}`,
        `session=${item.sessionId}`,
        msg,
        call,
    ].join(" ");
}

function printPermissionOutput(permissions: NormalizedPermission[]) {
    if (permissions.length === 0) {
        console.log("No permission entries for this session.");
        return;
    }

    console.log(`Found ${permissions.length} permission(s):`);
    for (const item of permissions) {
        console.log(`- ${formatPermissionLine(item)}`);
    }
}

function printQuestionOutput(questions: NormalizedQuestion[]) {
    if (questions.length === 0) {
        console.log("No question entries for this session.");
        return;
    }

    console.log(`Found ${questions.length} question(s):`);
    for (const item of questions) {
        console.log(`- ${formatQuestionLine(item)}`);
    }
}

function printOutput(result: InteractionResult, kind: QueryKind, jsonMode: boolean) {
    if (jsonMode) {
        if (kind === "permission") {
            console.log(JSON.stringify(result.permissions, null, 2));
            return;
        }
        if (kind === "question") {
            console.log(JSON.stringify(result.questions, null, 2));
            return;
        }
        console.log(
            JSON.stringify(
                {
                    permissions: result.permissions,
                    questions: result.questions,
                },
                null,
                2,
            ),
        );
        return;
    }

    if (kind === "permission") {
        printPermissionOutput(result.permissions);
        return;
    }
    if (kind === "question") {
        printQuestionOutput(result.questions);
        return;
    }

    if (result.permissions.length === 0 && result.questions.length === 0) {
        console.log("No permission/question entries for this session.");
        return;
    }

    console.log("Permissions:");
    if (result.permissions.length === 0) {
        console.log("- <none>");
    } else {
        for (const item of result.permissions) {
            console.log(`- ${formatPermissionLine(item)}`);
        }
    }

    console.log("");
    console.log("Questions:");
    if (result.questions.length === 0) {
        console.log("- <none>");
        return;
    }
    for (const item of result.questions) {
        console.log(`- ${formatQuestionLine(item)}`);
    }
}

function collectMessageRefs(result: InteractionResult, kind: QueryKind): MessageRef[] {
    if (kind === "permission") {
        return result.permissions.map((item) => ({
            kind: "permission",
            id: item.id,
            messageId: item.messageId,
        }));
    }
    if (kind === "question") {
        return result.questions.map((item) => ({
            kind: "question",
            id: item.id,
            messageId: item.messageId,
        }));
    }

    const fromPermissions = result.permissions.map((item) => ({
        kind: "permission" as const,
        id: item.id,
        messageId: item.messageId,
    }));
    const fromQuestions = result.questions.map((item) => ({
        kind: "question" as const,
        id: item.id,
        messageId: item.messageId,
    }));
    return [...fromPermissions, ...fromQuestions];
}

async function fetchRelatedMessages(
    server: OpenCodeServer,
    sessionId: string,
    refs: MessageRef[],
) {
    if (refs.length === 0) return;

    for (const ref of refs) {
        if (!ref.messageId) {
            console.log(`  [${ref.kind}] messageID: <empty> (${ref.id})`);
            continue;
        }

        try {
            const message = (await server.getMessage(
                sessionId,
                ref.messageId,
            )) as MessageWithParts;
            const info = message?.info as {
                role?: string;
                time?: { created?: number };
            };
            const role =
                typeof info?.role === "string" ? info.role : "<unknown>";
            const created = info?.time?.created
                ? new Date(info.time.created).toISOString()
                : "n/a";
            console.log(
                `  [${ref.kind}] messageID=${ref.messageId} role=${role} created=${created}`,
            );
        } catch {
            console.log(`  [${ref.kind}] messageID=${ref.messageId} (not found)`);
        }
    }
}

async function replyPermission(
    server: OpenCodeServer,
    sessionId: string,
    permissionId: string,
    action: ReplyAction,
) {
    const result = await server.respondPermission(
        sessionId,
        permissionId,
        action,
    );
    console.log(`reply result: ${String(result)}`);
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const server = OpenCodeServer.getInstance(args.baseUrl);

    if (args.replyId) {
        await replyPermission(
            server,
            args.sessionId,
            args.replyId,
            args.replyAction!,
        );
        return;
    }

    const result = args.watch
        ? await waitForInteractions(server, args)
        : await fetchInteractions(server, args);

    printOutput(result, args.kind, args.json);

    if (args.includeMessage) {
        const refs = collectMessageRefs(result, args.kind);
        await fetchRelatedMessages(server, args.sessionId, refs);
    }
}

await main();
