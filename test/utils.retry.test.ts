import { describe, expect, test } from "bun:test";
import { computeBackoffDelay, retryAsync } from "../.devserver/utils/retry";

describe("utils/retry", () => {
    test("computeBackoffDelay uses exponential backoff with max cap", () => {
        expect(
            computeBackoffDelay(1, {
                baseDelayMs: 100,
                maxDelayMs: 1_000,
            }),
        ).toBe(100);
        expect(
            computeBackoffDelay(3, {
                baseDelayMs: 100,
                maxDelayMs: 1_000,
            }),
        ).toBe(400);
        expect(
            computeBackoffDelay(6, {
                baseDelayMs: 100,
                maxDelayMs: 1_000,
            }),
        ).toBe(1_000);
    });

    test("retryAsync retries until success", async () => {
        let calls = 0;
        const result = await retryAsync(
            async () => {
                calls++;
                if (calls < 3) throw new Error("temporary");
                return "ok";
            },
            {
                attempts: 3,
                baseDelayMs: 0,
                maxDelayMs: 0,
                sleep: async () => {},
            },
        );

        expect(result).toBe("ok");
        expect(calls).toBe(3);
    });

    test("retryAsync stops when shouldRetry returns false", async () => {
        let calls = 0;
        await expect(
            retryAsync(
                async () => {
                    calls++;
                    throw new Error("permanent");
                },
                {
                    attempts: 5,
                    shouldRetry: () => false,
                    baseDelayMs: 0,
                    maxDelayMs: 0,
                    sleep: async () => {},
                },
            ),
        ).rejects.toThrow("permanent");

        expect(calls).toBe(1);
    });
});
