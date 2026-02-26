import { createLogger } from "../utils/logging";
import type { Interaction, Store, Task } from "../x2/store";
import type { InteractionEvaluation } from "./evaluator";

const logger = createLogger("X3.Responder");

interface InteractionServer {
    replyPermission(
        requestId: string,
        reply: "once" | "always" | "reject",
        message?: string,
    ): Promise<boolean>;
    replyQuestion(requestId: string, answers: string[][]): Promise<boolean>;
}

export interface ResponderResult {
    interaction: Interaction;
    route: "auto" | "user";
    reportTask: Task | null;
}

function buildReportPrompt(
    interaction: Interaction,
    evaluation: InteractionEvaluation,
): string {
    return JSON.stringify(
        {
            type: "interaction_escalation",
            interaction: {
                id: interaction.id,
                interactionType: interaction.type,
                requestId: interaction.requestId,
                sessionId: interaction.sessionId,
            },
            evaluation: {
                score: evaluation.score,
                reason: evaluation.reason,
                route: evaluation.route,
            },
            payload: interaction.payload,
            requested_action: "manual_review",
        },
        null,
        2,
    );
}

export class InteractionResponder {
    private store: Store;
    private server: InteractionServer;
    private autoThreshold: number;

    constructor(
        store: Store,
        server: InteractionServer,
        options: { autoThreshold?: number } = {},
    ) {
        this.store = store;
        this.server = server;
        this.autoThreshold = options.autoThreshold ?? 6;
    }

    async respond(
        interaction: Interaction,
        evaluation: InteractionEvaluation,
    ): Promise<ResponderResult> {
        const shouldAuto =
            evaluation.route === "auto" &&
            evaluation.score <= this.autoThreshold;

        if (!shouldAuto) {
            const reportTask = this.store.createTask(
                buildReportPrompt(interaction, evaluation),
                "x3",
                "report",
            );
            const updated = this.store.updateInteraction(interaction.id, {
                status: "answered",
                answer: JSON.stringify({
                    schema_version: "x3_interaction_result.v1",
                    source: "w4",
                    route: "user",
                    evaluation: {
                        score: evaluation.score,
                        reason: evaluation.reason,
                        route: evaluation.route,
                        raw: evaluation.raw,
                    },
                    report_task_id: reportTask.id,
                }),
                answeredAt: Date.now(),
            });
            logger.info("interaction_routed_user", {
                interaction: interaction.id.slice(0, 8),
                requestId: interaction.requestId,
                reportTask: reportTask.id.slice(0, 8),
                score: evaluation.score,
            });
            return {
                interaction: updated,
                route: "user",
                reportTask,
            };
        }

        try {
            if (interaction.type === "permission") {
                await this.server.replyPermission(
                    interaction.requestId,
                    "once",
                    evaluation.reply ?? evaluation.reason,
                );
            } else {
                const answer = evaluation.reply ?? evaluation.reason;
                await this.server.replyQuestion(interaction.requestId, [
                    [answer],
                ]);
            }

            const updated = this.store.updateInteraction(interaction.id, {
                status: "answered",
                answer: JSON.stringify({
                    schema_version: "x3_interaction_result.v1",
                    source: "w4",
                    route: "auto",
                    evaluation: {
                        score: evaluation.score,
                        reason: evaluation.reason,
                        route: evaluation.route,
                        raw: evaluation.raw,
                    },
                    reply: evaluation.reply,
                }),
                answeredAt: Date.now(),
            });
            logger.info("interaction_replied_auto", {
                interaction: interaction.id.slice(0, 8),
                requestId: interaction.requestId,
                score: evaluation.score,
            });
            return {
                interaction: updated,
                route: "auto",
                reportTask: null,
            };
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            const updated = this.store.updateInteraction(interaction.id, {
                status: "rejected",
                answer: JSON.stringify({
                    schema_version: "x3_interaction_result.v1",
                    source: "w4",
                    route: "auto",
                    evaluation: {
                        score: evaluation.score,
                        reason: evaluation.reason,
                        route: evaluation.route,
                        raw: evaluation.raw,
                    },
                    error: message,
                }),
                answeredAt: Date.now(),
            });
            logger.warn("interaction_auto_reply_failed", {
                interaction: interaction.id.slice(0, 8),
                requestId: interaction.requestId,
                error: message,
            });
            return {
                interaction: updated,
                route: "auto",
                reportTask: null,
            };
        }
    }
}
