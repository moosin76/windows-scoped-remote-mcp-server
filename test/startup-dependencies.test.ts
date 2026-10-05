import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "..");

describe("startup dependency bootstrap", () => {
  it("bootstraps uvx before starting WSR in start.bat", () => {
    const launcher = readFileSync(path.join(repoRoot, "start.bat"), "utf8");
    const uvCheck = launcher.indexOf("where uvx");
    const uvInstaller = launcher.indexOf("https://astral.sh/uv/install.ps1");
    const serverStart = launcher.indexOf("npx tsx src/server.ts");

    expect(uvCheck).toBeGreaterThan(-1);
    expect(uvInstaller).toBeGreaterThan(uvCheck);
    expect(serverStart).toBeGreaterThan(uvInstaller);
  });

  it("bootstraps uvx before starting WSR in start.sh", () => {
    const launcher = readFileSync(path.join(repoRoot, "start.sh"), "utf8");
    const uvCheck = launcher.indexOf("command -v uvx");
    const uvInstaller = launcher.indexOf("https://astral.sh/uv/install.ps1");
    const serverStart = launcher.indexOf("exec npx tsx src/server.ts");

    expect(uvCheck).toBeGreaterThan(-1);
    expect(uvInstaller).toBeGreaterThan(uvCheck);
    expect(serverStart).toBeGreaterThan(uvInstaller);
  });

  it("keeps uvx-backed provider commands portable", () => {
    const example = readFileSync(path.join(repoRoot, ".env.example"), "utf8");

    for (const variable of [
      "MCP_GODOT_COMMAND",
      "MCP_BLENDER_COMMAND",
      "MCP_WINDOWS_COMMAND",
    ]) {
      expect(example).toContain(`${variable}=uvx`);
      expect(example).not.toMatch(
        new RegExp(`^${variable}=[A-Za-z]:[\\\\/]`, "m"),
      );
    }
  });
});
