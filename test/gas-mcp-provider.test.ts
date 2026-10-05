import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import { createProviderRegistry } from "../src/providers/provider-factory.js";

function baseEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    MCP_WORKSPACE_ROOTS: process.cwd(),
    MCP_ALLOW_NO_AUTH: "true",
    MCP_OAUTH_ENABLED: "false",
    MCP_GODOT_ENABLED: "false",
    MCP_BLENDER_ENABLED: "false",
    MCP_WINDOWS_ENABLED: "false",
    MCP_POSTGRESQL_ENABLED: "false",
    MCP_GAS_ENABLED: "true",
    MCP_GAS_URL: "http://127.0.0.1:52214/mcp",
  };
}

describe("Game Assets Studio MCP provider config", () => {
  it("registers GAS through Streamable HTTP with the gas namespace", () => {
    const config = loadConfig(baseEnv(), process.cwd());
    const registry = createProviderRegistry(config);
    const provider = registry.list()[0] as unknown as {
      id: string;
      namespace: string;
      transportType: string;
      url: URL;
    };

    expect(config.gasMcpEnabled).toBe(true);
    expect(config.gasMcpUrl).toBe("http://127.0.0.1:52214/mcp");
    expect(provider.id).toBe("gas");
    expect(provider.namespace).toBe("gas");
    expect(provider.transportType).toBe("streamable-http");
    expect(provider.url.href).toBe("http://127.0.0.1:52214/mcp");
  });

  it("requires a URL when the GAS provider is enabled", () => {
    const env = baseEnv();
    delete env.MCP_GAS_URL;

    expect(() => loadConfig(env, process.cwd())).toThrow(
      "MCP_GAS_URL is required when MCP_GAS_ENABLED=true",
    );
  });
});
