import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ProjectRegistryEntry, RegisteredProject } from "./types";

const DEFAULT_PROJECTS_FILE = resolve(
  new URL("../../control-plane/projects.json", import.meta.url).pathname,
);

function toText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => toText(item))
    .filter((item): item is string => item !== null);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeProject(
  value: unknown,
  index: number,
): RegisteredProject | null {
  if (!isRecord(value)) return null;

  const id = toText(value.id) ?? `project-${index + 1}`;
  const name = toText(value.name) ?? id;
  const rootDir = toText(value.rootDir);
  const opencodeBaseUrl = toText(value.opencodeBaseUrl);
  const stateDbPath = toText(value.stateDbPath);

  if (!rootDir || !opencodeBaseUrl || !stateDbPath) {
    return null;
  }

  return {
    id,
    name,
    rootDir,
    opencodeBaseUrl,
    stateDbPath,
    dashboardUrl: toText(value.dashboardUrl),
    tags: toStringArray(value.tags),
    enabled: value.enabled !== false,
  };
}

function defaultProject(): RegisteredProject {
  const rootDir = resolve(new URL("../../../", import.meta.url).pathname);
  const opencodeBaseUrl =
    toText(process.env.CONTROL_PLANE_OPENCODE_BASE_URL) ??
    toText(process.env.X_OC_PODMAN_X1_DIRECT_BASE_URL) ??
    toText(process.env.OPENCODE_BASE_URL) ??
    "http://127.0.0.1:4996";
  return {
    id: "local",
    name: "Local Devserver",
    rootDir,
    opencodeBaseUrl,
    stateDbPath: (
      process.env.X2_DB_PATH ?? resolve(rootDir, ".devserver/data/state.db")
    ).trim(),
    dashboardUrl: toText(process.env.OPENCODE_DASHBOARD_URL) ?? null,
    tags: ["default"],
    enabled: true,
  };
}

export function loadProjectRegistry(): {
  projects: RegisteredProject[];
  source: string;
} {
  const configuredPath =
    toText(process.env.CONTROL_PLANE_PROJECTS_FILE) ?? DEFAULT_PROJECTS_FILE;

  if (!existsSync(configuredPath)) {
    return {
      projects: [defaultProject()],
      source: "default",
    };
  }

  const raw = readFileSync(configuredPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const root = isRecord(parsed) ? parsed : {};
  const list = Array.isArray(root.projects) ? root.projects : [];
  const projects = list
    .map((item, index) => normalizeProject(item, index))
    .filter((item): item is RegisteredProject => item !== null)
    .filter((item) => item.enabled);

  return {
    projects: projects.length > 0 ? projects : [defaultProject()],
    source: configuredPath,
  };
}

export function getProjectOrThrow(
  projects: RegisteredProject[],
  id: string,
): RegisteredProject {
  const project = projects.find((item) => item.id === id);
  if (!project) {
    throw new Error(`Unknown project: ${id}`);
  }
  return project;
}
