import { afterEach, describe, expect, test } from "bun:test";
import { createLogger } from "../.devserver/utils/logging";

const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

afterEach(() => {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
});

describe("utils/logging redaction", () => {
    test("redacts sensitive key/value fields", () => {
        const lines: string[] = [];
        console.log = ((message?: unknown) => {
            lines.push(String(message));
        }) as typeof console.log;

        const logger = createLogger("Test.Logger", "info");
        logger.info("provider_call", {
            authorization: "Bearer very-secret-token",
            apiKey: "sk-secret-value",
            token: "ghp_ABC123SECRET",
            detail: "ok",
        });

        const joined = lines.join("\n");
        expect(joined).toContain("authorization=[REDACTED]");
        expect(joined).toContain("apiKey=[REDACTED]");
        expect(joined).toContain("token=[REDACTED]");
        expect(joined).toContain("detail=ok");
        expect(joined).not.toContain("very-secret-token");
        expect(joined).not.toContain("sk-secret-value");
        expect(joined).not.toContain("ghp_ABC123SECRET");
    });

    test("redacts prompt-like payload fields as text length only", () => {
        const lines: string[] = [];
        console.log = ((message?: unknown) => {
            lines.push(String(message));
        }) as typeof console.log;

        const logger = createLogger("Test.Logger", "info");
        logger.info("eq1_payload", {
            prompt: "classify this request",
            response: "{\"action\":\"report\"}",
            output: "raw output text",
        });

        const joined = lines.join("\n");
        expect(joined).toContain("prompt=\"[REDACTED_TEXT len=21]\"");
        expect(joined).toContain("response=\"[REDACTED_TEXT len=19]\"");
        expect(joined).toContain("output=\"[REDACTED_TEXT len=15]\"");
        expect(joined).not.toContain("classify this request");
        expect(joined).not.toContain("{\"action\":\"report\"}");
        expect(joined).not.toContain("raw output text");
    });
});
