import { createLogger } from "../utils/logging";
import type { Interaction, Store } from "../x2/store";
import { InteractionEvaluator } from "./evaluator";
import type { ResponderResult } from "./responder";
import { InteractionResponder } from "./responder";

const logger = createLogger("X3.Processor");

export class InteractionProcessor {
    private store: Store;
    private evaluator: InteractionEvaluator;
    private responder: InteractionResponder;

    constructor(
        store: Store,
        evaluator: InteractionEvaluator,
        responder: InteractionResponder,
    ) {
        this.store = store;
        this.evaluator = evaluator;
        this.responder = responder;
    }

    nextPending(): Interaction | null {
        return this.store.listInteractions({ status: "pending", limit: 1 })[0] ?? null;
    }

    async processNext(): Promise<ResponderResult | null> {
        const interaction = this.nextPending();
        if (!interaction) return null;

        logger.info("interaction_processing_started", {
            interaction: interaction.id.slice(0, 8),
            type: interaction.type,
            requestId: interaction.requestId,
        });

        const evaluation = await this.evaluator.evaluate(interaction);
        const result = await this.responder.respond(interaction, evaluation);

        logger.info("interaction_processing_done", {
            interaction: interaction.id.slice(0, 8),
            route: result.route,
            status: result.interaction.status,
            reportTask: result.reportTask ? result.reportTask.id.slice(0, 8) : null,
        });

        return result;
    }
}
