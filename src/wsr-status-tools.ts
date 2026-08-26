import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { AppConfig } from "./config.js";
import type { ProcessManager } from "./process-manager.js";
import type { WorkspaceManager } from "./workspace.js";
import type { BrowserManager } from "./browser-manager.js";
import type { ProviderRegistry } from "./providers/provider-registry.js";
import { runTool } from "./tool-result.js";
import { collectWsrStatus } from "./wsr-status.js";

const wsrStatusOutput = z.object({
  server: z.object({
    name: z.string(),
    version: z.string(),
    commit: z.string().nullable(),
    uptimeSeconds: z.number().int().nonnegative(),
    nodeVersion: z.string(),
    platform: z.string(),
    arch: z.string(),
  }),
  endpoint: z.object({
    host: z.string(),
    port: z.number().int(),
    mcpPath: z.string(),
    publicUrlConfigured: z.boolean(),
    publicUrl: z.string().nullable(),
    allowedHostCount: z.number().int().nonnegative(),
  }),
  auth: z.object({
    authRequired: z.boolean(),
    allowNoAuth: z.boolean(),
    oauthEnabled: z.boolean(),
    staticTokenConfigured: z.boolean(),
    approvalKeyConfigured: z.boolean(),
    cloudflareTunnelTokenConfigured: z.boolean(),
  }),
  workspace: z.object({
    active: z
      .object({
        name: z.string(),
        path: z.string(),
      })
      .nullable(),
    registeredCount: z.number().int().nonnegative(),
  }),
  browser: z.object({
    available: z.boolean(),
    headless: z.boolean().nullable(),
    initialized: z.boolean(),
    pageOpen: z.boolean(),
    pageCount: z.number().int().nonnegative(),
  }),
  providers: z.array(
    z.object({
      id: z.string(),
      namespace: z.string(),
      connected: z.boolean(),
      toolCount: z.number().int().nonnegative(),
    }),
  ),
  processes: z.object({
    retainedCount: z.number().int().nonnegative(),
    runningCount: z.number().int().nonnegative(),
  }),
  cloudflared: z.object({
    available: z.boolean(),
    binaryName: z.string().nullable(),
    version: z.string().nullable(),
  }),
  warnings: z.array(z.string()),
});

export function registerWsrStatusTool(
  server: McpServer,
  config: AppConfig,
  processManager: ProcessManager,
  workspaceManager?: WorkspaceManager,
  browserManager?: BrowserManager,
  providerRegistry?: ProviderRegistry,
): void {
  server.registerTool(
    "wsr_status",
    {
      title: "Get WSR Status",
      description:
        "Return a read-only operational summary of the WSR gateway: version/commit/uptime, endpoint and auth configuration flags, active workspace count, browser state, provider connectivity, managed process counts, and cloudflared version. Secret token/password/cookie/session values are never returned.",
      inputSchema: z.object({}),
      outputSchema: wsrStatusOutput,
    },
    async () =>
      runTool(async () =>
        collectWsrStatus({
          config,
          processManager,
          workspaceManager,
          browserManager,
          providerRegistry,
        }),
      ),
  );
}
