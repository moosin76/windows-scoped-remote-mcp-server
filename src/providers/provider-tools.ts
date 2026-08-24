import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { jsonSchemaObjectToZodRawShape } from "zod-from-json-schema";
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

  const registerTool = server.registerTool.bind(server) as any;
  registerTool(
    tool.name,
    {
      ...(tool.description ? { description: tool.description } : {}),
      inputSchema: zodShape,
      ...(tool.annotations ? { annotations: tool.annotations } : {}),
    },
    async (args: Record<string, unknown>) => {
      const { provider, remoteName } = registry.resolve(tool.name);
      return provider.callTool(remoteName, args);
    },
  );
}
