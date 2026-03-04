/**
 * X₂ Router — 완료된 task의 결과를 분기
 *
 * Reporter 인터페이스로 출력 대상을 교환 가능.
 * Bot 없이는 ConsoleReporter. Bot 연결 시 TelegramReporter로 교체.
 */

import type { Task } from "./store";
import { createLogger } from "../utils/logging";
import { extractTelegramChatIdFromTaskSource } from "../utils/telegram-source";

const logger = createLogger("X2.Router");

export interface ReportPayload {
    raw: string;
    summary: string;
    executionAgent: string | null;
    executionModel: string | null;
    summaryAgent: string | null;
    summaryModel: string | null;
}

export interface Reporter {
    report(task: Task, payload: ReportPayload): Promise<void>;
}

export class ConsoleReporter implements Reporter {
    async report(task: Task, payload: ReportPayload): Promise<void> {
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
                result: payload.summary,
                rawResult: payload.raw,
                executionAgent: payload.executionAgent,
                executionModel: payload.executionModel,
                summaryAgent: payload.summaryAgent,
                summaryModel: payload.summaryModel,
            });
        } else if (task.error) {
            logger.error("task_failed", {
                task: task.id.slice(0, 8),
                error: task.error,
            });
        }
    }
}

interface TelegramReporterOptions {
    token: string;
    apiBase?: string;
    fallback?: Reporter;
}

const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;

function truncateTelegramMessage(text: string): string {
    if (text.length <= TELEGRAM_MAX_MESSAGE_LENGTH) return text;
    return `${text.slice(0, TELEGRAM_MAX_MESSAGE_LENGTH - 3)}...`;
}

function normalizeBody(value: string, fallback = "(empty result)"): string {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
}

function formatMonitoringTelegramMessage(
    task: Task,
    payload: ReportPayload,
): string {
    const status = task.status === "completed" ? "completed" : "failed";
    const lines = [
        `[monitor/raw][${status}] task:${task.id.slice(0, 8)}`,
        normalizeBody(payload.raw),
    ];
    return truncateTelegramMessage(lines.join("\n"));
}

function formatSummaryTelegramMessage(
    task: Task,
    payload: ReportPayload,
): string {
    const status = task.status === "completed" ? "completed" : "failed";
    const lines = [
        `[summary/meta][${status}] task:${task.id.slice(0, 8)}`,
        normalizeBody(payload.summary, "(empty summary)"),
        "",
        `run_agent: ${payload.executionAgent ?? "unknown"}`,
        `run_model: ${payload.executionModel ?? "unknown"}`,
        `summary_agent: ${payload.summaryAgent ?? "unknown"}`,
        `summary_model: ${payload.summaryModel ?? "unknown"}`,
    ];
    return truncateTelegramMessage(lines.join("\n"));
}

function shouldSendSummary(task: Task, payload: ReportPayload): boolean {
    if (task.status !== "completed") return false;
    const summary = payload.summary.trim();
    if (summary.length === 0) return false;
    const raw = payload.raw.trim();
    if (summary !== raw) return true;
    return (
        payload.executionAgent !== null ||
        payload.executionModel !== null ||
        payload.summaryAgent !== null ||
        payload.summaryModel !== null
    );
}

export class TelegramReporter implements Reporter {
    private token: string;
    private apiBase: string;
    private fallback: Reporter | null;

    constructor(options: TelegramReporterOptions) {
        this.token = options.token;
        this.apiBase = (options.apiBase ?? "https://api.telegram.org").replace(
            /\/+$/,
            "",
        );
        this.fallback = options.fallback ?? null;
    }

    private async sendMessage(chatId: string, text: string): Promise<void> {
        const endpoint = `${this.apiBase}/bot${encodeURIComponent(this.token)}/sendMessage`;
        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                chat_id: chatId,
                text,
            }),
        });

        const payload = (await response.json().catch(() => null)) as {
            ok?: unknown;
            description?: unknown;
        } | null;
        const apiOk = payload ? payload.ok !== false : true;
        if (!response.ok || !apiOk) {
            const reason =
                payload && typeof payload.description === "string"
                    ? payload.description
                    : `http_${response.status}`;
            throw new Error(`telegram sendMessage failed: ${reason}`);
        }
    }

    async report(task: Task, payload: ReportPayload): Promise<void> {
        const chatId = extractTelegramChatIdFromTaskSource(task.source);
        if (!chatId) {
            await this.fallback?.report(task, payload);
            return;
        }

        try {
            await this.sendMessage(
                chatId,
                formatMonitoringTelegramMessage(task, payload),
            );
            logger.info("telegram_report_sent", {
                task: task.id.slice(0, 8),
                chatId,
                source: task.source,
                kind: "monitor_raw",
            });

            if (shouldSendSummary(task, payload)) {
                await this.sendMessage(
                    chatId,
                    formatSummaryTelegramMessage(task, payload),
                );
                logger.info("telegram_report_sent", {
                    task: task.id.slice(0, 8),
                    chatId,
                    source: task.source,
                    kind: "summary_meta",
                });
            }

            return;
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            logger.error("telegram_report_failed", {
                task: task.id.slice(0, 8),
                chatId,
                source: task.source,
                error: message,
            });
        }

        await this.fallback?.report(task, payload);
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
        const raw =
            task.rawResult ?? task.result ?? task.error ?? "(no output)";
        await this.reporter.report(task, {
            raw,
            summary,
            executionAgent: task.runAgent,
            executionModel: task.runModel,
            summaryAgent: task.summaryAgent,
            summaryModel: task.summaryModel,
        });
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
