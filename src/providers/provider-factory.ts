import { RemoteMcpProvider } from "./mcp-provider.js";
import { ProviderRegistry } from "./provider-registry.js";
import type { AppConfig } from "../config.js";

export function createProviderRegistry(config: AppConfig): ProviderRegistry {
  const registry = new ProviderRegistry();
  if (config.godotMcpEnabled) {
    registry.add(new RemoteMcpProvider({
      id: "godot",
      namespace: "godot",
      url: config.godotMcpUrl,
      clientName: "windows-scoped-remote-mcp-gateway",
      clientVersion: "1.0.0",
    }));
  }
  return registry;
}