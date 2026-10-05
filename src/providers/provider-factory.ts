import { resolve } from "node:path";
import { RemoteMcpProvider } from "./mcp-provider.js";
import { ProviderRegistry } from "./provider-registry.js";
import type { AppConfig } from "../config.js";

export function createProviderRegistry(config: AppConfig): ProviderRegistry {
  const registry = new ProviderRegistry({
    snapshotCachePath: resolve(process.cwd(), ".mcp-provider-tools-cache.json"),
  });
  if (config.godotMcpEnabled) {
    registry.add(new RemoteMcpProvider({
      id: "godot",
      namespace: "godot",
      transport: "stdio",
      command: config.godotMcpCommand,
      args: [
        "--link-mode",
        "copy",
        "--from",
        `godot-ai==${config.godotMcpVersion}`,
        "godot-ai",
        "attach",
        "--port",
        String(config.godotMcpHttpPort),
        "--ws-port",
        String(config.godotMcpWsPort),
      ],
      env: {
        PYTHONUTF8: "1",
      },
      stdioStderrMode: "warnings",
      clientName: "windows-scoped-remote-mcp-gateway",
      clientVersion: "1.0.0",
    }));
  }
  if (config.blenderMcpEnabled) {
    registry.add(
      new RemoteMcpProvider({
        id: "blender",
        namespace: "blender",
        transport: "stdio",
        command: config.blenderMcpCommand,
        args: ["blender-mcp"],
        env: {
          BLENDER_HOST: config.blenderMcpHost,
          BLENDER_PORT: String(config.blenderMcpPort),
        },
        stdioStderrMode: "warnings",
        clientName: "windows-scoped-remote-mcp-gateway",
        clientVersion: "1.0.0",
      }),
    );
  }

  if (config.windowsMcpEnabled) {
    registry.add(
      new RemoteMcpProvider({
        id: "windows",
        namespace: "windows",
        transport: "stdio",
        command: config.windowsMcpCommand,
        args: [
          "windows-mcp",
          "serve",
          "--tools",
          config.windowsMcpTools.join(","),
        ],
        env: {
          PYTHONUTF8: "1",
          ANONYMIZED_TELEMETRY: "false",
          WINDOWS_MCP_DISABLE_FLASH: "1",
        },
        stdioStderrMode: "warnings",
        clientName: "windows-scoped-remote-mcp-gateway",
        clientVersion: "1.0.0",
      }),
    );
  }

  if (config.postgresqlMcpEnabled && config.postgresqlMcpUrl) {
    registry.add(new RemoteMcpProvider({
      id: "postgresql",
      namespace: "postgresql",
      url: config.postgresqlMcpUrl,
      transport: "sse",
      clientName: "windows-scoped-remote-mcp-gateway",
      clientVersion: "1.0.0",
    }));
  }
  if (config.gasMcpEnabled && config.gasMcpUrl) {
    registry.add(new RemoteMcpProvider({
      id: "gas",
      namespace: "gas",
      url: config.gasMcpUrl,
      transport: "streamable-http",
      clientName: "windows-scoped-remote-mcp-gateway",
      clientVersion: "1.0.0",
    }));
  }
  return registry;
}
