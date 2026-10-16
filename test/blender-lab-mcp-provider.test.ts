import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { loadConfig } from "../src/config.js";
import { createProviderRegistry } from "../src/providers/provider-factory.js";

function blenderEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    MCP_WORKSPACE_ROOTS: process.cwd(),
    MCP_ALLOW_NO_AUTH: "true",
    MCP_OAUTH_ENABLED: "false",
    MCP_GODOT_ENABLED: "false",
    MCP_BLENDER_ENABLED: "true",
    MCP_WINDOWS_ENABLED: "false",
    MCP_POSTGRESQL_ENABLED: "false",
    MCP_GAS_ENABLED: "false",
  };
}

describe("Blender Lab official MCP provider", () => {
  it("defaults to official extension v1.0.3 on the Blender socket", () => {
    const env = blenderEnv();
    delete env.MCP_BLENDER_VERSION;
    delete env.MCP_BLENDER_HOST;
    delete env.MCP_BLENDER_PORT;
    delete env.MCP_BLENDER_COMMAND;

    const config = loadConfig(env, process.cwd());
    expect(config.blenderMcpCommand).toBe("uvx");
    expect(config.blenderMcpVersion).toBe("1.0.3");
    expect(config.blenderMcpHost).toBe("127.0.0.1");
    expect(config.blenderMcpPort).toBe(9876);
  });

  it("registers Blender Lab stdio with the validated Python selection", () => {
    const env = blenderEnv();
    env.MCP_BLENDER_COMMAND = "uvx-test";
    env.MCP_BLENDER_VERSION = "1.0.3";
    env.MCP_BLENDER_HOST = "localhost";
    env.MCP_BLENDER_PORT = "9988";

    const config = loadConfig(env, process.cwd());
    const registry = createProviderRegistry(config);
    const provider = registry.list()[0] as unknown as {
      id: string;
      namespace: string;
      transportType: string;
      command: string;
      args: string[];
      env: Record<string, string>;
    };

    expect(provider.id).toBe("blender");
    expect(provider.namespace).toBe("blender");
    expect(provider.transportType).toBe("stdio");
    expect(provider.command).toBe("uvx-test");
    expect(provider.args).toEqual([
      ...(JSON.parse(readFileSync(".mcp-python-selection.json", "utf8")).blender ? ["--python", JSON.parse(readFileSync(".mcp-python-selection.json", "utf8")).blender] : []),
      "--no-build-package", "pyyaml",
      "--link-mode", "copy",
      "--from", "git+https://projects.blender.org/lab/blender_mcp.git@v1.0.3#subdirectory=mcp",
      "blender-mcp",
      "--transport", "stdio",
    ]);
    expect(provider.env).toEqual({
      BLENDER_MCP_HOST: "localhost",
      BLENDER_MCP_PORT: "9988",
      ...(process.platform === "win32"
        ? { PATHEXT: process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD" }
        : {}),
    });
  });

  it("does not register Blender when disabled", () => {
    const env = blenderEnv();
    env.MCP_BLENDER_ENABLED = "false";
    const registry = createProviderRegistry(loadConfig(env, process.cwd()));
    expect(registry.list().some((provider) => provider.id === "blender")).toBe(false);
  });
});
