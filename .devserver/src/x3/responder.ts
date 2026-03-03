import { createLogger } from "../utils/logging";
import type { Interaction, Store, Task } from "../x2/store";
import type { InteractionEvaluation } from "./evaluator";
import {
    type AutoReplyPolicy,
    decideAutoReply,
    DEFAULT_AUTO_REPLY_POLICY,
} from "./policy";

const logger = createLogger("X3.Responder");

interface InteractionServer {
    replyPermission(
        requestId: string,
        reply: "once" | "always" | "reject",
        message?: string,
    ): Promise<boolean>;
    replyQuestion(requestId: string, answers: string[][]): Promise<boolean>;
}

interface X4Router {
    routeInteraction(
        interaction: Interaction,
        evaluation: InteractionEvaluation,
    ): Promise<{
        decision: {
            action: "report" | "new_task" | "skip";
            reason: string;
            prompt: string | null;
            raw: Record<string, unknown>;
        };
        task: Task | null;
    }>;
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
    private policy: AutoReplyPolicy;
    private x4Router: X4Router | null;

    constructor(
        store: Store,
        server: InteractionServer,
        options: {
            policy?: AutoReplyPolicy;
            x4Router?: X4Router | null;
        } = {},
    ) {
        this.store = store;
        this.server = server;
        this.policy = options.policy ?? DEFAULT_AUTO_REPLY_POLICY;
        this.x4Router = options.x4Router ?? null;
    }

    async respond(
        interaction: Interaction,
        evaluation: InteractionEvaluation,
    ): Promise<ResponderResult> {
        const decision = decideAutoReply({
            score: evaluation.score,
            route: evaluation.route,
            policy: this.policy,
        });
        const shouldAuto = decision.decision === "auto";
        const from = interaction.status;

        if (!shouldAuto) {
            const routed = this.x4Router
                ? await this.x4Router.routeInteraction(interaction, evaluation)
                : {
                      decision: {
                          action: "report" as const,
                          reason: evaluation.reason,
                          prompt: null,
                          raw: {},
                      },
                      task: this.store.createTask(
                          buildReportPrompt(interaction, evaluation),
                          "x3",
                          "report",
                      ),
                  };

            const reportTask = routed.task;
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
                    x4_decision: routed.decision,
                    report_task_id: reportTask?.id ?? null,
                }),
                answeredAt: Date.now(),
            });
            logger.info("interaction_routed_user", {
                interaction: interaction.id.slice(0, 8),
                requestId: interaction.requestId,
                auto_reply_strategy: this.policy.auto_reply_strategy,
                routeAction: routed.decision.action,
                reportTask: reportTask ? reportTask.id.slice(0, 8) : null,
                score: evaluation.score,
            });
            this.store.appendMetricEvent({
                eventType: "interaction_state_transition",
                interactionId: interaction.id,
                traceId: interaction.id,
                from,
                to: "answered",
                reason: "interaction_escalated",
                status: "answered",
                source: "x3_worker",
                backlog: this.store.getInteractionStats().pending,
                payload: JSON.stringify({
                    source: "x3_responder",
                    route: routed.decision.action,
                    score: evaluation.score,
                    reason: evaluation.reason,
                    reportTaskId: reportTask?.id ?? null,
                    reportHash: routed.decision.request_hash ?? null,
                }),
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
                auto_reply_strategy: this.policy.auto_reply_strategy,
                auto_reply_decision: decision.decision,
                route_factor: decision.routeFactor,
                score_factor: decision.scoreFactor,
                score: evaluation.score,
            });
            this.store.appendMetricEvent({
                eventType: "interaction_state_transition",
                interactionId: interaction.id,
                traceId: interaction.id,
                from,
                to: "answered",
                reason: "interaction_auto_replied",
                status: "answered",
                source: "x3_worker",
                backlog: this.store.getInteractionStats().pending,
                payload: JSON.stringify({
                    source: "x3_responder",
                    route: "auto",
                    score: evaluation.score,
                    reason: evaluation.reason,
                }),
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
                auto_reply_strategy: this.policy.auto_reply_strategy,
                auto_reply_decision: decision.decision,
                route_factor: decision.routeFactor,
                score_factor: decision.scoreFactor,
                error: message,
            });
            this.store.appendMetricEvent({
                eventType: "interaction_state_transition",
                interactionId: interaction.id,
                traceId: interaction.id,
                from,
                to: "rejected",
                reason: "interaction_auto_reply_failed",
                status: "rejected",
                source: "x3_worker",
                errorClass: "auto_reply_failed",
                backlog: this.store.getInteractionStats().pending,
                payload: JSON.stringify({
                    source: "x3_responder",
                    score: evaluation.score,
                    reason: evaluation.reason,
                    error: message,
                }),
            });
            return {
                interaction: updated,
                route: "auto",
                reportTask: null,
            };
        }
    }
}
