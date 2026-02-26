import type { Interaction } from "../x2/store";
import type { InteractionEvaluation } from "../x3/evaluator";

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
    return {
        schema_version: "x4_summary.v1",
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
}
