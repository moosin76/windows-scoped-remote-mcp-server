import { describe, expect, it, vi } from "vitest";
import type { Tool } from "@modelcontextprotocol/server";
import type { McpProvider } from "../src/providers/mcp-provider.js";
import { ProviderRegistry } from "../src/providers/provider-registry.js";
import {
  CORE_NEEDLE_TOOLS,
  registerNeedleRouteTool,
  selectNeedleToolCatalog,
} from "../src/needle/needle-tools.js";
import type { NeedleRouter } from "../src/needle/needle-router.js";

function provider(
  id: string,
  namespace: string,
  tool: Tool,
): { provider: McpProvider; callTool: ReturnType<typeof vi.fn> } {
  const callTool = vi.fn(async () => ({
    content: [{ type: "text" as const, text: "provider-called" }],
  }));
  return {
    callTool,
    provider: {
      id,
      namespace,
      connect: async () => undefined,
      close: async () => undefined,
      isConnected: () => true,
      listTools: async () => [tool],
      callTool,
      namespacedToolName: (name) => `${namespace}_${name}`,
      remoteToolName: (name) => name.slice(namespace.length + 1),
    },
  };
}

async function registryWithProviders() {
  const blender = provider("blender", "blender", {
    name: "get_scene_info",
    description: "Get Blender scene information and objects",
    inputSchema: {
      type: "object",
      properties: {
        user_prompt: { type: "string" },
      },
      required: ["user_prompt"],
      additionalProperties: false,
    },
  });
  const postgresql = provider("postgresql", "postgresql", {
    name: "list_schemas",
    description: "List PostgreSQL database schemas",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  });
  const registry = new ProviderRegistry();
  registry.add(blender.provider);
  registry.add(postgresql.provider);
  await registry.refresh("blender");
  await registry.refresh("postgresql");
  return { registry, blender, postgresql };
}

describe("Needle tool catalog", () => {
  it("keeps a stable core catalog for common WSR operations", () => {
    expect(CORE_NEEDLE_TOOLS.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "list_workspaces",
        "get_active_workspace",
        "switch_workspace",
        "workspace_context",
        "workspace_resume",
        "wsr_status",
        "exec_command",
        "read_file",
        "write_file",
        "browser_navigate",
        "mcp_provider_status",
        "mcp_provider_catalog",
        "mcp_provider_call",
      ]),
    );
  });

  it("shortlists one relevant provider from the allowlisted registry snapshot", async () => {
    const { registry } = await registryWithProviders();

    const blender = selectNeedleToolCatalog(
      "Get Blender scene information",
      "all",
      undefined,
      registry,
      64,
    );
    expect(blender.providerIds).toEqual(["blender"]);
    const blenderTool = blender.tools.find(
      (tool) => tool.name === "blender_get_scene_info",
    );
    expect(blenderTool).toBeTruthy();
    expect(
      (blenderTool?.parameters.properties as Record<string, unknown>)
        .user_prompt,
    ).toBeUndefined();
    expect(blender.tools.some((tool) => tool.name === "postgresql_list_schemas")).toBe(false);

    const postgresql = selectNeedleToolCatalog(
      "List PostgreSQL schemas",
      "all",
      undefined,
      registry,
      64,
    );
    expect(postgresql.providerIds).toEqual(["postgresql"]);
    expect(
      postgresql.tools.some((tool) => tool.name === "postgresql_list_schemas"),
    ).toBe(true);
    expect(
      postgresql.tools.some((tool) => tool.name === "blender_get_scene_info"),
    ).toBe(false);
  });

  it("honors core/provider scopes and explicit provider ids", async () => {
    const { registry } = await registryWithProviders();

    const core = selectNeedleToolCatalog(
      "Get Blender scene information",
      "core",
      undefined,
      registry,
      64,
    );
    expect(core.providerIds).toEqual([]);
    expect(core.tools.some((tool) => tool.name.startsWith("blender_"))).toBe(false);

    const explicit = selectNeedleToolCatalog(
      "Get scene information",
      "providers",
      "blender",
      registry,
      64,
    );
    expect(explicit.providerIds).toEqual(["blender"]);
    expect(explicit.tools.some((tool) => tool.name === "blender_get_scene_info")).toBe(true);

    expect(() =>
      selectNeedleToolCatalog(
        "anything",
        "providers",
        "hidden-upstream",
        registry,
        64,
      ),
    ).toThrow("Unknown MCP provider");
  });
});

describe("needle_route registration", () => {
  it("returns recommendations without executing the provider tool", async () => {
    const { registry, blender } = await registryWithProviders();
    const route = vi.fn(async () => ({
      enabled: true,
      available: true,
      catalogCount: 14,
      catalogProviderIds: ["blender"],
      confidence: 0.94,
      confidenceThreshold: 0.7,
      functionCalls: [{ name: "blender_get_scene_info", arguments: {} }],
      suppressedCalls: [],
      reasoning: null,
      recommended: true,
      escalate: false,
      latencyMs: 7,
    }));
    const fakeRouter = { route } as unknown as NeedleRouter;
    const registered: Array<{
      name: string;
      callback: (args: Record<string, unknown>) => Promise<any>;
    }> = [];
    const fakeServer = {
      registerTool(
        name: string,
        _config: Record<string, unknown>,
        callback: (args: Record<string, unknown>) => Promise<any>,
      ) {
        registered.push({ name, callback });
        return {};
      },
    };

    registerNeedleRouteTool(fakeServer as never, fakeRouter, registry, 64);

    expect(registered[0].name).toBe("needle_route");
    const result = await registered[0].callback({
      query: "Get Blender scene information",
      originalQuery: "Blender scene 정보 확인해",
      scope: "providers",
      providerId: "blender",
    });

    expect(result.structuredContent.functionCalls).toEqual([
      {
        name: "blender_get_scene_info",
        arguments: { user_prompt: "Blender scene 정보 확인해" },
      },
    ]);
    expect(route).toHaveBeenCalledTimes(1);
    expect(blender.callTool).not.toHaveBeenCalled();
  });
});
