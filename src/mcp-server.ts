import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "./config.js";
import { FileService } from "./file-service.js";
import { ProcessManager } from "./process-manager.js";
import { registerExecTools } from "./exec-tools.js";
import { registerFileTools } from "./file-tools.js";
import { registerWorkspaceTools } from "./workspace-tools.js";
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
        "This server is a Windows remote development environment with multi-root workspace support and Playwright browser automation. Tools operate on the host. Use list_workspaces, get_active_workspace, and switch_workspace to manage projects; use browser tools (browser_navigate, browser_screenshot, browser_click, browser_fill, browser_get_content, browser_evaluate) to automate and inspect web pages; use exec_command for PowerShell / CMD commands, builds, package management, and git; and file tools (list_directory, read_file, write_file, replace_in_file, etc.) for direct file operations inside the active workspace.",
      capabilities: {
        tools: {},
        prompts: {},
        logging: {},
      },
    },
  );

  if (workspaceManager) {
    registerWorkspaceTools(server, workspaceManager);
  }
  if (browserManager) {
    registerBrowserTools(server, browserManager);
  }
  registerExecTools(server, config, processManager, fileService);
  registerFileTools(server, config, fileService);

  return server;
}
