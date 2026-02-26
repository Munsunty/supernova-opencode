import type { Eq1Client } from "../eq1/llm-client";
import { createLogger } from "../utils/logging";
import type { Interaction } from "../x2/store";

const logger = createLogger("X3.Evaluator");

export interface InteractionEvaluation {
    score: number;
    reason: string;
    route: "auto" | "user";
    reply: string | null;
    raw: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function toText(value: unknown): string | null {
    return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function pickRoute(output: Record<string, unknown>): "auto" | "user" {
    const action = toText(output.action)?.toLowerCase();
    if (action === "auto" || action === "allow" || action === "approve") {
        return "auto";
    }
    if (
        action === "user" ||
        action === "escalate" ||
        action === "report" ||
        action === "manual"
    ) {
        return "user";
    }
    const score = toNumber(output.score);
    return score !== null && score <= 6 ? "auto" : "user";
}

function buildPrompt(interaction: Interaction): string {
    return JSON.stringify(
        {
            interaction_type: interaction.type,
            request_id: interaction.requestId,
            session_id: interaction.sessionId,
            payload: interaction.payload,
            output_contract: {
                required: ["score", "reason", "route"],
                route: ["auto", "user"],
                score: "0-10 (lower means safer for auto)",
            },
        },
        null,
        2,
    );
}

export class InteractionEvaluator {
    private eq1Client: Eq1Client;

    constructor(eq1Client: Eq1Client) {
        this.eq1Client = eq1Client;
    }

    async evaluate(interaction: Interaction): Promise<InteractionEvaluation> {
        const result = await this.eq1Client.evaluate(buildPrompt(interaction), {
            interactionType: interaction.type,
            requestId: interaction.requestId,
            sessionId: interaction.sessionId,
        });
        const output = isRecord(result.output) ? result.output : {};
        const score = toNumber(output.score) ?? 10;
        const reason = toText(output.reason) ?? "no reason";
        const reply = toText(output.reply) ?? toText(output.answer) ?? null;
        const route = pickRoute(output);

        logger.info("interaction_evaluated", {
            interaction: interaction.id.slice(0, 8),
            type: interaction.type,
            score,
            route,
            attempts: result.attempts,
            provider: result.provider,
        });

        return {
            score,
            reason,
            route,
            reply,
            raw: output,
        };
    }
}
