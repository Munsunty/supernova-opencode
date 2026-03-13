import { createLogger } from "../utils/logging";
import type { InteractionOrigin, InteractionType, Store } from "../x2/store";
// InteractionType is used for joshua_decision reclassification in consumeList

const logger = createLogger("X3.Detector");

interface DetectorServer {
    listPermissions(): Promise<unknown[]>;
    listQuestions(): Promise<unknown[]>;
}

interface PollSourceResult {
    values: unknown[];
    error: string | null;
}

export interface DetectorPollStats {
    seen: number;
    enqueued: number;
    observed: number;
    duplicate: number;
    invalid: number;
}

function isAllZeroStats(stats: DetectorPollStats): boolean {
    return (
        stats.seen === 0 &&
        stats.enqueued === 0 &&
        stats.observed === 0 &&
        stats.duplicate === 0 &&
        stats.invalid === 0
    );
}

function shouldLogPollInfo(stats: DetectorPollStats): boolean {
    // INFO는 실제 action 신호(enqueued) 또는 데이터 이상(invalid)에만 사용한다.
    return stats.enqueued > 0 || stats.invalid > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickString(
    record: Record<string, unknown>,
    keys: string[],
): string | null {
    for (const key of keys) {
        const value = record[key];
        if (typeof value === "string" && value.trim().length > 0) {
            return value;
        }
    }
    return null;
}

function nestedRecord(
    record: Record<string, unknown>,
    keys: string[],
): Record<string, unknown> | null {
    for (const key of keys) {
        const value = record[key];
        if (isRecord(value)) return value;
    }
    return null;
}

function extractRequestId(record: Record<string, unknown>): string | null {
    const direct = pickString(record, [
        "requestID",
        "requestId",
        "id",
        "permissionID",
        "permissionId",
        "questionID",
        "questionId",
    ]);
    if (direct) return direct;

    const nested = nestedRecord(record, ["request", "permission", "question"]);
    if (!nested) return null;

    return pickString(nested, [
        "requestID",
        "requestId",
        "id",
        "permissionID",
        "permissionId",
        "questionID",
        "questionId",
    ]);
}

function extractSessionId(record: Record<string, unknown>): string | null {
    const direct = pickString(record, ["sessionID", "sessionId", "session_id"]);
    if (direct) return direct;

    const nested = nestedRecord(record, ["session", "request"]);
    if (!nested) return null;

    return pickString(nested, ["sessionID", "sessionId", "session_id", "id"]);
}

function payloadToString(value: unknown): string {
    try {
        return JSON.stringify(value);
    } catch {
        return JSON.stringify({
            error: "payload_not_serializable",
        });
    }
}

const JOSHUA_DECISION_MARKER = "JOSHUA_DECISION:";

function isJoshuaDecision(record: Record<string, unknown>): boolean {
    const textFields = ["message", "question", "text", "content", "body"];
    for (const field of textFields) {
        const v = record[field];
        if (typeof v === "string" && v.trimStart().startsWith(JOSHUA_DECISION_MARKER)) {
            return true;
        }
    }
    const nested = nestedRecord(record, ["question", "request", "data"]);
    if (nested) {
        for (const field of textFields) {
            const v = nested[field];
            if (typeof v === "string" && v.trimStart().startsWith(JOSHUA_DECISION_MARKER)) {
                return true;
            }
        }
    }
    return false;
}

export class InteractionDetector {
    private store: Store;
    private server: DetectorServer;
    private lastFailureSignature: string | null;

    constructor(store: Store, server: DetectorServer) {
        this.store = store;
        this.server = server;
        this.lastFailureSignature = null;
    }

    async pollOnce(): Promise<DetectorPollStats> {
        const traceId = `x3_detector_${Date.now()}`;
        const [permissions, questions] = await Promise.all([
            this.pollSource("permission", () => this.server.listPermissions()),
            this.pollSource("question", () => this.server.listQuestions()),
        ]);
        const stats: DetectorPollStats = {
            seen: 0,
            enqueued: 0,
            observed: 0,
            duplicate: 0,
            invalid: 0,
        };

        this.consumeList("permission", permissions.values, stats);
        this.consumeList("question", questions.values, stats);
        const pollPartial = Boolean(permissions.error || questions.error);
        this.logPollHealth(permissions.error, questions.error, stats);

        this.store.appendMetricEvent({
            eventType: "interaction_poll",
            traceId,
            interactionId: null,
            source: "x3_worker",
            status: pollPartial ? "unhealthy" : "healthy",
            reason: pollPartial ? "poll_partial" : "poll_done",
            payload: JSON.stringify({
                source: "x3_detector",
                type: "poll_once",
                seen: stats.seen,
                enqueued: stats.enqueued,
                observed: stats.observed,
                duplicate: stats.duplicate,
                invalid: stats.invalid,
                permission_error: permissions.error,
                question_error: questions.error,
            }),
        });
        if (isAllZeroStats(stats) || !shouldLogPollInfo(stats)) {
            logger.debug("detector_poll_done", stats);
        } else {
            logger.info("detector_poll_done", stats);
        }
        return stats;
    }

    private consumeList(
        type: InteractionType,
        values: unknown[],
        stats: DetectorPollStats,
    ): void {
        for (const value of values) {
            stats.seen += 1;

            if (!isRecord(value)) {
                stats.invalid += 1;
                logger.warn("interaction_invalid_payload", {
                    type,
                    reason: "not_object",
                });
                continue;
            }

            const requestId = extractRequestId(value);
            if (!requestId) {
                stats.invalid += 1;
                logger.warn("interaction_invalid_payload", {
                    type,
                    reason: "missing_request_id",
                });
                continue;
            }

            const sessionId = extractSessionId(value);
            const origin = this.resolveOrigin(sessionId);
            const status = origin === "managed" ? "pending" : "observed";
            const effectiveType: InteractionType =
                type === "question" && origin === "managed" && isJoshuaDecision(value)
                    ? "joshua_decision"
                    : type;
            const upserted = this.store.upsertInteraction({
                type: effectiveType,
                requestId,
                sessionId,
                origin,
                status,
                payload: payloadToString(value),
            });
            if (upserted.created) {
                if (origin === "managed") {
                    stats.enqueued += 1;
                } else {
                    stats.observed += 1;
                }
                continue;
            }
            stats.duplicate += 1;
        }
    }

    private resolveOrigin(sessionId: string | null): InteractionOrigin {
        if (!sessionId) return "external";
        return this.store.hasTaskSession(sessionId) ? "managed" : "external";
    }

    private async pollSource(
        source: InteractionType,
        fn: () => Promise<unknown[]>,
    ): Promise<PollSourceResult> {
        try {
            const values = await fn();
            return { values, error: null };
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            return {
                values: [],
                error: `${source}:${message}`,
            };
        }
    }

    private logPollHealth(
        permissionError: string | null,
        questionError: string | null,
        stats: DetectorPollStats,
    ): void {
        const signature = `${permissionError ?? "ok"}|${questionError ?? "ok"}`;
        if (!permissionError && !questionError) {
            if (this.lastFailureSignature !== null) {
                logger.info("detector_poll_recovered", stats);
            }
            this.lastFailureSignature = null;
            return;
        }

        if (this.lastFailureSignature !== signature) {
            logger.warn("detector_poll_partial", {
                permissionError,
                questionError,
                ...stats,
            });
            this.lastFailureSignature = signature;
            return;
        }

        logger.debug("detector_poll_partial_repeat", {
            permissionError,
            questionError,
            ...stats,
        });
    }
}
