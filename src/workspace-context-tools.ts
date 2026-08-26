import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { collectWorkspaceContext } from "./workspace-context.js";
import { runTool } from "./tool-result.js";
import type { WorkspaceManager } from "./workspace.js";

const contextDocumentOutput = z.object({
  path: z.string(),
  size: z.number().int(),
  modifiedAt: z.string(),
  truncated: z.boolean(),
  content: z.string(),
});

const contextCommitOutput = z.object({
  hash: z.string(),
  authoredAt: z.string(),
  subject: z.string(),
});

const workspaceContextOutput = z.object({
  workspace: z.string(),
  workspacePath: z.string(),
  isActive: z.boolean(),
  git: z.object({
    isRepository: z.boolean(),
    branch: z.string().nullable(),
    head: z.string().nullable(),
    dirty: z.boolean(),
    status: z.array(z.string()),
    recentCommits: z.array(contextCommitOutput),
  }),
  documents: z.object({
    instructions: contextDocumentOutput.nullable(),
    roadmap: contextDocumentOutput.nullable(),
    recentSessions: z.array(contextDocumentOutput),
    todos: z.array(contextDocumentOutput),
  }),
});

export function registerWorkspaceContextTools(
  server: McpServer,
  workspaceManager: WorkspaceManager,
): void {
  server.registerTool(
    "workspace_context",
    {
      title: "Get Workspace Development Context",
      description:
        "Collect read-only development handoff context for a registered workspace in one call: Git branch/HEAD/status/recent commits plus project instructions, roadmap, recent session notes, and TODO documents. Does not switch or modify the workspace.",
      inputSchema: z.object({
        workspace: z
          .string()
          .min(1)
          .optional()
          .describe("Workspace alias or path. Omit to inspect the active workspace."),
        recentCommits: z.number().int().min(1).max(20).default(5),
        recentSessions: z.number().int().min(0).max(5).default(2),
        maxDocumentBytes: z
          .number()
          .int()
          .min(1024)
          .max(128 * 1024)
          .default(32 * 1024),
      }),
      outputSchema: workspaceContextOutput,
    },
    async (args) =>
      runTool(async () =>
        collectWorkspaceContext(workspaceManager, {
          workspace: args.workspace,
          recentCommits: args.recentCommits,
          recentSessions: args.recentSessions,
          maxDocumentBytes: args.maxDocumentBytes,
        }),
      ),
  );
}
