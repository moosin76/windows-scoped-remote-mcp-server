import { describe, expect, it, vi } from "vitest";
import type { Tool } from "@modelcontextprotocol/server";
import { ProviderRegistry } from "../src/providers/provider-registry.js";
import {
  registerProviderCallTool,
  registerProviderCatalogTool,
  registerProviderStatusTool,
  registerProviderTools,
} from "../src/providers/provider-tools.js";
import type { McpProvider } from "../src/providers/mcp-provider.js";

type Registered = {
  name: string;
  config: Record<string, unknown>;
  callback: (args: Record<string, unknown>) => Promise<any>;
};

function fakeProvider(tool: Tool) {
  const callTool = vi.fn(async () => ({
    content: [{ type: "text" as const, text: "ok" }],
  }));

  const provider: McpProvider = {
    id: "fake",
    namespace: "fake",
    connect: async () => undefined,
    close: async () => undefined,
    isConnected: () => true,
    listTools: async () => [tool],
    callTool,
    namespacedToolName: (name) => `fake_${name}`,
    remoteToolName: (name) => name.slice("fake_".length),
  };

  return { provider, callTool };
}

function fakeServer(registered: Registered[]) {
  return {
    registerTool(
      name: string,
      config: Record<string, unknown>,
      callback: Registered["callback"],
    ) {
      registered.push({ name, config, callback });
      return {};
    },
  };
}

describe("registerProviderTools", () => {
  it("converts JSON Schema and registers a searchable namespaced proxy", async () => {
    const tool: Tool = {
      name: "echo",
      description: "Echo a message",
      inputSchema: {
        type: "object",
        properties: { message: { type: "string", minLength: 1 } },
        required: ["message"],
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: { echoed: { type: "string" } },
        required: ["echoed"],
        additionalProperties: false,
      },
    };
    const { provider, callTool } = fakeProvider(tool);
    const registry = new ProviderRegistry();
    registry.add(provider);
    const tools = await registry.refresh("fake");

    const registered: Registered[] = [];
    const server = fakeServer(registered);

    registerProviderTools(server as never, registry, tools);

    expect(registered).toHaveLength(1);
    expect(registered[0].name).toBe("fake_echo");
    expect(registered[0].config.description).toBe(
      "[MCP Provider: fake] Echo a message",
    );
    expect(registered[0].config.inputSchema).toBeTruthy();
    expect(
      (registered[0].config.inputSchema as { message?: { _zod?: unknown } })
        .message?._zod,
    ).toBeTruthy();
    expect(registered[0].config.outputSchema).toBeTruthy();
    expect(
      (registered[0].config.outputSchema as { echoed?: { _zod?: unknown } })
        .echoed?._zod,
    ).toBeTruthy();

    await registered[0].callback({ message: "hello" });
    expect(callTool).toHaveBeenCalledWith("echo", { message: "hello" });
  });

  it("supports tools without an input schema or description", async () => {
    const tool: Tool = { name: "ping", inputSchema: { type: "object" } };
    const { provider } = fakeProvider(tool);
    const registry = new ProviderRegistry();
    registry.add(provider);
    const tools = await registry.refresh("fake");

    const registered: Registered[] = [];
    const server = fakeServer(registered);

    registerProviderTools(server as never, registry, tools);
    expect(registered).toHaveLength(1);
    expect(registered[0].name).toBe("fake_ping");
    expect(registered[0].config.description).toContain("MCP Provider: fake");
    expect(registered[0].config.description).toContain("ping");
  });
});

describe("provider discovery fallback tools", () => {
  it("uses mcp_provider_status as a stable control-plane fallback", async () => {
    const { provider, callTool } = fakeProvider({
      name: "Snapshot",
      description: "Inspect the desktop",
      inputSchema: { type: "object" },
    });
    const registry = new ProviderRegistry();
    registry.add(provider);
    await registry.refresh("fake");

    const registered: Registered[] = [];
    registerProviderStatusTool(fakeServer(registered) as never, registry);

    expect(registered).toHaveLength(1);
    expect(registered[0].name).toBe("mcp_provider_status");
    expect(registered[0].config.description).toContain("control-plane fallback");
    expect(registered[0].config.description).toContain("catalog");
    expect(registered[0].config.description).toContain("call");

    const status = await registered[0].callback({});
    expect(status.structuredContent.providers[0]).toMatchObject({
      id: "fake",
      connected: true,
      toolCount: 1,
    });
    expect(status.structuredContent.providers[0].tools).toEqual([
      {
        name: "fake_Snapshot",
        remoteName: "Snapshot",
      },
    ]);

    const catalog = await registered[0].callback({ op: "catalog" });
    expect(catalog.structuredContent.providers[0].tools).toEqual([
      {
        name: "fake_Snapshot",
        remoteName: "Snapshot",
        description: "Inspect the desktop",
      },
    ]);

    const called = await registered[0].callback({
      op: "call",
      tool: "fake_Snapshot",
      arguments: { display: 0 },
    });
    expect(called).toMatchObject({
      content: [{ type: "text", text: "ok" }],
      structuredContent: {
        providerId: "fake",
        tool: "fake_Snapshot",
        result: null,
      },
    });
    expect(callTool).toHaveBeenCalledWith("Snapshot", { display: 0 });

    const rejected = await registered[0].callback({
      op: "call",
      tool: "fake_HiddenPowerShell",
      arguments: {},
    });
    expect(rejected.isError).toBe(true);
    expect(rejected.content[0].text).toContain("not in the discovered/allowed");
    expect(callTool).toHaveBeenCalledTimes(1);
  });

  it("catalogs discovered provider tools with names and descriptions", async () => {
    const { provider } = fakeProvider({
      name: "Snapshot",
      description: "Inspect the desktop",
      inputSchema: { type: "object" },
    });
    const registry = new ProviderRegistry();
    registry.add(provider);
    await registry.refresh("fake");

    const registered: Registered[] = [];
    registerProviderCatalogTool(fakeServer(registered) as never, registry);

    expect(registered).toHaveLength(1);
    expect(registered[0].name).toBe("mcp_provider_catalog");
    const result = await registered[0].callback({});
    expect(result.structuredContent.providers[0]).toMatchObject({
      id: "fake",
      connected: true,
      toolCount: 1,
    });
    expect(result.structuredContent.providers[0].tools).toEqual([
      {
        name: "fake_Snapshot",
        remoteName: "Snapshot",
        description: "Inspect the desktop",
      },
    ]);
  });

  it("calls only a tool present in the discovered snapshot", async () => {
    const { provider, callTool } = fakeProvider({
      name: "Snapshot",
      inputSchema: { type: "object" },
    });
    const registry = new ProviderRegistry();
    registry.add(provider);
    await registry.refresh("fake");

    const registered: Registered[] = [];
    registerProviderCallTool(fakeServer(registered) as never, registry);

    const result = await registered[0].callback({
      tool: "fake_Snapshot",
      arguments: { display: 0 },
    });
    expect(result).toMatchObject({
      content: [{ type: "text", text: "ok" }],
      structuredContent: { providerId: "fake", tool: "fake_Snapshot" },
    });
    expect(callTool).toHaveBeenCalledWith("Snapshot", { display: 0 });

    const rejected = await registered[0].callback({
      tool: "fake_HiddenPowerShell",
      arguments: {},
    });
    expect(rejected.isError).toBe(true);
    expect(rejected.content[0].text).toContain("not in the discovered/allowed");
    expect(callTool).toHaveBeenCalledTimes(1);
  });
});
