/**
 * OpenCode Server Wrapper
 *
 * @opencode-ai/sdk를 감싸는 싱글톤 클래스.
 * Telegram Bot(X₁), 보조 워커(L'ₙ) 등에서 import하여 사용.
 *
 * @example
 * ```ts
 * import { OpenCodeServer } from "./opencode-server-wrapper"
 *
 * const server = OpenCodeServer.getInstance()
 * const result = await server.run("hello.txt를 만들고 hello world를 써줘")
 * console.log(result.parts)
 * ```
 */

import {
  createOpencodeClient,
  type OpencodeClient,
} from "@opencode-ai/sdk/client"

// ─── SDK 타입 re-export ───────────────────────────────────────────

export type {
  // Core
  Session,
  Message,
  UserMessage,
  AssistantMessage,
  Part,
  TextPart,
  ReasoningPart,
  FilePart,
  ToolPart,
  StepStartPart,
  StepFinishPart,
  SnapshotPart,
  PatchPart,
  AgentPart,
  RetryPart,
  CompactionPart,
  // Tool state
  ToolState,
  ToolStatePending,
  ToolStateRunning,
  ToolStateCompleted,
  ToolStateError,
  // File
  FileDiff,
  FileNode,
  // Session
  SessionStatus,
  Permission,
  Todo,
  // PTY
  Pty,
  // MCP
  McpStatus,
  McpLocalConfig,
  McpRemoteConfig,
  // Errors
  ProviderAuthError,
  UnknownError,
  MessageOutputLengthError,
  MessageAbortedError,
  ApiError,
  // Events
  EventMessageUpdated,
  EventMessageRemoved,
  EventMessagePartUpdated,
  EventMessagePartRemoved,
  EventSessionCreated,
  EventSessionUpdated,
  EventSessionDeleted,
  EventSessionStatus,
  EventSessionIdle,
  EventSessionDiff,
  EventSessionError,
  EventFileEdited,
  EventFileWatcherUpdated,
  EventTodoUpdated,
  EventPermissionUpdated,
  EventPermissionReplied,
} from "@opencode-ai/sdk/client"

// ─── 래퍼 전용 타입 ───────────────────────────────────────────────

export interface PromptOptions {
  model?: { providerID: string; modelID: string }
  agent?: string
  noReply?: boolean
  system?: string
  tools?: Record<string, boolean>
}

export interface RunOptions extends PromptOptions {
  title?: string
  deleteAfter?: boolean
}

export interface PromptResult {
  info: import("@opencode-ai/sdk/client").AssistantMessage
  parts: import("@opencode-ai/sdk/client").Part[]
}

export interface MessageWithParts {
  info: import("@opencode-ai/sdk/client").Message
  parts: import("@opencode-ai/sdk/client").Part[]
}

// ─── 응답 언래핑 헬퍼 ─────────────────────────────────────────────

async function unwrap<T>(
  request: Promise<{ data?: T; error?: unknown }>
): Promise<T> {
  const result = await request
  if (result.error) {
    const err = result.error as Record<string, unknown>
    throw new Error(
      typeof err.message === "string"
        ? err.message
        : JSON.stringify(result.error)
    )
  }
  return result.data as T
}

// ─── 메인 클래스 ──────────────────────────────────────────────────

const DEFAULT_BASE_URL = "http://127.0.0.1:4996"

export class OpenCodeServer {
  private static instance: OpenCodeServer | null = null
  private client: OpencodeClient
  readonly baseUrl: string

  private constructor(baseUrl: string) {
    this.baseUrl = baseUrl
    this.client = createOpencodeClient({ baseUrl })
  }

  static getInstance(baseUrl: string = DEFAULT_BASE_URL): OpenCodeServer {
    if (!OpenCodeServer.instance) {
      OpenCodeServer.instance = new OpenCodeServer(baseUrl)
    }
    return OpenCodeServer.instance
  }

  static resetInstance(): void {
    OpenCodeServer.instance = null
  }

  /** 내부 SDK 클라이언트 직접 접근 (escape hatch) */
  get raw(): OpencodeClient {
    return this.client
  }

  // ─── Health / Global ────────────────────────────────────────────

  async health(): Promise<{ healthy: boolean; version: string }> {
    const res = await fetch(`${this.baseUrl}/global/health`)
    if (!res.ok) throw new Error(`Health check failed: ${res.status}`)
    return res.json()
  }

  async dispose() {
    return unwrap(this.client.instance.dispose())
  }

  // ─── Session 관리 ─────────────────────────────────────────────

  async listSessions(options?: { directory?: string }) {
    return unwrap(this.client.session.list({ query: options }))
  }

  async createSession(title?: string, options?: { parentID?: string; directory?: string }) {
    return unwrap(this.client.session.create({
      body: { title, ...(options?.parentID && { parentID: options.parentID }) },
      ...(options?.directory && { query: { directory: options.directory } }),
    }))
  }

  async getSession(id: string) {
    return unwrap(this.client.session.get({ path: { id } }))
  }

  async deleteSession(id: string) {
    return unwrap(this.client.session.delete({ path: { id } }))
  }

  async abortSession(id: string) {
    return unwrap(this.client.session.abort({ path: { id } }))
  }

  /** 전체 세션 상태 (path 없음 — session ID별 상태 맵 반환) */
  async getSessionStatuses() {
    return unwrap(this.client.session.status())
  }

  // ─── 메시지 / 프롬프트 ───────────────────────────────────────

  async prompt(
    sessionId: string,
    text: string,
    options: PromptOptions = {}
  ): Promise<PromptResult> {
    return unwrap(
      this.client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [{ type: "text", text }],
          ...(options.model && { model: options.model }),
          ...(options.agent && { agent: options.agent }),
          ...(options.noReply && { noReply: options.noReply }),
          ...(options.system && { system: options.system }),
          ...(options.tools && { tools: options.tools }),
        },
      })
    ) as Promise<PromptResult>
  }

  async promptAsync(
    sessionId: string,
    text: string,
    options: PromptOptions = {}
  ): Promise<void> {
    await unwrap(
      this.client.session.promptAsync({
        path: { id: sessionId },
        body: {
          parts: [{ type: "text", text }],
          ...(options.model && { model: options.model }),
          ...(options.agent && { agent: options.agent }),
          ...(options.noReply && { noReply: options.noReply }),
          ...(options.system && { system: options.system }),
          ...(options.tools && { tools: options.tools }),
        },
      })
    )
  }

  async getMessages(sessionId: string): Promise<MessageWithParts[]> {
    return unwrap(
      this.client.session.messages({ path: { id: sessionId } })
    ) as Promise<MessageWithParts[]>
  }

  async getMessage(sessionId: string, messageId: string) {
    return unwrap(
      this.client.session.message({ path: { id: sessionId, messageID: messageId } })
    )
  }

  // ─── Structured Output ───────────────────────────────────────

  async promptJSON<T = unknown>(
    sessionId: string,
    text: string,
    schema: object,
    options: PromptOptions & { retryCount?: number } = {}
  ): Promise<T> {
    const { retryCount = 2, ...promptOpts } = options
    // format은 서버에서 지원하지만 SDK 타입에 아직 미반영
    const body = {
      parts: [{ type: "text" as const, text }],
      format: {
        type: "json_schema" as const,
        schema: schema as Record<string, unknown>,
        retryCount,
      },
      ...(promptOpts.model && { model: promptOpts.model }),
      ...(promptOpts.agent && { agent: promptOpts.agent }),
      ...(promptOpts.system && { system: promptOpts.system }),
      ...(promptOpts.tools && { tools: promptOpts.tools }),
    }
    const result = (await unwrap(
      this.client.session.prompt({
        path: { id: sessionId },
        body: body as typeof body & Record<string, unknown>,
      })
    )) as PromptResult

    const textPart = result.parts.find((p) => p.type === "text")
    if (!textPart || textPart.type !== "text") {
      throw new Error("No text part in structured output response")
    }
    return JSON.parse(textPart.text) as T
  }

  // ─── 셸 / 커맨드 ─────────────────────────────────────────────

  async shell(sessionId: string, command: string, agent: string = "general") {
    return unwrap(
      this.client.session.shell({
        path: { id: sessionId },
        body: { command, agent },
      })
    )
  }

  async command(sessionId: string, command: string, args: string = "") {
    return unwrap(
      this.client.session.command({
        path: { id: sessionId },
        body: { command, arguments: args },
      })
    )
  }

  // ─── 세션 유틸 ────────────────────────────────────────────────

  async shareSession(id: string) {
    return unwrap(this.client.session.share({ path: { id } }))
  }

  async unshareSession(id: string) {
    return unwrap(this.client.session.unshare({ path: { id } }))
  }

  async summarizeSession(id: string) {
    return unwrap(this.client.session.summarize({ path: { id } }))
  }

  async revertSession(id: string, messageId: string) {
    return unwrap(
      this.client.session.revert({ path: { id }, body: { messageID: messageId } })
    )
  }

  async unrevertSession(id: string) {
    return unwrap(this.client.session.unrevert({ path: { id } }))
  }

  async getSessionDiff(id: string) {
    return unwrap(this.client.session.diff({ path: { id } }))
  }

  async getSessionChildren(id: string) {
    return unwrap(this.client.session.children({ path: { id } }))
  }

  async forkSession(id: string) {
    return unwrap(this.client.session.fork({ path: { id } }))
  }

  async updateSession(id: string, body: { title?: string }) {
    return unwrap(this.client.session.update({ path: { id }, body }))
  }

  async getSessionTodos(id: string) {
    return unwrap(this.client.session.todo({ path: { id } }))
  }

  async initSession(id: string) {
    return unwrap(this.client.session.init({ path: { id } }))
  }

  // ─── Permission ────────────────────────────────────────────────
  // SDK에 permission list/reply 네임스페이스 미노출 — fetch로 직접 호출

  async respondPermission(sessionId: string, permissionID: string, response: "once" | "always" | "reject") {
    return unwrap(
      this.client.postSessionIdPermissionsPermissionId({
        path: { id: sessionId, permissionID },
        body: { response },
      })
    )
  }

  async listPermissions(): Promise<unknown[]> {
    const res = await fetch(`${this.baseUrl}/permission`)
    if (!res.ok) throw new Error(`listPermissions failed: ${res.status}`)
    return res.json()
  }

  async replyPermission(
    requestId: string,
    reply: "once" | "always" | "reject",
    message?: string
  ): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/permission/${requestId}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reply, ...(message && { message }) }),
    })
    if (!res.ok) throw new Error(`replyPermission failed: ${res.status}`)
    return res.json()
  }

  // ─── Question ──────────────────────────────────────────────────
  // SDK에 question 네임스페이스 미노출 — fetch로 직접 호출

  async listQuestions(): Promise<unknown[]> {
    const res = await fetch(`${this.baseUrl}/question`)
    if (!res.ok) throw new Error(`listQuestions failed: ${res.status}`)
    return res.json()
  }

  async replyQuestion(requestId: string, answers: string[][]): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/question/${requestId}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    })
    if (!res.ok) throw new Error(`replyQuestion failed: ${res.status}`)
    return res.json()
  }

  async rejectQuestion(requestId: string): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/question/${requestId}/reject`, {
      method: "POST",
    })
    if (!res.ok) throw new Error(`rejectQuestion failed: ${res.status}`)
    return res.json()
  }

  // ─── 프로젝트 ────────────────────────────────────────────────

  async listProjects() {
    return unwrap(this.client.project.list())
  }

  async getCurrentProject() {
    return unwrap(this.client.project.current())
  }

  // ─── 파일 / 검색 ─────────────────────────────────────────────

  async searchText(pattern: string, options?: { directory?: string }) {
    return unwrap(this.client.find.text({ query: { pattern, ...options } }))
  }

  async searchFiles(query: string, options?: { directory?: string; dirs?: "true" | "false" }) {
    return unwrap(this.client.find.files({ query: { query, ...options } }))
  }

  async searchSymbols(query: string, options?: { directory?: string }) {
    return unwrap(this.client.find.symbols({ query: { query, ...options } }))
  }

  async readFile(path: string) {
    return unwrap(this.client.file.read({ query: { path } }))
  }

  async listFiles(path: string) {
    return unwrap(this.client.file.list({ query: { path } }))
  }

  async getFileStatus() {
    return unwrap(this.client.file.status())
  }

  // ─── 설정 ────────────────────────────────────────────────────

  async getConfig() {
    return unwrap(this.client.config.get())
  }

  async updateConfig(body: Record<string, unknown>) {
    return unwrap(this.client.config.update({ body }))
  }

  async getProviders() {
    return unwrap(this.client.config.providers())
  }

  // ─── Provider ─────────────────────────────────────────────────

  async listProviders() {
    return unwrap(this.client.provider.list())
  }

  async getProviderAuthMethods() {
    return unwrap(this.client.provider.auth())
  }

  async providerOAuthAuthorize(providerID: string, method: number) {
    return unwrap(this.client.provider.oauth.authorize({ path: { id: providerID }, body: { method } }))
  }

  async providerOAuthCallback(providerID: string, method: number, code?: string) {
    return unwrap(this.client.provider.oauth.callback({ path: { id: providerID }, body: { method, code } }))
  }

  // ─── Auth ──────────────────────────────────────────────────────

  async setAuth(providerID: string, auth?: Parameters<OpencodeClient["auth"]["set"]>[0]["body"]) {
    return unwrap(this.client.auth.set({ path: { id: providerID }, body: auth }))
  }

  // ─── 에이전트 / 도구 ─────────────────────────────────────────

  async listAgents() {
    return unwrap(this.client.app.agents())
  }

  async listToolIds() {
    return unwrap(this.client.tool.ids())
  }

  async listTools(provider: string, model: string) {
    return unwrap(
      this.client.tool.list({
        query: { provider, model },
      })
    )
  }

  // ─── PTY ────────────────────────────────────────────────────────

  async listPty() {
    return unwrap(this.client.pty.list())
  }

  async createPty(options?: { command?: string; args?: string[]; cwd?: string; title?: string; env?: Record<string, string> }) {
    return unwrap(this.client.pty.create({ body: options }))
  }

  async getPty(id: string) {
    return unwrap(this.client.pty.get({ path: { id } }))
  }

  async updatePty(id: string, body: Record<string, unknown>) {
    return unwrap(this.client.pty.update({ path: { id }, body }))
  }

  async removePty(id: string) {
    return unwrap(this.client.pty.remove({ path: { id } }))
  }

  // ─── MCP ────────────────────────────────────────────────────────

  async getMcpStatus() {
    return unwrap(this.client.mcp.status())
  }

  async addMcpServer(name: string, config: import("@opencode-ai/sdk/client").McpLocalConfig | import("@opencode-ai/sdk/client").McpRemoteConfig) {
    return unwrap(this.client.mcp.add({ body: { name, config } }))
  }

  async connectMcp(name: string) {
    return unwrap(this.client.mcp.connect({ path: { name } }))
  }

  async disconnectMcp(name: string) {
    return unwrap(this.client.mcp.disconnect({ path: { name } }))
  }

  async mcpAuthStart(name: string) {
    return unwrap(this.client.mcp.auth.start({ path: { name } }))
  }

  async mcpAuthRemove(name: string) {
    return unwrap(this.client.mcp.auth.remove({ path: { name } }))
  }

  async mcpAuthCallback(name: string, code: string) {
    return unwrap(this.client.mcp.auth.callback({ path: { name }, body: { code } }))
  }

  async mcpAuthAuthenticate(name: string) {
    return unwrap(this.client.mcp.auth.authenticate({ path: { name } }))
  }

  // ─── LSP / Formatter ───────────────────────────────────────────

  async getLspStatus() {
    return unwrap(this.client.lsp.status())
  }

  async getFormatterStatus() {
    return unwrap(this.client.formatter.status())
  }

  // ─── Commands ─────────────────────────────────────────────────

  async listCommands() {
    return unwrap(this.client.command.list())
  }

  // ─── VCS / Path ───────────────────────────────────────────────

  async getVcsInfo() {
    return unwrap(this.client.vcs.get())
  }

  async getPathInfo() {
    return unwrap(this.client.path.get())
  }

  // ─── 이벤트 (SSE) ────────────────────────────────────────────

  async subscribe() {
    return this.client.event.subscribe()
  }

  async subscribeGlobal() {
    return this.client.global.event()
  }

  // ─── 편의 메서드 ─────────────────────────────────────────────

  /**
   * 세션 생성 → 프롬프트 → (옵션) 세션 삭제를 한 호출로.
   * 일회성 실행에 사용.
   */
  async run(text: string, options: RunOptions = {}): Promise<PromptResult> {
    const { title, deleteAfter = false, ...promptOpts } = options
    const session = await this.createSession(title)
    try {
      return await this.prompt(session.id, text, promptOpts)
    } finally {
      if (deleteAfter) {
        await this.deleteSession(session.id).catch(() => {})
      }
    }
  }

  /**
   * 세션이 idle 상태가 될 때까지 폴링.
   * promptAsync 후 완료 대기에 사용.
   */
  async waitForIdle(
    sessionId: string,
    { interval = 1000, timeout = 300_000 } = {}
  ): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      const statuses = await this.getSessionStatuses()
      const status = (statuses as Record<string, { type: string }>)[sessionId]
      if (!status || status.type === "idle") return
      await new Promise((r) => setTimeout(r, interval))
    }
    throw new Error(`Session ${sessionId} did not become idle within ${timeout}ms`)
  }
}

export default OpenCodeServer
