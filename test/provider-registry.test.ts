import { describe, expect, it } from "vitest";
import { ProviderRegistry } from "../src/providers/provider-registry.js";
import type { McpProvider } from "../src/providers/mcp-provider.js";
import type { Tool } from "@modelcontextprotocol/server";

function fakeProvider(
  id: string,
  namespace: string,
  tools: string[],
): McpProvider & {
  connect: () => Promise<void>;
  isConnected: () => boolean;
  lastError?: string;
} {
  const toolList: Tool[] = tools.map((name) => ({
    name,
    description: `${name} test tool`,
    inputSchema: { type: "object" },
  }));
  return {
    id,
    namespace,
    connect: async () => undefined,
    close: async () => undefined,
    isConnected: () => true,
    listTools: async () => toolList,
    callTool: async () => ({ content: [{ type: "text", text: "ok" }] }),
    namespacedToolName: (name) => `${namespace}_${name}`,
    remoteToolName: (name) => {
      const prefix = `${namespace}_`;
      if (!name.startsWith(prefix)) throw new Error("wrong provider");
      return name.slice(prefix.length);
    },
  };
}

describe("ProviderRegistry", () => {
  it("discovers namespaced tools", async () => {
    const registry = new ProviderRegistry();
    registry.add(fakeProvider("godot", "godot", ["get_scene", "run_project"]));
    const tools = await registry.listTools();
    expect(tools.map((item) => item.tool.name)).toEqual([
      "godot_get_scene",
      "godot_run_project",
    ]);
    expect(tools[0]?.remoteName).toBe("get_scene");
  });

  it("rejects duplicate ids and namespaces", () => {
    const registry = new ProviderRegistry();
    registry.add(fakeProvider("godot", "godot", ["get_scene"]));
    expect(() => registry.add(fakeProvider("godot", "other", []))).toThrow(
      "already registered",
    );
    expect(() => registry.add(fakeProvider("blender", "godot", []))).toThrow(
      "namespace",
    );
  });

  it("keeps the registry usable when a provider is unavailable", async () => {
    const registry = new ProviderRegistry();
    const unavailable = fakeProvider("godot", "godot", []);
    unavailable.connect = async () => {
      throw new Error("ECONNREFUSED");
    };
    unavailable.isConnected = () => false;
    unavailable.lastError = undefined;
    registry.add(unavailable);

    await expect(registry.connectAll()).resolves.toBeUndefined();
    expect(registry.listStatuses()).toEqual([
      {
        id: "godot",
        namespace: "godot",
        connected: false,
        toolCount: 0,
      },
    ]);
  });

  it("rediscovers a provider that becomes available later", async () => {
    const registry = new ProviderRegistry();
    const provider = fakeProvider("godot", "godot", ["get_scene"]);
    let connected = false;
    provider.connect = async () => {
      connected = true;
    };
    provider.isConnected = () => connected;
    registry.add(provider);

    await registry.discoverAvailable();
    expect(registry.listCachedTools()).toHaveLength(1);
    expect(registry.listCachedTools()[0]?.tool.name).toBe("godot_get_scene");
  });
  it("resolves a namespaced call to its provider", () => {
    const registry = new ProviderRegistry();
    registry.add(fakeProvider("godot", "godot", ["get_scene"]));
    const resolved = registry.resolve("godot_get_scene");
    expect(resolved.provider.id).toBe("godot");
    expect(resolved.remoteName).toBe("get_scene");
  });
});
