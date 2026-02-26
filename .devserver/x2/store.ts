/**
 * X₂ Store — 자체 state.db (bun:sqlite)
 *
 * opencode.db와 별도 파일. Task 대기열 및 메타데이터 관리.
 * opencode 정보는 wrapper API로만 접근 — 이 DB에는 자체 상태만 저장.
 */

import { Database } from "bun:sqlite";
import { randomUUIDv7 } from "bun";

const DEFAULT_DB_PATH = new URL("../data/state.db", import.meta.url).pathname;

export type TaskStatus = "pending" | "running" | "completed" | "failed";

export interface Task {
    id: string;
    prompt: string;
    status: TaskStatus;
    attempts: number;
    retryAt: number | null;
    sessionId: string | null;
    result: string | null;
    error: string | null;
    source: string;
    startedAt: number | null;
    completedAt: number | null;
    createdAt: number;
    updatedAt: number;
}

export interface TaskStats {
    pending: number;
    running: number;
    completed: number;
    failed: number;
}

export class Store {
    private db: Database;

    constructor(dbPath: string = DEFAULT_DB_PATH) {
        this.db = new Database(dbPath, { create: true });
        this.db.exec("PRAGMA journal_mode = WAL");
        this.db.exec("PRAGMA foreign_keys = ON");
        this.migrate();
    }

    private migrate() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        prompt TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        retry_at INTEGER,
        session_id TEXT,
        result TEXT,
        error TEXT,
        source TEXT NOT NULL DEFAULT 'cli',
        started_at INTEGER,
        completed_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
        this.ensureColumn("attempts", "INTEGER NOT NULL DEFAULT 0");
        this.ensureColumn("retry_at", "INTEGER");
        this.ensureColumn("started_at", "INTEGER");
        this.ensureColumn("completed_at", "INTEGER");
        // 기존 데이터 호환: v1 상태값 done -> completed
        this.db.exec(
            `UPDATE tasks SET status = 'completed' WHERE status = 'done'`,
        );
        this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)
    `);
        this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at)
    `);
    }

    private ensureColumn(column: string, definition: string) {
        const cols = this.db.prepare("PRAGMA table_info(tasks)").all() as {
            name: string;
        }[];
        const hasColumn = cols.some((c) => c.name === column);
        if (!hasColumn) {
            this.db.exec(
                `ALTER TABLE tasks ADD COLUMN ${column} ${definition}`,
            );
        }
    }

    createTask(prompt: string, source: string = "cli"): Task {
        const now = Date.now();
        const id = randomUUIDv7();
        this.db
            .prepare(
                `INSERT INTO tasks (id, prompt, status, attempts, source, created_at, updated_at)
         VALUES (?, ?, 'pending', 0, ?, ?, ?)`,
            )
            .run(id, prompt, source, now, now);
        return this.getTask(id)!;
    }

    getTask(id: string): Task | null {
        const row = this.db
            .prepare("SELECT * FROM tasks WHERE id = ?")
            .get(id) as Record<string, unknown> | null;
        return row ? this.rowToTask(row) : null;
    }

    listTasks(filter?: { status?: TaskStatus; limit?: number }): Task[] {
        let sql = "SELECT * FROM tasks";
        const params: unknown[] = [];

        if (filter?.status) {
            sql += " WHERE status = ?";
            params.push(filter.status);
        }

        sql += " ORDER BY created_at ASC";

        if (filter?.limit) {
            sql += " LIMIT ?";
            params.push(filter.limit);
        }

        const rows = this.db.prepare(sql).all(...params) as Record<
            string,
            unknown
        >[];
        return rows.map((r) => this.rowToTask(r));
    }

    updateTask(
        id: string,
        updates: Partial<
            Pick<
                Task,
                | "status"
                | "attempts"
                | "retryAt"
                | "sessionId"
                | "result"
                | "error"
                | "startedAt"
                | "completedAt"
            >
        >,
    ): Task {
        const sets: string[] = [];
        const params: unknown[] = [];

        if (updates.status !== undefined) {
            sets.push("status = ?");
            params.push(updates.status);
        }
        if (updates.attempts !== undefined) {
            sets.push("attempts = ?");
            params.push(updates.attempts);
        }
        if (updates.retryAt !== undefined) {
            sets.push("retry_at = ?");
            params.push(updates.retryAt);
        }
        if (updates.sessionId !== undefined) {
            sets.push("session_id = ?");
            params.push(updates.sessionId);
        }
        if (updates.result !== undefined) {
            sets.push("result = ?");
            params.push(updates.result);
        }
        if (updates.error !== undefined) {
            sets.push("error = ?");
            params.push(updates.error);
        }
        if (updates.startedAt !== undefined) {
            sets.push("started_at = ?");
            params.push(updates.startedAt);
        }
        if (updates.completedAt !== undefined) {
            sets.push("completed_at = ?");
            params.push(updates.completedAt);
        }

        sets.push("updated_at = ?");
        params.push(Date.now());
        params.push(id);

        this.db
            .prepare(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`)
            .run(...params);

        return this.getTask(id)!;
    }

    getNextPending(): Task | null {
        const row = this.db
            .prepare(
                "SELECT * FROM tasks WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1",
            )
            .get() as Record<string, unknown> | null;
        return row ? this.rowToTask(row) : null;
    }

    claimNextPending(nowMs: number = Date.now()): Task | null {
        const now = nowMs;
        return this.db.transaction(() => {
            const next = this.db
                .prepare(
                    `SELECT id
                     FROM tasks
                     WHERE status = 'pending'
                       AND (retry_at IS NULL OR retry_at <= ?)
                     ORDER BY
                       CASE WHEN retry_at IS NULL THEN 0 ELSE 1 END ASC,
                       retry_at ASC,
                       created_at ASC
                     LIMIT 1`,
                )
                .get(now) as { id: string } | null;
            if (!next) return null;

            const result = this.db
                .prepare(
                    `UPDATE tasks
           SET status = 'running',
               retry_at = NULL,
               started_at = COALESCE(started_at, ?),
               updated_at = ?
           WHERE id = ? AND status = 'pending'`,
                )
                .run(now, now, next.id);

            if (result.changes === 0) return null;
            return this.getTask(next.id);
        })();
    }

    hasRunning(): boolean {
        const row = this.db
            .prepare(
                "SELECT COUNT(*) as count FROM tasks WHERE status = 'running'",
            )
            .get() as { count: number };
        return row.count > 0;
    }

    recoverRunningTasks(
        targetStatus: "pending" | "failed" = "failed",
        reason: string = "Recovered after worker restart",
    ): number {
        const running = this.listTasks({ status: "running" });
        const now = Date.now();

        for (const task of running) {
            const previousError = task.error ? `${task.error}\n` : "";
            this.updateTask(task.id, {
                status: targetStatus,
                error: `${previousError}[recovery] ${reason}`,
                retryAt: null,
                completedAt: targetStatus === "failed" ? now : null,
            });
        }

        return running.length;
    }

    getStats(): TaskStats {
        const rows = this.db
            .prepare(
                "SELECT status, COUNT(*) as count FROM tasks GROUP BY status",
            )
            .all() as { status: string; count: number }[];

        const stats: TaskStats = {
            pending: 0,
            running: 0,
            completed: 0,
            failed: 0,
        };
        for (const row of rows) {
            if (row.status === "done") {
                stats.completed += row.count;
                continue;
            }
            if (row.status in stats) {
                stats[row.status as keyof TaskStats] = row.count;
            }
        }
        return stats;
    }

    close() {
        this.db.close();
    }

    private rowToTask(row: Record<string, unknown>): Task {
        const rawStatus = row.status as string;
        const normalizedStatus = rawStatus === "done" ? "completed" : rawStatus;
        return {
            id: row.id as string,
            prompt: row.prompt as string,
            status: normalizedStatus as TaskStatus,
            attempts: Number(row.attempts ?? 0),
            retryAt: (row.retry_at as number) ?? null,
            sessionId: (row.session_id as string) ?? null,
            result: (row.result as string) ?? null,
            error: (row.error as string) ?? null,
            source: row.source as string,
            startedAt: (row.started_at as number) ?? null,
            completedAt: (row.completed_at as number) ?? null,
            createdAt: row.created_at as number,
            updatedAt: row.updated_at as number,
        };
    }
}
