import type { Interaction } from "../x2/store";
import type { InteractionEvaluation } from "../x3/evaluator";
import { createHash } from "node:crypto";

interface StableValue {
    [key: string]: unknown;
}

export const X4_SUMMARY_SCHEMA_VERSION = "x4_summary.v1";

function stableNormalize(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(stableNormalize);
    }

    if (value === null || typeof value !== "object") {
        return value;
    }

    const entries = Object.entries(value as StableValue)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, val]) => [key, stableNormalize(val)] as const);
    return Object.fromEntries(entries);
}

function buildRequestHash(payload: unknown): string {
    return createHash("sha256")
        .update(JSON.stringify(stableNormalize(payload)))
        .digest("hex");
}

function parsePayload(raw: string): unknown {
    try {
        return JSON.parse(raw);
    } catch {
        return { raw };
    }
}

export function summarizeInteractionContext(
    interaction: Interaction,
    evaluation: InteractionEvaluation,
): Record<string, unknown> {
    const summary = {
        schema_version: X4_SUMMARY_SCHEMA_VERSION,
        interaction: {
            id: interaction.id,
            type: interaction.type,
            request_id: interaction.requestId,
            session_id: interaction.sessionId,
            created_at: interaction.createdAt,
        },
        evaluation: {
            score: evaluation.score,
            reason: evaluation.reason,
            route: evaluation.route,
            reply: evaluation.reply,
            raw: evaluation.raw,
        },
        payload: parsePayload(interaction.payload),
    };
    return {
        ...summary,
        request_hash: buildRequestHash({
            interaction: summary.interaction,
            evaluation: summary.evaluation,
            payload: summary.payload,
        }),
        parent_id: interaction.id,
    };
}
