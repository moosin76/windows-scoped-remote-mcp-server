import { loadConfig } from "./config.js";
import { SandboxGuard } from "./sandbox.js";
import { FileService } from "./file-service.js";
import { ProcessManager } from "./process-manager.js";
import { startHttpServer } from "./http-server.js";
import { startCloudflareTunnel } from "./tunnel.js";
import { WorkspaceManager } from "./workspace.js";
import { BrowserManager } from "./browser-manager.js";
import { createProviderRegistry } from "./providers/provider-factory.js";
import { ProviderScheduler } from "./providers/provider-scheduler.js";
import { ensurePreferredWindowsShell } from "./shells.js";

async function main() {
  ensurePreferredWindowsShell();
  const config = loadConfig(process.env, process.cwd());
  const projectRoot = process.cwd();
  const workspaceManager = new WorkspaceManager(config.workspaceRoots);
  const activeWs = workspaceManager.getActiveWorkspace();

  console.log("============================================================");
  console.log("  Windows Scoped Remote MCP Server");
  console.log("============================================================");
  console.log(`📁 Active Workspace: ${activeWs.name} (${activeWs.path})`);
  console.log(
    `📚 All Workspaces:   ${workspaceManager
      .getAllWorkspaces()
      .map((w) => `${w.name} -> ${w.path}`)
      .join(" | ")}`,
  );
  console.log(
    `🌐 Browser Engine:   Playwright (${config.browserHeadless ? "Headless/Background" : "Headed/Visible Window"})`,
  );
  console.log(`🐚 Default Shell:    ${config.defaultShell}`);
  console.log(
    `🔒 Sandbox Guard:    Active (${workspaceManager.getAllRoots().length} Multi-Root Workspaces Contained)`,
  );
  console.log(
    `🔌 Local Endpoint:   http://localhost:${config.port}${config.endpoint}`,
  );
  if (config.publicUrl) {
    console.log(`🌐 Public Endpoint:  ${config.publicUrl}${config.endpoint}`);
  }
  console.log(`❤️  Health Check:    http://localhost:${config.port}/health`);
  if (config.authToken) {
    console.log(`🔐 Authentication:   Bearer token configured`);
  } else if (config.allowNoAuth) {
    console.log(`⚠️  Authentication:   Anonymous mode enabled`);
  } else {
    console.log(`🔐 Authentication:   OAuth/approval flow`);
  }
  console.log("============================================================\n");

  const sandbox = new SandboxGuard(workspaceManager);
  const browserManager = new BrowserManager(
    sandbox,
    config.browserHeadless,
    config.browserUserDataDir,
  );

  const processManager = new ProcessManager({
    maxProcesses: config.maxProcesses,
    maxRetainedOutputBytes: config.maxRetainedProcessOutputBytes,
    processRetentionMs: config.processRetentionMs,
    defaultMaxOutputBytes: config.maxOutputBytes,
  });

  const providerRegistry = createProviderRegistry(config);
  if (providerRegistry.list().length > 0) {
    console.log(
      `[MCP Providers] Connecting ${providerRegistry.list().length} provider(s)...`,
    );
    await providerRegistry.connectAll();
    const statuses = providerRegistry.listStatuses();
    const ready = statuses.filter((status) => status.connected);
    const unavailable = statuses.filter((status) => !status.connected);
    console.log(
      `[MCP Providers] Ready (${ready.length}/${statuses.length} provider(s), ${providerRegistry.listCachedTools().length} remote tools)`,
    );
    for (const status of unavailable) {
      console.warn(
        `[MCP Provider Warning] ${status.id} is unavailable. Core WSR tools remain available.`,
      );
    }
  }

  const fileService = new FileService({
    sandbox,
    maxChunkBytes: config.maxFileChunkBytes,
    maxEditFileBytes: config.maxEditFileBytes,
    maxOutputBytes: config.maxOutputBytes,
  });

  const runningServer = await startHttpServer(
    config,
    processManager,
    fileService,
    workspaceManager,
    browserManager,
    providerRegistry,
  );
  console.log(`[HTTP Server] Listening on ${config.host}:${config.port}`);

  // Keep optional remote providers healthy and discoverable without restarting WSR.
  // Modern 2026-07-28 clients can subscribe to tool-list changes through
  // subscriptions/listen. Each live modern handler owns a subscription bus, so
  // the HTTP server fans the notification out when the Provider snapshot changes.
  const providerScheduler = new ProviderScheduler(providerRegistry, {
    intervalMs: config.mcpProviderHealthIntervalMs,
    retryIntervalMs: config.mcpProviderRetryIntervalMs,
    onToolsChanged: (providerId) => {
      const count = providerRegistry
        .listCachedTools()
        .filter((tool) => tool.providerId === providerId).length;
      const notifiedHandlers = runningServer.notifyToolsChanged();
      console.log(
        `[MCP Provider Scheduler] '${providerId}' tool registry refreshed (${count} tools, ${notifiedHandlers} modern handler(s) notified)`,
      );
    },
  });
  providerScheduler.start();

  let tunnel: Awaited<ReturnType<typeof startCloudflareTunnel>> | undefined;
  try {
    tunnel = await startCloudflareTunnel(config, projectRoot);
  } catch (err) {
    console.warn(
      `[Tunnel Warning] Could not start Cloudflare Tunnel: ${(err as Error).message}`,
    );
    console.log(
      "ℹ️  You can still connect to the local endpoint or run cloudflared manually.",
    );
  }

  const shutdown = async () => {
    console.log("\n[Server] Shutting down gracefully...");
    if (tunnel) {
      tunnel.stop();
    }
    await providerScheduler.stop().catch(() => {});
    await providerRegistry.closeAll().catch(() => {});
    await browserManager.close().catch(() => {});
    await runningServer.close().catch(() => {});
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[Fatal Error]", err);
  process.exit(1);
});
