import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import {
  createShellInvocation,
  detectDefaultShell,
  findGitBashExecutable,
} from "../src/shells.js";

describe("shell selection", () => {
  it("prefers Git Bash on Windows and falls back to PowerShell 7", () => {
    if (process.platform !== "win32") return;

    const gitBash = findGitBashExecutable();
    expect(detectDefaultShell()).toBe(gitBash ? "bash" : "pwsh");
  });

  it("finds a standard Git for Windows installation without relying on PATH", () => {
    if (process.platform !== "win32") return;

    const gitBashWithoutPath = findGitBashExecutable(process.env, false);
    if (gitBashWithoutPath) {
      expect(gitBashWithoutPath.toLowerCase()).toContain("git");
      expect(gitBashWithoutPath.toLowerCase()).toContain("bash.exe");
    }
  });

  it("does not use MCP_DEFAULT_SHELL from env", () => {
    const cwd = process.cwd();
    const config = loadConfig(
      {
        ...process.env,
        MCP_WORKSPACE_ROOT: cwd,
        MCP_ALLOW_NO_AUTH: "true",
        MCP_OAUTH_ENABLED: "false",
        MCP_DEFAULT_SHELL: "cmd",
      },
      cwd,
    );

    if (process.platform === "win32") {
      const gitBash = findGitBashExecutable();
      expect(config.defaultShell).toBe(gitBash ? "bash" : "pwsh");
    }
  });

  it("builds a Git Bash invocation on Windows", () => {
    if (process.platform !== "win32") return;

    const invocation = createShellInvocation(
      "bash",
      "printf '한글 출력 테스트\\n'",
    );

    expect(invocation.executable.toLowerCase()).toContain("bash");
    expect(invocation.args).toEqual(["-c", "printf '한글 출력 테스트\\n'"]);
  });

  it("builds a PowerShell 7 invocation", () => {
    const invocation = createShellInvocation(
      "pwsh",
      "Write-Output '한글 출력 테스트'",
    );

    expect(invocation.executable).toBe("pwsh");
    expect(invocation.args).toContain("-NoProfile");
    expect(invocation.args).toContain("-Command");
    expect(invocation.args.at(-1)).toContain("한글 출력 테스트");
  });

  it("keeps Windows PowerShell 5.1 available only when explicitly selected", () => {
    const invocation = createShellInvocation(
      "powershell",
      "Write-Output 'legacy'",
    );

    if (process.platform === "win32") {
      expect(invocation.executable).toBe("powershell.exe");
    }
  });
});
