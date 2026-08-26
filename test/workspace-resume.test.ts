import { describe, expect, it } from "vitest";
import type { WorkspaceContextResult } from "../src/workspace-context.js";
import { buildWorkspaceResume } from "../src/workspace-resume.js";

function context(overrides: Partial<WorkspaceContextResult> = {}): WorkspaceContextResult {
  return {
    workspace: "wsr",
    workspacePath: "C:/repo/wsr",
    isActive: true,
    git: {
      isRepository: true,
      branch: "feature/workspace-resume",
      head: "abc123",
      dirty: false,
      status: [],
      recentCommits: [
        { hash: "abc123", authoredAt: "2026-08-26T00:00:00Z", subject: "checkpoint" },
      ],
    },
    documents: {
      instructions: {
        path: "AGENTS.md",
        size: 10,
        modifiedAt: "2026-08-26T00:00:00Z",
        truncated: false,
        content: "# Rules\n",
      },
      roadmap: null,
      recentSessions: [],
      todos: [],
    },
    ...overrides,
  };
}

describe("buildWorkspaceResume", () => {
  it("detects branch mismatch, dirty areas, roadmap work, and session next tasks", () => {
    const result = buildWorkspaceResume(
      context({
        git: {
          isRepository: true,
          branch: "feature/workspace-resume",
          head: "abc123",
          dirty: true,
          status: [" M src/workspace-resume.ts", "?? test/workspace-resume.test.ts"],
          recentCommits: [
            { hash: "abc123", authoredAt: "2026-08-26T00:00:00Z", subject: "checkpoint" },
          ],
        },
        documents: {
          instructions: null,
          roadmap: {
            path: "docs/project/roadmap.md",
            size: 100,
            modifiedAt: "2026-08-26T00:00:00Z",
            truncated: false,
            content: [
              "## NOW-01 — Handoff",
              "**상태: 완료**",
              "- [x] done",
              "## NOW-02 — Resume",
              "**상태: 구현 대기**",
              "- [ ] workspace_resume 구현",
              "- [ ] 테스트 추가",
              "## LATER — Future",
            ].join("\n"),
          },
          recentSessions: [
            {
              path: "docs/project/sessions/latest.md",
              size: 100,
              modifiedAt: "2026-08-26T00:00:00Z",
              truncated: false,
              content: [
                "## 작업 브랜치",
                "- `feature/workspace-context`",
                "## 미완료",
                "- 최종 diff 확인",
                "## 다음 세션/다음 작업",
                "1. workspace_resume 구현",
                "2. Provider 알림 준비",
                "## 주의사항",
                "- main push 금지",
              ].join("\n"),
            },
          ],
          todos: [],
        },
      }),
    );

    expect(result.branchMismatch).toEqual({
      currentBranch: "feature/workspace-resume",
      sessionBranch: "feature/workspace-context",
    });
    expect(result.dirtySummary?.count).toBe(2);
    expect(result.dirtySummary?.areas).toContain("src/workspace-resume.ts");
    expect(result.roadmap.currentItem).toContain("NOW-02");
    expect(result.roadmap.uncheckedTasks).toContain("workspace_resume 구현");
    expect(result.session.nextTasks).toContain("workspace_resume 구현");
    expect(result.session.unfinished).toContain("최종 diff 확인");
    expect(result.session.cautions).toContain("main push 금지");
    expect(result.nextTasks[0]).toBe("workspace_resume 구현");
    expect(result.warnings.some((warning) => warning.includes("현재 브랜치"))).toBe(true);
  });

  it("returns a clean resume without mismatch when session and branch agree", () => {
    const result = buildWorkspaceResume(
      context({
        documents: {
          instructions: null,
          roadmap: {
            path: "roadmap.md",
            size: 50,
            modifiedAt: "2026-08-26T00:00:00Z",
            truncated: false,
            content: "# Roadmap\n- [ ] Ship release\n",
          },
          recentSessions: [
            {
              path: "sessions/latest.md",
              size: 50,
              modifiedAt: "2026-08-26T00:00:00Z",
              truncated: false,
              content: "## Branch\n- `feature/workspace-resume`\n## Next task\n- Ship release\n",
            },
          ],
          todos: [],
        },
      }),
    );

    expect(result.branchMismatch).toBeNull();
    expect(result.dirtySummary).toBeNull();
    expect(result.nextTasks).toContain("Ship release");
    expect(result.resumeSummary).toContain("clean 상태");
  });

  it("warns conservatively when Git, roadmap, and session context are unavailable", () => {
    const result = buildWorkspaceResume(
      context({
        git: {
          isRepository: false,
          branch: null,
          head: null,
          dirty: false,
          status: [],
          recentCommits: [],
        },
        documents: {
          instructions: null,
          roadmap: null,
          recentSessions: [],
          todos: [],
        },
      }),
    );

    expect(result.recentCommit).toBeNull();
    expect(result.nextTasks).toEqual([]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Git 저장소"),
        expect.stringContaining("Roadmap"),
        expect.stringContaining("session"),
      ]),
    );
  });
});
