import { createTaskAckNotifierFromEnv } from "../channels/task-ack";
import { createLogger } from "../utils/logging";
import { Store } from "../x2/store";
import { enqueueTelegramUpdate } from "./telegram";

interface TelegramWebhookOptions {
  dbPath?: string;
  host?: string;
  port?: number;
  path?: string;
  source?: string;
  taskSource?: string;
  secret?: string;
}

interface TelegramWebhookResult {
  ok: true | false;
  action:
    | "enqueued"
    | "duplicate"
    | "invalid"
    | "parse_error"
    | "unauthorized"
    | "unavailable";
  eventId: string;
  source: string;
  reason?: string;
  taskId?: string;
}

const logger = createLogger("X1.Webhook");

function normalizePath(path?: string): string {
  if (!path || path.trim().length === 0) return "/webhook";
  const normalized = path.trim();
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i++) {
    mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return mismatch === 0;
}

function toJson<T>(value: T, status = 200): Response {
  return Response.json(value, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

export function createTelegramWebhookHandler(
  store: Store,
  options: TelegramWebhookOptions = {},
): (req: Request) => Promise<Response> {
  const path = normalizePath(options.path);
  const source = options.source ?? "x1_telegram";
  const taskSource = options.taskSource ?? "x1_telegram";
  const fallbackSecret =
    options.secret ??
    process.env.X1_WEBHOOK_SECRET ??
    process.env.TELEGRAM_WEBHOOK_SECRET ??
    null;
  const taskAckNotifier = createTaskAckNotifierFromEnv();

  return async function handleTelegramWebhook(req: Request): Promise<Response> {
    const requestPath = new URL(req.url).pathname;

    if (requestPath === "/health" && req.method === "GET") {
      return toJson({
        ok: true,
        status: "ok",
        source,
        path,
        ready: true,
      });
    }

    if (requestPath !== path) {
      return toJson(
        {
          ok: false,
          action: "unavailable",
          eventId: "",
          source,
          reason: `Not Found: ${path}`,
        },
        404,
      );
    }

    if (req.method !== "POST") {
      return toJson(
        {
          ok: false,
          action: "unavailable",
          eventId: "",
          source,
          reason: `Method not allowed: ${req.method}`,
        },
        405,
      );
    }

    if (fallbackSecret) {
      const header = req.headers.get("x-telegram-bot-api-secret-token");
      if (!header || !constantTimeEqual(header, fallbackSecret)) {
        return toJson(
          {
            ok: false,
            action: "unauthorized",
            eventId: "",
            source,
            reason: "Invalid webhook secret",
          },
          401,
        );
      }
    }

    let payload: unknown;
    try {
      payload = await req.json();
    } catch {
      return toJson(
        {
          ok: false,
          action: "parse_error",
          eventId: "",
          source,
          reason: "Invalid JSON payload",
        },
        400,
      );
    }

    try {
      const result = enqueueTelegramUpdate(store, payload, {
        source,
        taskSource,
      });
      if (result.action === "enqueued" && result.taskId) {
        void taskAckNotifier
          .notifyQueued({
            taskId: result.taskId,
            taskSource: result.taskSource ?? taskSource,
            pendingCount: result.pendingCount ?? 0,
            runningCount: result.runningCount ?? 0,
            chatId: result.chatId ?? null,
            replyToMessageId: result.messageId ?? null,
          })
          .then(() => {
            logger.info("x1_webhook_enqueue_ack_sent", {
              eventId: result.eventId,
              taskId: result.taskId,
              source: result.taskSource ?? taskSource,
            });
          })
          .catch((error) => {
            const message =
              error instanceof Error ? error.message : String(error);
            logger.error("x1_webhook_enqueue_ack_failed", {
              eventId: result.eventId,
              taskId: result.taskId,
              source: result.taskSource ?? taskSource,
              error: message,
            });
          });
      }
      const body: TelegramWebhookResult = {
        ok: true,
        action: result.action,
        eventId: result.eventId,
        source,
        reason: result.reason,
        taskId: result.taskId,
      };
      return toJson(body);
    } catch (error) {
      return toJson(
        {
          ok: false,
          action: "unavailable",
          eventId: "",
          source,
          reason: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  };
}

export function createTelegramWebhookServer(
  options: TelegramWebhookOptions = {},
): {
  server: ReturnType<typeof Bun.serve>;
  close: () => void;
} {
  const host = options.host ?? "0.0.0.0";
  const port = options.port ?? 5100;
  const store = new Store(options.dbPath ?? process.env.X2_DB_PATH);

  const server = Bun.serve({
    hostname: host,
    port,
    fetch: createTelegramWebhookHandler(store, options),
  });

  return {
    server,
    close() {
      server.stop();
      store.close();
    },
  };
}
