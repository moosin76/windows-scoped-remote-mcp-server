import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { wrapPowerShellCommand } from "./powershell-utf8.js";

export type ShellName = "powershell" | "pwsh" | "cmd" | "bash" | "sh";

export interface ShellInvocation {
  executable: string;
  args: string[];
}

function findCommandsOnPath(command: string): string[] {
  if (process.platform !== "win32") return [];

  const result = spawnSync("where.exe", [command], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) return [];

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function uniqueExistingPaths(candidates: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const resolved = path.resolve(candidate);
    const key = resolved.toLowerCase();
    if (seen.has(key) || !existsSync(resolved)) continue;
    seen.add(key);
    result.push(resolved);
  }

  return result;
}

function gitBashCandidates(
  env: NodeJS.ProcessEnv = process.env,
  includePath = true,
): string[] {
  const candidates: Array<string | undefined> = includePath
    ? [...findCommandsOnPath("bash")]
    : [];

  // If git.exe is on PATH, derive the adjacent Git for Windows bash paths.
  for (const gitExe of includePath ? findCommandsOnPath("git") : []) {
    const gitDir = path.dirname(gitExe);
    const gitRoot = path.basename(gitDir).toLowerCase() === "cmd"
      ? path.dirname(gitDir)
      : path.dirname(gitDir);
    candidates.push(
      path.join(gitRoot, "bin", "bash.exe"),
      path.join(gitRoot, "usr", "bin", "bash.exe"),
    );
  }

  // Standard Git for Windows installation locations. These do not require PATH setup.
  if (env.ProgramW6432) {
    candidates.push(
      path.join(env.ProgramW6432, "Git", "bin", "bash.exe"),
      path.join(env.ProgramW6432, "Git", "usr", "bin", "bash.exe"),
    );
  }
  if (env.ProgramFiles) {
    candidates.push(
      path.join(env.ProgramFiles, "Git", "bin", "bash.exe"),
      path.join(env.ProgramFiles, "Git", "usr", "bin", "bash.exe"),
    );
  }
  if (env["ProgramFiles(x86)"]) {
    candidates.push(
      path.join(env["ProgramFiles(x86)"], "Git", "bin", "bash.exe"),
      path.join(env["ProgramFiles(x86)"], "Git", "usr", "bin", "bash.exe"),
    );
  }
  if (env.LOCALAPPDATA) {
    candidates.push(
      path.join(env.LOCALAPPDATA, "Programs", "Git", "bin", "bash.exe"),
      path.join(env.LOCALAPPDATA, "Programs", "Git", "usr", "bin", "bash.exe"),
    );
  }

  return uniqueExistingPaths(candidates);
}

export function commandExists(command: string): boolean {
  const lookup = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnSync(lookup, [command], {
    encoding: "utf8",
    windowsHide: true,
  });
  return result.status === 0 && result.stdout.trim().length > 0;
}

export function findGitBashExecutable(
  env: NodeJS.ProcessEnv = process.env,
  includePath = true,
): string | undefined {
  if (process.platform !== "win32") return undefined;

  for (const candidate of gitBashCandidates(env, includePath)) {
    const probe = spawnSync(candidate, ["-lc", "uname -s"], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 3000,
    });
    if (probe.status !== 0) continue;

    const platformName = probe.stdout.trim();
    if (/^(MINGW|MSYS|CYGWIN)/i.test(platformName)) {
      return candidate;
    }
  }

  return undefined;
}

export function detectDefaultShell(): string {
  if (process.platform === "win32") {
    if (findGitBashExecutable()) return "bash";
    return "pwsh";
  }

  return process.env.SHELL?.trim() || "/bin/bash";
}

export function ensurePreferredWindowsShell(): void {
  if (process.platform !== "win32") return;
  if (findGitBashExecutable() || commandExists("pwsh")) return;

  console.log("[*] Git Bash/PowerShell 7 not found. Installing PowerShell 7 with winget...");
  const install = spawnSync(
    "winget",
    [
      "install",
      "--id",
      "Microsoft.PowerShell",
      "--source",
      "winget",
      "--accept-package-agreements",
      "--accept-source-agreements",
      "--silent",
    ],
    {
      stdio: "inherit",
      windowsHide: false,
    },
  );

  if (install.status !== 0 || !commandExists("pwsh")) {
    throw new Error(
      "PowerShell 7 installation failed. Install PowerShell 7 manually and restart WSR.",
    );
  }
}

export function createShellInvocation(
  shell: string,
  command: string,
): ShellInvocation {
  if (shell === "powershell") {
    return {
      executable: process.platform === "win32" ? "powershell.exe" : "powershell",
      args: [
        "-NoProfile",
        ...(process.platform === "win32" ? ["-ExecutionPolicy", "Bypass"] : []),
        "-Command",
        wrapPowerShellCommand(command),
      ],
    };
  }

  if (shell === "pwsh") {
    return {
      executable: "pwsh",
      args: ["-NoProfile", "-Command", wrapPowerShellCommand(command)],
    };
  }

  if (shell === "cmd") {
    return {
      executable: process.platform === "win32" ? "cmd.exe" : "cmd",
      args: ["/c", command],
    };
  }

  if (shell === "bash" && process.platform === "win32") {
    return {
      executable: findGitBashExecutable() || "bash",
      args: ["-c", command],
    };
  }

  return {
    executable: shell,
    args: ["-c", command],
  };
}
