import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { WorkspaceManager } from "./workspace.js";

export interface WorkspaceContextDocument {
  path: string;
  size: number;
  modifiedAt: string;
  truncated: boolean;
  content: string;
}

export interface WorkspaceContextGitCommit {
  hash: string;
  authoredAt: string;
  subject: string;
}

export interface WorkspaceContextResult {
  workspace: string;
  workspacePath: string;
  isActive: boolean;
  git: {
    isRepository: boolean;
    branch: string | null;
    head: string | null;
    dirty: boolean;
    status: string[];
    recentCommits: WorkspaceContextGitCommit[];
  };
  documents: {
    instructions: WorkspaceContextDocument | null;
    roadmap: WorkspaceContextDocument | null;
    recentSessions: WorkspaceContextDocument[];
    todos: WorkspaceContextDocument[];
  };
}

export interface WorkspaceContextOptions {
  workspace?: string;
  recentCommits?: number;
  recentSessions?: number;
  maxDocumentBytes?: number;
}

const INSTRUCTION_FILES = ["AGENTS.md", "AGENT.md"];
const ROADMAP_FILES = [
  "docs/project/roadmap.md",
  "docs/roadmap.md",
  "roadmap.md",
  "ROADMAP.md",
];
const SESSION_DIRS = ["docs/project/sessions", "docs/sessions", "sessions"];
const TODO_LIMIT = 3;

function gitCommand(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      ["-C", cwd, ...args],
      {
        encoding: "utf8",
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || error.message));
          return;
        }
        resolve(stdout.trim());
      },
    );
  });
}

async function tryGit(cwd: string, args: string[]): Promise<string | null> {
  try {
    return await gitCommand(cwd, args);
  } catch {
    return null;
  }
}

function truncateUtf8(text: string, maxBytes: number): { content: string; truncated: boolean } {
  const buffer = Buffer.from(text, "utf8");
  if (buffer.byteLength <= maxBytes) return { content: text, truncated: false };

  let content = buffer.subarray(0, maxBytes).toString("utf8");
  if (content.endsWith("\uFFFD")) content = content.slice(0, -1);
  return {
    content: `${content}\n\n[truncated]`,
    truncated: true,
  };
}

async function readDocument(
  root: string,
  filePath: string,
  maxBytes: number,
): Promise<WorkspaceContextDocument | null> {
  try {
    const info = await stat(filePath);
    if (!info.isFile()) return null;
    const text = await readFile(filePath, "utf8");
    const truncated = truncateUtf8(text, maxBytes);
    return {
      path: path.relative(root, filePath).split(path.sep).join("/"),
      size: info.size,
      modifiedAt: info.mtime.toISOString(),
      truncated: truncated.truncated,
      content: truncated.content,
    };
  } catch {
    return null;
  }
}

async function firstDocument(
  root: string,
  candidates: string[],
  maxBytes: number,
): Promise<WorkspaceContextDocument | null> {
  for (const candidate of candidates) {
    const document = await readDocument(root, path.join(root, candidate), maxBytes);
    if (document) return document;
  }
  return null;
}

async function collectMarkdownFiles(directory: string, limit = 500): Promise<string[]> {
  const files: string[] = [];

  const walk = async (current: string): Promise<void> => {
    if (files.length >= limit) return;
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= limit) break;
      if (entry.name.startsWith(".")) continue;
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        files.push(entryPath);
      }
    }
  };

  await walk(directory);
  return files;
}

async function newestDocuments(
  root: string,
  files: string[],
  count: number,
  maxBytes: number,
): Promise<WorkspaceContextDocument[]> {
  const withStats = await Promise.all(
    files.map(async (filePath) => {
      try {
        const info = await stat(filePath);
        return { filePath, modifiedAt: info.mtimeMs };
      } catch {
        return null;
      }
    }),
  );

  const selected = withStats
    .filter((item): item is { filePath: string; modifiedAt: number } => item !== null)
    .sort((a, b) => b.modifiedAt - a.modifiedAt)
    .slice(0, count);

  const documents = await Promise.all(
    selected.map((item) => readDocument(root, item.filePath, maxBytes)),
  );
  return documents.filter(
    (document): document is WorkspaceContextDocument => document !== null,
  );
}

async function collectRecentSessions(
  root: string,
  count: number,
  maxBytes: number,
): Promise<WorkspaceContextDocument[]> {
  if (count === 0) return [];
  for (const directory of SESSION_DIRS) {
    const files = await collectMarkdownFiles(path.join(root, directory));
    if (files.length > 0) return newestDocuments(root, files, count, maxBytes);
  }
  return [];
}

async function collectTodos(
  root: string,
  maxBytes: number,
): Promise<WorkspaceContextDocument[]> {
  const rootTodos = [path.join(root, "TODO.md"), path.join(root, "todo.md")];
  const files = [...rootTodos, ...(await collectMarkdownFiles(path.join(root, "docs")))];
  const unique = Array.from(new Set(files)).filter((filePath) =>
    path.basename(filePath).toLowerCase().includes("todo"),
  );
  return newestDocuments(root, unique, TODO_LIMIT, maxBytes);
}

async function collectGitContext(root: string, recentCommitCount: number) {
  const inside = await tryGit(root, ["rev-parse", "--is-inside-work-tree"]);
  if (inside !== "true") {
    return {
      isRepository: false,
      branch: null,
      head: null,
      dirty: false,
      status: [],
      recentCommits: [] as WorkspaceContextGitCommit[],
    };
  }

  const [branchOutput, headOutput, statusOutput, logOutput] = await Promise.all([
    tryGit(root, ["branch", "--show-current"]),
    tryGit(root, ["rev-parse", "--short=12", "HEAD"]),
    tryGit(root, ["status", "--short"]),
    tryGit(root, [
      "log",
      `-n${recentCommitCount}`,
      "--pretty=format:%h%x1f%aI%x1f%s",
    ]),
  ]);

  const status = statusOutput ? statusOutput.split(/\r?\n/).filter(Boolean) : [];
  const recentCommits = logOutput
    ? logOutput.split(/\r?\n/).flatMap((line) => {
        const [hash, authoredAt, ...subjectParts] = line.split("\x1f");
        if (!hash || !authoredAt) return [];
        return [
          {
            hash,
            authoredAt,
            subject: subjectParts.join("\x1f"),
          },
        ];
      })
    : [];

  return {
    isRepository: true,
    branch: branchOutput || null,
    head: headOutput || null,
    dirty: status.length > 0,
    status,
    recentCommits,
  };
}

export async function collectWorkspaceContext(
  workspaceManager: WorkspaceManager,
  options: WorkspaceContextOptions = {},
): Promise<WorkspaceContextResult> {
  const workspace = options.workspace
    ? workspaceManager.getWorkspace(options.workspace)
    : workspaceManager.getActiveWorkspace();
  const recentCommits = options.recentCommits ?? 5;
  const recentSessions = options.recentSessions ?? 2;
  const maxDocumentBytes = options.maxDocumentBytes ?? 32 * 1024;

  const [git, instructions, roadmap, sessions, todos] = await Promise.all([
    collectGitContext(workspace.path, recentCommits),
    firstDocument(workspace.path, INSTRUCTION_FILES, maxDocumentBytes),
    firstDocument(workspace.path, ROADMAP_FILES, maxDocumentBytes),
    collectRecentSessions(workspace.path, recentSessions, maxDocumentBytes),
    collectTodos(workspace.path, maxDocumentBytes),
  ]);

  return {
    workspace: workspace.name,
    workspacePath: workspace.path,
    isActive: workspace.isActive,
    git,
    documents: {
      instructions,
      roadmap,
      recentSessions: sessions,
      todos,
    },
  };
}
