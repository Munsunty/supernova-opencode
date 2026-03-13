import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "../../src/x2/store";
import { collectXocX4Metrics } from "../script/xoc-x4-monitor";

const tempDirs: string[] = [];

function createStoreWithPath(): { store: Store; dbPath: string } {
    const dir = mkdtempSync(join(tmpdir(), "homsa-monitor-"));
    tempDirs.push(dir);
    const dbPath = join(dir, "state.db");
    return {
        store: new Store(dbPath),
        dbPath,
    };
}

afterEach(() => {
    while (tempDirs.length > 0) {
        const dir = tempDirs.pop();
        if (!dir) continue;
        rmSync(dir, { recursive: true, force: true });
    }
});

describe("script/xoc-x4-monitor", () => {
    test("collects xoc task metrics for x4 usage", () => {
        const { store, dbPath } = createStoreWithPath();

        const completed = store.createTask(
            "do something",
            "cli",
            "omo_request",
        );
        store.updateTask(completed.id, {
            status: "completed",
            startedAt: 1_000,
            completedAt: 2_500,
            result: "Done work\n\nCost: $0.0123\nTokens: 10in / 20out\nTODO: next",
        });
        store.appendMetricEvent({
            eventType: "task_terminal",
            taskId: completed.id,
            taskType: "omo_request",
            status: "completed",
            durationMs: 1500,
        });

        const failed = store.createTask("will fail", "cli", "omo_request");
        store.updateTask(failed.id, {
            status: "failed",
            startedAt: 2_000,
            completedAt: 6_000,
            error: "network timeout",
        });
        store.appendMetricEvent({
            eventType: "task_terminal",
            taskId: failed.id,
            taskType: "omo_request",
            status: "failed",
            durationMs: 4000,
            errorClass: "timeout",
        });

        store.createTask("ignore me", "cli", "classify");
        store.close();

        const report = collectXocX4Metrics({
            dbPath,
            opencodeLogPath: join(
                tempDirs[tempDirs.length - 1]!,
                "missing.log",
            ),
        });

        expect(report.schemaVersion).toBe("xoc_x4_metrics.v1");
        expect(report.totalTasks).toBe(2);
        expect(report.statusCounts.completed).toBe(1);
        expect(report.statusCounts.failed).toBe(1);
        expect(report.recommendedActionCounts.new_task).toBe(1);
        expect(report.recommendedActionCounts.report).toBe(1);
        expect(report.cost.totalUsd).toBe(0.0123);
        expect(report.tokens.totalIn).toBe(10);
        expect(report.tokens.totalOut).toBe(20);
        expect(report.latencyMs.p50).toBe(1500);
        expect(report.latencyMs.p90).toBe(4000);
        expect(report.logSummary.loaded).toBe(false);

        const failedRow = report.rows.find((row) => row.taskId === failed.id);
        expect(failedRow?.errorClass).toBe("timeout");
    });

    test("enriches rows with opencode log session signals", () => {
        const { store, dbPath } = createStoreWithPath();
        const completed = store.createTask("hello", "toy_bot", "omo_request");
        store.updateTask(completed.id, {
            status: "completed",
            sessionId: "ses_test123",
            startedAt: 1000,
            completedAt: 2000,
            result: "ok\n\nCost: $0.001\nTokens: 1in / 2out",
        });
        store.appendMetricEvent({
            eventType: "task_terminal",
            taskId: completed.id,
            taskType: "omo_request",
            status: "completed",
            durationMs: 1000,
        });
        store.close();

        const logPath = join(tempDirs[tempDirs.length - 1]!, "opencode.log");
        writeFileSync(
            logPath,
            [
                "INFO  2026-02-26T09:09:54 +0ms service=llm providerID=minimax modelID=x sessionID=ses_test123 stream",
                "INFO  2026-02-26T09:09:55 +0ms service=session.prompt step=1 sessionID=ses_test123 loop",
                "INFO  2026-02-26T09:09:56 +0ms service=session.prompt sessionID=ses_test123 exiting loop",
                "INFO  2026-02-26T09:09:57 +0ms service=server method=GET path=/session/status request",
                "",
            ].join("\n"),
            "utf8",
        );

        const report = collectXocX4Metrics({
            dbPath,
            opencodeLogPath: logPath,
            source: "toy_",
        });

        expect(report.logSummary.loaded).toBe(true);
        expect(report.logSummary.sessions).toBe(1);
        expect(report.logSummary.matchedRows).toBe(1);
        expect(report.opencodeLogPath).toBe(logPath);
        expect(report.totalTasks).toBe(1);

        const row = report.rows[0]!;
        expect(row.logMatched).toBe(true);
        expect(row.logProvider).toBe("minimax");
        expect(row.logPromptLoops).toBe(1);
        expect(row.logExitedLoop).toBe(true);
        expect(row.logStatusPolls).toBe(1);
    });
});
