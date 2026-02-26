import { createLogger } from "../utils/logging";
import type { InteractionType, Store } from "../x2/store";

const logger = createLogger("X3.Detector");

interface DetectorServer {
    listPermissions(): Promise<unknown[]>;
    listQuestions(): Promise<unknown[]>;
}

export interface DetectorPollStats {
    seen: number;
    enqueued: number;
    duplicate: number;
    invalid: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickString(record: Record<string, unknown>, keys: string[]): string | null {
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
    const direct = pickString(record, [
        "sessionID",
        "sessionId",
        "session_id",
    ]);
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

export class InteractionDetector {
    private store: Store;
    private server: DetectorServer;

    constructor(store: Store, server: DetectorServer) {
        this.store = store;
        this.server = server;
    }

    async pollOnce(): Promise<DetectorPollStats> {
        const [permissions, questions] = await Promise.all([
            this.server.listPermissions(),
            this.server.listQuestions(),
        ]);
        const stats: DetectorPollStats = {
            seen: 0,
            enqueued: 0,
            duplicate: 0,
            invalid: 0,
        };

        this.consumeList("permission", permissions, stats);
        this.consumeList("question", questions, stats);
        logger.info("detector_poll_done", stats);
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
            const upserted = this.store.upsertInteraction({
                type,
                requestId,
                sessionId,
                payload: payloadToString(value),
            });
            if (upserted.created) {
                stats.enqueued += 1;
                continue;
            }
            stats.duplicate += 1;
        }
    }
}
