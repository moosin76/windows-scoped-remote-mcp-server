import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { collectWorkspaceResume } from "./workspace-resume.js";
import { runTool } from "./tool-result.js";
import type { WorkspaceManager } from "./workspace.js";

const branchMismatchOutput = z
  .object({
    currentBranch: z.string(),
    sessionBranch: z.string(),
  })
  .nullable();

const dirtySummaryOutput = z
  .object({
    count: z.number().int(),
    paths: z.array(z.string()),
    areas: z.array(z.string()),
  })
  .nullable();

const workspaceResumeOutput = z.object({
  workspace: z.string(),
  workspacePath: z.string(),
  isActive: z.boolean(),
  git: z.object({
    isRepository: z.boolean(),
    branch: z.string().nullable(),
    head: z.string().nullable(),
    dirty: z.boolean(),
    status: z.array(z.string()),
  }),
  sourceDocuments: z.object({
    instructions: z.string().nullable(),
    roadmap: z.string().nullable(),
    latestSession: z.string().nullable(),
    todos: z.array(z.string()),
  }),
  resumeSummary: z.string(),
  warnings: z.array(z.string()),
  nextTasks: z.array(z.string()),
  branchMismatch: branchMismatchOutput,
  dirtySummary: dirtySummaryOutput,
  roadmap: z.object({
    currentItem: z.string().nullable(),
    uncheckedTasks: z.array(z.string()),
  }),
  session: z.object({
    path: z.string().nullable(),
    branch: z.string().nullable(),
    unfinished: z.array(z.string()),
    nextTasks: z.array(z.string()),
    cautions: z.array(z.string()),
  }),
  recentCommit: z
    .object({
      hash: z.string(),
      subject: z.string(),
    })
    .nullable(),
});

export function registerWorkspaceResumeTools(
  server: McpServer,
  workspaceManager: WorkspaceManager,
): void {
  server.registerTool(
    "workspace_resume",
    {
      title: "Get Workspace Resume Hints",
      description:
        "Build read-only structured resume hints from workspace_context data. Detects branch/session mismatches, summarizes dirty areas, and extracts likely next tasks from roadmap, session notes, and TODO documents without switching or modifying the workspace.",
      inputSchema: z.object({
        workspace: z
          .string()
          .min(1)
          .optional()
          .describe("Workspace alias or path. Omit to inspect the active workspace."),
        recentCommits: z.number().int().min(1).max(20).default(5),
        recentSessions: z.number().int().min(1).max(5).default(2),
        maxDocumentBytes: z
          .number()
          .int()
          .min(1024)
          .max(128 * 1024)
          .default(32 * 1024),
      }),
      outputSchema: workspaceResumeOutput,
    },
    async (args) =>
      runTool(async () =>
        collectWorkspaceResume(workspaceManager, {
          workspace: args.workspace,
          recentCommits: args.recentCommits,
          recentSessions: args.recentSessions,
          maxDocumentBytes: args.maxDocumentBytes,
        }),
      ),
  );
}
