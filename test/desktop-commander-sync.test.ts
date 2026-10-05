import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "..");
const scriptPath = path.join(repoRoot, "scripts", "sync-desktop-commander-workspaces.ts");
const tempRoots: string[] = [];

function makeTempRoot() {
  const root = mkdtempSync(path.join(tmpdir(), "wsr-rdc-sync-"));
  tempRoots.push(root);
  return root;
}

function runSync(envPath: string, configPath: string) {
  return spawnSync(process.execPath, ["--import", "tsx", scriptPath, "--env", envPath, "--config", configPath], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Desktop Commander workspace sync", () => {
  test("copies existing WSR workspace roots and preserves other config", () => {
    const root = makeTempRoot();
    const workspaceA = path.join(root, "alpha");
    const workspaceB = path.join(root, "beta");
    mkdirSync(workspaceA);
    mkdirSync(workspaceB);

    const envPath = path.join(root, ".env");
    const configPath = path.join(root, "config.json");
    writeFileSync(envPath, `MCP_WORKSPACE_ROOTS=alpha:${workspaceA}, beta:${workspaceB}, duplicate:${workspaceA}\n`);
    writeFileSync(configPath, JSON.stringify({ blockedCommands: ["format"], allowedDirectories: [], keepMe: true }, null, 2));

    const result = runSync(envPath, configPath);
    expect(result.status, result.stderr || result.stdout).toBe(0);

    const config = JSON.parse(readFileSync(configPath, "utf8"));
    expect(config.allowedDirectories).toEqual([path.resolve(workspaceA), path.resolve(workspaceB)]);
    expect(config.blockedCommands).toEqual(["format"]);
    expect(config.keepMe).toBe(true);
  });

  test("loads workspace directories from MCP_WORKSPACE_FILE", () => {
    const root = makeTempRoot();
    const workspaceA = path.join(root, "alpha");
    const workspaceB = path.join(root, "beta");
    mkdirSync(workspaceA);
    mkdirSync(workspaceB);

    const envPath = path.join(root, ".env");
    const workspaceFile = path.join(root, "workspaces.local.json");
    const configPath = path.join(root, "config.json");
    writeFileSync(envPath, "MCP_WORKSPACE_FILE=workspaces.local.json\n");
    writeFileSync(
      workspaceFile,
      JSON.stringify({
        workspaces: [
          { name: "alpha", path: "./alpha" },
          { name: "beta", path: "./beta" },
        ],
      }),
    );
    writeFileSync(configPath, JSON.stringify({ allowedDirectories: [] }, null, 2));

    const result = runSync(envPath, configPath);
    expect(result.status, result.stderr || result.stdout).toBe(0);

    const config = JSON.parse(readFileSync(configPath, "utf8"));
    expect(config.allowedDirectories).toEqual([path.resolve(workspaceA), path.resolve(workspaceB)]);
  });

  test("refuses to write an empty allowlist when no workspace directory exists", () => {
    const root = makeTempRoot();
    const envPath = path.join(root, ".env");
    const configPath = path.join(root, "config.json");
    const original = { allowedDirectories: [root], keepMe: true };
    writeFileSync(envPath, `MCP_WORKSPACE_ROOTS=missing:${path.join(root, "missing")}\n`);
    writeFileSync(configPath, JSON.stringify(original, null, 2));
    const result = runSync(envPath, configPath);
    expect(result.status).not.toBe(0);
    expect(JSON.parse(readFileSync(configPath, "utf8"))).toEqual(original);
  });
});

describe("launcher integration", () => {
  test("syncs Desktop Commander before starting WSR from Git Bash", () => {
    const launcher = readFileSync(path.join(repoRoot, "start.sh"), "utf8");
    const syncIndex = launcher.indexOf("sync-desktop-commander-workspaces.ts");
    const serverIndex = launcher.indexOf("exec npx tsx src/server.ts");
    expect(syncIndex).toBeGreaterThan(-1);
    expect(serverIndex).toBeGreaterThan(syncIndex);
  });

  test("syncs Desktop Commander before starting WSR from start.bat", () => {
    const launcher = readFileSync(path.join(repoRoot, "start.bat"), "utf8");
    const syncIndex = launcher.indexOf("sync-desktop-commander-workspaces.ts");
    const serverIndex = launcher.indexOf("npx tsx src/server.ts");
    expect(syncIndex).toBeGreaterThan(-1);
    expect(serverIndex).toBeGreaterThan(syncIndex);
  });
});
