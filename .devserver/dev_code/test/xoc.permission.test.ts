import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

function loadConfig() {
    const raw = readFileSync(".devserver/opencode.json", "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
}

describe("X_oc sandbox policy", () => {
    test("denies .devserver access", () => {
        const config = loadConfig();
        const permission = config.permission as Record<string, Record<string, string>>;

        expect(permission.read?.[".devserver/**"]).toBe("deny");
        expect(permission.edit?.[".devserver/**"]).toBe("deny");
        expect(permission.glob?.[".devserver/**"]).toBe("deny");
        expect(permission.grep?.[".devserver/**"]).toBe("deny");
        expect(permission.list?.[".devserver/**"]).toBe("deny");
        expect(permission.bash?.["*.devserver*"]).toBe("deny");
    });
});
