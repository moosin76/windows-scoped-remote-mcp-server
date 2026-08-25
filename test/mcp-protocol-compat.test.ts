import { describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";

import { loadConfig } from "../src/config.js";
import { FileService } from "../src/file-service.js";
import { createWsrMcpHandler, startHttpServer } from "../src/http-server.js";
import { ProcessManager } from "../src/process-manager.js";
import { ProviderRegistry } from "../src/providers/provider-registry.js";
import { SandboxGuard } from "../src/sandbox.js";
import { WorkspaceManager } from "../src/workspace.js";

const MODERN_PROTOCOL_VERSION = "2026-07-28";
const LEGACY_PROTOCOL_VERSION = "2025-11-25";

function createDependencies() {
  const workspaceRoot = process.cwd();
  const config = loadConfig(
    {
      MCP_ALLOW_NO_AUTH: "true",
      MCP_OAUTH_ENABLED: "false",
      MCP_WORKSPACE_ROOT: workspaceRoot,
    },
    workspaceRoot,
  );
  const workspaceManager = new WorkspaceManager(config.workspaceRoots);
  const sandbox = new SandboxGuard(workspaceManager);
  const fileService = new FileService({
    sandbox,
    maxChunkBytes: config.maxFileChunkBytes,
    maxEditFileBytes: config.maxEditFileBytes,
    maxOutputBytes: config.maxOutputBytes,
  });
  const processManager = new ProcessManager({
    maxProcesses: config.maxProcesses,
    maxRetainedOutputBytes: config.maxRetainedProcessOutputBytes,
    processRetentionMs: config.processRetentionMs,
    defaultMaxOutputBytes: config.maxOutputBytes,
  });

  return {
    config,
    processManager,
    fileService,
    workspaceManager,
    providerRegistry: new ProviderRegistry(),
  };
}

function createHandler() {
  const dependencies = createDependencies();
  return createWsrMcpHandler(
    dependencies.config,
    dependencies.processManager,
    dependencies.fileService,
    dependencies.workspaceManager,
    undefined,
    dependencies.providerRegistry,
  );
}

function request(
  body: Record<string, unknown>,
  protocolVersion?: string,
  name?: string,
  url = "http://localhost:12000/mcp",
): Request {
  const headers = new Headers({
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
  });
  if (protocolVersion) headers.set("MCP-Protocol-Version", protocolVersion);
  if (protocolVersion === MODERN_PROTOCOL_VERSION) {
    headers.set("Mcp-Method", String(body.method));
    if (name) headers.set("Mcp-Name", name);
  }
  return new Request(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function modernParams(
  params: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...params,
    _meta: {
      "io.modelcontextprotocol/protocolVersion": MODERN_PROTOCOL_VERSION,
      "io.modelcontextprotocol/clientInfo": {
        name: "wsr-protocol-test",
        version: "1.0.0",
      },
      "io.modelcontextprotocol/clientCapabilities": {},
    },
  };
}

async function jsonRpcBody(response: Response): Promise<any> {
  const text = await response.text();
  if (response.headers.get("content-type")?.includes("text/event-stream")) {
    const data = text
      .split(/\r?\n/)
      .find((line) => line.startsWith("data: "))
      ?.slice("data: ".length);
    if (!data) throw new Error(`Missing JSON-RPC data event: ${text}`);
    return JSON.parse(data);
  }
  return JSON.parse(text);
}

describe("WSR MCP protocol compatibility", () => {
  it("serves server/discover, tools/list, and tools/call for 2026-07-28", async () => {
    const handler = createHandler();
    try {
      const discoverResponse = await handler.fetch(
        request(
          {
            jsonrpc: "2.0",
            id: "discover-1",
            method: "server/discover",
            params: modernParams(),
          },
          MODERN_PROTOCOL_VERSION,
        ),
      );
      expect(discoverResponse.status).toBe(200);
      const discover = await jsonRpcBody(discoverResponse);
      expect(discover.result.supportedVersions).toContain(
        MODERN_PROTOCOL_VERSION,
      );
      expect(discover.result.capabilities.tools).toBeDefined();
      expect(
        discover.result._meta["io.modelcontextprotocol/serverInfo"].name,
      ).toBe("windows-scoped-remote-mcp");

      const listResponse = await handler.fetch(
        request(
          {
            jsonrpc: "2.0",
            id: "list-1",
            method: "tools/list",
            params: modernParams(),
          },
          MODERN_PROTOCOL_VERSION,
        ),
      );
      expect(listResponse.status).toBe(200);
      const list = await jsonRpcBody(listResponse);
      expect(
        list.result.tools.some(
          (tool: any) => tool.name === "mcp_provider_status",
        ),
      ).toBe(true);
      const applyPatchTool = list.result.tools.find(
        (tool: any) => tool.name === "apply_patch",
      );
      expect(applyPatchTool?.outputSchema?.properties?.success).toBeDefined();
      expect(applyPatchTool?.outputSchema?.properties?.output).toBeDefined();

      const statResponse = await handler.fetch(
        request(
          {
            jsonrpc: "2.0",
            id: "stat-1",
            method: "tools/call",
            params: modernParams({
              name: "stat_path",
              arguments: { path: "package.json" },
            }),
          },
          MODERN_PROTOCOL_VERSION,
          "stat_path",
        ),
      );
      expect(statResponse.status).toBe(200);
      const statCall = await jsonRpcBody(statResponse);
      expect(statCall.result.structuredContent.exists).toBe(true);
      expect(statCall.result.structuredContent.relativePath).toBe("package.json");

      const callResponse = await handler.fetch(
        request(
          {
            jsonrpc: "2.0",
            id: "call-1",
            method: "tools/call",
            params: modernParams({
              name: "mcp_provider_status",
              arguments: {},
            }),
          },
          MODERN_PROTOCOL_VERSION,
          "mcp_provider_status",
        ),
      );
      expect(callResponse.status).toBe(200);
      const call = await jsonRpcBody(callResponse);
      expect(call.result.content[0].text).toBe("[]");
    } finally {
      await handler.close();
    }
  });

  it("keeps the 2025 initialize flow and tool calls working", async () => {
    const handler = createHandler();
    try {
      const initializeResponse = await handler.fetch(
        request({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: LEGACY_PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: { name: "wsr-legacy-test", version: "1.0.0" },
          },
        }),
      );
      expect(initializeResponse.status).toBe(200);
      const initialize = await jsonRpcBody(initializeResponse);
      expect(initialize.result.protocolVersion).toBe(LEGACY_PROTOCOL_VERSION);

      const initializedResponse = await handler.fetch(
        request(
          {
            jsonrpc: "2.0",
            method: "notifications/initialized",
            params: {},
          },
          LEGACY_PROTOCOL_VERSION,
        ),
      );
      expect(initializedResponse.status).toBe(202);

      const listResponse = await handler.fetch(
        request(
          {
            jsonrpc: "2.0",
            id: 2,
            method: "tools/list",
            params: {},
          },
          LEGACY_PROTOCOL_VERSION,
        ),
      );
      expect(listResponse.status).toBe(200);
      const list = await jsonRpcBody(listResponse);
      expect(
        list.result.tools.some(
          (tool: any) => tool.name === "mcp_provider_status",
        ),
      ).toBe(true);

      const callResponse = await handler.fetch(
        request(
          {
            jsonrpc: "2.0",
            id: 3,
            method: "tools/call",
            params: { name: "mcp_provider_status", arguments: {} },
          },
          LEGACY_PROTOCOL_VERSION,
        ),
      );
      expect(callResponse.status).toBe(200);
      const call = await jsonRpcBody(callResponse);
      expect(call.result.content[0].text).toBe("[]");
    } finally {
      await handler.close();
    }
  });

  it("serves both eras through Express/Node with OAuth metadata and bearer auth intact", async () => {
    const dependencies = createDependencies();
    dependencies.config.host = "127.0.0.1";
    dependencies.config.port = 0;
    dependencies.config.allowNoAuth = false;
    dependencies.config.authToken = "wsr-test-token";

    const running = await startHttpServer(
      dependencies.config,
      dependencies.processManager,
      dependencies.fileService,
      dependencies.workspaceManager,
      undefined,
      dependencies.providerRegistry,
    );
    try {
      const address = running.httpServer.address() as AddressInfo;
      const baseUrl = `http://127.0.0.1:${address.port}`;

      const unauthorized = await fetch(
        request(
          {
            jsonrpc: "2.0",
            id: "unauthorized",
            method: "server/discover",
            params: modernParams(),
          },
          MODERN_PROTOCOL_VERSION,
          undefined,
          `${baseUrl}/mcp`,
        ),
      );
      expect(unauthorized.status).toBe(401);

      const discoverRequest = request(
        {
          jsonrpc: "2.0",
          id: "http-discover",
          method: "server/discover",
          params: modernParams(),
        },
        MODERN_PROTOCOL_VERSION,
        undefined,
        `${baseUrl}/mcp`,
      );
      discoverRequest.headers.set("authorization", "Bearer wsr-test-token");
      const discover = await fetch(discoverRequest);
      expect(discover.status).toBe(200);
      expect((await jsonRpcBody(discover)).result.supportedVersions).toContain(
        MODERN_PROTOCOL_VERSION,
      );

      const initializeRequest = request(
        {
          jsonrpc: "2.0",
          id: "http-initialize",
          method: "initialize",
          params: {
            protocolVersion: LEGACY_PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: { name: "wsr-http-test", version: "1.0.0" },
          },
        },
        undefined,
        undefined,
        `${baseUrl}/mcp`,
      );
      initializeRequest.headers.set("authorization", "Bearer wsr-test-token");
      const initialize = await fetch(initializeRequest);
      expect(initialize.status).toBe(200);
      expect((await jsonRpcBody(initialize)).result.protocolVersion).toBe(
        LEGACY_PROTOCOL_VERSION,
      );

      const requestInit = {
        headers: { authorization: "Bearer wsr-test-token" },
      } satisfies RequestInit;
      const modernClient = new Client(
        { name: "wsr-modern-sdk-test", version: "1.0.0" },
        { versionNegotiation: { mode: { pin: MODERN_PROTOCOL_VERSION } } },
      );
      const legacyClient = new Client({
        name: "wsr-legacy-sdk-test",
        version: "1.0.0",
      });
      try {
        await modernClient.connect(
          new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
            requestInit,
          }),
        );
        expect(modernClient.getProtocolEra()).toBe("modern");
        expect(
          (await modernClient.listTools()).tools.some(
            (tool) => tool.name === "mcp_provider_status",
          ),
        ).toBe(true);
        expect(
          (
            await modernClient.callTool({
              name: "mcp_provider_status",
              arguments: {},
            })
          ).isError,
        ).not.toBe(true);

        await legacyClient.connect(
          new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
            requestInit,
          }),
        );
        expect(legacyClient.getProtocolEra()).toBe("legacy");
        expect(
          (await legacyClient.listTools()).tools.some(
            (tool) => tool.name === "mcp_provider_status",
          ),
        ).toBe(true);
        expect(
          (
            await legacyClient.callTool({
              name: "mcp_provider_status",
              arguments: {},
            })
          ).isError,
        ).not.toBe(true);
      } finally {
        await modernClient.close().catch(() => undefined);
        await legacyClient.close().catch(() => undefined);
      }

      const protectedResource = await fetch(
        `${baseUrl}/.well-known/oauth-protected-resource/mcp`,
      );
      expect(protectedResource.status).toBe(200);
      expect(
        (await protectedResource.json()).authorization_servers,
      ).toHaveLength(1);

      const authorizationServer = await fetch(
        `${baseUrl}/.well-known/oauth-authorization-server`,
      );
      expect(authorizationServer.status).toBe(200);
      expect((await authorizationServer.json()).token_endpoint).toBeDefined();
    } finally {
      await running.close();
    }
  });
});
