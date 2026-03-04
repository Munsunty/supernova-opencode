/**
 * X₂ Store — 자체 state.db (bun:sqlite)
 *
 * opencode.db와 별도 파일. Task 대기열 및 메타데이터 관리.
 * opencode 정보는 wrapper API로만 접근 — 이 DB에는 자체 상태만 저장.
 */

import { Database } from "bun:sqlite";
import { randomUUIDv7 } from "bun";
import { isEq1TaskType, type Eq1TaskType } from "../eq1/task-types";

const DEFAULT_DB_PATH =
    process.env.X2_DB_PATH ??
    new URL("../../data/state.db", import.meta.url).pathname;

export type TaskStatus = "pending" | "running" | "completed" | "failed";
export type TaskType = "omo_request" | Eq1TaskType | "report";
export type InteractionType = "permission" | "question";
export type InteractionStatus = "pending" | "answered" | "rejected";
export type InboundEventStatus = "received" | "duplicate" | "invalid";
export type InboundEventChannel = "telegram" | "cli" | (string & {});

export interface Task {
    id: string;
    type: TaskType;
    prompt: string;
    status: TaskStatus;
    attempts: number;
    retryAt: number | null;
    sessionId: string | null;
    requestMessageId: string | null;
    assistantMessageId: string | null;
    rawResult: string | null;
    result: string | null;
    error: string | null;
    runAgent: string | null;
    runModel: string | null;
    summaryAgent: string | null;
    summaryModel: string | null;
    source: string;
    startedAt: number | null;
    completedAt: number | null;
    createdAt: number;
    updatedAt: number;
}

export interface Interaction {
    id: string;
    type: InteractionType;
    requestId: string;
    sessionId: string | null;
    payload: string;
    status: InteractionStatus;
    answer: string | null;
    createdAt: number;
    answeredAt: number | null;
    updatedAt: number;
}

export interface TaskStats {
    pending: number;
    running: number;
    completed: number;
    failed: number;
}

export interface InteractionStats {
    pending: number;
    answered: number;
    rejected: number;
}

export interface InboundEvent {
    id: string;
    channel: InboundEventChannel;
    eventId: string;
    source: string;
    status: InboundEventStatus;
    payload: string;
    createdAt: number;
}

export type MetricStatus =
    | "pending"
    | "running"
    | "completed"
    | "failed"
    | "answered"
    | "rejected"
    | "healthy"
    | "unhealthy"
    | (string & {});

export interface MetricEvent {
    id: string;
    eventType: string;
    taskId: string | null;
    interactionId: string | null;
    traceId: string | null;
    taskType: TaskType | null;
    status: MetricStatus | null;
    fromState: string | null;
    toState: string | null;
    reason: string | null;
    source: string | null;
    requestHash: string | null;
    parentId: string | null;
    durationMs: number | null;
    backlog: number | null;
    errorClass: string | null;
    payload: string | null;
    createdAt: number;
}

export class Store {
    private db: Database;

    constructor(dbPath: string = DEFAULT_DB_PATH) {
        this.initializeWithRetry(dbPath);
    }

    private initializeWithRetry(dbPath: string): void {
        const maxAttempts = 20;
        const baseDelayMs = 250;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const db = new Database(dbPath, { create: true });
            this.db = db;
            try {
                db.exec("PRAGMA busy_timeout = 5000");
                db.exec("PRAGMA journal_mode = WAL");
                db.exec("PRAGMA foreign_keys = ON");
                this.migrate();
                return;
            } catch (error) {
                try {
                    db.close();
                } catch {}

                if (attempt >= maxAttempts || !this.isLockedError(error)) {
                    throw error;
                }
                Bun.sleepSync(baseDelayMs * attempt);
            }
        }
    }

    private isLockedError(error: unknown): boolean {
        if (!(error instanceof Error)) return false;
        return /database (is )?(locked|busy)|SQLITE_(LOCKED|BUSY)/i.test(
            error.message,
        );
    }

    private migrate() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL DEFAULT 'omo_request',
        prompt TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        retry_at INTEGER,
        session_id TEXT,
        request_message_id TEXT,
        assistant_message_id TEXT,
        raw_result TEXT,
        result TEXT,
        error TEXT,
        run_agent TEXT,
        run_model TEXT,
        summary_agent TEXT,
        summary_model TEXT,
        source TEXT NOT NULL DEFAULT 'cli',
        started_at INTEGER,
        completed_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
	    `);
        this.ensureColumn("type", "TEXT NOT NULL DEFAULT 'omo_request'");
        this.ensureColumn("attempts", "INTEGER NOT NULL DEFAULT 0");
        this.ensureColumn("retry_at", "INTEGER");
        this.ensureColumn("started_at", "INTEGER");
        this.ensureColumn("completed_at", "INTEGER");
        this.ensureColumn("request_message_id", "TEXT");
        this.ensureColumn("assistant_message_id", "TEXT");
        this.ensureColumn("raw_result", "TEXT");
        this.ensureColumn("run_agent", "TEXT");
        this.ensureColumn("run_model", "TEXT");
        this.ensureColumn("summary_agent", "TEXT");
        this.ensureColumn("summary_model", "TEXT");
        this.db.exec(
            `UPDATE tasks SET type = 'omo_request' WHERE type IS NULL OR type = ''`,
        );
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
        this.db.exec(`
	      CREATE TABLE IF NOT EXISTS interactions (
	        id TEXT PRIMARY KEY,
	        type TEXT NOT NULL,
	        request_id TEXT NOT NULL,
	        session_id TEXT,
	        payload TEXT NOT NULL,
	        status TEXT NOT NULL DEFAULT 'pending',
	        answer TEXT,
	        created_at INTEGER NOT NULL,
	        answered_at INTEGER,
	        updated_at INTEGER NOT NULL,
	        UNIQUE(type, request_id)
	      )
	    `);
        this.db.exec(`
	      CREATE INDEX IF NOT EXISTS idx_interactions_status ON interactions(status)
	    `);
        this.db.exec(`
		      CREATE INDEX IF NOT EXISTS idx_interactions_created ON interactions(created_at)
		    `);
        this.db.exec(`
	      CREATE TABLE IF NOT EXISTS metrics_events (
	        id TEXT PRIMARY KEY,
	        event_type TEXT NOT NULL,
	        trace_id TEXT,
	        task_id TEXT,
	        interaction_id TEXT,
	        request_hash TEXT,
	        parent_id TEXT,
	        source TEXT,
	        task_type TEXT,
	        from_state TEXT,
	        to_state TEXT,
	        reason TEXT,
	        status TEXT,
	        duration_ms INTEGER,
	        backlog INTEGER,
	        error_class TEXT,
	        payload TEXT,
	        created_at INTEGER NOT NULL
	      )
	    `);
        this.ensureMetricColumn("trace_id", "TEXT");
        this.ensureMetricColumn("request_hash", "TEXT");
        this.ensureMetricColumn("parent_id", "TEXT");
        this.ensureMetricColumn("source", "TEXT");
        this.ensureMetricColumn("from_state", "TEXT");
        this.ensureMetricColumn("to_state", "TEXT");
        this.ensureMetricColumn("reason", "TEXT");
        this.db.exec(`
	      CREATE INDEX IF NOT EXISTS idx_metrics_events_created ON metrics_events(created_at)
	    `);
        this.db.exec(`
	      CREATE INDEX IF NOT EXISTS idx_metrics_events_event_type ON metrics_events(event_type)
	    `);
        this.db.exec(`
	      CREATE INDEX IF NOT EXISTS idx_metrics_events_task_id ON metrics_events(task_id)
	    `);
        this.db.exec(`
	      CREATE INDEX IF NOT EXISTS idx_metrics_events_trace_id ON metrics_events(trace_id)
	    `);
        this.db.exec(`
	      CREATE TABLE IF NOT EXISTS inbound_events (
	        id TEXT PRIMARY KEY,
	        channel TEXT NOT NULL,
	        event_id TEXT NOT NULL,
	        source TEXT NOT NULL,
	        status TEXT NOT NULL DEFAULT 'received',
	        payload TEXT NOT NULL,
	        created_at INTEGER NOT NULL,
	        UNIQUE(channel, event_id)
	      )
	    `);
        this.db.exec(`
	      CREATE INDEX IF NOT EXISTS idx_inbound_events_channel ON inbound_events(channel)
	    `);
        this.db.exec(`
	      CREATE INDEX IF NOT EXISTS idx_inbound_events_created ON inbound_events(created_at)
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

    private ensureMetricColumn(column: string, definition: string) {
        const cols = this.db
            .prepare("PRAGMA table_info(metrics_events)")
            .all() as { name: string }[];
        const hasColumn = cols.some((c) => c.name === column);
        if (!hasColumn) {
            this.db.exec(
                `ALTER TABLE metrics_events ADD COLUMN ${column} ${definition}`,
            );
        }
    }

    createTask(
        prompt: string,
        source: string = "cli",
        type: TaskType = "omo_request",
        sessionId?: string | null,
    ): Task {
        const now = Date.now();
        const id = randomUUIDv7();
        this.db
            .prepare(
                `INSERT INTO tasks (id, type, prompt, status, attempts, source, session_id, created_at, updated_at)
         VALUES (?, ?, ?, 'pending', 0, ?, ?, ?, ?)`,
            )
            .run(id, type, prompt, source, sessionId ?? null, now, now);
        return this.getTask(id)!;
    }

    getTask(id: string): Task | null {
        const row = this.db
            .prepare("SELECT * FROM tasks WHERE id = ?")
            .get(id) as Record<string, unknown> | null;
        return row ? this.rowToTask(row) : null;
    }

    listTasks(filter?: {
        status?: TaskStatus;
        type?: TaskType;
        limit?: number;
    }): Task[] {
        let sql = "SELECT * FROM tasks";
        const params: unknown[] = [];
        const wheres: string[] = [];

        if (filter?.status) {
            wheres.push("status = ?");
            params.push(filter.status);
        }
        if (filter?.type) {
            wheres.push("type = ?");
            params.push(filter.type);
        }
        if (wheres.length > 0) {
            sql += ` WHERE ${wheres.join(" AND ")}`;
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

    findLatestSessionIdBySource(
        source: string,
        options: {
            excludeTaskId?: string;
        } = {},
    ): string | null {
        const where = ["source = ?", "session_id IS NOT NULL"];
        const params: unknown[] = [source];

        if (options.excludeTaskId) {
            where.push("id != ?");
            params.push(options.excludeTaskId);
        }

        const row = this.db
            .prepare(
                `SELECT session_id
                 FROM tasks
                 WHERE ${where.join(" AND ")}
                 ORDER BY created_at DESC
                 LIMIT 1`,
            )
            .get(...params) as { session_id?: unknown } | null;

        if (!row || typeof row.session_id !== "string") return null;
        const sessionId = row.session_id.trim();
        return sessionId.length > 0 ? sessionId : null;
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
                | "requestMessageId"
                | "assistantMessageId"
                | "rawResult"
                | "result"
                | "error"
                | "runAgent"
                | "runModel"
                | "summaryAgent"
                | "summaryModel"
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
        if (updates.requestMessageId !== undefined) {
            sets.push("request_message_id = ?");
            params.push(updates.requestMessageId);
        }
        if (updates.assistantMessageId !== undefined) {
            sets.push("assistant_message_id = ?");
            params.push(updates.assistantMessageId);
        }
        if (updates.rawResult !== undefined) {
            sets.push("raw_result = ?");
            params.push(updates.rawResult);
        }
        if (updates.result !== undefined) {
            sets.push("result = ?");
            params.push(updates.result);
        }
        if (updates.error !== undefined) {
            sets.push("error = ?");
            params.push(updates.error);
        }
        if (updates.runAgent !== undefined) {
            sets.push("run_agent = ?");
            params.push(updates.runAgent);
        }
        if (updates.runModel !== undefined) {
            sets.push("run_model = ?");
            params.push(updates.runModel);
        }
        if (updates.summaryAgent !== undefined) {
            sets.push("summary_agent = ?");
            params.push(updates.summaryAgent);
        }
        if (updates.summaryModel !== undefined) {
            sets.push("summary_model = ?");
            params.push(updates.summaryModel);
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

    upsertInteraction(input: {
        type: InteractionType;
        requestId: string;
        sessionId?: string | null;
        payload: string;
    }): { interaction: Interaction; created: boolean } {
        const now = Date.now();
        const id = randomUUIDv7();
        const result = this.db
            .prepare(
                `INSERT INTO interactions (
                   id, type, request_id, session_id, payload, status, created_at, updated_at
                 ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
                 ON CONFLICT(type, request_id) DO NOTHING`,
            )
            .run(
                id,
                input.type,
                input.requestId,
                input.sessionId ?? null,
                input.payload,
                now,
                now,
            );

        const interaction = this.getInteractionByRequest(
            input.type,
            input.requestId,
        );
        if (!interaction) {
            throw new Error(
                `Failed to upsert interaction: ${input.type}:${input.requestId}`,
            );
        }

        return {
            interaction,
            created: result.changes > 0,
        };
    }

    getInteraction(id: string): Interaction | null {
        const row = this.db
            .prepare("SELECT * FROM interactions WHERE id = ?")
            .get(id) as Record<string, unknown> | null;
        return row ? this.rowToInteraction(row) : null;
    }

    getInteractionByRequest(
        type: InteractionType,
        requestId: string,
    ): Interaction | null {
        const row = this.db
            .prepare(
                "SELECT * FROM interactions WHERE type = ? AND request_id = ?",
            )
            .get(type, requestId) as Record<string, unknown> | null;
        return row ? this.rowToInteraction(row) : null;
    }

    listInteractions(filter?: {
        status?: InteractionStatus;
        type?: InteractionType;
        limit?: number;
    }): Interaction[] {
        let sql = "SELECT * FROM interactions";
        const params: unknown[] = [];
        const wheres: string[] = [];

        if (filter?.status) {
            wheres.push("status = ?");
            params.push(filter.status);
        }
        if (filter?.type) {
            wheres.push("type = ?");
            params.push(filter.type);
        }
        if (wheres.length > 0) {
            sql += ` WHERE ${wheres.join(" AND ")}`;
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
        return rows.map((row) => this.rowToInteraction(row));
    }

    updateInteraction(
        id: string,
        updates: Partial<
            Pick<Interaction, "status" | "answer" | "answeredAt" | "sessionId">
        >,
    ): Interaction {
        const sets: string[] = [];
        const params: unknown[] = [];

        if (updates.status !== undefined) {
            sets.push("status = ?");
            params.push(updates.status);
        }
        if (updates.answer !== undefined) {
            sets.push("answer = ?");
            params.push(updates.answer);
        }
        if (updates.answeredAt !== undefined) {
            sets.push("answered_at = ?");
            params.push(updates.answeredAt);
        }
        if (updates.sessionId !== undefined) {
            sets.push("session_id = ?");
            params.push(updates.sessionId);
        }

        sets.push("updated_at = ?");
        params.push(Date.now());
        params.push(id);

        this.db
            .prepare(`UPDATE interactions SET ${sets.join(", ")} WHERE id = ?`)
            .run(...params);
        return this.getInteraction(id)!;
    }

    getInteractionStats(): InteractionStats {
        const rows = this.db
            .prepare(
                "SELECT status, COUNT(*) as count FROM interactions GROUP BY status",
            )
            .all() as { status: string; count: number }[];

        const stats: InteractionStats = {
            pending: 0,
            answered: 0,
            rejected: 0,
        };
        for (const row of rows) {
            if (row.status in stats) {
                stats[row.status as keyof InteractionStats] = row.count;
            }
        }
        return stats;
    }

    appendMetricEvent(input: {
        eventType: string;
        taskId?: string | null;
        interactionId?: string | null;
        traceId?: string | null;
        source?: string | null;
        requestHash?: string | null;
        parentId?: string | null;
        from?: string | null;
        to?: string | null;
        reason?: string | null;
        taskType?: TaskType | null;
        status?: MetricStatus | null;
        durationMs?: number | null;
        backlog?: number | null;
        errorClass?: string | null;
        payload?: string | null;
        createdAt?: number;
    }): MetricEvent {
        const id = randomUUIDv7();
        const createdAt = input.createdAt ?? Date.now();
        this.db
            .prepare(
                `INSERT INTO metrics_events (
                   id, event_type, trace_id, task_id, interaction_id, request_hash, parent_id,
                   source, task_type, from_state, to_state, reason, status,
                   duration_ms, backlog, error_class, payload, created_at
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
                id,
                input.eventType,
                input.traceId ?? null,
                input.taskId ?? null,
                input.interactionId ?? null,
                input.requestHash ?? null,
                input.parentId ?? null,
                input.source ?? null,
                input.taskType ?? null,
                input.from ?? null,
                input.to ?? null,
                input.reason ?? null,
                input.status ?? null,
                input.durationMs ?? null,
                input.backlog ?? null,
                input.errorClass ?? null,
                input.payload ?? null,
                createdAt,
            );
        return this.getMetricEvent(id)!;
    }

    getMetricEvent(id: string): MetricEvent | null {
        const row = this.db
            .prepare("SELECT * FROM metrics_events WHERE id = ?")
            .get(id) as Record<string, unknown> | null;
        return row ? this.rowToMetricEvent(row) : null;
    }

    listMetricEvents(filter?: {
        eventType?: string;
        taskId?: string;
        interactionId?: string;
        since?: number;
        limit?: number;
    }): MetricEvent[] {
        let sql = "SELECT * FROM metrics_events";
        const params: unknown[] = [];
        const wheres: string[] = [];

        if (filter?.eventType) {
            wheres.push("event_type = ?");
            params.push(filter.eventType);
        }
        if (filter?.taskId) {
            wheres.push("task_id = ?");
            params.push(filter.taskId);
        }
        if (filter?.interactionId) {
            wheres.push("interaction_id = ?");
            params.push(filter.interactionId);
        }
        if (filter?.since !== undefined) {
            wheres.push("created_at >= ?");
            params.push(filter.since);
        }
        if (wheres.length > 0) {
            sql += ` WHERE ${wheres.join(" AND ")}`;
        }
        sql += " ORDER BY created_at DESC";
        if (filter?.limit) {
            sql += " LIMIT ?";
            params.push(filter.limit);
        }

        const rows = this.db.prepare(sql).all(...params) as Record<
            string,
            unknown
        >[];
        return rows.map((row) => this.rowToMetricEvent(row));
    }

    registerInboundEvent(input: {
        channel: InboundEventChannel;
        eventId: string;
        source: string;
        status?: InboundEventStatus;
        payload: string;
    }): { event: InboundEvent; created: boolean } {
        const now = Date.now();
        const status = input.status ?? "received";
        const id = randomUUIDv7();
        const result = this.db
            .prepare(
                `INSERT INTO inbound_events (id, channel, event_id, source, status, payload, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(channel, event_id) DO NOTHING`,
            )
            .run(
                id,
                input.channel,
                input.eventId,
                input.source,
                status,
                input.payload,
                now,
            );

        const event = this.getInboundEvent(input.channel, input.eventId);
        if (!event) {
            throw new Error(
                `Failed to register inbound event: ${input.channel}:${input.eventId}`,
            );
        }

        return {
            event,
            created: result.changes > 0,
        };
    }

    getInboundEvent(
        channel: InboundEventChannel,
        eventId: string,
    ): InboundEvent | null {
        const row = this.db
            .prepare(
                `SELECT * FROM inbound_events WHERE channel = ? AND event_id = ?`,
            )
            .get(channel, eventId) as Record<string, unknown> | null;
        return row ? this.rowToInboundEvent(row) : null;
    }

    listInboundEvents(filter?: {
        channel?: InboundEventChannel;
        eventId?: string;
        status?: InboundEventStatus;
        limit?: number;
    }): InboundEvent[] {
        let sql = "SELECT * FROM inbound_events";
        const params: unknown[] = [];
        const wheres: string[] = [];

        if (filter?.channel) {
            wheres.push("channel = ?");
            params.push(filter.channel);
        }
        if (filter?.eventId) {
            wheres.push("event_id = ?");
            params.push(filter.eventId);
        }
        if (filter?.status) {
            wheres.push("status = ?");
            params.push(filter.status);
        }
        if (wheres.length > 0) {
            sql += ` WHERE ${wheres.join(" AND ")}`;
        }
        sql += " ORDER BY created_at DESC";

        if (filter?.limit) {
            sql += " LIMIT ?";
            params.push(filter.limit);
        }

        const rows = this.db.prepare(sql).all(...params) as Record<
            string,
            unknown
        >[];
        return rows.map((row) => this.rowToInboundEvent(row));
    }

    updateInboundEventStatus(
        id: string,
        status: InboundEventStatus,
    ): InboundEvent {
        this.db
            .prepare("UPDATE inbound_events SET status = ? WHERE id = ?")
            .run(status, id);
        const row = this.db
            .prepare("SELECT * FROM inbound_events WHERE id = ?")
            .get(id) as Record<string, unknown> | null;
        if (!row) {
            throw new Error(`Inbound event not found: ${id}`);
        }
        return this.rowToInboundEvent(row);
    }

    close() {
        this.db.close();
    }

    private rowToTask(row: Record<string, unknown>): Task {
        const rawStatus = row.status as string;
        const normalizedStatus = rawStatus === "done" ? "completed" : rawStatus;
        const rawType = (row.type as string | undefined) ?? "omo_request";
        const normalizedType: TaskType =
            rawType === "omo_request" || rawType === "report"
                ? rawType
                : isEq1TaskType(rawType)
                  ? rawType
                  : "omo_request";
        return {
            id: row.id as string,
            type: normalizedType,
            prompt: row.prompt as string,
            status: normalizedStatus as TaskStatus,
            attempts: Number(row.attempts ?? 0),
            retryAt: (row.retry_at as number) ?? null,
            sessionId: (row.session_id as string) ?? null,
            requestMessageId: (row.request_message_id as string) ?? null,
            assistantMessageId: (row.assistant_message_id as string) ?? null,
            rawResult: (row.raw_result as string) ?? null,
            result: (row.result as string) ?? null,
            error: (row.error as string) ?? null,
            runAgent: (row.run_agent as string) ?? null,
            runModel: (row.run_model as string) ?? null,
            summaryAgent: (row.summary_agent as string) ?? null,
            summaryModel: (row.summary_model as string) ?? null,
            source: row.source as string,
            startedAt: (row.started_at as number) ?? null,
            completedAt: (row.completed_at as number) ?? null,
            createdAt: row.created_at as number,
            updatedAt: row.updated_at as number,
        };
    }

    private rowToInteraction(row: Record<string, unknown>): Interaction {
        const rawType = row.type as string;
        const normalizedType: InteractionType =
            rawType === "permission" || rawType === "question"
                ? rawType
                : "question";
        const rawStatus = row.status as string;
        const normalizedStatus: InteractionStatus =
            rawStatus === "pending" ||
            rawStatus === "answered" ||
            rawStatus === "rejected"
                ? rawStatus
                : "pending";

        return {
            id: row.id as string,
            type: normalizedType,
            requestId: row.request_id as string,
            sessionId: (row.session_id as string) ?? null,
            payload: row.payload as string,
            status: normalizedStatus,
            answer: (row.answer as string) ?? null,
            createdAt: row.created_at as number,
            answeredAt: (row.answered_at as number) ?? null,
            updatedAt: row.updated_at as number,
        };
    }

    private rowToMetricEvent(row: Record<string, unknown>): MetricEvent {
        const rawTaskType = (row.task_type as string | null) ?? null;
        const taskType: TaskType | null =
            rawTaskType === null
                ? null
                : rawTaskType === "omo_request" || rawTaskType === "report"
                  ? rawTaskType
                  : isEq1TaskType(rawTaskType)
                    ? rawTaskType
                    : null;

        const rawStatus = (row.status as string | null) ?? null;
        const status: MetricStatus | null =
            rawStatus === "pending" ||
            rawStatus === "running" ||
            rawStatus === "completed" ||
            rawStatus === "failed" ||
            rawStatus === "answered" ||
            rawStatus === "rejected" ||
            rawStatus === "healthy" ||
            rawStatus === "unhealthy"
                ? (rawStatus as MetricStatus)
                : null;

        return {
            id: row.id as string,
            eventType: row.event_type as string,
            taskId: (row.task_id as string) ?? null,
            interactionId: (row.interaction_id as string) ?? null,
            traceId: (row.trace_id as string) ?? null,
            taskType,
            status,
            fromState: (row.from_state as string) ?? null,
            toState: (row.to_state as string) ?? null,
            reason: (row.reason as string) ?? null,
            source: (row.source as string) ?? null,
            requestHash: (row.request_hash as string) ?? null,
            parentId: (row.parent_id as string) ?? null,
            durationMs:
                row.duration_ms === null || row.duration_ms === undefined
                    ? null
                    : Number(row.duration_ms),
            backlog:
                row.backlog === null || row.backlog === undefined
                    ? null
                    : Number(row.backlog),
            errorClass: (row.error_class as string) ?? null,
            payload: (row.payload as string) ?? null,
            createdAt: row.created_at as number,
        };
    }

    private rowToInboundEvent(row: Record<string, unknown>): InboundEvent {
        const rawStatus = row.status as string;
        const normalizedStatus =
            rawStatus === "received" || rawStatus === "invalid"
                ? rawStatus
                : "duplicate";

        return {
            id: row.id as string,
            channel: row.channel as InboundEventChannel,
            eventId: row.event_id as string,
            source: row.source as string,
            status: normalizedStatus,
            payload: row.payload as string,
            createdAt: row.created_at as number,
        };
    }
}
