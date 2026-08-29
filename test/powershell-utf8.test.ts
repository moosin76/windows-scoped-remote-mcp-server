import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  createPowerShellScriptContents,
  createPwshScriptContents,
  POWERSHELL_UTF8_PREAMBLE,
  wrapPowerShellCommand,
} from "../src/powershell-utf8.js";

describe("PowerShell UTF-8 bootstrap", () => {
  it("configures PowerShell and native command output for UTF-8", () => {
    expect(POWERSHELL_UTF8_PREAMBLE).toContain("[Console]::OutputEncoding");
    expect(POWERSHELL_UTF8_PREAMBLE).toContain("$OutputEncoding");
    expect(POWERSHELL_UTF8_PREAMBLE).toContain("chcp.com 65001");
  });

  it("preserves Korean output from Windows PowerShell commands", () => {
    if (process.platform !== "win32") return;

    const result = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        wrapPowerShellCommand(
          "Write-Output '한글 출력 테스트: 전투 스킬 커버 체이스'; Write-Output ([Console]::OutputEncoding.WebName); chcp.com",
        ),
      ],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("한글 출력 테스트: 전투 스킬 커버 체이스");
    expect(result.stdout).toContain("utf-8");
    expect(result.stdout).toContain("65001");
  });

  it("preserves Korean output from PowerShell 7 commands", () => {
    if (process.platform !== "win32") return;

    const result = spawnSync(
      "pwsh",
      [
        "-NoProfile",
        "-Command",
        wrapPowerShellCommand(
          "Write-Output '한글 출력 테스트: PowerShell 7'; Write-Output ([Console]::OutputEncoding.WebName)",
        ),
      ],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("한글 출력 테스트: PowerShell 7");
    expect(result.stdout).toContain("utf-8");
  });

  it("writes PowerShell 7 script source as UTF-8 without a BOM", () => {
    const contents = createPwshScriptContents(
      "Write-Output 'PowerShell 7 한글 테스트'",
    );

    expect(contents.charCodeAt(0)).not.toBe(0xfeff);
    expect(contents).toContain("PowerShell 7 한글 테스트");
  });

  it("writes PowerShell 5.1 script source with a BOM and UTF-8 output", async () => {
    const contents = createPowerShellScriptContents(
      "Write-Output '스크립트 한글 테스트: 어레인 트래비스'",
    );
    expect(contents.charCodeAt(0)).toBe(0xfeff);

    if (process.platform !== "win32") return;

    const tempDir = await mkdtemp(path.join(os.tmpdir(), "wsr-powershell-utf8-"));
    const scriptPath = path.join(tempDir, "utf8-test.ps1");
    try {
      await writeFile(scriptPath, contents, "utf8");
      const result = spawnSync(
        "powershell.exe",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
        { encoding: "utf8" },
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("스크립트 한글 테스트: 어레인 트래비스");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
