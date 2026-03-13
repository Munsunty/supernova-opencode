import { createLogger } from "../utils/logging";
import { createProjectOverview, createSessionDetail, enqueueWebTask } from "./summary";
import { getProjectOrThrow, loadProjectRegistry } from "./registry";
import type { RegisteredProject } from "./types";

const logger = createLogger("ControlPlane");
const PUBLIC_DIR = new URL("./public/", import.meta.url);

interface ServerOptions {
    host: string;
    port: number;
    checkOnly: boolean;
}

function parseArgs(argv: string[]): ServerOptions {
    const options: ServerOptions = {
        host: process.env.CONTROL_PLANE_HOST?.trim() || "127.0.0.1",
        port: Number(process.env.CONTROL_PLANE_PORT ?? 4310),
        checkOnly: false,
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const next = argv[i + 1];
        switch (arg) {
            case "--host":
                if (!next) throw new Error("--host requires a value");
                options.host = next;
                i++;
                break;
            case "--port":
                if (!next) throw new Error("--port requires a value");
                options.port = Number(next);
                i++;
                break;
            case "--check":
                options.checkOnly = true;
                break;
            case "--help":
                printHelp();
                process.exit(0);
            default:
                throw new Error(`Unknown argument: ${arg}`);
        }
    }

    if (!Number.isFinite(options.port) || options.port < 1) {
        throw new Error("--port must be a positive number");
    }

    return options;
}

function printHelp() {
    console.log(`Usage:
  bun run .devserver/src/control-plane/server.ts [options]

Options:
  --host <host>     Bind host (default: 127.0.0.1)
  --port <port>     Bind port (default: 4310)
  --check           Validate registry and print loaded projects
  --help            Show this help
`);
}

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data, null, 2), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
        },
    });
}

function text(message: string, status = 200): Response {
    return new Response(message, {
        status,
        headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
        },
    });
}

function corsHeaders(): Record<string, string> {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };
}

function withCors(response: Response): Response {
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders())) {
        headers.set(key, value);
    }
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}

function parseProjectId(pathname: string): string | null {
    const match = pathname.match(/^\/api\/projects\/([^/]+)/);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function parseSessionId(pathname: string): string | null {
    const match = pathname.match(/^\/api\/projects\/[^/]+\/sessions\/([^/]+)/);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function staticResponse(pathname: string): Response {
    const target =
        pathname === "/"
            ? new URL("./public/index.html", import.meta.url)
            : new URL(`.${pathname}`, PUBLIC_DIR);
    return new Response(Bun.file(target));
}

function projectListView(projects: RegisteredProject[]) {
    return projects.map((project) => ({
        id: project.id,
        name: project.name,
        rootDir: project.rootDir,
        opencodeBaseUrl: project.opencodeBaseUrl,
        dashboardUrl: project.dashboardUrl,
        tags: project.tags,
    }));
}

async function routeApi(
    request: Request,
    projects: RegisteredProject[],
    registrySource: string,
): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (request.method === "OPTIONS") {
        return withCors(new Response(null, { status: 204 }));
    }

    if (pathname === "/api/health") {
        return withCors(
            json({
                ok: true,
                registrySource,
                projectCount: projects.length,
                now: Date.now(),
            }),
        );
    }

    if (pathname === "/api/projects" && request.method === "GET") {
        return withCors(json({ projects: projectListView(projects) }));
    }

    const projectId = parseProjectId(pathname);
    if (!projectId) {
        return withCors(json({ error: "Not found" }, 404));
    }

    const project = getProjectOrThrow(projects, projectId);

    if (pathname === `/api/projects/${encodeURIComponent(project.id)}/overview`) {
        const overview = await createProjectOverview(project);
        return withCors(json(overview));
    }

    if (pathname === `/api/projects/${encodeURIComponent(project.id)}/sessions` && request.method === "GET") {
        const overview = await createProjectOverview(project);
        return withCors(json({ sessions: overview.sessions.recent }));
    }

    if (
        pathname === `/api/projects/${encodeURIComponent(project.id)}/channels/web/tasks` &&
        request.method === "POST"
    ) {
        const body = (await request.json().catch(() => ({}))) as {
            prompt?: unknown;
            threadId?: unknown;
            type?: unknown;
        };
        const created = enqueueWebTask(project, {
            prompt: typeof body.prompt === "string" ? body.prompt : "",
            threadId: typeof body.threadId === "string" ? body.threadId : null,
            type: body.type === "report" ? "report" : "omo_request",
        });
        return withCors(json({ ok: true, created }, 201));
    }

    const sessionId = parseSessionId(pathname);
    if (sessionId && request.method === "GET") {
        const detail = await createSessionDetail(project, sessionId);
        return withCors(json(detail));
    }

    return withCors(json({ error: "Not found" }, 404));
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const registry = loadProjectRegistry();

    if (options.checkOnly) {
        console.log(
            JSON.stringify(
                {
                    ok: true,
                    registrySource: registry.source,
                    projects: projectListView(registry.projects),
                },
                null,
                2,
            ),
        );
        return;
    }

    Bun.serve({
        hostname: options.host,
        port: options.port,
        fetch: async (request) => {
            const url = new URL(request.url);
            try {
                if (url.pathname.startsWith("/api/")) {
                    return await routeApi(
                        request,
                        registry.projects,
                        registry.source,
                    );
                }

                if (
                    url.pathname === "/" ||
                    url.pathname === "/styles.css" ||
                    url.pathname === "/app.js"
                ) {
                    return staticResponse(url.pathname);
                }

                return text("Not found", 404);
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error);
                logger.error("request_failed", {
                    path: url.pathname,
                    error: message,
                });
                return withCors(json({ error: message }, 500));
            }
        },
    });

    logger.info("server_started", {
        host: options.host,
        port: options.port,
        projects: registry.projects.length,
        registrySource: registry.source,
    });
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("startup_failed", { error: message });
    process.exit(1);
});
