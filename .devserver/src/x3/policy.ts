export type AutoReplyFallback = "auto" | "user";
export type AutoReplyStrategy =
    | "route_only"
    | "score_only"
    | "route_and_score"
    | "route_or_score";

export interface AutoReplyPolicy {
    threshold: number;
    fallback: AutoReplyFallback;
    auto_reply_strategy: AutoReplyStrategy;
}

export interface AutoReplyPolicyParseResult {
    policy: AutoReplyPolicy;
    warnings: string[];
}

export const DEFAULT_AUTO_REPLY_POLICY: AutoReplyPolicy = {
    threshold: 6,
    fallback: "user",
    auto_reply_strategy: "route_and_score",
};

const ALLOWED_STRATEGIES = new Set<AutoReplyStrategy>([
    "route_only",
    "score_only",
    "route_and_score",
    "route_or_score",
]);

const ALLOWED_FALLBACKS = new Set<AutoReplyFallback>([
    "auto",
    "user",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toText(value: unknown): string | null {
    return typeof value === "string" && value.trim().length > 0
        ? value.trim()
        : null;
}

function toNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function coerceThreshold(raw: unknown, warnings: string[]): number {
    const value = toNumber(raw) ?? Number.NaN;
    if (!Number.isFinite(value)) {
        warnings.push(
            `auto_reply_policy.threshold is invalid; using default ${DEFAULT_AUTO_REPLY_POLICY.threshold}`,
        );
        return DEFAULT_AUTO_REPLY_POLICY.threshold;
    }

    if (value < 0) {
        warnings.push(
            "auto_reply_policy.threshold is below 0; clamped to 0",
        );
        return 0;
    }
    if (value > 10) {
        warnings.push(
            "auto_reply_policy.threshold is above 10; clamped to 10",
        );
        return 10;
    }

    return value;
}

function coerceFallback(raw: unknown, warnings: string[]): AutoReplyFallback {
    const candidate = toText(raw)?.toLowerCase() as AutoReplyFallback | null;
    if (candidate && ALLOWED_FALLBACKS.has(candidate)) return candidate;
    warnings.push(
        `auto_reply_policy.fallback is invalid; using default ${DEFAULT_AUTO_REPLY_POLICY.fallback}`,
    );
    return DEFAULT_AUTO_REPLY_POLICY.fallback;
}

function coerceStrategy(
    raw: unknown,
    warnings: string[],
): AutoReplyStrategy {
    const candidate = toText(raw)?.toLowerCase() as AutoReplyStrategy | null;
    if (candidate && ALLOWED_STRATEGIES.has(candidate)) return candidate;
    warnings.push(
        `auto_reply_policy.auto_reply_strategy is unknown; using default ${DEFAULT_AUTO_REPLY_POLICY.auto_reply_strategy}`,
    );
    return DEFAULT_AUTO_REPLY_POLICY.auto_reply_strategy;
}

export function parseAutoReplyPolicy(
    rawPolicy: unknown,
): AutoReplyPolicyParseResult {
    const input = isRecord(rawPolicy) ? rawPolicy : {};
    const warnings: string[] = [];

    return {
        policy: {
            threshold: coerceThreshold(input.threshold, warnings),
            fallback: coerceFallback(input.fallback, warnings),
            auto_reply_strategy: coerceStrategy(input.auto_reply_strategy, warnings),
        },
        warnings,
    };
}

export interface AutoReplyDecisionInput {
    score: number;
    route: "auto" | "user";
    policy: AutoReplyPolicy;
}

export interface AutoReplyDecision {
    decision: "auto" | "user";
    strategy: AutoReplyStrategy;
    routeFactor: boolean;
    scoreFactor: boolean;
}

export function decideAutoReply({
    score,
    route,
    policy,
}: AutoReplyDecisionInput): AutoReplyDecision {
    const scoreFactor = Number.isFinite(score) ? score <= policy.threshold : false;
    const routeFactor = route === "auto";

    let decision: "auto" | "user";
    switch (policy.auto_reply_strategy) {
        case "route_only":
            decision = routeFactor ? "auto" : "user";
            break;
        case "score_only":
            decision = scoreFactor ? "auto" : "user";
            break;
        case "route_or_score":
            decision = routeFactor || scoreFactor ? "auto" : "user";
            break;
        case "route_and_score":
        default:
            decision = routeFactor && scoreFactor ? "auto" : "user";
            break;
    }

    if (decision === "auto") {
        return { decision, strategy: policy.auto_reply_strategy, routeFactor, scoreFactor };
    }

    if (!Number.isFinite(score)) {
        return {
            decision: policy.fallback,
            strategy: policy.auto_reply_strategy,
            routeFactor,
            scoreFactor,
        };
    }

    return { decision, strategy: policy.auto_reply_strategy, routeFactor, scoreFactor };
}
