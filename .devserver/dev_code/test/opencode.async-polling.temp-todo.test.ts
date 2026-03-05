import { describe, expect, test } from "bun:test";
import { OpenCodeServer } from "../../src/opencode-server-wrapper";

const BASE_URL = process.env.OPENCODE_BASE_URL ?? "http://127.0.0.1:4996";
const POLL_INTERVAL_MS = Number(process.env.OC_POLL_INTERVAL_MS ?? 1000);
const POLL_TIMEOUT_MS = Number(process.env.OC_POLL_TIMEOUT_MS ?? 180000);

const prompt = `
이제 무슨

temp_TODO.md 정리

목적
- Feature Phase(4/5)는 일시 중단하고 Podman 안정화를 최우선으로 수행한다.

운영 규칙
- 포맷: [우선순위][영역] 작업 내용
- 우선순위: P0(즉시), P1(이번 안정화 스프린트), P2(후순위)
- 상태: [ ] 또는 [x] 체크박스만 사용
- 장애 로그: Run Log 하단에 실행 이력 1줄 추가

작업 현황

Done (완료)
- [x] [P0][Decision] Feature phase를 중단하고 Podman 기반 안정화 우선으로 전환
- [x] [P0][Podman] dev-up.sh 사전 진단 추가 (podman info, machine inspect, socket 점검, fail-fast)
- [x] [P0][Startup] 컨테이너 기동 후 readiness gate 추가
- [x] [P0][Recovery] readiness 실패 시 자동 teardown 및 원인 요약 로그 출력
- [x] [P0][Ports] 포트 충돌 처리 개선 (기본 fail-fast, 선택적 force-kill)
- [x] [P0][Env] 필수/권장 env 검증 경고 구조화
- [x] [P0][Entrypoint] 하드코딩 축소 및 env 오버라이드 적용
- [x] [P0][Entrypoint] proxy inline 코드 분리 (src/scripts/dashboard-proxy.ts)
- [x] [P0][Config] workspace 경로 기반 runtime permission config 자동 생성 연결
- [x] [P0][Volumes] 프로젝트 스코프 volume naming 규칙 도입
- [x] [P1][Ops] bun run dev:doctor 추가 (사전 점검)
- [x] [P1][Ops] bun run dev:smoke 추가 (기동 → health 확인 → 정리)
- [x] [P1][Validation] 사용자 실행 기준 bun run dev:smoke PASS
- [x] [P1][Docs] .devserver/docs에 Podman 트러블슈팅 섹션 추가
- [x] [P1][Phase] docs/PHASE_STATUS.md에 blocked(infra) 반영
- [x] [P1][Doctor] dev:doctor 최신화 (.env 로드 + provider key optional 체크)
- [x] [P1][Tests] .devserver/dev_code/test 전체 통과 (77 pass)
- [x] [P2][Ops] dev-up/entrypoint 주요 env 변수 표 정리
- [x] [P1][Auth] 컨테이너 시작 시 auth seed 자동 동기화
- [x] [P1][Config] opencode runtime config seed 동기화
- [x] [P1][Workspace] podman run -w /workspace/project 기본 working dir 고정
- [x] [P1][Dashboard] dashboard project auto-add 연결
- [x] [P1][Mount] .devserver 경로 named volume 마스킹 + seed read-only 개별 마운트
- [x] [P1][Security] .devserver/.gitignore에 opencode/auth*.json 추가
- [x] [P1][Ops] .devserver 마스킹 + dashboard auto-add 회귀 확인
- [x] [P1][Phase] 인프라 차단 해제 판단 완료 및 문서 상태 동기화
- [x] [P0][Startup] 컨테이너 기동 신뢰성 개선 (readiness 안정화)
- [x] [P1][Docs] 문서/운영 체크리스트 최신화
- [x] [P1][Ops] 배포 전 smoke 경로 정렬
- [x] [P0][Status] close-ready 후보 조건 충족

Next
- [ ] [P2][Ops] readiness 이벤트를 metrics_events에 저장해 가시성 강화

Backlog
- [ ] [P2][Ops] smoke 테스트를 CI job으로 분리
- [ ] [P2][Ops] dev:doctor의 gvproxy 포트 점유 경고 정책 정리

In Progress
- 없음 (2026-03-02 기준 smoke PASS, close-ready)

Run Log
- 2026-02-28: temp_TODO 생성, P0/P1 작업 대부분 완료, 77 tests PASS
- 2026-03-01: auth/opencode seed sync, dashboard 개선, workspace 고정
- 2026-03-02: .devserver 마운트 정책 전환, 보안 보강, smoke PASS 후 close-ready

결론
Podman 안정화 스프린트 완료, P0/P1 핵심 작업 완료 상태이며 smoke 테스트 PASS로 close-ready 진입 가능.
`;

function extractAssistantText(
    messages: Array<{
        info: { role?: string };
        parts?: Array<{ type?: string; text?: string }>;
    }>,
): string {
    for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        if (message.info?.role !== "assistant") continue;
        const text = (message.parts ?? [])
            .filter(
                (part) => part.type === "text" && typeof part.text === "string",
            )
            .map((part) => part.text ?? "")
            .join("\n")
            .trim();
        if (text.length > 0) return text;
    }
    return "";
}

describe("OpenCode async/polling single-cycle", () => {
    test(
        "prompt_async -> poll status -> read assistant result",
        async () => {
            const server = OpenCodeServer.getInstance(BASE_URL);
            const prompt = "temp_TODO.md 내용 정리해줘";
            const session = await server.createSession(
                "async-polling-temp-todo",
            );

            try {
                await server.promptAsync(session.id, prompt);

                const startedAt = Date.now();
                while (true) {
                    const statuses =
                        (await server.getSessionStatuses()) as Record<
                            string,
                            { type?: string }
                        >;
                    const statusType = statuses[session.id]?.type ?? "idle";
                    if (statusType === "idle") break;

                    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
                        throw new Error(
                            `Polling timeout after ${POLL_TIMEOUT_MS}ms (session=${session.id})`,
                        );
                    }
                    await Bun.sleep(POLL_INTERVAL_MS);
                }

                const messages = (await server.getMessages(
                    session.id,
                )) as Array<{
                    info: { role?: string };
                    parts?: Array<{ type?: string; text?: string }>;
                }>;
                const assistantText = extractAssistantText(messages);
                const preview = assistantText;

                expect(messages.length).toBeGreaterThan(0);
                expect(assistantText.length).toBeGreaterThan(0);
                expect(assistantText).toContain("TODO");
                console.log(
                    "\n[assistant_response_preview]\n" + preview + "\n",
                );
            } finally {
                await server.deleteSession(session.id).catch(() => {});
            }
        },
        POLL_TIMEOUT_MS + 30_000,
    );
});
