import { existsSync, mkdirSync } from "node:fs";
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
export function parseWorkspaceRoots(
  rawRoots: string | undefined,
  fallbackRoot: string,
): ParsedWorkspace[] {
  const list: ParsedWorkspace[] = [];
  const usedNames = new Set<string>();

  if (rawRoots && rawRoots.trim() !== "") {
    // Split by comma or semicolon
    const items = rawRoots.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);

    for (const item of items) {
      let name: string;
      let targetPath: string;

      // Check for alias syntax (e.g. "alias:C:\path" or "alias:D:/path")
      // Need to distinguish "test:D:\path" vs "D:\path" (Windows drive letter)
      const colonIndex = item.indexOf(":");
      const secondColonIndex = item.indexOf(":", colonIndex + 1);

      if (colonIndex > 0 && secondColonIndex > colonIndex) {
        // Form: "alias:D:\path"
        name = item.slice(0, colonIndex).trim();
        targetPath = item.slice(colonIndex + 1).trim();
      } else if (colonIndex > 0 && !/^[a-zA-Z]$/.test(item.slice(0, colonIndex).trim())) {
        // Form: "alias:/posix/path" or "alias:relative/path"
        name = item.slice(0, colonIndex).trim();
        targetPath = item.slice(colonIndex + 1).trim();
      } else {
        // Form: "D:\path" or "/posix/path" -> derive name from directory basename
        targetPath = item;
        const normalized = normalizeCanonicalPath(targetPath);
        name = path.basename(normalized) || "root";
      }

      const canonicalPath = normalizeCanonicalPath(targetPath);
      
      // Auto create directory if not exists
      try {
        if (!existsSync(canonicalPath)) {
          mkdirSync(canonicalPath, { recursive: true });
        }
      } catch {}

      // Ensure unique name
      let uniqueName = name;
      let counter = 1;
      while (usedNames.has(uniqueName.toLowerCase())) {
        uniqueName = `${name}-${counter++}`;
      }
      usedNames.add(uniqueName.toLowerCase());

      list.push({
        name: uniqueName,
        path: canonicalPath,
      });
    }
  }

  // If list is empty, use fallback
  if (list.length === 0) {
    const canonical = normalizeCanonicalPath(fallbackRoot);
    try {
      if (!existsSync(canonical)) {
        mkdirSync(canonical, { recursive: true });
      }
    } catch {}
    const defaultName = path.basename(canonical) || "workspace";
    list.push({
      name: defaultName,
      path: canonical,
    });
  }

  return list;
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
