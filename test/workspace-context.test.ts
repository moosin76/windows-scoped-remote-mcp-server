import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { collectWorkspaceContext } from "../src/workspace-context.js";
import { WorkspaceManager } from "../src/workspace.js";

const tempRoots: string[] = [];

async function makeTempWorkspace(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wsr-context-"));
  tempRoots.push(root);
  return root;
}

function initGit(root: string): void {
  execFileSync("git", ["init", root], { stdio: "ignore" });
  execFileSync("git", ["-C", root, "config", "user.name", "WSR Test"]);
  execFileSync("git", ["-C", root, "config", "user.email", "wsr@example.test"]);
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("collectWorkspaceContext", () => {
  it("collects Git state and handoff documents without switching the workspace", async () => {
    const root = await makeTempWorkspace();
    await mkdir(path.join(root, "docs", "project", "sessions"), { recursive: true });
    await mkdir(path.join(root, "docs", "project", "systems"), { recursive: true });

    await writeFile(path.join(root, "AGENTS.md"), "# Agent Rules\n", "utf8");
    await writeFile(path.join(root, "docs", "project", "roadmap.md"), "# Roadmap\nPhase 2\n", "utf8");
    const olderSession = path.join(root, "docs", "project", "sessions", "session-a.md");
    const newerSession = path.join(root, "docs", "project", "sessions", "session-b.md");
    await writeFile(olderSession, "# Session A\nold\n", "utf8");
    await writeFile(newerSession, "# Session B\nnext task\n", "utf8");
    await writeFile(
      path.join(root, "docs", "project", "systems", "feature-todo.md"),
      "# TODO\n- next\n",
      "utf8",
    );

    await utimes(olderSession, new Date("2026-08-25T00:00:00Z"), new Date("2026-08-25T00:00:00Z"));
    await utimes(newerSession, new Date("2026-08-26T00:00:00Z"), new Date("2026-08-26T00:00:00Z"));

    initGit(root);
    execFileSync("git", ["-C", root, "add", "."]);
    execFileSync("git", ["-C", root, "commit", "-m", "initial"], { stdio: "ignore" });
    await writeFile(path.join(root, "dirty.txt"), "uncommitted\n", "utf8");

    const manager = new WorkspaceManager([
      { name: "active", path: root },
      { name: "other", path: path.join(root, "other") },
    ]);

    const result = await collectWorkspaceContext(manager, {
      workspace: "active",
      recentCommits: 3,
      recentSessions: 1,
      maxDocumentBytes: 8 * 1024,
    });

    expect(result.workspace).toBe("active");
    expect(result.isActive).toBe(true);
    expect(result.git.isRepository).toBe(true);
    expect(result.git.head).toBeTruthy();
    expect(result.git.dirty).toBe(true);
    expect(result.git.status.some((line) => line.includes("dirty.txt"))).toBe(true);
    expect(result.git.recentCommits[0]?.subject).toBe("initial");
    expect(result.documents.instructions?.path).toBe("AGENTS.md");
    expect(result.documents.roadmap?.path).toBe("docs/project/roadmap.md");
    expect(result.documents.recentSessions).toHaveLength(1);
    expect(result.documents.recentSessions[0]?.path).toBe("docs/project/sessions/session-b.md");
    expect(result.documents.todos.some((document) => document.path.endsWith("feature-todo.md"))).toBe(true);
    expect(manager.getActiveWorkspace().name).toBe("active");
  });

  it("still returns project documents when the workspace is not a Git repository", async () => {
    const root = await makeTempWorkspace();
    await writeFile(path.join(root, "AGENT.md"), "# Local Instructions\n", "utf8");
    const manager = new WorkspaceManager([{ name: "plain", path: root }]);

    const result = await collectWorkspaceContext(manager);

    expect(result.git.isRepository).toBe(false);
    expect(result.git.recentCommits).toEqual([]);
    expect(result.documents.instructions?.path).toBe("AGENT.md");
  });
});
