import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import { createProviderRegistry } from "../src/providers/provider-factory.js";

function baseEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    MCP_WORKSPACE_ROOT: process.cwd(),
    MCP_ALLOW_NO_AUTH: "true",
    MCP_OAUTH_ENABLED: "false",
    MCP_GODOT_ENABLED: "false",
    MCP_BLENDER_ENABLED: "false",
    MCP_POSTGRESQL_ENABLED: "false",
    MCP_WINDOWS_ENABLED: "false",
  };
}

describe("Windows Computer Use MCP Provider config", () => {
  it("uses a narrow desktop automation allowlist by default", () => {
    const env = baseEnv();
    env.MCP_WINDOWS_ENABLED = "true";
    env.MCP_WINDOWS_COMMAND = "uvx-test";
    delete env.MCP_WINDOWS_TOOLS;

    const config = loadConfig(env, process.cwd());

    expect(config.windowsMcpEnabled).toBe(true);
    expect(config.windowsMcpCommand).toBe("uvx-test");
    expect(config.windowsMcpTools).toEqual([
      "DisplayInventory",
      "Snapshot",
      "Screenshot",
      "Click",
      "Type",
      "Scroll",
      "Move",
      "Shortcut",
      "Wait",
      "WaitFor",
      "MultiSelect",
      "MultiEdit",
      "Clipboard",
    ]);
    expect(config.windowsMcpTools).not.toContain("PowerShell");
    expect(config.windowsMcpTools).not.toContain("FileSystem");
    expect(config.windowsMcpTools).not.toContain("Process");
    expect(config.windowsMcpTools).not.toContain("Registry");
    expect(config.windowsMcpTools).not.toContain("App");
  });

  it("registers Windows-MCP as an isolated windows namespace provider", () => {
    const env = baseEnv();
    env.MCP_WINDOWS_ENABLED = "true";
    env.MCP_WINDOWS_COMMAND = "uvx-test";
    env.MCP_WINDOWS_TOOLS = "Screenshot,Click";

    const config = loadConfig(env, process.cwd());
    const registry = createProviderRegistry(config);

    expect(registry.list().map(({ id, namespace }) => ({ id, namespace }))).toEqual([
      { id: "windows", namespace: "windows" },
    ]);
    expect(config.windowsMcpTools).toEqual(["Screenshot", "Click"]);
  });
});
