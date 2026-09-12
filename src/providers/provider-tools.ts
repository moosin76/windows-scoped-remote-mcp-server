import type { McpServer, Tool } from "@modelcontextprotocol/server";
import { jsonSchemaObjectToZodRawShape } from "zod-from-json-schema";
import { z } from "zod";
import type { ProviderRegistry, NamespacedTool } from "./provider-registry.js";

const EMPTY_INPUT_SCHEMA = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

/** Register a snapshot of remote-provider tools on the gateway MCP server. */
export function registerProviderTools(
  server: McpServer,
  registry: ProviderRegistry,
  tools: readonly NamespacedTool[],
): void {
  for (const entry of tools) registerProviderTool(server, registry, entry);
}

/**
 * Expose the currently discovered provider tool snapshot through one stable
 * gateway tool. This is a recovery path for MCP clients whose own tool search
 * does not surface dynamically proxied provider tools reliably.
 */
export function registerProviderCatalogTool(
  server: McpServer,
  registry: ProviderRegistry,
): void {
  server.registerTool(
    "mcp_provider_catalog",
    {
      description:
        "List the actual discovered tools exposed by optional MCP providers, including Godot, Blender, Windows-MCP desktop UI automation, and PostgreSQL. Use this when a provider-specific tool is hard to find or tool discovery/search misses it.",
      outputSchema: z.object({
        providers: z.array(z.record(z.string(), z.unknown())),
      }),
    },
    async () => {
      const tools = registry.listCachedTools();
      const providers = registry.listStatuses().map((status) => ({
        ...status,
        tools: tools
          .filter((entry) => entry.providerId === status.id)
          .map((entry) => ({
            name: entry.tool.name,
            remoteName: entry.remoteName,
            description: entry.tool.description ?? "",
          })),
      }));
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(providers, null, 2) },
        ],
        structuredContent: { providers },
      };
    },
  );
}

/**
 * Stable generic fallback for invoking an already-discovered provider tool.
 * It intentionally refuses names that are absent from the Registry snapshot,
 * so this cannot bypass provider allowlists or expose hidden upstream tools.
 */
export function registerProviderCallTool(
  server: McpServer,
  registry: ProviderRegistry,
): void {
  server.registerTool(
    "mcp_provider_call",
    {
      description:
        "Call an already-discovered MCP provider tool by its namespaced name (for example windows_Snapshot or blender_get_scene_info). Fallback for clients that cannot directly discover a dynamic provider tool. Only tools present in mcp_provider_catalog are allowed.",
      inputSchema: {
        tool: z.string().min(1),
        arguments: z.record(z.string(), z.unknown()).optional(),
      },
      outputSchema: z.record(z.string(), z.unknown()),
    },
    async ({
      tool,
      arguments: args,
    }: {
      tool: string;
      arguments?: Record<string, unknown>;
    }) => {
      const entry = registry
        .listCachedTools()
        .find((candidate) => candidate.tool.name === tool);
      if (!entry) {
        const available = registry
          .listCachedTools()
          .map((candidate) => candidate.tool.name);
        return {
          content: [
            {
              type: "text" as const,
              text:
                `Provider tool '${tool}' is not in the discovered/allowed tool snapshot. ` +
                `Use mcp_provider_catalog to inspect available tools. ` +
                `Available: ${available.join(", ")}`,
            },
          ],
          isError: true,
        };
      }

      const provider = registry.get(entry.providerId);
      if (!provider) {
        return {
          content: [
            {
              type: "text" as const,
              text: `MCP provider '${entry.providerId}' is no longer registered.`,
            },
          ],
          isError: true,
        };
      }

      try {
        const result = await provider.callTool(entry.remoteName, args ?? {});
        if (result.structuredContent) return result;
        return {
          ...result,
          structuredContent: {
            providerId: entry.providerId,
            tool: entry.tool.name,
          },
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: error instanceof Error ? error.message : String(error),
            },
          ],
          isError: true,
        };
      }
    },
  );
}

/** Always expose provider health so an unavailable optional MCP is diagnosable. */
export function registerProviderStatusTool(
  server: McpServer,
  registry: ProviderRegistry,
): void {
  server.registerTool(
    "mcp_provider_status",
    {
      description:
        "Show the connection status of configured remote MCP providers. Use this when a provider-specific tool is unavailable.",
      outputSchema: z.object({ providers: z.array(z.record(z.string(), z.unknown())) }),
    },
    async () => {
      const providers = registry.listStatuses();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(providers, null, 2) }],
        structuredContent: { providers },
      };
    },
  );
}

function registerProviderTool(
  server: McpServer,
  registry: ProviderRegistry,
  entry: NamespacedTool,
): void {
  const tool = entry.tool as Tool;
  const inputSchema = tool.inputSchema ?? EMPTY_INPUT_SCHEMA;
  const zodShape = jsonSchemaObjectToZodRawShape(
    inputSchema as Parameters<typeof jsonSchemaObjectToZodRawShape>[0],
  );
  const outputShape = tool.outputSchema
    ? jsonSchemaObjectToZodRawShape(
        tool.outputSchema as Parameters<typeof jsonSchemaObjectToZodRawShape>[0],
      )
    : undefined;

  const registerTool = server.registerTool.bind(server) as any;
  registerTool(
    tool.name,
    {
      description:
        `[MCP Provider: ${entry.providerId}] ` +
        (tool.description ??
          `Proxy tool '${entry.remoteName}' exposed by the '${entry.providerId}' MCP provider.`),
      inputSchema: zodShape,
      ...(outputShape ? { outputSchema: outputShape } : {}),
      ...(tool.annotations ? { annotations: tool.annotations } : {}),
    },
    async (args: Record<string, unknown>) => {
      const { provider, remoteName } = registry.resolve(tool.name);
      try {
        return await provider.callTool(remoteName, args);
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: error instanceof Error ? error.message : String(error),
            },
          ],
          isError: true,
        };
      }
    },
  );
}
