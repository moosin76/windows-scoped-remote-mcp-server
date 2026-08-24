import { realpathSync, existsSync } from "node:fs";
import path from "node:path";
import { PathForbiddenError } from "./errors.js";
import { normalizeCanonicalPath } from "./paths.js";
import { WorkspaceManager } from "./workspace.js";

export class SandboxGuard {
  readonly workspaceManager?: WorkspaceManager;
  private readonly roots: string[];

  constructor(target: string | string[] | WorkspaceManager) {
    if (target instanceof WorkspaceManager) {
      this.workspaceManager = target;
      this.roots = target.getAllRoots().map(normalizeCanonicalPath);
    } else if (Array.isArray(target)) {
      this.roots = target.map(normalizeCanonicalPath);
    } else {
      this.roots = [normalizeCanonicalPath(target)];
    }
  }

  get workspaceRoot(): string {
    if (this.workspaceManager) {
      return this.workspaceManager.getActiveRoot();
    }
    return this.roots[0] || process.cwd();
  }

  getAllRoots(): string[] {
    if (this.workspaceManager) {
      return this.workspaceManager.getAllRoots();
    }
    return [...this.roots];
  }

  /**
   * Checks if a normalized target path is inside any of the allowed workspace roots.
   */
  isInside(targetPath: string): boolean {
    const normalizedTarget = normalizeCanonicalPath(targetPath);
    const roots = this.getAllRoots();

    for (const root of roots) {
      const normalizedRoot = normalizeCanonicalPath(root);

      if (process.platform === "win32") {
        const targetLower = normalizedTarget.toLowerCase();
        const rootLower = normalizedRoot.toLowerCase();

        if (targetLower === rootLower) {
          return true;
        }
        if (targetLower.startsWith(rootLower.endsWith("\\") ? rootLower : rootLower + "\\")) {
          return true;
        }
      } else {
        if (normalizedTarget === normalizedRoot) {
          return true;
        }
        if (normalizedTarget.startsWith(normalizedRoot.endsWith("/") ? normalizedRoot : normalizedRoot + "/")) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Asserts that the target path is strictly within one of the allowed workspace roots.
   * Throws PathForbiddenError if it escapes or attempts to access outside paths.
   */
  assertInside(targetPath: string, context = "Path"): string {
    const normalized = normalizeCanonicalPath(targetPath);
    if (!this.isInside(normalized)) {
      const allowed = this.getAllRoots().join(", ");
      throw new PathForbiddenError(
        `Access Denied: ${context} "${targetPath}" is outside the allowed workspaces [${allowed}].`,
      );
    }

    // If target exists, verify realpath (to prevent symlink jailbreak)
    if (existsSync(normalized)) {
      try {
        const real = normalizeCanonicalPath(realpathSync(normalized));
        if (!this.isInside(real)) {
          const allowed = this.getAllRoots().join(", ");
          throw new PathForbiddenError(
            `Access Denied: Symlink target "${real}" points outside allowed workspaces [${allowed}].`,
          );
        }
      } catch (err) {
        if (err instanceof PathForbiddenError) {
          throw err;
        }
        // If realpath fails (e.g. permission), continue with normalized check
      }
    }

    return normalized;
  }

  /**
   * Resolves a relative or absolute path against a base inside the workspace,
   * guaranteeing the result is inside one of the allowed workspaces.
   */
  resolveSafe(input: string, baseDir?: string): string {
    let target = input;
    if (this.workspaceManager) {
      target = this.workspaceManager.resolveAlias(target);
    }

    const base = baseDir ? this.assertInside(baseDir, "Base directory") : this.workspaceRoot;
    const resolved = path.isAbsolute(target) ? path.resolve(target) : path.resolve(base, target);
    return this.assertInside(resolved, "Target path");
  }
}
