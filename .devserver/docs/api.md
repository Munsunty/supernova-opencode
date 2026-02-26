# OpenCode HTTP API

> 공식 문서: https://opencode.ai/docs/server / https://opencode.ai/docs/sdk
> OpenAPI 스펙: `GET /doc` (OpenAPI 3.1, version 0.0.3)
> **총 83 엔드포인트, 151 스키마**

## 개요

`opencode serve`는 HTTP 웹 서버를 기동한다. 웹 UI, REST API, OpenAPI 스펙을 동시에 제공한다.

- **웹 UI**: 브라우저에서 `http://<hostname>:<port>` 접속
- **REST API**: SDK 또는 curl로 JSON 엔드포인트 호출
- **OpenAPI 스펙**: `GET /doc` 에서 OpenAPI 3.1 스펙 확인 가능

```bash
# 기본 기동 (포트 4096)
opencode serve

# 옵션 지정
opencode serve --port 4996 --hostname 127.0.0.1

# CORS 허용 (여러 origin 가능)
opencode serve --cors http://localhost:5173 --cors https://app.example.com

# mDNS 서비스 디스커버리
opencode serve --mdns
```

| 옵션 | 기본값 | 설명 |
|------|--------|------|
| `--port` | `4096` | 서버 포트 |
| `--hostname` | `127.0.0.1` | 바인드 호스트 |
| `--cors` | - | CORS 허용 origin (반복 가능) |
| `--mdns` | `false` | mDNS 디스커버리 활성화 |
| `--mdns-domain` | - | 커스텀 mDNS 도메인 |

> **이 프로젝트**: `dev-up.sh`에서 `--port 4996`으로 기동 (기본 4096과 다름)

## 인증

환경변수로 HTTP Basic Auth 설정:

| 환경변수 | 기본값 | 설명 |
|----------|--------|------|
| `OPENCODE_SERVER_PASSWORD` | - | 서버 접근 비밀번호 (설정 시 인증 활성화) |
| `OPENCODE_SERVER_USERNAME` | `opencode` | 인증 사용자명 |

```bash
OPENCODE_SERVER_PASSWORD=my-secret opencode serve
```

## SDK

### 설치

```bash
npm install @opencode-ai/sdk
# 또는
bun add @opencode-ai/sdk
```

### 서버 + 클라이언트 동시 초기화

```typescript
import { createOpencode } from "@opencode-ai/sdk"

const { client } = await createOpencode({
  hostname: "127.0.0.1",
  port: 4096,
  timeout: 5000,
  signal: abortController.signal,
  config: { model: "anthropic/claude-sonnet-4-20250514" }
})
```

### 기존 서버에 연결 (클라이언트만)

```typescript
import { createOpencodeClient } from "@opencode-ai/sdk"

const client = createOpencodeClient({
  baseUrl: "http://localhost:4996"
})
```

---

## API 엔드포인트

### Global (5)

| 메서드 | 엔드포인트 | operationId | 설명 |
|--------|-----------|-------------|------|
| GET | `/global/health` | `global.health` | 서버 상태 → `{healthy, version}` |
| GET | `/global/event` | `global.event` | SSE 글로벌 이벤트 스트림 |
| GET | `/global/config` | `global.config.get` | 글로벌 설정 조회 → Config |
| PATCH | `/global/config` | `global.config.update` | 글로벌 설정 변경 ← Config |
| POST | `/global/dispose` | `global.dispose` | 글로벌 인스턴스 종료 |

### Auth (2)

| 메서드 | 엔드포인트 | operationId | 설명 |
|--------|-----------|-------------|------|
| PUT | `/auth/{providerID}` | `auth.set` | 프로바이더 인증 설정 |
| DELETE | `/auth/{providerID}` | `auth.remove` | 프로바이더 인증 제거 |

### Session (25)

| 메서드 | 엔드포인트 | operationId | 설명 |
|--------|-----------|-------------|------|
| GET | `/session` | `session.list` | 세션 목록 |
| POST | `/session` | `session.create` | 새 세션 생성 |
| GET | `/session/status` | `session.status` | 전체 세션 상태 |
| GET | `/session/{sessionID}` | `session.get` | 특정 세션 조회 |
| DELETE | `/session/{sessionID}` | `session.delete` | 세션 삭제 |
| PATCH | `/session/{sessionID}` | `session.update` | 세션 업데이트 |
| GET | `/session/{sessionID}/children` | `session.children` | 자식 세션 목록 |
| GET | `/session/{sessionID}/todo` | `session.todo` | 세션 TODO 목록 |
| POST | `/session/{sessionID}/init` | `session.init` | 세션 초기화 (AGENTS.md 생성) |
| POST | `/session/{sessionID}/fork` | `session.fork` | 세션 포크 |
| POST | `/session/{sessionID}/abort` | `session.abort` | 실행 중인 세션 중단 |
| POST | `/session/{sessionID}/share` | `session.share` | 세션 공유 |
| DELETE | `/session/{sessionID}/share` | `session.unshare` | 세션 공유 해제 |
| GET | `/session/{sessionID}/diff` | `session.diff` | 세션 파일 diff |
| POST | `/session/{sessionID}/summarize` | `session.summarize` | 세션 요약 |
| GET | `/session/{sessionID}/message` | `session.messages` | 메시지 목록 |
| POST | `/session/{sessionID}/message` | `session.prompt` | 메시지 전송 (동기) |
| GET | `/session/{sessionID}/message/{messageID}` | `session.message` | 특정 메시지 조회 |
| DELETE | `/session/{sessionID}/message/{messageID}/part/{partID}` | `part.delete` | 메시지 part 삭제 |
| PATCH | `/session/{sessionID}/message/{messageID}/part/{partID}` | `part.update` | 메시지 part 수정 |
| POST | `/session/{sessionID}/prompt_async` | `session.prompt_async` | 메시지 전송 (비동기) |
| POST | `/session/{sessionID}/command` | `session.command` | 슬래시 커맨드 실행 |
| POST | `/session/{sessionID}/shell` | `session.shell` | 셸 명령 실행 |
| POST | `/session/{sessionID}/revert` | `session.revert` | 메시지 되돌리기 |
| POST | `/session/{sessionID}/unrevert` | `session.unrevert` | 되돌리기 취소 |

**session.list query params**: `directory`, `roots` (bool), `start` (timestamp), `search`, `limit`
**session.create**: query `directory`, body `{parentID?, title, permission?}`

### Permission (3)

| 메서드 | 엔드포인트 | operationId | 설명 |
|--------|-----------|-------------|------|
| GET | `/permission` | `permission.list` | 대기 중 권한 요청 목록 |
| POST | `/session/{sessionID}/permissions/{permissionID}` | `permission.respond` | 권한 요청 응답 |
| POST | `/permission/{requestID}/reply` | `permission.reply` | 권한 요청 회신 |

### Question (3)

| 메서드 | 엔드포인트 | operationId | 설명 |
|--------|-----------|-------------|------|
| GET | `/question` | `question.list` | 대기 중 질문 목록 |
| POST | `/question/{requestID}/reply` | `question.reply` | 질문 응답 |
| POST | `/question/{requestID}/reject` | `question.reject` | 질문 거부 |

### Config (3)

| 메서드 | 엔드포인트 | operationId | 설명 |
|--------|-----------|-------------|------|
| GET | `/config` | `config.get` | 현재 설정 조회 |
| PATCH | `/config` | `config.update` | 설정 변경 |
| GET | `/config/providers` | `config.providers` | 프로바이더 + 기본 모델 목록 |

### Provider (4)

| 메서드 | 엔드포인트 | operationId | 설명 |
|--------|-----------|-------------|------|
| GET | `/provider` | `provider.list` | 프로바이더 목록 |
| GET | `/provider/auth` | `provider.auth` | 프로바이더 인증 방식 목록 |
| POST | `/provider/{providerID}/oauth/authorize` | `provider.oauth.authorize` | OAuth 인증 시작 |
| POST | `/provider/{providerID}/oauth/callback` | `provider.oauth.callback` | OAuth 콜백 |

### Project (3)

| 메서드 | 엔드포인트 | operationId | 설명 |
|--------|-----------|-------------|------|
| GET | `/project` | `project.list` | 프로젝트 목록 |
| GET | `/project/current` | `project.current` | 현재 활성 프로젝트 |
| PATCH | `/project/{projectID}` | `project.update` | 프로젝트 업데이트 |

### File / Find (6)

| 메서드 | 엔드포인트 | operationId | Query Params | 설명 |
|--------|-----------|-------------|--------------|------|
| GET | `/find` | `find.text` | `query`, `directory`, `limit` | 텍스트 검색 |
| GET | `/find/file` | `find.files` | `name`, `directory`, `limit` | 파일 검색 |
| GET | `/find/symbol` | `find.symbols` | `name`, `directory` | 심볼 검색 |
| GET | `/file` | `file.list` | - | 파일 목록 |
| GET | `/file/content` | `file.read` | `path` | 파일 내용 |
| GET | `/file/status` | `file.status` | `path` | 파일 변경 상태 |

### MCP (8)

| 메서드 | 엔드포인트 | operationId | 설명 |
|--------|-----------|-------------|------|
| GET | `/mcp` | `mcp.status` | MCP 서버 상태 |
| POST | `/mcp` | `mcp.add` | MCP 서버 추가 |
| POST | `/mcp/{name}/connect` | `mcp.connect` | MCP 서버 연결 |
| POST | `/mcp/{name}/disconnect` | `mcp.disconnect` | MCP 서버 해제 |
| POST | `/mcp/{name}/auth` | `mcp.auth.start` | MCP OAuth 시작 |
| DELETE | `/mcp/{name}/auth` | `mcp.auth.remove` | MCP OAuth 제거 |
| POST | `/mcp/{name}/auth/callback` | `mcp.auth.callback` | MCP OAuth 콜백 |
| POST | `/mcp/{name}/auth/authenticate` | `mcp.auth.authenticate` | MCP OAuth 인증 |

### PTY (6)

| 메서드 | 엔드포인트 | operationId | 설명 |
|--------|-----------|-------------|------|
| GET | `/pty` | `pty.list` | PTY 세션 목록 |
| POST | `/pty` | `pty.create` | PTY 세션 생성 |
| GET | `/pty/{ptyID}` | `pty.get` | PTY 세션 조회 |
| PUT | `/pty/{ptyID}` | `pty.update` | PTY 세션 업데이트 |
| DELETE | `/pty/{ptyID}` | `pty.remove` | PTY 세션 제거 |
| GET | `/pty/{ptyID}/connect` | `pty.connect` | PTY WebSocket 연결 |

### Worktree — Experimental (4)

| 메서드 | 엔드포인트 | operationId | 설명 |
|--------|-----------|-------------|------|
| GET | `/experimental/worktree` | `worktree.list` | 워크트리 목록 |
| POST | `/experimental/worktree` | `worktree.create` | 워크트리 생성 |
| DELETE | `/experimental/worktree` | `worktree.remove` | 워크트리 제거 |
| POST | `/experimental/worktree/reset` | `worktree.reset` | 워크트리 리셋 |

### Tool — Experimental (2)

| 메서드 | 엔드포인트 | operationId | 설명 |
|--------|-----------|-------------|------|
| GET | `/experimental/tool/ids` | `tool.ids` | 도구 ID 목록 |
| GET | `/experimental/tool` | `tool.list` | 도구 목록 (query: `sessionID`, `providerID`, `modelID`) |

### TUI (12)

| 메서드 | 엔드포인트 | operationId | 설명 |
|--------|-----------|-------------|------|
| POST | `/tui/append-prompt` | `tui.appendPrompt` | 프롬프트에 텍스트 추가 |
| POST | `/tui/clear-prompt` | `tui.clearPrompt` | 프롬프트 초기화 |
| POST | `/tui/submit-prompt` | `tui.submitPrompt` | 프롬프트 제출 |
| POST | `/tui/execute-command` | `tui.executeCommand` | 커맨드 실행 |
| POST | `/tui/open-help` | `tui.openHelp` | 도움말 열기 |
| POST | `/tui/open-sessions` | `tui.openSessions` | 세션 목록 열기 |
| POST | `/tui/open-themes` | `tui.openThemes` | 테마 선택 열기 |
| POST | `/tui/open-models` | `tui.openModels` | 모델 선택 열기 |
| POST | `/tui/show-toast` | `tui.showToast` | 알림 표시 |
| POST | `/tui/publish` | `tui.publish` | TUI 이벤트 발행 |
| POST | `/tui/select-session` | `tui.selectSession` | 세션 선택 |
| GET | `/tui/control/next` | `tui.control.next` | 다음 TUI 요청 |
| POST | `/tui/control/response` | `tui.control.response` | TUI 응답 제출 |

### Misc (9)

| 메서드 | 엔드포인트 | operationId | 설명 |
|--------|-----------|-------------|------|
| GET | `/path` | `path.get` | 경로 정보 |
| GET | `/vcs` | `vcs.get` | VCS 정보 |
| GET | `/command` | `command.list` | 커맨드 목록 |
| GET | `/agent` | `app.agents` | 에이전트 목록 |
| GET | `/skill` | `app.skills` | 스킬 목록 |
| GET | `/lsp` | `lsp.status` | LSP 상태 |
| GET | `/formatter` | `formatter.status` | Formatter 상태 |
| GET | `/event` | `event.subscribe` | SSE 이벤트 스트림 |
| POST | `/log` | `app.log` | 로그 기록 |
| POST | `/instance/dispose` | `instance.dispose` | 인스턴스 종료 |

### Experimental — 기타 (2)

| 메서드 | 엔드포인트 | operationId | 설명 |
|--------|-----------|-------------|------|
| GET | `/experimental/session` | `experimental.session.list` | 실험적 세션 목록 |
| GET | `/experimental/resource` | `experimental.resource.list` | MCP 리소스 목록 |

---

## 핵심 스키마

### Message

```typescript
type Message = UserMessage | AssistantMessage  // role로 구분

interface AssistantMessage {
  id: string
  sessionID: string
  role: "assistant"
  time: { created: number; completed?: number }
  error?: ErrorUnion
  parentID: string
  modelID: string
  providerID: string
  mode: string
  agent: string
  path: { cwd: string; root: string }
  cost: number
  tokens: {
    total: number; input: number; output: number;
    reasoning: number; cache: { read: number; write: number }
  }
  summary?: boolean
  structured?: {}
  variant?: string
  finish?: string
}
```

### Part (12 variants)

```
Part = TextPart | FilePart | ToolPart | SubtaskPart | ReasoningPart |
       StepStartPart | StepFinishPart | SnapshotPart | PatchPart |
       AgentPart | RetryPart | CompactionPart
```

| type | 주요 필드 |
|------|----------|
| `text` | `text`, `synthetic?`, `ignored?`, `time` |
| `file` | `mime`, `filename`, `url`, `source?` |
| `tool` | `callID`, `tool`, `state: ToolState` |
| `subtask` | `prompt`, `description`, `agent`, `model?`, `command?` |
| `reasoning` | `text` |
| `step_start` / `step_finish` | - |
| `snapshot` / `patch` | - |
| `agent` | - |
| `retry` / `compaction` | - |

### Session

```typescript
interface Session {
  id: string           // "^ses.*"
  slug: string
  projectID: string
  directory: string
  parentID?: string
  title: string
  version: string
  time: { created: number; updated: number; compacting?: number; archived?: number }
  summary: { additions: number; deletions: number; files: number; diffs: FileDiff[] }
  share?: { url: string }
  permission?: PermissionRuleset
  revert?: { messageID: string; partID?: string }
}
```

### ToolState

```
ToolState = ToolStatePending | ToolStateRunning | ToolStateCompleted | ToolStateError
```

| status | 추가 필드 |
|--------|----------|
| `pending` | `input` |
| `running` | `input`, `output?`, `title?`, `metadata?`, `time.start` |
| `completed` | `input`, `output`, `title?`, `metadata?`, `time: {start, end}` |
| `error` | `input`, `error`, `time: {start, end}` |

### Error Types

```
ErrorUnion = APIError | BadRequestError | NotFoundError | ContextOverflowError |
             MessageAbortedError | MessageOutputLengthError | StructuredOutputError |
             ProviderAuthError | UnknownError
```
모두 `{name: string, data: {message, statusCode, isRetryable, ...}}` 형태.

### SSE 이벤트 (50+)

주요 이벤트:
- `Event.session.{created,updated,deleted,idle,status,error,diff,compacted}`
- `Event.message.{updated,removed,part.updated,part.removed,part.delta}`
- `Event.permission.{asked,replied}`
- `Event.question.{asked,replied,rejected}`
- `Event.file.{edited,watcher.updated}`
- `Event.todo.updated`
- `Event.pty.{created,updated,deleted,exited}`
- `Event.mcp.{tools.changed,browser.open.failed}`
- `Event.worktree.{ready,failed}`
- `Event.vcs.branch.updated`
- `Event.installation.{update-available,updated}`
- `Event.server.{connected,instance.disposed}`
- `Event.global.disposed`

---

## Structured Output

```typescript
const result = await client.session.prompt({
  path: { id: sessionId },
  body: {
    parts: [{ type: "text", text: "프로젝트 의존성을 분석해줘" }],
    format: {
      type: "json_schema",
      schema: { type: "object", properties: { ... } },
      retryCount: 2
    }
  }
})
```

---

*Source: OpenCode `/doc` 엔드포인트 (OpenAPI 3.1, v0.0.3)*
*Updated: 2026-02-25*
