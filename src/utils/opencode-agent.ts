import type {
  OpenCodeServer,
  PromptOptions,
  PromptResult,
  RunOptions,
} from "../opencode-server-wrapper";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type UnknownRecord = Record<string, unknown>;
type AgentName = string | null | undefined;
type PromptModel = PromptOptions["model"];
type ModelRef = string | PromptModel | null | undefined;
type AgentPromptOptions = Omit<PromptOptions, "agent" | "model"> & {
  agent?: AgentName;
  model?: ModelRef;
};
type AgentRunOptions = Omit<RunOptions, "agent" | "model"> & {
  agent?: AgentName;
  model?: ModelRef;
};

interface X2Dispatcher {
  model: string | null;
  prompt: (
    server: OpenCodeServer,
    sessionId: string,
    text: string,
    agent?: AgentName,
  ) => Promise<void>;
}

interface X2SummarizeRequest {
  task: {
    id: string;
    type: string;
    source: string;
  };
  summary: {
    text: string;
    files: Array<{
      file: string;
      additions: number;
      deletions: number;
    }>;
    tools: Array<{
      name: string;
      status: string;
      title?: string;
    }>;
    cost: number;
    tokens: {
      input: number;
      output: number;
      reasoning: number;
    };
    duration: number | null;
  };
  fallbackText: string;
  summarizerAgent?: AgentName;
}

interface X2SummarizeResult {
  text: string;
  summaryAgent: string;
  summaryModel: string | null;
  usedAgent: boolean;
  error: string | null;
}

interface X4SummarizeRequest {
  summary: Record<string, unknown>;
  summarizerAgent?: AgentName;
}

interface X4SummarizeResult {
  summary: Record<string, unknown>;
  usedAgent: boolean;
  agent: string | null;
  error: string | null;
}

interface MessageMeta {
  agent: string | null;
  model: string | null;
}

const FALLBACK_X2_SUMMARIZER_PROMPT = [
  "You are the X2 summarizer agent for the homsa repository.",
  "",
  "Role:",
  "- Summarize task execution outputs for user delivery.",
  "- Preserve factual details only; do not invent missing information.",
  "- Keep output concise and operationally useful.",
  "",
  "Rules:",
  "- Prioritize: outcome, changed files, notable errors, and next actionable step.",
  "- If execution failed, explain the failure reason and safest recovery action.",
  "- Do not include internal chain-of-thought or speculative reasoning.",
  "- Use plain Korean unless the input/output is clearly English.",
  "",
  "Format:",
  "- 3 short sections max: `결과`, `핵심 변경`, `다음 단계`.",
  "- Use bullet points when listing multiple facts.",
].join("\n");

const FALLBACK_X4_SUMMARIZER_PROMPT = [
  "You are the X4 summarizer/router-context agent for the homsa repository.",
  "",
  "Role:",
  "- Convert interaction history into routing-ready context.",
  "- Emphasize intent, urgency, risk, and required follow-up.",
  "- Produce stable summaries that can be consumed by downstream routing logic.",
  "",
  "Rules:",
  "- Extract only verifiable facts from the input.",
  "- Separate `사실` and `판단 근거` clearly.",
  "- If data is incomplete, mark unknown fields explicitly as `unknown`.",
  "- Avoid verbose prose and avoid policy drift.",
  "",
  "Format:",
  "- Structured sections: `요청 의도`, `현재 상태`, `리스크`, `권장 액션`.",
  "- Each section should be short and directly actionable.",
].join("\n");

const promptTemplateCache = new Map<string, string | null>();

function toOptionalAgent(agent: string | null | undefined): string | undefined {
  if (typeof agent !== "string") return undefined;
  const trimmed = agent.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseModelFromString(raw: string): PromptModel | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const splitAt = trimmed.indexOf("/");
  if (splitAt <= 0 || splitAt === trimmed.length - 1) {
    return null;
  }
  const providerID = trimmed.slice(0, splitAt).trim();
  const modelID = trimmed.slice(splitAt + 1).trim();
  if (!providerID || !modelID) return null;
  return { providerID, modelID };
}

function toOptionalModel(model: ModelRef): PromptModel | undefined {
  if (!model) return undefined;
  if (typeof model === "string") {
    return parseModelFromString(model) ?? undefined;
  }

  const providerID =
    typeof model.providerID === "string" ? model.providerID.trim() : "";
  const modelID = typeof model.modelID === "string" ? model.modelID.trim() : "";
  if (!providerID || !modelID) return undefined;
  return { providerID, modelID };
}

function normalizePromptOptions(
  options: AgentPromptOptions = {},
): PromptOptions {
  const { agent, model, ...rest } = options;
  const normalized: PromptOptions = { ...rest };
  const normalizedAgent = toOptionalAgent(agent);
  if (normalizedAgent) normalized.agent = normalizedAgent;
  const normalizedModel = toOptionalModel(model);
  if (normalizedModel) normalized.model = normalizedModel;
  return normalized;
}

function normalizeRunOptions(options: AgentRunOptions = {}): RunOptions {
  const { agent, model, ...rest } = options;
  const normalized: RunOptions = { ...rest };
  const normalizedAgent = toOptionalAgent(agent);
  if (normalizedAgent) normalized.agent = normalizedAgent;
  const normalizedModel = toOptionalModel(model);
  if (normalizedModel) normalized.model = normalizedModel;
  return normalized;
}

function formatModel(model: ModelRef): string | null {
  const normalized = toOptionalModel(model);
  if (!normalized) return null;
  return `${normalized.providerID}/${normalized.modelID}`;
}

function toRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as UnknownRecord;
}

function toText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function modelFromInfo(info: UnknownRecord): string | null {
  const directProvider = toText(info.providerID);
  const directModel = toText(info.modelID);
  if (directProvider && directModel) {
    return `${directProvider}/${directModel}`;
  }

  const nested = toRecord(info.model);
  if (!nested) return null;
  const nestedProvider = toText(nested.providerID);
  const nestedModel = toText(nested.modelID);
  if (nestedProvider && nestedModel) {
    return `${nestedProvider}/${nestedModel}`;
  }

  return null;
}

function normalizePathCandidate(raw: string | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildPromptPathCandidates(
  fileName: string,
  envKeys: string[],
): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const push = (value: string | undefined) => {
    const normalized = normalizePathCandidate(value);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push(normalized);
  };

  for (const envKey of envKeys) {
    push(process.env[envKey]);
  }

  push(`/run/opencode-seed/agents/${fileName}`);
  push(`/workspace/project/.devserver/agents/${fileName}`);
  push(resolve(process.cwd(), ".devserver", "agents", fileName));
  push(resolve(process.cwd(), "agents", fileName));

  return candidates;
}

function loadPromptTemplate(
  cacheKey: string,
  fileName: string,
  envKeys: string[],
  fallback: string,
): string {
  if (promptTemplateCache.has(cacheKey)) {
    return promptTemplateCache.get(cacheKey) ?? fallback;
  }

  for (const candidate of buildPromptPathCandidates(fileName, envKeys)) {
    try {
      if (!existsSync(candidate)) continue;
      const loaded = readFileSync(candidate, "utf8").trim();
      if (!loaded) continue;
      promptTemplateCache.set(cacheKey, loaded);
      return loaded;
    } catch {
      // ignore and continue with next candidate
    }
  }

  promptTemplateCache.set(cacheKey, null);
  return fallback;
}

function extractTextParts(parts: PromptResult["parts"]): string {
  return parts
    .filter((part) => part.type === "text")
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("\n")
    .trim();
}

function buildX2SummarizePrompt(payload: X2SummarizeRequest): string {
  const template = loadPromptTemplate(
    "x2_summarizer_prompt",
    "x2-summarizer.prompt.txt",
    ["OPENCODE_X2_SUMMARIZER_PROMPT_PATH", "X2_SUMMARIZER_PROMPT_PATH"],
    FALLBACK_X2_SUMMARIZER_PROMPT,
  );
  return [
    template,
    "",
    "Input JSON:",
    JSON.stringify(
      {
        task: payload.task,
        summary: payload.summary,
      },
      null,
      2,
    ),
    "",
    "Respond only with the final summary that follows the format rules.",
  ].join("\n");
}

function buildX4SummarizePrompt(summary: Record<string, unknown>): string {
  const template = loadPromptTemplate(
    "x4_summarizer_prompt",
    "x4-summarizer.prompt.txt",
    ["OPENCODE_X4_SUMMARIZER_PROMPT_PATH", "X4_SUMMARIZER_PROMPT_PATH"],
    FALLBACK_X4_SUMMARIZER_PROMPT,
  );
  return [
    template,
    "",
    "Input JSON:",
    JSON.stringify(summary, null, 2),
    "",
    "Respond only with the final summary that follows the format rules.",
  ].join("\n");
}

async function promptAsyncWithAgent(
  server: OpenCodeServer,
  sessionId: string,
  text: string,
  options: AgentPromptOptions = {},
): Promise<void> {
  await server.promptAsync(sessionId, text, normalizePromptOptions(options));
}

async function runWithAgent(
  server: OpenCodeServer,
  text: string,
  options: AgentRunOptions = {},
): Promise<PromptResult> {
  return server.run(text, normalizeRunOptions(options));
}

function createX2Dispatcher(bypassModel?: ModelRef): X2Dispatcher {
  const normalizedModel = toOptionalModel(bypassModel);
  const formattedModel = formatModel(normalizedModel);

  return {
    model: formattedModel,
    async prompt(
      server: OpenCodeServer,
      sessionId: string,
      text: string,
      agent?: AgentName,
    ): Promise<void> {
      await promptAsyncWithAgent(server, sessionId, text, {
        agent,
        ...(normalizedModel ? { model: normalizedModel } : {}),
      });
    },
  };
}

async function x2Summarize(
  server: OpenCodeServer,
  request: X2SummarizeRequest,
): Promise<X2SummarizeResult> {
  const fallback = request.fallbackText;
  const agent = toOptionalAgent(request.summarizerAgent);
  if (!agent) {
    return {
      text: fallback,
      summaryAgent: "x2-local",
      summaryModel: null,
      usedAgent: false,
      error: null,
    };
  }

  try {
    const result = await runWithAgent(server, buildX2SummarizePrompt(request), {
      agent,
      deleteAfter: true,
      tools: {
        write: false,
        edit: false,
        bash: false,
      },
    });
    const text = extractTextParts(result.parts);
    if (!text) {
      return {
        text: fallback,
        summaryAgent: "x2-local-fallback",
        summaryModel: null,
        usedAgent: false,
        error: "x2_summary_empty",
      };
    }

    const meta = toRecord(result.info);
    const observedAgent = (meta ? toText(meta.agent) : null) ?? agent;
    const observedModel = meta ? modelFromInfo(meta) : null;
    return {
      text,
      summaryAgent: observedAgent,
      summaryModel: observedModel,
      usedAgent: true,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      text: fallback,
      summaryAgent: "x2-local-fallback",
      summaryModel: null,
      usedAgent: false,
      error: message,
    };
  }
}

async function x4Summarize(
  server: OpenCodeServer,
  request: X4SummarizeRequest,
): Promise<X4SummarizeResult> {
  const agent = toOptionalAgent(request.summarizerAgent);
  if (!agent) {
    return {
      summary: request.summary,
      usedAgent: false,
      agent: null,
      error: null,
    };
  }

  try {
    const result = await runWithAgent(
      server,
      buildX4SummarizePrompt(request.summary),
      {
        agent,
        deleteAfter: true,
        tools: {
          write: false,
          edit: false,
          bash: false,
        },
      },
    );
    const llmSummary = extractTextParts(result.parts);
    if (!llmSummary) {
      return {
        summary: request.summary,
        usedAgent: false,
        agent,
        error: "x4_summary_empty",
      };
    }

    return {
      summary: {
        ...request.summary,
        llm_summary: llmSummary,
        llm_summary_agent: agent,
      },
      usedAgent: true,
      agent,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      summary: request.summary,
      usedAgent: false,
      agent,
      error: message,
    };
  }
}

function messageMeta(info: unknown): MessageMeta {
  const record = toRecord(info);
  if (!record) return { agent: null, model: null };
  return {
    agent: toText(record.agent),
    model: modelFromInfo(record),
  };
}

export const opencodeAgent = {
  X2_normalize_bypass_model: (model: ModelRef): string | null =>
    formatModel(model),
  X2_dispatcher: createX2Dispatcher,
  X2_summarize: x2Summarize,
  X4_summarize: x4Summarize,
  message_meta: messageMeta,
};
