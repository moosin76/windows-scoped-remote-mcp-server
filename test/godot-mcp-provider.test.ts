import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import { createProviderRegistry } from "../src/providers/provider-factory.js";

function baseEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    MCP_WORKSPACE_ROOTS: process.cwd(),
    MCP_ALLOW_NO_AUTH: "true",
    MCP_OAUTH_ENABLED: "false",
    MCP_GODOT_ENABLED: "true",
    MCP_BLENDER_ENABLED: "false",
    MCP_WINDOWS_ENABLED: "false",
    MCP_POSTGRESQL_ENABLED: "false",
    MCP_GAS_ENABLED: "false",
  };
}

describe("Godot AI MCP v4.3 provider config", () => {
  it("defaults to the authenticated attach bridge ports", () => {
    const env = baseEnv();
    delete env.MCP_GODOT_COMMAND;
    delete env.MCP_GODOT_VERSION;
    delete env.MCP_GODOT_HTTP_PORT;
    delete env.MCP_GODOT_WS_PORT;
    delete env.MCP_GODOT_URL;

    const config = loadConfig(env, process.cwd());

    expect(config.godotMcpCommand).toBe("uvx");
    expect(config.godotMcpVersion).toBe("4.3.0");
    expect(config.godotMcpHttpPort).toBe(8001);
    expect(config.godotMcpWsPort).toBe(8002);
  });

  it("registers Godot through stdio godot-ai attach instead of direct HTTP", () => {
    const env = baseEnv();
    env.MCP_GODOT_COMMAND = "uvx-test";
    env.MCP_GODOT_VERSION = "4.3.0";
    env.MCP_GODOT_HTTP_PORT = "8101";
    env.MCP_GODOT_WS_PORT = "8102";

    const config = loadConfig(env, process.cwd());
    const registry = createProviderRegistry(config);
    const provider = registry.list()[0] as unknown as {
      id: string;
      namespace: string;
      transportType: string;
      command: string;
      args: string[];
    };

    expect(provider.id).toBe("godot");
    expect(provider.namespace).toBe("godot");
    expect(provider.transportType).toBe("stdio");
    expect(provider.command).toBe("uvx-test");
    expect(provider.args).toEqual([
      "--link-mode",
      "copy",
      "--from",
      "godot-ai==4.3.0",
      "godot-ai",
      "attach",
      "--port",
      "8101",
      "--ws-port",
      "8102",
    ]);
  });
});
