import { describe, expect, test } from "bun:test";
import {
    DEFAULT_AUTO_REPLY_POLICY,
    decideAutoReply,
    parseAutoReplyPolicy,
} from "../../src/x3/policy";

describe("X3 auto-reply policy", () => {
    test("normalizes invalid strategy to default and records warning", () => {
        const parsed = parseAutoReplyPolicy({
            auto_reply_strategy: "unknown_strategy",
            fallback: "auto",
            threshold: 3,
        });

        expect(parsed.policy.auto_reply_strategy).toBe(
            DEFAULT_AUTO_REPLY_POLICY.auto_reply_strategy,
        );
        expect(parsed.warnings).toHaveLength(1);
        expect(parsed.warnings[0]).toContain("unknown");
    });

    test("uses threshold boundary in route and score decision", () => {
        const policy = parseAutoReplyPolicy({
            auto_reply_strategy: "route_and_score",
            threshold: 6,
            fallback: "user",
        }).policy;

        const low = decideAutoReply({
            score: 6,
            route: "auto",
            policy,
        });
        expect(low.decision).toBe("auto");

        const high = decideAutoReply({
            score: 7,
            route: "auto",
            policy,
        });
        expect(high.decision).toBe("user");
    });

    test("falls back when route is user but score allows fallback policy", () => {
        const policy = parseAutoReplyPolicy({
            auto_reply_strategy: "score_only",
            threshold: 8,
            fallback: "user",
        }).policy;

        const decision = decideAutoReply({
            score: 7,
            route: "user",
            policy,
        });

        expect(decision.decision).toBe("auto");
        expect(decision.strategy).toBe("score_only");
    });

    test("clamps threshold below 0/above 10 and records warning", () => {
        const lower = parseAutoReplyPolicy({ threshold: -5 });
        const upper = parseAutoReplyPolicy({ threshold: 20 });

        expect(lower.policy.threshold).toBe(0);
        expect(lower.warnings.length).toBeGreaterThanOrEqual(1);
        expect(lower.warnings[0]).toContain("below 0");

        expect(upper.policy.threshold).toBe(10);
        expect(upper.warnings.length).toBeGreaterThanOrEqual(1);
        expect(upper.warnings[0]).toContain("above 10");
    });

    test("route_only ignores score and follows route factor", () => {
        const policy = parseAutoReplyPolicy({
            auto_reply_strategy: "route_only",
            threshold: 1,
            fallback: "user",
        }).policy;

        const decisionAuto = decideAutoReply({
            score: 100,
            route: "auto",
            policy,
        });
        const decisionUser = decideAutoReply({
            score: 1,
            route: "user",
            policy,
        });

        expect(decisionAuto.decision).toBe("auto");
        expect(decisionUser.decision).toBe("user");
    });

    test("route_and_score with non-finite score falls back to policy fallback", () => {
        const policy = parseAutoReplyPolicy({
            auto_reply_strategy: "route_and_score",
            threshold: 6,
            fallback: "user",
        }).policy;

        const decision = decideAutoReply({
            score: Number.NaN,
            route: "user",
            policy,
        });

        expect(decision.decision).toBe("user");
        expect(decision.routeFactor).toBe(false);
        expect(decision.scoreFactor).toBe(false);
    });
});
