import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ProcessManager } from "./process-manager.js";
import {
  createPowerShellScriptContents,
  createPwshScriptContents,
} from "./powershell-utf8.js";

export type ScriptInterpreter =
  | "powershell"
  | "pwsh"
  | "cmd"
  | "bash"
  | "sh"
  | "node"
  | "python"
  | "custom";

export interface RunScriptOptions {
  script: string;
  interpreter?: ScriptInterpreter;
  customInterpreter?: string;
  args?: string[];
  workdir: string;
  env?: Record<string, string>;
  stdin?: string;
  timeoutMs?: number;
  yieldTimeMs?: number;
  maxOutputBytes?: number;
}

export async function runScript(
  processManager: ProcessManager,
  tempBaseDir: string,
  options: RunScriptOptions,
): Promise<string> {
  const isWin = process.platform === "win32";
  const interpreter = options.interpreter || (isWin ? "pwsh" : "bash");

  let extension = ".sh";
  let executable = "bash";
  let runnerArgs: string[] = [];

  if (interpreter === "powershell") {
    extension = ".ps1";
    executable = isWin ? "powershell.exe" : "powershell";
    runnerArgs = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"];
  } else if (interpreter === "pwsh") {
    extension = ".ps1";
    executable = "pwsh";
    runnerArgs = ["-NoProfile", "-File"];
  } else if (interpreter === "cmd") {
    extension = ".bat";
    executable = isWin ? "cmd.exe" : "cmd";
    runnerArgs = ["/c"];
  } else if (interpreter === "node") {
    extension = ".js";
    executable = "node";
    runnerArgs = [];
  } else if (interpreter === "python") {
    extension = ".py";
    executable = isWin ? "python" : "python3";
    runnerArgs = [];
  } else if (interpreter === "custom") {
    if (!options.customInterpreter) {
      throw new Error("customInterpreter is required when interpreter='custom'");
    }
    executable = options.customInterpreter;
    extension = ".script";
    runnerArgs = [];
  } else {
    extension = ".sh";
    executable = interpreter;
    runnerArgs = [];
  }

  const scriptDir = path.join(tempBaseDir, ".mcp_tmp_scripts");
  await mkdir(scriptDir, { recursive: true });
  const scriptFile = path.join(scriptDir, `script_${randomUUID()}${extension}`);
  const scriptContents =
    interpreter === "powershell"
      ? createPowerShellScriptContents(options.script)
      : interpreter === "pwsh"
        ? createPwshScriptContents(options.script)
        : options.script;
  await writeFile(scriptFile, scriptContents, "utf8");

  const cleanup = async () => {
    try {
      await rm(scriptFile, { force: true });
    } catch {
      // Ignore
    }
  };

  const finalArgs = [...runnerArgs, scriptFile, ...(options.args || [])];

  return processManager.start({
    executable,
    args: finalArgs,
    commandForDisplay: `${executable} ${options.args?.join(" ") || ""}`.trim(),
    cwd: options.workdir,
    env: options.env,
    stdin: options.stdin,
    timeoutMs: options.timeoutMs,
    cleanup,
  });
}
