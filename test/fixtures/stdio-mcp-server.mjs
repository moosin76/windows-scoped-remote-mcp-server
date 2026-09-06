import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  { name: "wsr-stdio-test-server", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "ping",
      description: "Return the provided value",
      inputSchema: {
        type: "object",
        properties: { value: { type: "string" } },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => ({
  content: [
    {
      type: "text",
      text: String(request.params.arguments?.value ?? "pong"),
    },
  ],
}));

await server.connect(new StdioServerTransport());
