import { describe, test, expect } from "bun:test";
import { OpenCodeServer } from "../../src/opencode-server-wrapper";

const server = OpenCodeServer.getInstance();

describe("OpenCode Server Wrapper", () => {
    // ─── Health / Global ──────────────────────────────────────────

    test("health", async () => {
        const health = await server.health();
        expect(health.healthy).toBe(true);
        expect(health.version).toBeString();
    });

    // ─── Session ──────────────────────────────────────────────────

    test("listSessions", async () => {
        const sessions = await server.listSessions();
        expect(Array.isArray(sessions)).toBe(true);
    });

    test("getSessionStatuses", async () => {
        const statuses = await server.getSessionStatuses();
        expect(statuses).toBeDefined();
    });

    // ─── Project ──────────────────────────────────────────────────

    test("getCurrentProject", async () => {
        const project = await server.getCurrentProject();
        expect(project).toBeDefined();
    });

    test("listProjects", async () => {
        const projects = await server.listProjects();
        expect(Array.isArray(projects)).toBe(true);
    });

    // ─── Config / Provider ────────────────────────────────────────

    test("getConfig", async () => {
        const config = await server.getConfig();
        expect(config).toBeDefined();
    });

    test("getProviders (config.providers)", async () => {
        const providers = await server.getProviders();
        expect(providers).toBeDefined();
    });

    test("listProviders (provider.list)", async () => {
        const providers = await server.listProviders();
        expect(providers).toBeDefined();
    });

    test("getProviderAuthMethods", async () => {
        const methods = await server.getProviderAuthMethods();
        expect(methods).toBeDefined();
    });

    // ─── Agent / Tool / Command ───────────────────────────────────

    test("listAgents", async () => {
        const agents = await server.listAgents();
        expect(agents.length).toBeGreaterThan(0);
    });

    test("listToolIds", async () => {
        const ids = await server.listToolIds();
        expect(ids).toBeDefined();
    });

    test("listCommands", async () => {
        const commands = await server.listCommands();
        expect(commands).toBeDefined();
    });

    // ─── File / Path / VCS ────────────────────────────────────────

    test("getPathInfo", async () => {
        const path = await server.getPathInfo();
        expect(path).toBeDefined();
    });

    test("getVcsInfo", async () => {
        const vcs = await server.getVcsInfo();
        expect(vcs).toBeDefined();
    });

    test("getFileStatus", async () => {
        const status = await server.getFileStatus();
        expect(status).toBeDefined();
    });

    // ─── File / Search ──────────────────────────────────────────────

    test("searchFiles", async () => {
        const result = await server.searchFiles("wrapper");
        expect(result).toBeDefined();
    });

    test("searchText", async () => {
        const result = await server.searchText("OpenCodeServer");
        expect(result).toBeDefined();
    });

    test("readFile", async () => {
        const result = await server.readFile(
            ".devserver/src/opencode-server-wrapper.ts",
        );
        expect(result).toBeDefined();
    });

    test("listFiles", async () => {
        const result = await server.listFiles(".");
        expect(result).toBeDefined();
    });

    // ─── MCP / LSP / Formatter ────────────────────────────────────

    test("getMcpStatus", async () => {
        const status = await server.getMcpStatus();
        expect(status).toBeDefined();
    });

    test("getLspStatus", async () => {
        const status = await server.getLspStatus();
        expect(status).toBeDefined();
    });

    test("getFormatterStatus", async () => {
        const status = await server.getFormatterStatus();
        expect(status).toBeDefined();
    });

    // ─── PTY ──────────────────────────────────────────────────────

    test("listPty", async () => {
        const ptys = await server.listPty();
        expect(Array.isArray(ptys)).toBe(true);
    });

    // ─── Permission / Question ────────────────────────────────────

    test("listPermissions", async () => {
        const permissions = await server.listPermissions();
        expect(Array.isArray(permissions)).toBe(true);
    });

    test("listQuestions", async () => {
        const questions = await server.listQuestions();
        expect(Array.isArray(questions)).toBe(true);
    });

    // ─── Dashboard ────────────────────────────────────────────────

    test("dashboard reachable", async () => {
        const res = await fetch("http://127.0.0.1:51234");
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain("<");
    });

    // ─── E2E: run() ───────────────────────────────────────────────

    test("run() — create session + prompt + delete", async () => {
        const result = await server.run("echo 'wrapper test ok'", {
            title: "bun-test",
            deleteAfter: true,
        });
        expect(result.info).toBeDefined();
        expect(result.parts.length).toBeGreaterThan(0);
    }, 60_000);

    // ─── Scenario: 세션 라이프사이클 ──────────────────────────────

    test("scenario: create → prompt → messages → diff → todos → delete", async () => {
        // 1. 세션 생성
        const session = await server.createSession("scenario-lifecycle");
        expect(session.id).toMatch(/^ses/);
        expect(session.title).toBe("scenario-lifecycle");

        // 2. 세션 조회
        const fetched = await server.getSession(session.id);
        expect(fetched.id).toBe(session.id);

        // 3. 프롬프트 전송 — 파일 생성 요청
        const result = await server.prompt(
            session.id,
            "Create a file called /tmp/scenario-test.txt with content 'hello scenario'",
        );
        expect(result.info.role).toBe("assistant");
        expect(result.info.cost).toBeGreaterThanOrEqual(0);
        expect(result.info.tokens.input).toBeGreaterThan(0);
        expect(result.info.tokens.output).toBeGreaterThan(0);
        expect(result.parts.length).toBeGreaterThan(0);

        // 4. 메시지 히스토리 조회
        const messages = await server.getMessages(session.id);
        expect(messages.length).toBeGreaterThanOrEqual(2); // user + assistant

        // 5. 세션 diff 조회
        const diff = await server.getSessionDiff(session.id);
        expect(diff).toBeDefined();

        // 6. 세션 TODO 조회
        const todos = await server.getSessionTodos(session.id);
        expect(Array.isArray(todos)).toBe(true);

        // 7. 세션 상태 맵에서 확인
        const statuses = await server.getSessionStatuses();
        expect(statuses).toBeDefined();

        // 8. 세션 삭제
        const deleted = await server.deleteSession(session.id);
        expect(deleted).toBe(true);

        // 9. 삭제 후 목록에서 사라졌는지 확인
        const sessions = await server.listSessions();
        const found = (sessions as { id: string }[]).find(
            (s) => s.id === session.id,
        );
        expect(found).toBeUndefined();
    }, 120_000);

    // ─── Scenario: promptAsync → waitForIdle ──────────────────────

    test("scenario: promptAsync → waitForIdle → getMessages", async () => {
        // 1. 세션 생성
        const session = await server.createSession("scenario-async");

        // 2. 비동기 프롬프트 전송
        await server.promptAsync(
            session.id,
            "What is 2+2? Reply with just the number.",
        );

        // 3. busy 전환 대기 후 idle까지 폴링
        await new Promise((r) => setTimeout(r, 1000));
        await server.waitForIdle(session.id);

        // 4. 메시지 검증
        const messages = await server.getMessages(session.id);
        expect(messages.length).toBeGreaterThanOrEqual(2);

        // 5. 정리
        await server.deleteSession(session.id);
    }, 120_000);
});
