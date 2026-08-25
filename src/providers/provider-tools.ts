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
      ...(tool.description ? { description: tool.description } : {}),
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
