/**
 * X₂ Queue — 대기열 + 순차 실행
 *
 * Store에 task를 쌓고, 하나씩 꺼내서 OpenCode wrapper로 실행.
 * running task가 있으면 대기 (순차 1:1 정책).
 */

import { Store, type Task } from "./store"
import { summarize, formatSummary } from "./summarizer"
import type { OpenCodeServer } from "../opencode-server-wrapper"

export class Queue {
  private store: Store
  private server: OpenCodeServer
  private loopTimer: ReturnType<typeof setInterval> | null = null

  constructor(store: Store, server: OpenCodeServer) {
    this.store = store
    this.server = server
  }

  enqueue(prompt: string, source: string = "cli"): Task {
    return this.store.createTask(prompt, source)
  }

  async processNext(): Promise<Task | null> {
    if (this.store.hasRunning()) return null

    const task = this.store.getNextPending()
    if (!task) return null

    // pending → running
    this.store.updateTask(task.id, { status: "running" })

    try {
      const session = await this.server.createSession(
        task.prompt.slice(0, 80)
      )
      this.store.updateTask(task.id, { sessionId: session.id })

      const result = await this.server.prompt(session.id, task.prompt)
      const summary = summarize(result)
      const formatted = formatSummary(summary)

      // running → done
      return this.store.updateTask(task.id, {
        status: "done",
        result: formatted,
      })
    } catch (err) {
      // running → failed
      const message =
        err instanceof Error ? err.message : String(err)
      return this.store.updateTask(task.id, {
        status: "failed",
        error: message,
      })
    }
  }

  isRunning(): boolean {
    return this.store.hasRunning()
  }

  currentTask(): Task | null {
    const running = this.store.listTasks({ status: "running", limit: 1 })
    return running[0] ?? null
  }

  getStats() {
    return this.store.getStats()
  }

  startLoop(interval: number = 3000): void {
    if (this.loopTimer) return
    this.loopTimer = setInterval(async () => {
      try {
        await this.processNext()
      } catch {
        // 루프는 멈추지 않음
      }
    }, interval)
  }

  stopLoop(): void {
    if (this.loopTimer) {
      clearInterval(this.loopTimer)
      this.loopTimer = null
    }
  }
}
