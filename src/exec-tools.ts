import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { AppConfig } from "./config.js";
import { FileService } from "./file-service.js";
import { ProcessManager } from "./process-manager.js";
import { runScript, type ScriptInterpreter } from "./script-runner.js";
import { runTool } from "./tool-result.js";

export function registerExecTools(
  server: McpServer,
  config: AppConfig,
  processManager: ProcessManager,
  fileService: FileService,
): void {
  const isWin = process.platform === "win32";

  server.registerTool(
    "exec_command",
    {
      title: "Execute Shell Command",
      description:
        "Execute a shell command inside the sandboxed workspace. On Windows, uses PowerShell (or CMD). Returns output immediately or session ID if long-running.",
      inputSchema: {
        cmd: z.string().min(1).describe("The shell command to execute."),
        workdir: z
          .string()
          .optional()
          .describe(`Working directory relative to workspace root (${config.workspaceRoot}).`),
        shell: z
          .enum(["powershell", "cmd", "pwsh", "bash", "sh"])
          .optional()
          .describe("Shell to use. Defaults to powershell on Windows, bash on Linux."),
        env: z.record(z.string()).optional().describe("Additional environment variables."),
        stdin: z.string().optional().describe("Optional input string to write to stdin."),
        timeoutMs: z.number().int().min(0).default(0).describe("Timeout in ms (0 = unlimited)."),
        yieldTimeMs: z
          .number()
          .int()
          .min(0)
          .max(30_000)
          .default(10_000)
          .describe("Wait time before returning a running background session."),
        maxOutputBytes: z
          .number()
          .int()
          .min(16 * 1024)
          .max(config.maxOutputBytes)
          .default(config.maxOutputBytes),
      },
    },
    async ({ cmd, workdir, shell, env, stdin, timeoutMs, yieldTimeMs, maxOutputBytes }) =>
      runTool(async () => {
        const cwd = fileService.resolve(workdir || ".");
        const selectedShell = shell || (isWin ? "powershell" : "bash");

        let executable: string = selectedShell;
        let args: string[] = [];

        if (selectedShell === "powershell") {
          executable = "powershell.exe";
          args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", cmd];
        } else if (selectedShell === "cmd") {
          executable = "cmd.exe";
          args = ["/c", cmd];
        } else if (selectedShell === "pwsh") {
          executable = "pwsh";
          args = ["-NoProfile", "-Command", cmd];
        } else {
          executable = "bash";
          args = ["-c", cmd];
        }

        const sessionId = processManager.start({
          executable,
          args,
          commandForDisplay: cmd,
          cwd,
          env,
          timeoutMs,
          stdin,
        });

        const result = await processManager.read(sessionId, {
          waitMs: yieldTimeMs,
          maxOutputBytes,
        });

        return {
          ...result,
          completed: !result.running,
        };
      }),
  );

  server.registerTool(
    "run_script",
    {
      title: "Run Multi-line Script",
      description:
        "Execute a multi-line script (PowerShell, Batch, Node.js, Python) inside the sandboxed workspace.",
      inputSchema: {
        script: z.string().min(1).describe("Complete script contents."),
        interpreter: z
          .enum(["powershell", "cmd", "node", "python", "bash", "sh", "custom"])
          .default(isWin ? "powershell" : "bash")
          .describe("Script interpreter language."),
        customInterpreter: z.string().optional().describe("Executable if interpreter='custom'."),
        args: z.array(z.string()).optional().describe("Arguments passed to script."),
        workdir: z.string().optional().describe("Working directory relative to workspace root."),
        env: z.record(z.string()).optional(),
        stdin: z.string().optional(),
        timeoutMs: z.number().int().min(0).default(0),
        yieldTimeMs: z.number().int().min(0).max(30_000).default(10_000),
        maxOutputBytes: z.number().int().default(config.maxOutputBytes),
      },
    },
    async ({
      script,
      interpreter,
      customInterpreter,
      args,
      workdir,
      env,
      stdin,
      timeoutMs,
      yieldTimeMs,
      maxOutputBytes,
    }) =>
      runTool(async () => {
        const cwd = fileService.resolve(workdir || ".");
        const sessionId = await runScript(processManager, fileService.workspaceRoot, {
          script,
          interpreter: interpreter as ScriptInterpreter,
          customInterpreter,
          args,
          workdir: cwd,
          env,
          stdin,
          timeoutMs,
        });

        const result = await processManager.read(sessionId, {
          waitMs: yieldTimeMs,
          maxOutputBytes,
        });

        return {
          ...result,
          completed: !result.running,
        };
      }),
  );

  server.registerTool(
    "read_process",
    {
      title: "Read Running Process Output",
      description: "Poll stdout/stderr output from a running process session by sessionId.",
      inputSchema: {
        sessionId: z.string().uuid(),
        afterSeq: z.number().int().min(0).default(0),
        waitMs: z.number().int().min(0).max(30_000).default(5_000),
        maxOutputBytes: z.number().int().default(config.maxOutputBytes),
      },
    },
    async ({ sessionId, afterSeq, waitMs, maxOutputBytes }) =>
      runTool(async () => {
        const result = await processManager.read(sessionId, {
          afterSeq,
          waitMs,
          maxOutputBytes,
        });
        return {
          ...result,
          completed: !result.running,
        };
      }),
  );

  server.registerTool(
    "write_stdin",
    {
      title: "Write to Process Stdin",
      description: "Send text input to a running process's stdin.",
      inputSchema: {
        sessionId: z.string().uuid(),
        input: z.string().describe("Text to send to stdin."),
        end: z.boolean().default(false).describe("Close stdin stream after writing."),
      },
    },
    async ({ sessionId, input, end }) =>
      runTool(async () => {
        processManager.writeStdin(sessionId, input, end);
        return { success: true, sessionId };
      }),
  );

  server.registerTool(
    "terminate_process",
    {
      title: "Terminate Process",
      description: "Send termination signal (or Windows taskkill) to stop a running process session.",
      inputSchema: {
        sessionId: z.string().uuid(),
        signal: z.enum(["SIGINT", "SIGTERM", "SIGKILL"]).default("SIGTERM"),
      },
    },
    async ({ sessionId, signal }) =>
      runTool(async () => {
        await processManager.terminate(sessionId, signal);
        return { success: true, sessionId };
      }),
  );

  server.registerTool(
    "list_processes",
    {
      title: "List Processes",
      description: "List currently managed running or recently completed process sessions.",
      inputSchema: {},
    },
    async () =>
      runTool(async () => {
        return { processes: processManager.list() };
      }),
  );
}
