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
        "Stable MCP provider control-plane fallback. With no arguments (or op='status'), show provider connection status. Use op='catalog' to list the actual discovered/allowed provider tools, or op='call' with a namespaced tool name to invoke one of those discovered tools. Use this when mcp_provider_catalog, mcp_provider_call, or a provider-specific tool is not visible in client tool discovery/search.",
      inputSchema: {
        op: z.enum(["status", "catalog", "call"]).optional(),
        tool: z.string().min(1).optional(),
        arguments: z.record(z.string(), z.unknown()).optional(),
      },
      outputSchema: z.object({
        providers: z.array(z.record(z.string(), z.unknown())).optional(),
        providerId: z.string().optional(),
        tool: z.string().optional(),
        result: z.unknown().optional(),
      }),
    },
    async ({
      op = "status",
      tool,
      arguments: args,
    }: {
      op?: "status" | "catalog" | "call";
      tool?: string;
      arguments?: Record<string, unknown>;
    }) => {
      if (op === "call") {
        if (!tool) {
          return {
            content: [
              {
                type: "text" as const,
                text: "mcp_provider_status op='call' requires a namespaced 'tool' name. Use op='catalog' first if needed.",
              },
            ],
            isError: true,
          };
        }

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
                  `Use mcp_provider_status with op='catalog' to inspect available tools. ` +
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
          return {
            ...result,
            structuredContent: {
              providerId: entry.providerId,
              tool: entry.tool.name,
              result: result.structuredContent ?? null,
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
      }

      const cachedTools = registry.listCachedTools();
      // Always include tool names, even for the no-argument status call. This
      // deliberately supports clients that cached an older input schema for
      // mcp_provider_status and therefore cannot send op='catalog'.
      const providers = registry.listStatuses().map((status) => ({
        ...status,
        tools: cachedTools
          .filter((entry) => entry.providerId === status.id)
          .map((entry) => ({
            name: entry.tool.name,
            remoteName: entry.remoteName,
            ...(op === "catalog"
              ? { description: entry.tool.description ?? "" }
              : {}),
          })),
      }));
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
