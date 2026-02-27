/**
 * X₂ Summarizer — PromptResult에서 핵심 정보 추출
 *
 * 순수 함수. 외부 의존성 없음.
 * wrapper의 PromptResult를 받아 요약/비용/변경사항을 반환.
 */

import type {
  AssistantMessage,
  Part,
  ToolPart,
} from "../opencode-server-wrapper"

export interface PromptResult {
  info: AssistantMessage
  parts: Part[]
}

export interface Summary {
  text: string
  cost: number
  tokens: { input: number; output: number; reasoning: number }
  files: FileChange[]
  tools: ToolSummary[]
  duration: number | null
}

export interface FileChange {
  file: string
  additions: number
  deletions: number
}

export interface ToolSummary {
  name: string
  status: string
  title?: string
}

const MAX_TEXT_LENGTH = 2000

export function summarize(result: PromptResult): Summary {
  return {
    text: extractText(result.parts),
    cost: result.info.cost,
    tokens: {
      input: result.info.tokens.input,
      output: result.info.tokens.output,
      reasoning: result.info.tokens.reasoning,
    },
    files: extractFileChanges(result.parts),
    tools: extractTools(result.parts),
    duration: extractDuration(result.info),
  }
}

export function extractText(parts: Part[], maxLength = MAX_TEXT_LENGTH): string {
  const texts: string[] = []
  for (const part of parts) {
    if (part.type === "text" && !part.synthetic && !part.ignored) {
      texts.push(part.text)
    }
  }
  const joined = texts.join("\n")
  if (joined.length <= maxLength) return joined
  return joined.slice(0, maxLength) + "…"
}

export function extractFileChanges(parts: Part[]): FileChange[] {
  const changes: FileChange[] = []
  for (const part of parts) {
    if (part.type !== "tool") continue
    const tool = part as ToolPart
    if (tool.state.status !== "completed") continue

    // edit/write 도구에서 파일 변경 메타데이터 추출
    const meta = tool.state.metadata
    if (meta?.file && typeof meta.file === "string") {
      changes.push({
        file: meta.file,
        additions: typeof meta.additions === "number" ? meta.additions : 0,
        deletions: typeof meta.deletions === "number" ? meta.deletions : 0,
      })
    }
  }
  return changes
}

export function extractTools(parts: Part[]): ToolSummary[] {
  const tools: ToolSummary[] = []
  for (const part of parts) {
    if (part.type !== "tool") continue
    const tool = part as ToolPart
    tools.push({
      name: tool.tool,
      status: tool.state.status,
      title:
        tool.state.status === "completed" || tool.state.status === "running"
          ? tool.state.title
          : undefined,
    })
  }
  return tools
}

export function extractCost(info: AssistantMessage) {
  return {
    cost: info.cost,
    tokens: {
      input: info.tokens.input,
      output: info.tokens.output,
      reasoning: info.tokens.reasoning,
      cache: info.tokens.cache,
    },
  }
}

export function extractDuration(info: AssistantMessage): number | null {
  if (!info.time.completed) return null
  return info.time.completed - info.time.created
}

export function formatSummary(summary: Summary): string {
  const lines: string[] = []

  if (summary.text) {
    lines.push(summary.text)
    lines.push("")
  }

  if (summary.files.length > 0) {
    lines.push(`Files: ${summary.files.length}`)
    for (const f of summary.files) {
      lines.push(`  ${f.file} (+${f.additions} -${f.deletions})`)
    }
    lines.push("")
  }

  const toolsDone = summary.tools.filter((t) => t.status === "completed").length
  if (summary.tools.length > 0) {
    lines.push(`Tools: ${toolsDone}/${summary.tools.length} completed`)
  }

  if (summary.duration !== null) {
    lines.push(`Duration: ${(summary.duration / 1000).toFixed(1)}s`)
  }

  lines.push(`Cost: $${summary.cost.toFixed(4)}`)
  lines.push(
    `Tokens: ${summary.tokens.input}in / ${summary.tokens.output}out`
  )

  return lines.join("\n")
}
