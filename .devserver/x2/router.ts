/**
 * X₂ Router — 완료된 task의 결과를 분기
 *
 * Reporter 인터페이스로 출력 대상을 교환 가능.
 * Bot 없이는 ConsoleReporter. Bot 연결 시 TelegramReporter로 교체.
 */

import type { Task } from "./store";
import { createLogger } from "../utils/logging";

const logger = createLogger("X2.Router");

export interface Reporter {
    report(task: Task, summary: string): Promise<void>;
}

export class ConsoleReporter implements Reporter {
    async report(task: Task, summary: string): Promise<void> {
        const status = task.status === "completed" ? "OK" : "FAIL";
        logger.info("task_result", {
            status,
            task: task.id.slice(0, 8),
            source: task.source,
        });
        logger.info("task_prompt", {
            task: task.id.slice(0, 8),
            prompt: task.prompt.slice(0, 100),
        });
        if (task.status === "completed") {
            logger.info("task_completed", {
                task: task.id.slice(0, 8),
                result: summary,
            });
        } else if (task.error) {
            logger.error("task_failed", {
                task: task.id.slice(0, 8),
                error: task.error,
            });
        }
    }
}

export class Router {
    private reporter: Reporter;

    constructor(reporter: Reporter) {
        this.reporter = reporter;
    }

    setReporter(reporter: Reporter) {
        this.reporter = reporter;
    }

    async route(task: Task): Promise<void> {
        const summary = task.result ?? task.error ?? "(no output)";
        await this.reporter.report(task, summary);
    }

    shouldFollowUp(task: Task): boolean {
        if (task.status === "failed") return false;
        if (!task.result) return false;
        // 간단한 휴리스틱: result에 "TODO", "FIXME", "다음 단계" 등이 있으면 후속 작업 필요
        const keywords = [
            "TODO",
            "FIXME",
            "다음 단계",
            "추가 작업",
            "follow-up",
        ];
        return keywords.some((kw) =>
            task.result!.toLowerCase().includes(kw.toLowerCase()),
        );
    }
}
