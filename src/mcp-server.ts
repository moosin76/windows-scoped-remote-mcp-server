import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "./config.js";
import { FileService } from "./file-service.js";
import { ProcessManager } from "./process-manager.js";
import { registerExecTools } from "./exec-tools.js";
import { registerFileTools } from "./file-tools.js";
import { registerWorkspaceTools } from "./workspace-tools.js";
import { registerCrossWorkspaceTools } from "./workspace-cross-tools.js";
import { registerBrowserTools } from "./browser-tools.js";
import type { WorkspaceManager } from "./workspace.js";
import type { BrowserManager } from "./browser-manager.js";

export function createMcpServer(
  config: AppConfig,
  processManager: ProcessManager,
  fileService: FileService,
  workspaceManager?: WorkspaceManager,
  browserManager?: BrowserManager,
): McpServer {
  const server = new McpServer(
    {
      name: "windows-scoped-remote-mcp",
      version: "1.0.0",
      ...(config.publicUrl ? { websiteUrl: config.publicUrl } : {}),
    },
    {
      instructions:
        "This server is a Windows remote development environment with multi-root workspace support and Playwright browser automation. The active workspace has read/write access. Other registered workspaces are read-only references and can be listed, read, searched, analyzed, and copied into the active workspace; they cannot be modified through cross-workspace tools.",
      capabilities: { tools: {}, prompts: {}, logging: {} },
    },
  );

  if (workspaceManager) {
    registerWorkspaceTools(server, workspaceManager);
    registerCrossWorkspaceTools(server, workspaceManager);
  }
  if (browserManager) registerBrowserTools(server, browserManager);
  registerExecTools(server, config, processManager, fileService);
  registerFileTools(server, config, fileService);
  return server;
}
