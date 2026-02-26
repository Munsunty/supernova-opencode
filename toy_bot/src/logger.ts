/**
 * Logger utility for toy_bot.
 * Outputs structured JSON logs to stdout.
 */

export interface Logger {
    info(event: string, data?: Record<string, unknown>): void;
    warn(event: string, data?: Record<string, unknown>): void;
    error(event: string, data?: Record<string, unknown>): void;
}

type LogLevel = "INFO" | "WARN" | "ERROR";

/**
 * Fields that should be redacted in logs
 * Handles case-insensitive matching and variations like api_key, api-key
 */
const SENSITIVE_FIELD_PATTERN =
    /^(token|api[_-]?key|authorization|password|secret)$/i;

/**
 * Deep redact sensitive fields from an object
 * Handles circular references gracefully
 */
function redactSensitiveFields(
    value: unknown,
    seen = new WeakMap<object, unknown>()
): unknown {
    if (value === null || value === undefined) {
        return value;
    }

    if (typeof value !== "object") {
        return value;
    }

    if (seen.has(value)) {
        return "[Circular]";
    }

    if (Array.isArray(value)) {
        seen.set(value, true);
        return value.map((item) => redactSensitiveFields(item, seen));
    }

    const obj = value as Record<string, unknown>;
    seen.set(obj, true);

    const result: Record<string, unknown> = {};

    for (const key of Object.keys(obj)) {
        const isSensitive = SENSITIVE_FIELD_PATTERN.test(key);

        if (isSensitive) {
            result[key] = "[REDACTED]";
        } else {
            result[key] = redactSensitiveFields(obj[key], seen);
        }
    }

    return result;
}

/**
 * Write a log entry to stdout as JSON
 */
function writeLog(
    name: string,
    level: LogLevel,
    event: string,
    data?: Record<string, unknown>
): void {
    const entry = {
        timestamp: new Date().toISOString(),
        level,
        name,
        event,
        data: data ? redactSensitiveFields(data) : undefined,
    };

    console.log(JSON.stringify(entry));
}

/**
 * Create a new logger instance with the given name
 */
export function createLogger(name: string): Logger {
    return {
        info: (event: string, data?: Record<string, unknown>) => {
            writeLog(name, "INFO", event, data);
        },
        warn: (event: string, data?: Record<string, unknown>) => {
            writeLog(name, "WARN", event, data);
        },
        error: (event: string, data?: Record<string, unknown>) => {
            writeLog(name, "ERROR", event, data);
        },
    };
}
