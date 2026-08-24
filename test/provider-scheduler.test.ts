import { describe, expect, it, vi } from "vitest";
import { ProviderScheduler } from "../src/providers/provider-scheduler.js";
import { ProviderRegistry } from "../src/providers/provider-registry.js";
import type { McpProvider } from "../src/providers/mcp-provider.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

function fakeProvider(): McpProvider & { connected: boolean; tools: Tool[] } {
  const provider = {
    id: "godot",
    namespace: "godot",
    connected: false,
    tools: [{ name: "get_scene", description: "scene", inputSchema: { type: "object" } }] as Tool[],
    connect: async () => { provider.connected = true; },
    close: async () => { provider.connected = false; },
    isConnected: () => provider.connected,
    listTools: async () => provider.tools,
    callTool: async () => ({ content: [{ type: "text" as const, text: "ok" }] }),
    namespacedToolName: (name: string) => `godot_${name}`,
    remoteToolName: (name: string) => name.slice("godot_".length),
  };
  return provider;
}

describe("ProviderScheduler", () => {
  it("rediscovers an unavailable provider and refreshes its tools", async () => {
    const registry = new ProviderRegistry();
    const provider = fakeProvider();
    registry.add(provider);
    const changed = vi.fn();
    const scheduler = new ProviderScheduler(registry, { onToolsChanged: changed, intervalMs: 60_000, retryIntervalMs: 60_000 });

    await scheduler.pollNow();

    expect(provider.connected).toBe(true);
    expect(registry.listCachedTools().map((tool) => tool.tool.name)).toEqual(["godot_get_scene"]);
    expect(changed).not.toHaveBeenCalled();
    await scheduler.stop();
  });

  it("detects a remote tool list change", async () => {
    const registry = new ProviderRegistry();
    const provider = fakeProvider();
    provider.connected = true;
    registry.add(provider);
    const changed = vi.fn();
    const scheduler = new ProviderScheduler(registry, { onToolsChanged: changed, intervalMs: 60_000, retryIntervalMs: 60_000 });

    await scheduler.pollNow();
    provider.tools = [...provider.tools, { name: "run_project", inputSchema: { type: "object" } }];
    await scheduler.pollNow();

    expect(registry.listCachedTools().map((tool) => tool.tool.name)).toEqual(["godot_get_scene", "godot_run_project"]);
    expect(changed).toHaveBeenCalledWith("godot");
    await scheduler.stop();
  });

  it("does not let a failed health check stop the scheduler", async () => {
    const registry = new ProviderRegistry();
    const provider = fakeProvider();
    provider.connected = true;
    provider.listTools = async () => { throw new Error("ECONNREFUSED"); };
    registry.add(provider);
    const scheduler = new ProviderScheduler(registry, { intervalMs: 60_000, retryIntervalMs: 60_000 });

    await expect(scheduler.pollNow()).resolves.toBeUndefined();
    expect(provider.connected).toBe(true);
    await scheduler.stop();
  });
});
