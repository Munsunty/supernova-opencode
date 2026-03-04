/**
 * OMO bypass PoC for OpenCode model selection.
 *
 * Goal:
 *  - Compare prompt behavior when model is explicit vs omitted.
 *  - Confirm what model is actually used for the assistant response.
 *
 * Usage examples:
 *   bun run .devserver/dev_code/script/xoc-omo-bypass-poc.ts
 *   bun run .devserver/dev_code/script/xoc-omo-bypass-poc.ts --repeat 2 --keep-sessions
 *   bun run .devserver/dev_code/script/xoc-omo-bypass-poc.ts \
 *     --prompt "Echo this request exactly: hello from poc" \
 *     --base-url http://127.0.0.1:4996
 */

import {
    OpenCodeServer,
    type PromptOptions,
} from "../../src/opencode-server-wrapper";

interface Scenario {
    id: string;
    label: string;
    options: PromptOptions;
}

interface ProbeResult {
    scenario: string;
    sessionId: string;
    requestedModel: string | null;
    requestedAgent: string | null;
    requestedAgentMatch: boolean | null;
    requestedModelMatch: boolean | null;
    messageCount: number;
    observedModelSource: "assistant" | "user" | "none";
    observedModel: string | null;
    observedUserModel: string | null;
    observedAgent: string | null;
    observedAgentSource: "assistant" | "user" | "none";
    observedRoles: string[];
    assistantText: string;
    usedBypassedChannel: boolean;
    bypassSource: "assistant" | "user" | "none";
    durationMs: number;
    error?: string;
}

interface CliArgs {
    baseUrl: string;
    prompt: string;
    repeat: number;
    keepSessions: boolean;
    cases: string[] | null;
}

function parseArgs(argv: string[]): CliArgs {
    const args: CliArgs = {
        baseUrl: process.env.OPENCODE_URL ?? "http://127.0.0.1:4996",
        prompt: "Please reply with one short sentence in Korean indicating completion.",
        repeat: 1,
        keepSessions: false,
        cases: null,
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const next = argv[i + 1];
        switch (arg) {
            case "--base-url":
                if (!next) throw new Error("--base-url requires a value");
                args.baseUrl = next;
                i++;
                break;
            case "--prompt":
                if (!next) throw new Error("--prompt requires a value");
                args.prompt = next;
                i++;
                break;
            case "--repeat":
                if (!next) throw new Error("--repeat requires a number");
                args.repeat = Number.parseInt(next, 10);
                if (!Number.isFinite(args.repeat) || args.repeat < 1) {
                    throw new Error("--repeat must be a positive integer");
                }
                i++;
                break;
            case "--cases":
                if (!next)
                    throw new Error(
                        "--cases requires comma-separated scenario IDs",
                    );
                args.cases = next
                    .split(",")
                    .map((id) => id.trim())
                    .filter(Boolean);
                i++;
                break;
            case "--keep-sessions":
                args.keepSessions = true;
                break;
            case "--help":
                printHelp();
                process.exit(0);
            default:
                break;
        }
    }

    return args;
}

function printHelp() {
    console.log(`Usage:
  bun run .devserver/dev_code/script/xoc-omo-bypass-poc.ts [options]

Options:
  --base-url <url>      Opencode server base URL (default: http://127.0.0.1:4996)
  --prompt <text>       Prompt to send for each case
  --repeat <n>          Repeat each case n times (default: 1)
  --cases <ids>         Comma-separated case IDs to run (default: all)
  --keep-sessions       Keep sessions for manual inspection
  --help                Show this message

Case IDs:
  baseline             no model/agent
  agent-spark          explicit agent=spark
`);
}

function formatModel(providerID?: unknown, modelID?: unknown): string | null {
    if (typeof providerID !== "string" || typeof modelID !== "string") {
        return null;
    }
    if (providerID.length === 0 || modelID.length === 0) return null;
    return `${providerID}/${modelID}`;
}

function extractText(parts: unknown[]): string {
    if (!Array.isArray(parts)) return "";
    return parts
        .map((part) => {
            if (!part || typeof part !== "object") return "";
            const candidate = part as { type?: unknown; text?: unknown };
            if (
                candidate.type === "text" &&
                typeof candidate.text === "string"
            ) {
                return candidate.text;
            }
            return "";
        })
        .filter(Boolean)
        .join("\n")
        .slice(0, 500);
}

function coerceMessageRecords(messages: unknown[]): Array<{
    info: {
        role?: unknown;
        providerID?: unknown;
        modelID?: unknown;
        model?: unknown;
        agent?: unknown;
    };
    parts?: unknown;
}> {
    if (!Array.isArray(messages)) return [];
    const normalized: Array<{
        info: {
            role?: unknown;
            providerID?: unknown;
            modelID?: unknown;
            model?: unknown;
            agent?: unknown;
        };
        parts?: unknown;
    }> = [];
    for (const entry of messages) {
        if (!entry || typeof entry !== "object") continue;
        const candidate = entry as {
            info?: unknown;
            parts?: unknown;
        };
        if (!candidate.info || typeof candidate.info !== "object") continue;
        const info = candidate.info as {
            role?: unknown;
            providerID?: unknown;
            modelID?: unknown;
            model?: unknown;
            agent?: unknown;
        };
        normalized.push({ info, parts: candidate.parts });
    }
    return normalized;
}

function formatRole(role: unknown): string {
    if (typeof role !== "string" || role.length === 0) return "<unknown>";
    return role;
}

function normalizeModel(
    providerID?: unknown,
    modelID?: unknown,
): string | null {
    if (typeof providerID !== "string" || typeof modelID !== "string") {
        return null;
    }
    const provider = providerID.trim().toLowerCase();
    const model = modelID.trim().toLowerCase();
    if (!provider || !model) return null;
    return `${provider}/${model}`;
}

function messageModel(message: {
    providerID?: unknown;
    modelID?: unknown;
    model?: unknown;
}): string | null {
    const direct = normalizeModel(message.providerID, message.modelID);
    if (direct) return direct;
    if (!message.model || typeof message.model !== "object") return null;
    const modelObj = message.model as {
        providerID?: unknown;
        modelID?: unknown;
    };
    return normalizeModel(modelObj.providerID, modelObj.modelID);
}

function messageAgent(message: { agent?: unknown }): string | null {
    if (typeof message.agent !== "string") return null;
    const trimmed = message.agent.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function findMessagesByRole(messages: unknown[], role: "assistant" | "user") {
    for (let i = messages.length - 1; i >= 0; i--) {
        const entry = messages[i];
        if (!entry || typeof entry !== "object") continue;
        const message = entry as { info?: unknown };
        const info = message.info;
        if (!info || typeof info !== "object") continue;
        if ((info as { role?: unknown }).role === role) {
            return entry as
                | {
                      info: {
                          role: string;
                          providerID?: string;
                          modelID?: string;
                          model?: { providerID?: unknown; modelID?: unknown };
                          agent?: string;
                      };
                      parts: unknown[];
                  }
                | undefined;
        }
    }
    return undefined;
}

function findLatestModelAndAgent(
    messages: Array<{
        info: {
            role?: unknown;
            providerID?: unknown;
            modelID?: unknown;
            model?: unknown;
            agent?: unknown;
        };
        parts?: unknown;
    }>,
): {
    assistantModel: string | null;
    userModel: string | null;
    assistantAgent: string | null;
    userAgent: string | null;
    roles: string[];
} {
    const assistant = findMessagesByRole(messages, "assistant");
    const user = findMessagesByRole(messages, "user");
    const assistantInfo = assistant?.info;
    const userInfo = user?.info;

    const assistantModel = assistantInfo ? messageModel(assistantInfo) : null;
    const userModel = userInfo ? messageModel(userInfo) : null;
    const assistantAgent = assistantInfo ? messageAgent(assistantInfo) : null;
    const userAgent = userInfo ? messageAgent(userInfo) : null;

    return {
        assistantModel,
        userModel,
        assistantAgent,
        userAgent,
        roles: messages.map((message) => formatRole(message.info.role)),
    };
}

function resolveObservedModel(
    requestedModel: string | null,
    assistantModel: string | null,
    userModel: string | null,
): {
    source: "assistant" | "user" | "none";
    model: string | null;
    matchRequested: boolean;
} {
    if (!requestedModel) {
        if (assistantModel) {
            return {
                source: "assistant",
                model: assistantModel,
                matchRequested: false,
            };
        }
        if (userModel) {
            return { source: "user", model: userModel, matchRequested: false };
        }
        return { source: "none", model: null, matchRequested: false };
    }

    if (assistantModel && modelsMatch(assistantModel, requestedModel)) {
        return {
            source: "assistant",
            model: assistantModel,
            matchRequested: true,
        };
    }
    if (userModel && modelsMatch(userModel, requestedModel)) {
        return { source: "user", model: userModel, matchRequested: true };
    }

    if (assistantModel) {
        return {
            source: "assistant",
            model: assistantModel,
            matchRequested: false,
        };
    }
    if (userModel) {
        return { source: "user", model: userModel, matchRequested: false };
    }
    return { source: "none", model: null, matchRequested: false };
}

function resolveObservedAgent(
    requestedAgent: string | null,
    assistantAgent: string | null,
    userAgent: string | null,
): {
    source: "assistant" | "user" | "none";
    agent: string | null;
    matchRequested: boolean | null;
} {
    const requested = canonicalizeRequestedAgent(requestedAgent);
    const assistant = normalizeAgent(assistantAgent);
    const user = normalizeAgent(userAgent);

    if (requestedAgent === null) {
        if (assistant) {
            return {
                source: "assistant",
                agent: assistantAgent,
                matchRequested: null,
            };
        }
        if (user) {
            return { source: "user", agent: userAgent, matchRequested: null };
        }
        return { source: "none", agent: null, matchRequested: null };
    }

    if (assistant && assistant === requested) {
        return {
            source: "assistant",
            agent: assistantAgent,
            matchRequested: true,
        };
    }
    if (user && user === requested) {
        return { source: "user", agent: userAgent, matchRequested: true };
    }
    if (assistant) {
        return {
            source: "assistant",
            agent: assistantAgent,
            matchRequested: false,
        };
    }
    if (user) {
        return { source: "user", agent: userAgent, matchRequested: false };
    }
    return { source: "none", agent: null, matchRequested: false };
}

function modelsMatch(a: string | null, b: string | null): boolean {
    if (!a || !b) return false;
    return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForMessages(
    server: ReturnType<typeof OpenCodeServer.getInstance>,
    sessionId: string,
    timeoutMs: number,
    pollMs: number,
): Promise<unknown[]> {
    const deadline = Date.now() + timeoutMs;
    let lastLength = -1;
    let stableCount = 0;

    while (Date.now() < deadline) {
        const messages = coerceMessageRecords(
            await server.getMessages(sessionId).catch(() => []),
        );

        if (messages.length > 0) {
            const assistant = findMessagesByRole(messages, "assistant");
            if (assistant) return messages;

            if (messages.length !== lastLength) {
                stableCount = 0;
                lastLength = messages.length;
            } else {
                stableCount += 1;
            }

            // no new messages for several polls and still no assistant.
            if (stableCount >= 3) return messages;
        } else if (lastLength === 0) {
            stableCount += 1;
            if (stableCount >= 3) return [];
        } else {
            lastLength = messages.length;
            stableCount = 0;
        }

        await sleep(pollMs);
    }

    return coerceMessageRecords(
        await server.getMessages(sessionId).catch(() => []),
    );
}

function normalizeAgent(agent?: string | null): string | null {
    if (!agent || typeof agent !== "string") return null;
    return agent.split("(")[0].trim().toLowerCase();
}

function canonicalizeRequestedAgent(agent?: string | null): string | null {
    const normalized = normalizeAgent(agent);
    if (normalized === "build") {
        return "opencode-builder";
    }
    return normalized;
}

function buildScenarios(): Scenario[] {
    return [
        {
            id: "baseline",
            label: "Baseline (no model, no agent)",
            options: {},
        },
        {
            id: "agent-spark",
            label: "Explicit agent=spark",
            options: {
                agent: "spark",
            },
        },
    ];
}

async function runScenario(
    server: ReturnType<typeof OpenCodeServer.getInstance>,
    prompt: string,
    scenario: Scenario,
    keepSession: boolean,
): Promise<ProbeResult> {
    const startedAt = Date.now();
    let sessionId = "<not-created>";
    let session: { id: string } | null = null;
    const emptyMessages: ReturnType<typeof coerceMessageRecords> = [];
    let messages = emptyMessages;

    try {
        session = await server.createSession(scenario.label);
        sessionId = session.id;
        await server.promptAsync(session.id, prompt, scenario.options);
        await server.waitForIdle(session.id, {
            interval: 500,
            timeout: 180_000,
        });
        messages = await waitForMessages(server, session.id, 60_000, 500);
        const { assistantModel, userModel, assistantAgent, userAgent, roles } =
            findLatestModelAndAgent(messages);
        const assistant = findMessagesByRole(messages, "assistant");
        const requestedModel = scenario.options.model
            ? formatModel(
                  scenario.options.model.providerID,
                  scenario.options.model.modelID,
              )
            : null;
        const requestedAgent = scenario.options.agent ?? null;
        const observedModel = resolveObservedModel(
            requestedModel,
            assistantModel,
            userModel,
        );
        const observedAgent = resolveObservedAgent(
            requestedAgent,
            assistantAgent,
            userAgent,
        );

        return {
            scenario: scenario.id,
            sessionId: session.id,
            requestedModel,
            requestedAgent: requestedAgent,
            requestedAgentMatch: observedAgent.matchRequested,
            requestedModelMatch: observedModel.matchRequested,
            messageCount: messages.length,
            observedModelSource: observedModel.source,
            observedModel: observedModel.model,
            observedUserModel: userModel,
            observedAgent: observedAgent.agent,
            observedAgentSource: observedAgent.source,
            observedRoles: roles,
            assistantText: assistant ? extractText(assistant.parts ?? []) : "",
            usedBypassedChannel:
                requestedModel !== null && observedModel.matchRequested,
            bypassSource: observedModel.source,
            durationMs: Date.now() - startedAt,
        };
    } catch (error) {
        const requestedModel = scenario.options.model
            ? formatModel(
                  scenario.options.model.providerID,
                  scenario.options.model.modelID,
              )
            : null;
        return {
            scenario: scenario.id,
            sessionId: sessionId,
            requestedModel,
            requestedAgent: scenario.options.agent ?? null,
            requestedAgentMatch: null,
            requestedModelMatch: false,
            messageCount: messages.length,
            observedModelSource: "none",
            observedModel: null,
            observedUserModel: null,
            observedAgent: null,
            observedAgentSource: "none",
            observedRoles: messages.map((message) =>
                formatRole(message.info.role),
            ),
            assistantText: "",
            usedBypassedChannel: false,
            bypassSource: "none",
            durationMs: Date.now() - startedAt,
            error: error instanceof Error ? error.message : String(error),
        };
    } finally {
        if (!keepSession) {
            if (session) {
                await server.deleteSession(session.id).catch(() => {});
            }
        } else {
            if (session) {
                console.error(`Session kept for manual check: ${session.id}`);
            } else {
                console.error("Session was not created; nothing to keep.");
            }
        }
    }
}

function printSummary(results: ProbeResult[]) {
    console.log("\n=== OMO model bypass PoC results ===");
    for (const result of results) {
        console.log(`- ${result.scenario}`);
        console.log(`  sessionId: ${result.sessionId}`);
        console.log(`  messageCount: ${result.messageCount}`);
        console.log(`  roles: ${result.observedRoles.join(" -> ")}`);
        console.log(
            `  requested: ${result.requestedModel ?? "<not provided>"}`,
        );
        console.log(
            `  requestedAgent: ${result.requestedAgent ?? "<not provided>"}`,
        );
        console.log(`  observedModel: ${result.observedModel ?? "<none>"}`);
        console.log(`  observedModelSource: ${result.observedModelSource}`);
        console.log(
            `  observedUserModel: ${result.observedUserModel ?? "<n/a>"}`,
        );
        console.log(`  observedAgent: ${result.observedAgent ?? "<n/a>"}`);
        console.log(`  observedAgentSource: ${result.observedAgentSource}`);
        console.log(
            `  bypassMatch: ${result.requestedModel ? (result.usedBypassedChannel ? "true" : "false") : "n/a"}`,
        );
        console.log(
            `  requestedModelMatch: ${result.requestedModelMatch === null ? "n/a" : result.requestedModelMatch ? "true" : "false"}`,
        );
        console.log(
            `  agentMatch: ${
                result.requestedAgentMatch === null
                    ? "n/a"
                    : result.requestedAgentMatch
                      ? "true"
                      : "false"
            }`,
        );
        console.log(`  durationMs: ${result.durationMs}`);
        if (result.error) {
            console.log(`  error: ${result.error}`);
        }
        if (result.assistantText.length > 0) {
            console.log(`  sampleText: ${result.assistantText}`);
        }
        console.log("");
    }

    const explicit = results.filter((r) => r.requestedModel !== null);
    const explicitPass = explicit.filter((r) => r.usedBypassedChannel).length;
    const explicitAssistantSource = explicit.filter(
        (r) => r.observedModelSource === "assistant",
    ).length;
    const explicitUserSource = explicit.filter(
        (r) => r.observedModelSource === "user",
    ).length;
    const explicitNoModelSource =
        explicit.length - explicitAssistantSource - explicitUserSource;
    console.log(
        `Explicit-model scenarios passed: ${explicitPass}/${explicit.length}`,
    );
    if (explicit.length > 0) {
        console.log(
            `Explicit-model source: assistant=${explicitAssistantSource}/${explicit.length}, user=${explicitUserSource}/${explicit.length}, none=${explicitNoModelSource}/${explicit.length}`,
        );
    }
    if (explicit.length > 0 && explicitPass < explicit.length) {
        console.log(
            `Warning: ${explicit.length - explicitPass} explicit scenario(s) did not emit requested model.`,
        );
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const scenarios = buildScenarios().filter((scenario) => {
        if (!args.cases || args.cases.length === 0) return true;
        return args.cases.includes(scenario.id);
    });

    if (scenarios.length === 0) {
        throw new Error("No matching scenarios found");
    }

    const server = OpenCodeServer.getInstance(args.baseUrl);
    const allResults: ProbeResult[] = [];

    try {
        for (let index = 0; index < args.repeat; index++) {
            console.log(`Run ${index + 1}/${args.repeat}`);
            for (const scenario of scenarios) {
                console.log(`- running ${scenario.id} (${scenario.label})`);
                const result = await runScenario(
                    server,
                    args.prompt,
                    scenario,
                    args.keepSessions,
                );
                allResults.push(result);
            }
        }
    } finally {
        await server.dispose().catch(() => {});
    }

    printSummary(allResults);
}

await main();
