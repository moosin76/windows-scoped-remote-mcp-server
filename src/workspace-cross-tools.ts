import type { McpServer } from "@modelcontextprotocol/server";

// Cross-workspace read-only reference tools.
import { z } from "zod";
import { cp, lstat, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { runTool } from "./tool-result.js";
import type { WorkspaceManager } from "./workspace.js";

const workspaceEntryOutput = z.object({ path:z.string(), relativePath:z.string(), name:z.string(), type:z.enum(["directory","file","other"]), size:z.number(), modifiedAt:z.string() });
const workspaceListOutput = z.object({ workspace:z.string(), workspacePath:z.string(), directory:z.string(), entries:z.array(workspaceEntryOutput), totalEntries:z.number().int(), truncated:z.boolean() });
const workspaceReadOutput = z.object({ workspace:z.string(), path:z.string(), relativePath:z.string(), size:z.number(), content:z.string() });
const workspaceSearchResultOutput = z.object({ path:z.string(), relativePath:z.string(), line:z.number().int(), text:z.string() });
const workspaceSearchOutput = z.object({ workspace:z.string(), query:z.string(), results:z.array(workspaceSearchResultOutput), totalResults:z.number().int(), truncated:z.boolean() });
const workspaceAnalyzeOutput = z.object({ workspace:z.string(), workspacePath:z.string(), analyzedPath:z.string(), counts:z.record(z.string(),z.number().int()), extensions:z.record(z.string(),z.number().int()), entriesAnalyzed:z.number().int(), truncated:z.boolean(), writeAccess:z.enum(["active-workspace","read-only"]) });
const workspaceCopyOutput = z.object({ sourceWorkspace:z.string(), source:z.string(), destinationWorkspace:z.string(), destination:z.string(), overwrite:z.boolean(), sourceModified:z.literal(false) });

export function registerCrossWorkspaceTools(
  server: McpServer,
  wm: WorkspaceManager,
): void {
  server.registerTool(
    "workspace_list_directory",
    {
      title: "List Workspace Directory",
      description: "Read-only directory listing for any registered workspace.",
      inputSchema: z.object({
        workspace: z.string(),
        path: z.string().default("."),
        recursive: z.boolean().default(false),
        maxDepth: z.number().int().min(1).max(20).default(5),
        maxEntries: z.number().int().min(1).max(5000).default(1000),
        includeHidden: z.boolean().default(false),
      }),
      outputSchema: workspaceListOutput,
    },
    async (a) =>
      runTool(async () => {
        const ws = wm.getWorkspace(a.workspace);
        const target = wm.resolveWorkspacePath(a.workspace, a.path);
        const entries: unknown[] = [];
        const walk = async (dir: string, depth: number) => {
          if (depth > a.maxDepth || entries.length >= a.maxEntries) return;
          for (const item of await readdir(dir, { withFileTypes: true })) {
            if (!a.includeHidden && item.name.startsWith(".")) continue;
            if (entries.length >= a.maxEntries) break;
            const p = path.join(dir, item.name);
            const s = await lstat(p);
            entries.push({
              path: p,
              relativePath: path.relative(ws.path, p),
              name: item.name,
              type: s.isDirectory()
                ? "directory"
                : s.isFile()
                  ? "file"
                  : "other",
              size: s.size,
              modifiedAt: s.mtime.toISOString(),
            });
            if (a.recursive && s.isDirectory()) await walk(p, depth + 1);
          }
        };
        await walk(target, 1);
        return {
          workspace: ws.name,
          workspacePath: ws.path,
          directory: target,
          entries,
          totalEntries: entries.length,
          truncated: entries.length >= a.maxEntries,
        };
      }),
  );

  server.registerTool(
    "workspace_read_file",
    {
      title: "Read File From Workspace",
      description:
        "Read a file from any registered workspace without changing the active workspace.",
      inputSchema: z.object({
        workspace: z.string(),
        path: z.string(),
        maxBytes: z
          .number()
          .int()
          .min(1)
          .max(1024 * 1024)
          .default(1024 * 1024),
      }),
      outputSchema: workspaceReadOutput,
    },
    async (a) =>
      runTool(async () => {
        const p = wm.resolveWorkspacePath(a.workspace, a.path);
        const s = await stat(p);
        if (!s.isFile()) throw new Error(`'${a.path}' is not a file.`);
        if (s.size > a.maxBytes)
          throw new Error(
            `File is ${s.size} bytes; maxBytes is ${a.maxBytes}.`,
          );
        const ws = wm.getWorkspace(a.workspace);
        return {
          workspace: ws.name,
          path: p,
          relativePath: a.path,
          size: s.size,
          content: await readFile(p, "utf8"),
        };
      }),
  );

  server.registerTool(
    "workspace_search",
    {
      title: "Search Workspace",
      description: "Search text in files of a registered workspace. Read-only.",
      inputSchema: z.object({
        workspace: z.string(),
        query: z.string(),
        path: z.string().default("."),
        extensions: z.array(z.string()).optional(),
        maxResults: z.number().int().min(1).max(1000).default(100),
        maxFileBytes: z
          .number()
          .int()
          .min(1)
          .max(1024 * 1024)
          .default(524288),
      }),
      outputSchema: workspaceSearchOutput,
    },
    async (a) =>
      runTool(async () => {
        const ws = wm.getWorkspace(a.workspace);
        const start = wm.resolveWorkspacePath(a.workspace, a.path);
        const exts = a.extensions?.map((e) =>
          e.startsWith(".") ? e.toLowerCase() : `.${e.toLowerCase()}`,
        );
        const results: unknown[] = [];
        const walk = async (dir: string) => {
          if (results.length >= a.maxResults) return;
          for (const item of await readdir(dir, { withFileTypes: true })) {
            if (item.name.startsWith(".")) continue;
            if (results.length >= a.maxResults) break;
            const p = path.join(dir, item.name);
            if (item.isDirectory()) {
              await walk(p);
              continue;
            }
            if (
              !item.isFile() ||
              (exts && !exts.includes(path.extname(item.name).toLowerCase()))
            )
              continue;
            const s = await stat(p);
            if (s.size > a.maxFileBytes) continue;
            let text: string;
            try {
              text = await readFile(p, "utf8");
            } catch {
              continue;
            }
            text.split(/\r?\n/).forEach((line, i) => {
              if (
                results.length < a.maxResults &&
                line.toLowerCase().includes(a.query.toLowerCase())
              )
                results.push({
                  path: p,
                  relativePath: path.relative(ws.path, p),
                  line: i + 1,
                  text: line.trim().slice(0, 1000),
                });
            });
          }
        };
        await walk(start);
        return {
          workspace: ws.name,
          query: a.query,
          results,
          totalResults: results.length,
          truncated: results.length >= a.maxResults,
        };
      }),
  );

  server.registerTool(
    "workspace_analyze",
    {
      title: "Analyze Workspace",
      description:
        "Create a read-only structural summary of a registered workspace.",
      inputSchema: z.object({
        workspace: z.string(),
        path: z.string().default("."),
        maxEntries: z.number().int().min(1).max(5000).default(2000),
      }),
      outputSchema: workspaceAnalyzeOutput,
    },
    async (a) =>
      runTool(async () => {
        const ws = wm.getWorkspace(a.workspace);
        const start = wm.resolveWorkspacePath(a.workspace, a.path);
        const counts: Record<string, number> = {};
        const extensions: Record<string, number> = {};
        let total = 0;
        const walk = async (dir: string) => {
          if (total >= a.maxEntries) return;
          for (const item of await readdir(dir, { withFileTypes: true })) {
            if (item.name.startsWith(".")) continue;
            if (total >= a.maxEntries) break;
            total++;
            const kind = item.isDirectory()
              ? "directory"
              : item.isFile()
                ? "file"
                : "other";
            counts[kind] = (counts[kind] ?? 0) + 1;
            if (item.isFile()) {
              const e =
                path.extname(item.name).toLowerCase() || "[no-extension]";
              extensions[e] = (extensions[e] ?? 0) + 1;
            }
            if (item.isDirectory()) await walk(path.join(dir, item.name));
          }
        };
        await walk(start);
        return {
          workspace: ws.name,
          workspacePath: ws.path,
          analyzedPath: start,
          counts,
          extensions,
          entriesAnalyzed: total,
          truncated: total >= a.maxEntries,
          writeAccess: ws.isActive ? "active-workspace" : "read-only",
        };
      }),
  );

  server.registerTool(
    "workspace_copy_to_active",
    {
      title: "Copy From Workspace To Active Workspace",
      description:
        "Copy files or folders from another workspace into the active workspace. The source workspace is never modified.",
      inputSchema: z.object({
        sourceWorkspace: z.string(),
        sourcePath: z.string(),
        destinationPath: z.string(),
        overwrite: z.boolean().default(false),
      }),
      outputSchema: workspaceCopyOutput,
    },
    async (a) =>
      runTool(async () => {
        const sourceWs = wm.getWorkspace(a.sourceWorkspace);
        const active = wm.getActiveWorkspace();
        if (sourceWs.isActive)
          throw new Error(
            "Source is the active workspace; use copy_path for same-workspace copies.",
          );
        const source = wm.resolveWorkspacePath(a.sourceWorkspace, a.sourcePath);
        const destination = wm.resolveWorkspacePath(
          active.name,
          a.destinationPath,
        );
        const s = await stat(source);
        if (s.isDirectory())
          await cp(source, destination, {
            recursive: true,
            force: a.overwrite,
          });
        else await cp(source, destination, { force: a.overwrite });
        return {
          sourceWorkspace: sourceWs.name,
          source,
          destinationWorkspace: active.name,
          destination,
          overwrite: a.overwrite,
          sourceModified: false,
        };
      }),
  );
}
