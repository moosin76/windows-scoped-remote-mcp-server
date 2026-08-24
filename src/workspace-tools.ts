import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { runTool } from "./tool-result.js";
import type { WorkspaceManager } from "./workspace.js";

export function registerWorkspaceTools(
  server: McpServer,
  workspaceManager: WorkspaceManager,
): void {
  server.registerTool(
    "list_workspaces",
    {
      title: "List Workspaces",
      description:
        "List all registered multi-root workspaces, their aliases, directory paths, and which workspace is currently active.",
      inputSchema: z.object({}),
    },
    async () =>
      runTool(async () => {
        const workspaces = workspaceManager.getAllWorkspaces();
        const active = workspaceManager.getActiveWorkspace();
        return {
          activeWorkspace: active.name,
          activePath: active.path,
          totalWorkspaces: workspaces.length,
          workspaces,
        };
      }),
  );

  server.registerTool(
    "get_active_workspace",
    {
      title: "Get Active Workspace",
      description:
        "Get information about the currently active workspace, including alias name, absolute directory path, and sandbox status.",
      inputSchema: z.object({}),
    },
    async () =>
      runTool(async () => {
        const active = workspaceManager.getActiveWorkspace();
        return {
          name: active.name,
          path: active.path,
          status: "active",
          sandbox: "contained",
        };
      }),
  );

  server.registerTool(
    "switch_workspace",
    {
      title: "Switch Active Workspace",
      description:
        "Switch the active workspace by alias name or path. Subsequent relative file operations and shell commands will execute in this workspace.",
      inputSchema: z.object({
        name: z
          .string()
          .min(1)
          .describe(
            "Workspace alias name (e.g. 'test', 'ether', 'server') or absolute directory path to switch to.",
          ),
      }),
    },
    async ({ name }) =>
      runTool(async () => {
        const switched = workspaceManager.switchWorkspace(name);
        return {
          switchedTo: switched.name,
          activePath: switched.path,
          message: `Active workspace successfully switched to '${switched.name}' (${switched.path}).`,
        };
      }),
  );
}
