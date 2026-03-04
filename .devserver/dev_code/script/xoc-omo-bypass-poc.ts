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
  observedModel: string | null;
  observedUserModel: string | null;
  observedAgent: string | null;
  assistantText: string;
  usedBypassedChannel: boolean;
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

const TARGET_MODEL = {
  providerID: "openai",
  modelID: "gpt-5.3-codex-spark",
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    baseUrl: process.env.OPENCODE_URL ?? "http://127.0.0.1:4996",
    prompt:
      "Please reply with one short sentence in Korean indicating completion.",
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
          throw new Error("--cases requires comma-separated scenario IDs");
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
  agent-explore        agent: explore only
  model-direct         explicit model direct (target model)
  explore-direct-model  agent: explore + explicit target model
  agent-build          agent: build only
  build-direct-model   agent: build + explicit target model
  opencode-builder-direct-model
                     agent: OpenCode-Builder + explicit target model
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
      if (candidate.type === "text" && typeof candidate.text === "string") {
        return candidate.text;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .slice(0, 500);
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
      id: "agent-explore",
      label: "Explicit agent=explore",
      options: {
        agent: "explore",
      },
    },
    {
      id: "model-direct",
      label: "Explicit model: openai/gpt-5.3-codex-spark",
      options: {
        model: TARGET_MODEL,
      },
    },
    {
      id: "explore-direct-model",
      label: "agent=explore + explicit model target",
      options: {
        agent: "explore",
        model: TARGET_MODEL,
      },
    },
    {
      id: "agent-build",
      label: "Explicit agent=build",
      options: {
        agent: "build",
      },
    },
    {
      id: "build-direct-model",
      label: "agent=build + explicit model target",
      options: {
        agent: "build",
        model: TARGET_MODEL,
      },
    },
    {
      id: "opencode-builder-direct-model",
      label: "agent=OpenCode-Builder + explicit model target",
      options: {
        agent: "OpenCode-Builder",
        model: TARGET_MODEL,
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
  let durationMs = 0;
  let session: { id: string } | null = null;

  try {
    session = await server.createSession(scenario.label);
    sessionId = session.id;
    await server.promptAsync(session.id, prompt, scenario.options);
    await server.waitForIdle(session.id, { interval: 500, timeout: 180_000 });
    const messages = await server.getMessages(session.id);
    const assistant = findMessagesByRole(messages as unknown[], "assistant");
    const user = findMessagesByRole(messages as unknown[], "user");

    if (!assistant) {
      throw new Error("No assistant message found after completion");
    }

    durationMs = Date.now() - startedAt;
    const observedModel = formatModel(
      (assistant.info as { providerID?: string }).providerID,
      (assistant.info as { modelID?: string }).modelID,
    );
    const observedUserModel = user?.info.model
      ? formatModel(
          user.info.model.providerID as unknown,
          user.info.model.modelID as unknown,
        )
      : null;
    const requestedModel = scenario.options.model
      ? formatModel(
          scenario.options.model.providerID,
          scenario.options.model.modelID,
        )
      : null;
    const requestedAgent = scenario.options.agent ?? null;
    const requestedAgentMatch =
      requestedAgent === null
        ? null
        : canonicalizeRequestedAgent(requestedAgent) ===
          normalizeAgent(user?.info.agent ?? null);

    return {
      scenario: scenario.id,
      sessionId: session.id,
      requestedModel,
      requestedAgent: requestedAgent,
      requestedAgentMatch,
      observedModel,
      observedUserModel,
      observedAgent: user?.info.agent ?? null,
      assistantText: extractText(assistant.parts ?? []),
      usedBypassedChannel:
        requestedModel !== null && observedModel === requestedModel,
      durationMs,
    };
  } catch (error) {
    return {
      scenario: scenario.id,
      sessionId: sessionId,
      requestedModel: scenario.options.model
        ? formatModel(
            scenario.options.model.providerID,
            scenario.options.model.modelID,
          )
        : null,
      requestedAgent: scenario.options.agent ?? null,
      requestedAgentMatch: null,
      observedModel: null,
      observedUserModel: null,
      observedAgent: null,
      assistantText: "",
      usedBypassedChannel: false,
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
    console.log(`  requested: ${result.requestedModel ?? "<not provided>"}`);
    console.log(
      `  requestedAgent: ${result.requestedAgent ?? "<not provided>"}`,
    );
    console.log(
      `  observedModel: ${result.observedModel ?? "<no assistant msg>"}`,
    );
    console.log(`  observedUserModel: ${result.observedUserModel ?? "<n/a>"}`);
    console.log(`  observedAgent: ${result.observedAgent ?? "<n/a>"}`);
    console.log(
      `  bypassMatch: ${result.requestedModel ? (result.usedBypassedChannel ? "true" : "false") : "n/a"}`,
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
  console.log(
    `Explicit-model scenarios passed: ${explicitPass}/${explicit.length}`,
  );
  if (explicit.length > 0 && explicitPass < explicit.length) {
    console.log(
      "Warning: one or more explicit model requests were not reflected in assistant model; fallback or OmO override is likely occurring.",
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
