import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { normalizeCanonicalPath } from "./paths.js";

export interface WorkspaceItem {
  name: string;
  path: string;
  isActive: boolean;
}

export interface ParsedWorkspace {
  name: string;
  path: string;
}

/**
 * Parses workspace definitions from environment string.
 * Supports:
 * - "test:d:\Godot\mcp-test, ether:d:\Godot\ether-chronicle, server:d:\Godot\localRemoteMcp"
 * - "d:\Godot\mcp-test, d:\Godot\ether-chronicle"
 * - Semicolon or comma separators
 */
function workspaceItemsToParsed(
  items: string[],
  fallbackRoot: string,
  createMissing = true,
): ParsedWorkspace[] {
  const list: ParsedWorkspace[] = [];
  const usedNames = new Set<string>();

  for (const item of items) {
    let name: string;
    let targetPath: string;

    const colonIndex = item.indexOf(":");
    const secondColonIndex = item.indexOf(":", colonIndex + 1);

    if (colonIndex > 0 && secondColonIndex > colonIndex) {
      name = item.slice(0, colonIndex).trim();
      targetPath = item.slice(colonIndex + 1).trim();
    } else if (colonIndex > 0 && !/^[a-zA-Z]$/.test(item.slice(0, colonIndex).trim())) {
      name = item.slice(0, colonIndex).trim();
      targetPath = item.slice(colonIndex + 1).trim();
    } else {
      targetPath = item;
      const normalized = normalizeCanonicalPath(targetPath);
      name = path.basename(normalized) || "root";
    }

    const canonicalPath = normalizeCanonicalPath(targetPath);
    try {
      if (createMissing && !existsSync(canonicalPath)) {
        mkdirSync(canonicalPath, { recursive: true });
      }
    } catch {}

    let uniqueName = name;
    let counter = 1;
    while (usedNames.has(uniqueName.toLowerCase())) {
      uniqueName = `${name}-${counter++}`;
    }
    usedNames.add(uniqueName.toLowerCase());
    list.push({ name: uniqueName, path: canonicalPath });
  }

  if (list.length === 0) {
    const canonical = normalizeCanonicalPath(fallbackRoot);
    try {
      if (createMissing && !existsSync(canonical)) {
        mkdirSync(canonical, { recursive: true });
      }
    } catch {}
    list.push({
      name: path.basename(canonical) || "workspace",
      path: canonical,
    });
  }

  return list;
}

/**
 * Parses workspace definitions from the legacy environment string.
 * The first entry is the initial active workspace.
 */
export function parseWorkspaceRoots(
  rawRoots: string | undefined,
  fallbackRoot: string,
): ParsedWorkspace[] {
  const items = rawRoots && rawRoots.trim() !== ""
    ? rawRoots.split(/[,;]+/).map((value) => value.trim()).filter(Boolean)
    : [];
  return workspaceItemsToParsed(items, fallbackRoot);
}

/**
 * Loads workspaces from MCP_WORKSPACE_FILE when configured.
 * Falls back to MCP_WORKSPACE_ROOTS for backward compatibility.
 * The first configured workspace is always the initial active workspace.
 */
export function loadConfiguredWorkspaceRoots(
  env: NodeJS.ProcessEnv,
  baseDir: string,
  fallbackRoot: string,
  options: { createMissing?: boolean } = {},
): ParsedWorkspace[] {
  const createMissing = options.createMissing ?? true;
  const workspaceFile = env.MCP_WORKSPACE_FILE?.trim();
  if (!workspaceFile) {
    const items = env.MCP_WORKSPACE_ROOTS?.trim()
      ? env.MCP_WORKSPACE_ROOTS.split(/[,;]+/).map((value) => value.trim()).filter(Boolean)
      : [];
    return workspaceItemsToParsed(items, fallbackRoot, createMissing);
  }

  const filePath = path.resolve(baseDir, workspaceFile);
  if (!existsSync(filePath)) {
    throw new Error(`MCP_WORKSPACE_FILE not found: ${filePath}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(
      `MCP_WORKSPACE_FILE is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const entries = Array.isArray(parsed)
    ? parsed
    : typeof parsed === "object" && parsed !== null
      ? (parsed as { workspaces?: unknown }).workspaces
      : undefined;

  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error("MCP_WORKSPACE_FILE must contain a non-empty 'workspaces' array.");
  }

  const items = entries.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      throw new Error(`MCP_WORKSPACE_FILE workspaces[${index}] must be an object.`);
    }
    const { name, path: workspacePath } = entry as { name?: unknown; path?: unknown };
    if (typeof name !== "string" || name.trim() === "") {
      throw new Error(`MCP_WORKSPACE_FILE workspaces[${index}].name is required.`);
    }
    if (typeof workspacePath !== "string" || workspacePath.trim() === "") {
      throw new Error(`MCP_WORKSPACE_FILE workspaces[${index}].path is required.`);
    }
    const normalizedPath = path.isAbsolute(workspacePath.trim())
      ? workspacePath.trim()
      : path.resolve(path.dirname(filePath), workspacePath.trim());
    return `${name.trim()}:${normalizedPath}`;
  });

  return workspaceItemsToParsed(items, fallbackRoot, createMissing);
}

export class WorkspaceManager {
  private readonly workspaces: Map<string, string> = new Map(); // name (lower) -> path
  private readonly displayNames: Map<string, string> = new Map(); // name (lower) -> original name
  private activeName: string;

  constructor(workspaces: ParsedWorkspace[]) {
    if (workspaces.length === 0) {
      throw new Error("WorkspaceManager requires at least one workspace");
    }

    for (const ws of workspaces) {
      const lower = ws.name.toLowerCase();
      this.workspaces.set(lower, ws.path);
      this.displayNames.set(lower, ws.name);
    }

    // First workspace is active by default
    this.activeName = workspaces[0].name.toLowerCase();
  }

  /**
   * Creates an independent workspace selection context backed by the same
   * registered roots. Switching the fork never changes this manager.
   */
  fork(): WorkspaceManager {
    const workspaces: ParsedWorkspace[] = [];
    for (const [lower, wsPath] of this.workspaces.entries()) {
      workspaces.push({
        name: this.displayNames.get(lower) || lower,
        path: wsPath,
      });
    }
    const forked = new WorkspaceManager(workspaces);
    forked.activeName = this.activeName;
    return forked;
  }

  getAllWorkspaces(): WorkspaceItem[] {
    const result: WorkspaceItem[] = [];
    for (const [lower, wsPath] of this.workspaces.entries()) {
      result.push({
        name: this.displayNames.get(lower) || lower,
        path: wsPath,
        isActive: lower === this.activeName,
      });
    }
    return result;
  }

  getAllRoots(): string[] {
    return Array.from(this.workspaces.values());
  }

  getActiveWorkspace(): WorkspaceItem {
    const wsPath = this.workspaces.get(this.activeName) || Array.from(this.workspaces.values())[0];
    const name = this.displayNames.get(this.activeName) || this.activeName;
    return {
      name,
      path: wsPath,
      isActive: true,
    };
  }

  getActiveRoot(): string {
    return this.getActiveWorkspace().path;
  }

  getWorkspace(nameOrPath: string): WorkspaceItem {
    const trimmed = nameOrPath.trim();
    const lower = trimmed.toLowerCase();

    if (this.workspaces.has(lower)) {
      const wsPath = this.workspaces.get(lower)!;
      return {
        name: this.displayNames.get(lower) || lower,
        path: wsPath,
        isActive: lower === this.activeName,
      };
    }

    const normalizedTarget = normalizeCanonicalPath(trimmed);
    for (const [wsName, wsPath] of this.workspaces.entries()) {
      if (wsPath.toLowerCase() === normalizedTarget.toLowerCase()) {
        return {
          name: this.displayNames.get(wsName) || wsName,
          path: wsPath,
          isActive: wsName === this.activeName,
        };
      }
    }

    const availableNames = Array.from(this.displayNames.values()).join(", ");
    throw new Error(`Workspace '${nameOrPath}' not found. Available workspaces: ${availableNames}`);
  }

  resolveWorkspacePath(workspaceName: string, relativePath = "."): string {
    const workspace = this.getWorkspace(workspaceName);
    const resolved = path.resolve(workspace.path, relativePath);
    const root = normalizeCanonicalPath(workspace.path);
    const target = normalizeCanonicalPath(resolved);
    const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
    if (target.toLowerCase() !== root.toLowerCase() && !target.toLowerCase().startsWith(prefix.toLowerCase())) {
      throw new Error(`Path '${relativePath}' escapes workspace '${workspace.name}'.`);
    }
    return target;
  }

  switchWorkspace(nameOrPath: string): WorkspaceItem {
    const trimmed = nameOrPath.trim();
    const lower = trimmed.toLowerCase();

    // 1. Match by alias / name
    if (this.workspaces.has(lower)) {
      this.activeName = lower;
      return this.getActiveWorkspace();
    }

    // 2. Match by normalized path
    const normalizedTarget = normalizeCanonicalPath(trimmed);
    for (const [wsName, wsPath] of this.workspaces.entries()) {
      if (wsPath.toLowerCase() === normalizedTarget.toLowerCase()) {
        this.activeName = wsName;
        return this.getActiveWorkspace();
      }
    }

    const availableNames = Array.from(this.displayNames.values()).join(", ");
    throw new Error(
      `Workspace '${nameOrPath}' not found. Available workspaces: ${availableNames}`,
    );
  }

  /**
   * Resolves aliases like "@ether/src/index.ts" or "ether:src/index.ts"
   */
  resolveAlias(input: string): string {
    const trimmed = input.trim();

    // Handle @alias/path or @alias\path
    if (trimmed.startsWith("@")) {
      const slashIdx = trimmed.indexOf("/") >= 0 ? trimmed.indexOf("/") : trimmed.indexOf("\\");
      if (slashIdx > 1) {
        const alias = trimmed.slice(1, slashIdx).toLowerCase();
        const subPath = trimmed.slice(slashIdx + 1);
        const root = this.workspaces.get(alias);
        if (root) {
          return path.resolve(root, subPath);
        }
      }
    }

    // Handle alias:path (excluding Windows single-letter drive C:\, D:\)
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx > 1) {
      const alias = trimmed.slice(0, colonIdx).toLowerCase();
      const subPath = trimmed.slice(colonIdx + 1);
      const root = this.workspaces.get(alias);
      if (root) {
        return path.resolve(root, subPath);
      }
    }

    return trimmed;
  }
}
