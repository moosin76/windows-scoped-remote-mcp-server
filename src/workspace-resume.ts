import type {
  WorkspaceContextDocument,
  WorkspaceContextOptions,
  WorkspaceContextResult,
} from "./workspace-context.js";
import { collectWorkspaceContext } from "./workspace-context.js";
import type { WorkspaceManager } from "./workspace.js";

export interface WorkspaceResumeResult {
  workspace: string;
  workspacePath: string;
  isActive: boolean;
  git: {
    isRepository: boolean;
    branch: string | null;
    head: string | null;
    dirty: boolean;
    status: string[];
  };
  sourceDocuments: {
    instructions: string | null;
    roadmap: string | null;
    latestSession: string | null;
    todos: string[];
  };
  resumeSummary: string;
  warnings: string[];
  nextTasks: string[];
  branchMismatch: {
    currentBranch: string;
    sessionBranch: string;
  } | null;
  dirtySummary: {
    count: number;
    paths: string[];
    areas: string[];
  } | null;
  roadmap: {
    currentItem: string | null;
    uncheckedTasks: string[];
  };
  session: {
    path: string | null;
    branch: string | null;
    unfinished: string[];
    nextTasks: string[];
    cautions: string[];
  };
  recentCommit: {
    hash: string;
    subject: string;
  } | null;
}

export interface WorkspaceResumeOptions extends WorkspaceContextOptions {}

function cleanMarkdownText(value: string): string {
  return value
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .replace(/^\[[ xX]\]\s*/, "")
    .replace(/`/g, "")
    .trim();
}

function unique(values: string[], limit = 10): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, limit);
}

function extractBranch(content: string): string | null {
  const branchPattern = /\b(?:feature|fix|docs|refactor|test|chore|release|hotfix)\/[A-Za-z0-9._/-]+\b/g;
  const named = content.match(branchPattern);
  if (named?.[0]) return named[0];

  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (!/(branch|브랜치)/i.test(lines[index] ?? "")) continue;
    for (const candidate of lines.slice(index, index + 4)) {
      const cleaned = cleanMarkdownText(candidate ?? "");
      if (/^(main|master|develop)$/i.test(cleaned)) return cleaned;
    }
  }
  return null;
}

function extractBulletItems(content: string, headingPattern: RegExp, limit = 8): string[] {
  const lines = content.split(/\r?\n/);
  const results: string[] = [];
  let collecting = false;
  let headingLevel = 0;

  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1]?.length ?? 0;
      const title = heading[2] ?? "";
      if (headingPattern.test(title)) {
        collecting = true;
        headingLevel = level;
        continue;
      }
      if (collecting && level <= headingLevel) break;
      continue;
    }
    if (!collecting) continue;

    const bullet = line.match(/^\s*(?:[-*+]\s+|\d+[.)]\s+)(.+)$/);
    if (!bullet?.[1]) continue;
    const cleaned = cleanMarkdownText(bullet[1]);
    if (cleaned && !/^없음$/i.test(cleaned)) results.push(cleaned);
    if (results.length >= limit) break;
  }

  return unique(results, limit);
}

function extractRoadmap(content: string): { currentItem: string | null; uncheckedTasks: string[] } {
  const lines = content.split(/\r?\n/);
  const sections: Array<{ title: string; lines: string[] }> = [];
  let current: { title: string; lines: string[] } | null = null;

  for (const line of lines) {
    const nowHeading = line.match(/^##\s+(NOW-[^\r\n]+)$/i);
    if (nowHeading?.[1]) {
      if (current) sections.push(current);
      current = { title: cleanMarkdownText(nowHeading[1]), lines: [] };
      continue;
    }
    if (current && /^##\s+/.test(line)) {
      sections.push(current);
      current = null;
    }
    if (current) current.lines.push(line);
  }
  if (current) sections.push(current);

  for (const section of sections) {
    const body = section.lines.join("\n");
    const exactDone = /\*\*\s*상태\s*:\s*완료\s*\*\*/.test(body) || /\*\*\s*status\s*:\s*done\s*\*\*/i.test(body);
    if (exactDone) continue;
    const unchecked = section.lines
      .flatMap((line) => {
        const match = line.match(/^\s*[-*+]\s+\[ \]\s+(.+)$/);
        return match?.[1] ? [cleanMarkdownText(match[1])] : [];
      });
    return { currentItem: section.title, uncheckedTasks: unique(unchecked, 8) };
  }

  const uncheckedTasks = lines.flatMap((line) => {
    const match = line.match(/^\s*[-*+]\s+\[ \]\s+(.+)$/);
    return match?.[1] ? [cleanMarkdownText(match[1])] : [];
  });
  return { currentItem: null, uncheckedTasks: unique(uncheckedTasks, 8) };
}

function statusPath(line: string): string {
  const raw = line.length > 3 ? line.slice(3).trim() : line.trim();
  const arrow = raw.lastIndexOf(" -> ");
  return arrow >= 0 ? raw.slice(arrow + 4).trim() : raw;
}

function summarizeDirty(status: string[]): WorkspaceResumeResult["dirtySummary"] {
  if (status.length === 0) return null;
  const paths = status.map(statusPath).filter(Boolean);
  const areas = unique(
    paths.map((filePath) => {
      const normalized = filePath.replaceAll("\\", "/");
      const [first, second] = normalized.split("/");
      if (!second) return first || normalized;
      if (["src", "test", "docs", "game", "web", "website"].includes(first ?? "")) {
        return `${first}/${second}`;
      }
      return first || normalized;
    }),
    8,
  );
  return { count: status.length, paths: paths.slice(0, 12), areas };
}

function latestSession(context: WorkspaceContextResult): WorkspaceContextDocument | null {
  return context.documents.recentSessions[0] ?? null;
}

function sessionMentionsDirty(session: WorkspaceContextDocument | null, dirty: WorkspaceResumeResult["dirtySummary"]): boolean {
  if (!session || !dirty) return true;
  const haystack = session.content.toLowerCase().replaceAll("\\", "/");
  return dirty.paths.some((filePath) => {
    const normalized = filePath.toLowerCase().replaceAll("\\", "/");
    const base = normalized.split("/").pop() ?? normalized;
    return haystack.includes(normalized) || (base.length >= 5 && haystack.includes(base));
  });
}

function buildSummary(result: Omit<WorkspaceResumeResult, "resumeSummary">): string {
  const parts: string[] = [];
  if (result.git.branch) parts.push(`현재 브랜치는 ${result.git.branch}이다.`);
  else if (result.git.isRepository) parts.push("Git 저장소이지만 현재 브랜치를 확인하지 못했다.");
  else parts.push("Git 저장소가 아니다.");

  if (result.git.dirty && result.dirtySummary) {
    parts.push(`미커밋 변경 ${result.dirtySummary.count}건이 있다.`);
  } else if (result.git.isRepository) {
    parts.push("작업 트리는 clean 상태다.");
  }

  if (result.branchMismatch) {
    parts.push(`최신 session의 브랜치(${result.branchMismatch.sessionBranch})와 현재 브랜치가 다르다.`);
  }
  if (result.roadmap.currentItem) parts.push(`Roadmap의 현재 후보는 ${result.roadmap.currentItem}이다.`);
  if (result.nextTasks[0]) parts.push(`우선 시작할 작업은 '${result.nextTasks[0]}'이다.`);
  return parts.join(" ");
}

export function buildWorkspaceResume(context: WorkspaceContextResult): WorkspaceResumeResult {
  const sessionDoc = latestSession(context);
  const sessionBranch = sessionDoc ? extractBranch(sessionDoc.content) : null;
  const branchMismatch =
    context.git.branch && sessionBranch && context.git.branch !== sessionBranch
      ? { currentBranch: context.git.branch, sessionBranch }
      : null;
  const dirtySummary = summarizeDirty(context.git.status);
  const roadmap = context.documents.roadmap
    ? extractRoadmap(context.documents.roadmap.content)
    : { currentItem: null, uncheckedTasks: [] };
  const sessionUnfinished = sessionDoc
    ? extractBulletItems(sessionDoc.content, /(미완료|남은 작업|unfinished|remaining)/i)
    : [];
  const sessionNextTasks = sessionDoc
    ? extractBulletItems(sessionDoc.content, /(다음(?: 세션| 작업)?|next(?: session| task)?)/i)
    : [];
  const sessionCautions = sessionDoc
    ? extractBulletItems(sessionDoc.content, /(주의|알려진 문제|known issues?|caution|warning)/i)
    : [];

  const warnings: string[] = [];
  if (!context.git.isRepository) warnings.push("Git 저장소가 아니어서 branch/commit 기반 재개 판단이 제한된다.");
  if (branchMismatch) warnings.push(`현재 브랜치 '${branchMismatch.currentBranch}'와 최신 session 브랜치 '${branchMismatch.sessionBranch}'가 다르다.`);
  if (context.git.dirty && !sessionDoc) warnings.push("미커밋 변경이 있지만 최근 session 문서가 없다.");
  if (context.git.dirty && sessionDoc && !sessionMentionsDirty(sessionDoc, dirtySummary)) {
    warnings.push("미커밋 변경이 최신 session 문서에 기록된 작업과 직접 연결되지 않을 수 있다.");
  }
  if (!context.documents.roadmap) warnings.push("Roadmap 문서를 찾지 못해 프로젝트 우선순위를 자동 판단할 수 없다.");
  if (!sessionDoc) warnings.push("최근 session 문서를 찾지 못해 직전 작업의 미완료/주의사항을 복원할 수 없다.");

  const nextTasks = unique([
    ...sessionNextTasks,
    ...sessionUnfinished,
    ...roadmap.uncheckedTasks,
    ...(roadmap.currentItem ? [roadmap.currentItem] : []),
    ...context.documents.todos.flatMap((document) =>
      document.content.split(/\r?\n/).flatMap((line) => {
        const match = line.match(/^\s*[-*+]\s+(?:\[ \]\s+)?(.+)$/);
        return match?.[1] ? [cleanMarkdownText(match[1])] : [];
      }),
    ),
  ], 10);

  const partial: Omit<WorkspaceResumeResult, "resumeSummary"> = {
    workspace: context.workspace,
    workspacePath: context.workspacePath,
    isActive: context.isActive,
    git: {
      isRepository: context.git.isRepository,
      branch: context.git.branch,
      head: context.git.head,
      dirty: context.git.dirty,
      status: context.git.status,
    },
    sourceDocuments: {
      instructions: context.documents.instructions?.path ?? null,
      roadmap: context.documents.roadmap?.path ?? null,
      latestSession: sessionDoc?.path ?? null,
      todos: context.documents.todos.map((document) => document.path),
    },
    warnings: unique(warnings, 10),
    nextTasks,
    branchMismatch,
    dirtySummary,
    roadmap,
    session: {
      path: sessionDoc?.path ?? null,
      branch: sessionBranch,
      unfinished: sessionUnfinished,
      nextTasks: sessionNextTasks,
      cautions: sessionCautions,
    },
    recentCommit: context.git.recentCommits[0]
      ? {
          hash: context.git.recentCommits[0].hash,
          subject: context.git.recentCommits[0].subject,
        }
      : null,
  };

  return { ...partial, resumeSummary: buildSummary(partial) };
}

export async function collectWorkspaceResume(
  workspaceManager: WorkspaceManager,
  options: WorkspaceResumeOptions = {},
): Promise<WorkspaceResumeResult> {
  const context = await collectWorkspaceContext(workspaceManager, {
    ...options,
    recentSessions: Math.max(options.recentSessions ?? 2, 1),
  });
  return buildWorkspaceResume(context);
}
