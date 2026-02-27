type LogLevel = "debug" | "info" | "warn" | "error";
type LogValue = string | number | boolean | null | undefined;
type LogFields = Record<string, LogValue>;

const LEVEL_PRIORITY: Record<LogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
};

const SENSITIVE_KEY_RE =
    /(authorization|api[_-]?key|token|secret|password|cookie|set-cookie)/i;
const SENSITIVE_VALUE_RE =
    /(bearer\s+[a-z0-9._-]+|sk-[a-z0-9_-]+|ghp_[a-z0-9]+)/i;
const PROMPTLIKE_KEY_RE =
    /(prompt|content|response|result|raw|input|output|text)/i;

function normalizeLevel(value?: string): LogLevel {
    if (!value) return "info";
    const lower = value.toLowerCase();
    if (
        lower === "debug" ||
        lower === "info" ||
        lower === "warn" ||
        lower === "error"
    ) {
        return lower;
    }
    return "info";
}

function stringifyValue(value: LogValue): string {
    if (value === null) return "null";
    if (value === undefined) return "undefined";
    if (typeof value === "string") {
        return /\s/.test(value) ? JSON.stringify(value) : value;
    }
    return String(value);
}

function redactField(key: string, value: LogValue): LogValue {
    if (value === null || value === undefined) return value;

    if (SENSITIVE_KEY_RE.test(key)) {
        return "[REDACTED]";
    }

    if (typeof value === "string") {
        if (SENSITIVE_VALUE_RE.test(value)) {
            return "[REDACTED]";
        }

        if (PROMPTLIKE_KEY_RE.test(key) && value.length > 0) {
            return `[REDACTED_TEXT len=${value.length}]`;
        }
    }

    return value;
}

function formatFields(fields?: LogFields): string {
    if (!fields) return "";
    const entries = Object.entries(fields);
    if (entries.length === 0) return "";
    return entries
        .map(
            ([key, value]) =>
                `${key}=${stringifyValue(redactField(key, value))}`,
        )
        .join(" ");
}

export interface Logger {
    debug(message: string, fields?: LogFields): void;
    info(message: string, fields?: LogFields): void;
    warn(message: string, fields?: LogFields): void;
    error(message: string, fields?: LogFields): void;
}

export function createLogger(scope: string, minLevel?: LogLevel): Logger {
    const configured = minLevel ?? normalizeLevel(process.env.LOG_LEVEL);

    const write = (level: LogLevel, message: string, fields?: LogFields) => {
        if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[configured]) return;

        const timestamp = new Date().toISOString();
        const meta = formatFields(fields);
        const line = `[${timestamp}] [${scope}] [${level.toUpperCase()}] ${message}${meta ? ` ${meta}` : ""}`;

        if (level === "error") {
            console.error(line);
            return;
        }
        if (level === "warn") {
            console.warn(line);
            return;
        }
        console.log(line);
    };

    return {
        debug: (message, fields) => write("debug", message, fields),
        info: (message, fields) => write("info", message, fields),
        warn: (message, fields) => write("warn", message, fields),
        error: (message, fields) => write("error", message, fields),
    };
}
