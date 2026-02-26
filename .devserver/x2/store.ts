/**
 * X₂ Store — 자체 state.db (bun:sqlite)
 *
 * opencode.db와 별도 파일. Task 대기열 및 메타데이터 관리.
 * opencode 정보는 wrapper API로만 접근 — 이 DB에는 자체 상태만 저장.
 */

import { Database } from "bun:sqlite"
import { randomUUIDv7 } from "bun"

const DEFAULT_DB_PATH = new URL(
  "../data/state.db",
  import.meta.url
).pathname

export type TaskStatus = "pending" | "running" | "done" | "failed"

export interface Task {
  id: string
  prompt: string
  status: TaskStatus
  sessionId: string | null
  result: string | null
  error: string | null
  source: string
  createdAt: number
  updatedAt: number
}

export interface TaskStats {
  pending: number
  running: number
  done: number
  failed: number
}

export class Store {
  private db: Database

  constructor(dbPath: string = DEFAULT_DB_PATH) {
    this.db = new Database(dbPath, { create: true })
    this.db.exec("PRAGMA journal_mode = WAL")
    this.db.exec("PRAGMA foreign_keys = ON")
    this.migrate()
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        prompt TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        session_id TEXT,
        result TEXT,
        error TEXT,
        source TEXT NOT NULL DEFAULT 'cli',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)
    `)
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at)
    `)
  }

  createTask(prompt: string, source: string = "cli"): Task {
    const now = Date.now()
    const id = randomUUIDv7()
    this.db
      .prepare(
        `INSERT INTO tasks (id, prompt, status, source, created_at, updated_at)
         VALUES (?, ?, 'pending', ?, ?, ?)`
      )
      .run(id, prompt, source, now, now)
    return this.getTask(id)!
  }

  getTask(id: string): Task | null {
    const row = this.db
      .prepare("SELECT * FROM tasks WHERE id = ?")
      .get(id) as Record<string, unknown> | null
    return row ? this.rowToTask(row) : null
  }

  listTasks(filter?: { status?: TaskStatus; limit?: number }): Task[] {
    let sql = "SELECT * FROM tasks"
    const params: unknown[] = []

    if (filter?.status) {
      sql += " WHERE status = ?"
      params.push(filter.status)
    }

    sql += " ORDER BY created_at ASC"

    if (filter?.limit) {
      sql += " LIMIT ?"
      params.push(filter.limit)
    }

    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[]
    return rows.map((r) => this.rowToTask(r))
  }

  updateTask(id: string, updates: Partial<Pick<Task, "status" | "sessionId" | "result" | "error">>): Task {
    const sets: string[] = []
    const params: unknown[] = []

    if (updates.status !== undefined) {
      sets.push("status = ?")
      params.push(updates.status)
    }
    if (updates.sessionId !== undefined) {
      sets.push("session_id = ?")
      params.push(updates.sessionId)
    }
    if (updates.result !== undefined) {
      sets.push("result = ?")
      params.push(updates.result)
    }
    if (updates.error !== undefined) {
      sets.push("error = ?")
      params.push(updates.error)
    }

    sets.push("updated_at = ?")
    params.push(Date.now())
    params.push(id)

    this.db
      .prepare(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`)
      .run(...params)

    return this.getTask(id)!
  }

  getNextPending(): Task | null {
    const row = this.db
      .prepare(
        "SELECT * FROM tasks WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1"
      )
      .get() as Record<string, unknown> | null
    return row ? this.rowToTask(row) : null
  }

  hasRunning(): boolean {
    const row = this.db
      .prepare("SELECT COUNT(*) as count FROM tasks WHERE status = 'running'")
      .get() as { count: number }
    return row.count > 0
  }

  getStats(): TaskStats {
    const rows = this.db
      .prepare(
        "SELECT status, COUNT(*) as count FROM tasks GROUP BY status"
      )
      .all() as { status: string; count: number }[]

    const stats: TaskStats = { pending: 0, running: 0, done: 0, failed: 0 }
    for (const row of rows) {
      if (row.status in stats) {
        stats[row.status as TaskStatus] = row.count
      }
    }
    return stats
  }

  close() {
    this.db.close()
  }

  private rowToTask(row: Record<string, unknown>): Task {
    return {
      id: row.id as string,
      prompt: row.prompt as string,
      status: row.status as TaskStatus,
      sessionId: (row.session_id as string) ?? null,
      result: (row.result as string) ?? null,
      error: (row.error as string) ?? null,
      source: row.source as string,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    }
  }
}
