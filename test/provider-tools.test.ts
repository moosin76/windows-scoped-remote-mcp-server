import { describe, expect, it, vi } from "vitest";
import type { Tool } from "@modelcontextprotocol/server";
import { ProviderRegistry } from "../src/providers/provider-registry.js";
import { registerProviderTools } from "../src/providers/provider-tools.js";
import type { McpProvider } from "../src/providers/mcp-provider.js";

type Registered = {
  name: string;
  config: Record<string, unknown>;
  callback: (args: Record<string, unknown>) => Promise<unknown>;
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

describe("registerProviderTools", () => {
  it("converts JSON Schema and registers a namespaced proxy", async () => {
    const tool: Tool = {
      name: "echo",
      description: "Echo a message",
      inputSchema: {
        type: "object",
        properties: { message: { type: "string", minLength: 1 } },
        required: ["message"],
        additionalProperties: false,
      },
    };
    const { provider, callTool } = fakeProvider(tool);
    const registry = new ProviderRegistry();
    registry.add(provider);
    const tools = await registry.refresh("fake");

    const registered: Registered[] = [];
    const server = {
      registerTool(
        name: string,
        config: Record<string, unknown>,
        callback: Registered["callback"],
      ) {
        registered.push({ name, config, callback });
        return {};
      },
    };

    registerProviderTools(server as never, registry, tools);

    expect(registered).toHaveLength(1);
    expect(registered[0].name).toBe("fake_echo");
    expect(registered[0].config.description).toBe("Echo a message");
    expect(registered[0].config.inputSchema).toBeTruthy();
    expect(
      (registered[0].config.inputSchema as { message?: { _zod?: unknown } })
        .message?._zod,
    ).toBeTruthy();

    await registered[0].callback({ message: "hello" });
    expect(callTool).toHaveBeenCalledWith("echo", { message: "hello" });
  });

  it("supports tools without an input schema", async () => {
    const tool: Tool = { name: "ping", inputSchema: { type: "object" } };
    const { provider } = fakeProvider(tool);
    const registry = new ProviderRegistry();
    registry.add(provider);
    const tools = await registry.refresh("fake");

    const registered: Registered[] = [];
    const server = {
      registerTool(
        name: string,
        config: Record<string, unknown>,
        callback: Registered["callback"],
      ) {
        registered.push({ name, config, callback });
        return {};
      },
    };

    registerProviderTools(server as never, registry, tools);
    expect(registered).toHaveLength(1);
    expect(registered[0].name).toBe("fake_ping");
  });
});
