import { randomUUID } from "node:crypto";
import type { Server as HttpServer } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createOAuthMetadata, mcpAuthRouter, type AuthRouterOptions } from "@modelcontextprotocol/sdk/server/auth/router.js";
import express, { type Request, type Response } from "express";

import { createAuthMiddleware } from "./auth.js";
import type { AppConfig } from "./config.js";
import { errorMessage } from "./errors.js";
import { FileService } from "./file-service.js";
import { createMcpServer } from "./mcp-server.js";
import { ProcessManager } from "./process-manager.js";
import { RemoteDevOAuthProvider, OAUTH_SCOPES } from "./oauth.js";
import { generateOpenApiSpec, generateAiPluginManifest } from "./openapi.js";
import type { WorkspaceManager } from "./workspace.js";
import type { BrowserManager } from "./browser-manager.js";
import type { ProviderRegistry } from "./providers/provider-registry.js";

export interface RunningHttpServer {
  httpServer: HttpServer;
  close: () => Promise<void>;
}

function rpcError(response: Response, status: number, message: string): void {
  response.status(status).json({
    jsonrpc: "2.0",
    error: { code: -32000, message },
    id: null,
  });
}

export async function startHttpServer(
  config: AppConfig,
  processManager: ProcessManager,
  fileService: FileService,
  workspaceManager?: WorkspaceManager,
  browserManager?: BrowserManager,
  providerRegistry?: ProviderRegistry,
): Promise<RunningHttpServer> {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  // CORS and Accept headers normalizer
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Session-Id, Accept");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    // Normalize Accept header for clients that omit text/event-stream
    if (req.path === config.endpoint) {
      const existing = req.headers.accept || "";
      if (!existing.includes("text/event-stream")) {
        req.headers.accept = existing ? `${existing}, text/event-stream` : "application/json, text/event-stream, */*";
      }
    }
    next();
  });

  // OAuth 2.1 / RFC 9728 / RFC 8414 Provider for ChatGPT
  const oauthProvider = new RemoteDevOAuthProvider(config);
  const resourceUrl = oauthProvider.resourceUrl;
  const issuerUrl = oauthProvider.issuerUrl;

  // RFC 9728 Protected Resource Metadata
  const serveResourceMetadata = (_req: Request, res: Response) => {
    res.set("Access-Control-Allow-Origin", "*").json({
      resource: resourceUrl.href,
      authorization_servers: [issuerUrl.href],
      scopes_supported: [...OAUTH_SCOPES],
      bearer_methods_supported: ["header"],
      resource_name: "windows-scoped-remote-mcp",
    });
  };

  app.get("/.well-known/oauth-protected-resource", serveResourceMetadata);
  app.get("/.well-known/oauth-protected-resource/mcp", serveResourceMetadata);

  const oauthRouterOptions: AuthRouterOptions = {
    provider: oauthProvider,
    issuerUrl,
    resourceServerUrl: resourceUrl,
    scopesSupported: [...OAUTH_SCOPES],
    resourceName: "windows-scoped-remote-mcp",
  };

  const oauthMetadata = {
    ...createOAuthMetadata(oauthRouterOptions),
    revocation_endpoint_auth_methods_supported: ["client_secret_post", "none"],
  };

  app.get("/.well-known/oauth-authorization-server", (_req, res) => {
    res.set("Access-Control-Allow-Origin", "*").json(oauthMetadata);
  });

  app.use(express.urlencoded({ extended: false }));
  app.use(mcpAuthRouter(oauthRouterOptions));

  // OpenAPI and ChatGPT Plugin Manifest endpoints
  const openApiSpec = generateOpenApiSpec(config);
  const aiPluginManifest = generateAiPluginManifest(config);

  app.get("/openapi.json", (_req, res) => {
    res.set("Access-Control-Allow-Origin", "*").json(openApiSpec);
  });
  app.get("/.well-known/ai-plugin.json", (_req, res) => {
    res.set("Access-Control-Allow-Origin", "*").json(aiPluginManifest);
  });

  // REST API Endpoints for ChatGPT Actions
  app.get(["/api/list-directory", "/api/list_directory"], async (req, res) => {
    try {
      const p = (req.query.path as string) || ".";
      const recursive = req.query.recursive === "true";
      const result = await fileService.listDirectory(p, { recursive });
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: errorMessage(e) });
    }
  });

  app.post(["/api/list-directory", "/api/list_directory"], express.json(), async (req, res) => {
    try {
      const p = req.body?.path || ".";
      const recursive = !!req.body?.recursive;
      const result = await fileService.listDirectory(p, { recursive });
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: errorMessage(e) });
    }
  });

  app.get(["/api/read-file", "/api/read_file"], async (req, res) => {
    try {
      const p = req.query.path as string;
      if (!p) {
        res.status(400).json({ error: "Missing required 'path' query parameter" });
        return;
      }
      const result = await fileService.readFile(p);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: errorMessage(e) });
    }
  });

  app.post(["/api/read-file", "/api/read_file"], express.json(), async (req, res) => {
    try {
      const p = req.body?.path;
      if (!p) {
        res.status(400).json({ error: "Missing required 'path' in body" });
        return;
      }
      const result = await fileService.readFile(p, { offset: req.body.offset, maxBytes: req.body.maxBytes });
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: errorMessage(e) });
    }
  });

  app.post(["/api/write-file", "/api/write_file"], express.json(), async (req, res) => {
    try {
      const { path: p, content, mode } = req.body || {};
      if (!p || content === undefined) {
        res.status(400).json({ error: "Missing required 'path' or 'content'" });
        return;
      }
      const result = await fileService.writeFile(p, content, { mode });
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: errorMessage(e) });
    }
  });

  app.post(["/api/exec", "/api/exec_command"], express.json(), async (req, res) => {
    try {
      const { cmd, shell, cwd, timeoutMs } = req.body || {};
      if (!cmd) {
        res.status(400).json({ error: "Missing required 'cmd'" });
        return;
      }
      const isWin = process.platform === "win32";
      const selectedShell = shell || (isWin ? "powershell" : "bash");
      let executable = selectedShell;
      let args: string[] = [];
      if (selectedShell === "powershell") {
        executable = "powershell.exe";
        args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", cmd];
      } else if (selectedShell === "cmd") {
        executable = "cmd.exe";
        args = ["/c", cmd];
      } else {
        args = ["-c", cmd];
      }

      const resolvedCwd = fileService.resolve(cwd || ".");
      const sessionId = await processManager.start({
        executable,
        args,
        commandForDisplay: cmd,
        cwd: resolvedCwd,
        timeoutMs: timeoutMs || 30000,
      });
      const readRes = await processManager.read(sessionId, { waitMs: timeoutMs || 30000 });
      res.json(readRes);
    } catch (e) {
      res.status(500).json({ error: errorMessage(e) });
    }
  });

  app.get(["/api/stat", "/api/stat_path"], async (req, res) => {
    try {
      const p = req.query.path as string;
      if (!p) {
        res.status(400).json({ error: "Missing required 'path' parameter" });
        return;
      }
      const result = await fileService.statPath(p);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: errorMessage(e) });
    }
  });

  const authenticate = createAuthMiddleware(config, oauthProvider);
  const parseJson = express.json({ limit: config.maxRequestBody });

  // Health check endpoint
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      name: "windows-scoped-remote-mcp",
      version: "1.0.0",
      activeWorkspace: workspaceManager?.getActiveWorkspace() || { name: "default", path: config.workspaceRoot },
      allWorkspaces: workspaceManager?.getAllWorkspaces() || [{ name: "default", path: config.workspaceRoot, isActive: true }],
      defaultShell: config.defaultShell,
      activeProcesses: processManager.list().length,
      authRequired: !config.allowNoAuth || !!config.authToken,
    });
  });

  // MCP Streamable HTTP endpoint (POST /mcp)
  app.post(config.endpoint, parseJson, authenticate, async (req: Request, res: Response) => {
    const rpcMethodName = req.body?.method || "unknown";
    const toolName = req.body?.params?.name || "";
    console.log(`[MCP Inbound] Method: ${rpcMethodName} ${toolName ? `(${toolName})` : ""} from ${req.ip}`);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    const mcpServer = await createMcpServer(
      config,
      processManager,
      fileService,
      workspaceManager,
      browserManager,
      providerRegistry,
    );

    const closeRequest = async () => {
      await mcpServer.close().catch(() => {});
    };

    res.once("finish", () => {
      console.log(`[MCP Outbound] Status: ${res.statusCode} for ${rpcMethodName}`);
      void closeRequest();
    });
    res.once("close", () => void closeRequest());

    try {
      transport.onerror = (err) => {
        console.error("[MCP Transport Error]", errorMessage(err));
      };
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("[MCP Handler Error]", errorMessage(err));
      if (!res.headersSent) {
        rpcError(res, 500, `Internal MCP server error: ${errorMessage(err)}`);
      }
      await closeRequest();
    }
  });

  // Method not allowed on GET /mcp
  app.get(config.endpoint, (_req, res) => {
    res.set("Allow", "POST");
    rpcError(res, 405, "MCP endpoint accepts POST requests only.");
  });

  return new Promise((resolve, reject) => {
    const httpServer = app.listen(config.port, config.host, () => {
      resolve({
        httpServer,
        close: async () => {
          await new Promise<void>((res, rej) => {
            httpServer.close((err) => (err ? rej(err) : res()));
          });
        },
      });
    });

    httpServer.on("error", reject);
  });
}
