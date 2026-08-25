import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Server as HttpServer } from "node:http";
import {
  createMcpHandler,
  type McpHttpHandler,
} from "@modelcontextprotocol/server";
import {
  createOAuthMetadata,
  mcpAuthRouter,
} from "@modelcontextprotocol/server-legacy/auth";
import type { AuthRouterOptions } from "@modelcontextprotocol/server-legacy/auth";
import { toNodeHandler } from "@modelcontextprotocol/node";
import express, { type Request, type Response } from "express";

import { createAuthMiddleware } from "./auth.js";
import type { AppConfig } from "./config.js";
import { errorMessage } from "./errors.js";
import { FileService } from "./file-service.js";
import { createMcpServer } from "./mcp-server.js";
import { ProcessManager } from "./process-manager.js";
import { RemoteDevOAuthProvider, OAUTH_SCOPES } from "./oauth.js";
import { generateOpenApiSpec, generateAiPluginManifest } from "./openapi.js";
import { WorkspaceManager } from "./workspace.js";
import { SandboxGuard } from "./sandbox.js";
import type { BrowserManager } from "./browser-manager.js";
import type { ProviderRegistry } from "./providers/provider-registry.js";

export interface RunningHttpServer {
  httpServer: HttpServer;
  close: () => Promise<void>;
}

interface LegacyMcpSession {
  transport: StreamableHTTPServerTransport;
  server: Awaited<ReturnType<typeof createMcpServer>>;
  workspaceManager: WorkspaceManager;
}

interface ModernMcpSession {
  handler: McpHttpHandler;
  handleRequest: ReturnType<typeof toNodeHandler>;
  workspaceManager: WorkspaceManager;
}

function rpcError(response: Response, status: number, message: string): void {
  response.status(status).json({
    jsonrpc: "2.0",
    error: { code: -32000, message },
    id: null,
  });
}

export function createWsrMcpHandler(
  config: AppConfig,
  processManager: ProcessManager,
  fileService: FileService,
  workspaceManager?: WorkspaceManager,
  browserManager?: BrowserManager,
  providerRegistry?: ProviderRegistry,
): McpHttpHandler {
  return createMcpHandler(
    () =>
      createMcpServer(
        config,
        processManager,
        fileService,
        workspaceManager,
        browserManager,
        providerRegistry,
      ),
    {
      legacy: "stateless",
      onerror: (error) => {
        console.error("[MCP Handler Error]", errorMessage(error));
      },
    },
  );
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

  const legacySessions = new Map<string, LegacyMcpSession>();
  const modernSessions = new Map<string, ModernMcpSession>();

  const createSessionServices = async () => {
    const sessionWorkspaceManager = workspaceManager?.fork();
    if (!sessionWorkspaceManager) {
      return {
        server: await createMcpServer(
          config,
          processManager,
          fileService,
          undefined,
          browserManager,
          providerRegistry,
        ),
        workspaceManager: undefined,
      };
    }

    const sessionSandbox = new SandboxGuard(sessionWorkspaceManager);
    const sessionFileService = new FileService({
      sandbox: sessionSandbox,
      maxChunkBytes: config.maxFileChunkBytes,
      maxEditFileBytes: config.maxEditFileBytes,
      maxOutputBytes: config.maxOutputBytes,
    });

    // Browser navigation remains shared so the persistent login profile and
    // visible browser behavior do not change. File/exec/workspace tools use
    // the session-scoped sandbox and workspace manager.
    const sessionBrowserManager = browserManager?.fork(sessionSandbox);
    const server = await createMcpServer(
      config,
      processManager,
      sessionFileService,
      sessionWorkspaceManager,
      sessionBrowserManager,
      providerRegistry,
    );
    return { server, workspaceManager: sessionWorkspaceManager };
  };

  const getModernSession = (openAiSessionId: string): ModernMcpSession | undefined => {
    const existing = modernSessions.get(openAiSessionId);
    if (existing) return existing;
    if (!workspaceManager) return undefined;

    const sessionWorkspaceManager = workspaceManager.fork();
    const sessionSandbox = new SandboxGuard(sessionWorkspaceManager);
    const sessionFileService = new FileService({
      sandbox: sessionSandbox,
      maxChunkBytes: config.maxFileChunkBytes,
      maxEditFileBytes: config.maxEditFileBytes,
      maxOutputBytes: config.maxOutputBytes,
    });
    const sessionBrowserManager = browserManager?.fork(sessionSandbox);
    const handler = createWsrMcpHandler(
      config,
      processManager,
      sessionFileService,
      sessionWorkspaceManager,
      sessionBrowserManager,
      providerRegistry,
    );
    const handleRequest = toNodeHandler(handler, {
      onerror: (error) => {
        console.error("[MCP Adapter Error]", errorMessage(error));
      },
    });
    const session = { handler, handleRequest, workspaceManager: sessionWorkspaceManager };
    modernSessions.set(openAiSessionId, session);
    console.log(
      `[MCP Modern Session] Initialized workspace=${sessionWorkspaceManager.getActiveWorkspace().name}`,
    );
    return session;
  };

  // CORS and Accept headers normalizer
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Mcp-Method, Mcp-Name, Accept",
    );
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    // Normalize Accept header for clients that omit text/event-stream
    if (req.path === config.endpoint) {
      const existing = req.headers.accept || "";
      if (!existing.includes("text/event-stream")) {
        req.headers.accept = existing
          ? `${existing}, text/event-stream`
          : "application/json, text/event-stream, */*";
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

  app.post(
    ["/api/list-directory", "/api/list_directory"],
    express.json(),
    async (req, res) => {
      try {
        const p = req.body?.path || ".";
        const recursive = !!req.body?.recursive;
        const result = await fileService.listDirectory(p, { recursive });
        res.json(result);
      } catch (e) {
        res.status(500).json({ error: errorMessage(e) });
      }
    },
  );

  app.get(["/api/read-file", "/api/read_file"], async (req, res) => {
    try {
      const p = req.query.path as string;
      if (!p) {
        res
          .status(400)
          .json({ error: "Missing required 'path' query parameter" });
        return;
      }
      const result = await fileService.readFile(p);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: errorMessage(e) });
    }
  });

  app.post(
    ["/api/read-file", "/api/read_file"],
    express.json(),
    async (req, res) => {
      try {
        const p = req.body?.path;
        if (!p) {
          res.status(400).json({ error: "Missing required 'path' in body" });
          return;
        }
        const result = await fileService.readFile(p, {
          offset: req.body.offset,
          maxBytes: req.body.maxBytes,
        });
        res.json(result);
      } catch (e) {
        res.status(500).json({ error: errorMessage(e) });
      }
    },
  );

  app.post(
    ["/api/write-file", "/api/write_file"],
    express.json(),
    async (req, res) => {
      try {
        const { path: p, content, mode } = req.body || {};
        if (!p || content === undefined) {
          res
            .status(400)
            .json({ error: "Missing required 'path' or 'content'" });
          return;
        }
        const result = await fileService.writeFile(p, content, { mode });
        res.json(result);
      } catch (e) {
        res.status(500).json({ error: errorMessage(e) });
      }
    },
  );

  app.post(
    ["/api/exec", "/api/exec_command"],
    express.json(),
    async (req, res) => {
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
        const readRes = await processManager.read(sessionId, {
          waitMs: timeoutMs || 30000,
        });
        res.json(readRes);
      } catch (e) {
        res.status(500).json({ error: errorMessage(e) });
      }
    },
  );

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
  const mcpHandler = createWsrMcpHandler(
    config,
    processManager,
    fileService,
    workspaceManager,
    browserManager,
    providerRegistry,
  );
  const handleModernMcpRequest = toNodeHandler(mcpHandler, {
    onerror: (error) => {
      console.error("[MCP Adapter Error]", errorMessage(error));
    },
  });

  // Health check endpoint
  app.get("/health", (_req, res) => {
    const defaultWorkspace = workspaceManager?.getActiveWorkspace() || {
      name: "default",
      path: config.workspaceRoot,
    };
    res.json({
      status: "ok",
      name: "windows-scoped-remote-mcp",
      version: "1.0.0",
      // Keep the old field for health endpoint compatibility. This is now the
      // server default, while each MCP session owns an independent selection.
      activeWorkspace: defaultWorkspace,
      defaultWorkspace,
      activeMcpSessions: legacySessions.size + modernSessions.size,
      legacyMcpSessions: legacySessions.size,
      modernMcpSessions: modernSessions.size,
      allWorkspaces: workspaceManager?.getAllWorkspaces() || [
        { name: "default", path: config.workspaceRoot, isActive: true },
      ],
      defaultShell: config.defaultShell,
      activeProcesses: processManager.list().length,
      authRequired: !config.allowNoAuth || !!config.authToken,
    });
  });

  // MCP Streamable HTTP endpoint (POST /mcp).
  // 2025-era clients use a stateful transport so each MCP connection owns an
  // independent WorkspaceManager fork. Modern protocol traffic keeps using
  // the v2 handler.
  app.post(
    config.endpoint,
    parseJson,
    authenticate,
    async (req: Request, res: Response) => {
      const rpcMethodName = req.body?.method || "unknown";
      const toolName = req.body?.params?.name || "";
      const sessionId = req.header("mcp-session-id") || undefined;
      const requestedProtocol =
        req.header("mcp-protocol-version") || req.body?.params?.protocolVersion || "";
      const isLegacyProtocol = !requestedProtocol.startsWith("2026-");

      console.log(
        `[MCP Inbound] Method: ${rpcMethodName} ${toolName ? `(${toolName})` : ""} from ${req.ip}${sessionId ? ` session=${sessionId}` : ""}`,
      );

      const openAiSessionId = req.header("x-openai-session") || undefined;
      console.log(
        `[MCP Diagnostic] protocol=${requestedProtocol || "unknown"} openaiSession=${openAiSessionId ? "present" : "absent"}`,
      );
      res.once("finish", () => {
        console.log(
          `[MCP Outbound] Status: ${res.statusCode} for ${rpcMethodName}`,
        );
      });

      try {
        if (isLegacyProtocol) {
          let session = sessionId ? legacySessions.get(sessionId) : undefined;

          if (!session && !sessionId && isInitializeRequest(req.body)) {
            const services = await createSessionServices();
            let transport!: StreamableHTTPServerTransport;
            transport = new StreamableHTTPServerTransport({
              sessionIdGenerator: () => randomUUID(),
              onsessioninitialized: (newSessionId) => {
                if (!services.workspaceManager) return;
                legacySessions.set(newSessionId, {
                  transport,
                  server: services.server,
                  workspaceManager: services.workspaceManager,
                });
                console.log(
                  `[MCP Session] Initialized ${newSessionId} workspace=${services.workspaceManager.getActiveWorkspace().name}`,
                );
              },
            });
            transport.onclose = () => {
              const sid = transport.sessionId;
              if (sid) {
                legacySessions.delete(sid);
                console.log(`[MCP Session] Closed ${sid}`);
              }
            };
            await services.server.connect(transport);
            await transport.handleRequest(req, res, req.body);
            return;
          }

          if (!session) {
            rpcError(res, 400, "Bad Request: No valid MCP session ID provided");
            return;
          }

          await session.transport.handleRequest(req, res, req.body);
          return;
        }

        if (openAiSessionId) {
          const modernSession = getModernSession(openAiSessionId);
          if (modernSession) {
            await modernSession.handleRequest(req, res, req.body);
            return;
          }
        }

        await handleModernMcpRequest(req, res, req.body);
      } catch (err) {
        console.error("[MCP Handler Error]", errorMessage(err));
        if (!res.headersSent) {
          rpcError(res, 500, `Internal MCP server error: ${errorMessage(err)}`);
        }
      }
    },
  );

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
          for (const session of legacySessions.values()) {
            await session.transport.close().catch(() => {});
            await session.server.close().catch(() => {});
          }
          legacySessions.clear();
          for (const session of modernSessions.values()) {
            await session.handler.close().catch(() => {});
          }
          modernSessions.clear();
          await mcpHandler.close();
        },
      });
    });

    httpServer.on("error", reject);
  });
}
