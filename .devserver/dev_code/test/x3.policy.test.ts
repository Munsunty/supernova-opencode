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
});
