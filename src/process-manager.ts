import { randomUUID } from "node:crypto";
import { spawn, execFile, type ChildProcessWithoutNullStreams } from "node:child_process";
import { promisify } from "node:util";
import { errorMessage } from "./errors.js";

const execFileAsync = promisify(execFile);
const OUTPUT_CHUNK_BYTES = 16 * 1024;

export type ProcessOutputStream = "stdout" | "stderr";

interface OutputChunk {
  seq: number;
  stream: ProcessOutputStream;
  data: Buffer;
}

interface ManagedProcess {
  sessionId: string;
  child: ChildProcessWithoutNullStreams;
  command: string;
  cwd: string;
  startedAt: number;
  endedAt: number | undefined;
  exitCode: number | null | undefined;
  signal: NodeJS.Signals | null | undefined;
  error: string | undefined;
  timedOut: boolean;
  chunks: OutputChunk[];
  pendingOutput: Record<ProcessOutputStream, Buffer>;
  retainedBytes: number;
  totalOutputBytes: number;
  droppedOutputBytes: number;
  nextSeq: number;
  waiters: Set<() => void>;
  exitWaiters: Set<() => void>;
  timeoutHandle: NodeJS.Timeout | undefined;
  cleanup: (() => Promise<void>) | undefined;
}

export interface StartProcessRequest {
  executable: string;
  args: string[];
  commandForDisplay: string;
  cwd: string;
  env?: Record<string, string> | undefined;
  timeoutMs?: number | undefined;
  stdin?: string | undefined;
  cleanup?: (() => Promise<void>) | undefined;
}

export interface ReadProcessRequest {
  afterSeq?: number | undefined;
  waitMs?: number | undefined;
  maxOutputBytes?: number | undefined;
}

export interface ProcessReadResult {
  sessionId: string;
  command: string;
  cwd: string;
  running: boolean;
  pid: number | undefined;
  startedAt: string;
  endedAt: string | undefined;
  wallTimeMs: number;
  exitCode: number | null | undefined;
  signal: NodeJS.Signals | null | undefined;
  timedOut: boolean;
  error: string | undefined;
  stdout: string;
  stderr: string;
  output: string;
  nextSeq: number;
  hasMore: boolean;
  totalOutputBytes: number;
  droppedOutputBytes: number;
}

export interface ProcessManagerOptions {
  maxRetainedOutputBytes: number;
  processRetentionMs: number;
  maxProcesses: number;
  defaultMaxOutputBytes: number;
}

export class ProcessManager {
  readonly #processes = new Map<string, ManagedProcess>();
  readonly #options: ProcessManagerOptions;

  constructor(options: ProcessManagerOptions) {
    this.#options = options;
  }

  start(request: StartProcessRequest): string {
    this.prune();
    this.#makeCapacity();

    const isWin = process.platform === "win32";
    const child = spawn(request.executable, request.args, {
      cwd: request.cwd,
      env: { ...process.env, ...request.env },
      stdio: "pipe",
      detached: !isWin,
      windowsHide: true,
    });

    const sessionId = randomUUID();
    const managed: ManagedProcess = {
      sessionId,
      child,
      command: request.commandForDisplay,
      cwd: request.cwd,
      startedAt: Date.now(),
      endedAt: undefined,
      exitCode: undefined,
      signal: undefined,
      error: undefined,
      timedOut: false,
      chunks: [],
      pendingOutput: { stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) },
      retainedBytes: 0,
      totalOutputBytes: 0,
      droppedOutputBytes: 0,
      nextSeq: 1,
      waiters: new Set(),
      exitWaiters: new Set(),
      timeoutHandle: undefined,
      cleanup: request.cleanup,
    };
    this.#processes.set(sessionId, managed);

    child.stdout.on("data", (data: Buffer | string) => {
      this.#appendOutput(managed, "stdout", Buffer.from(data));
    });
    child.stderr.on("data", (data: Buffer | string) => {
      this.#appendOutput(managed, "stderr", Buffer.from(data));
    });
    child.stdin.on("error", (error) => {
      this.#recordStdinError(managed, error);
    });
    child.on("error", (error) => {
      managed.error = errorMessage(error);
      this.#finish(managed, null, null);
    });
    child.on("close", (code, signal) => {
      this.#finish(managed, code, signal);
    });

    const timeoutMs = request.timeoutMs ?? 0;
    if (timeoutMs > 0) {
      managed.timeoutHandle = setTimeout(() => {
        managed.timedOut = true;
        managed.error ??= `Process exceeded timeout of ${timeoutMs} ms`;
        this.terminate(sessionId, "SIGTERM");
        const forceTimer = setTimeout(() => {
          if (this.#isRunning(managed)) {
            this.terminate(sessionId, "SIGKILL");
          }
        }, 5000);
        forceTimer.unref();
      }, timeoutMs);
      managed.timeoutHandle.unref();
    }

    if (request.stdin !== undefined) {
      this.writeStdin(sessionId, request.stdin, true);
    }

    return sessionId;
  }

  async read(sessionId: string, request: ReadProcessRequest = {}): Promise<ProcessReadResult> {
    const managed = this.#getProcess(sessionId);
    const afterSeq = request.afterSeq ?? 0;
    const waitMs = request.waitMs ?? 0;
    const maxOutputBytes = request.maxOutputBytes ?? this.#options.defaultMaxOutputBytes;

    // If process is running and waitMs > 0, wait until process exits or waitMs expires
    if (waitMs > 0 && this.#isRunning(managed)) {
      await new Promise<void>((resolve) => {
        let timer: NodeJS.Timeout;
        const cleanup = () => {
          clearTimeout(timer);
          managed.exitWaiters.delete(onExit);
          managed.waiters.delete(onData);
        };

        const onExit = () => {
          cleanup();
          resolve();
        };

        const onData = () => {
          // If we accumulated enough output or process exited, resolve
          if (!this.#isRunning(managed)) {
            cleanup();
            resolve();
          }
        };

        timer = setTimeout(() => {
          cleanup();
          resolve();
        }, waitMs);
        timer.unref();

        managed.exitWaiters.add(onExit);
        managed.waiters.add(onData);
      });
    }

    return this.#buildReadResult(managed, afterSeq, maxOutputBytes);
  }

  writeStdin(sessionId: string, input: string, end = false): void {
    const managed = this.#getProcess(sessionId);
    if (!this.#isRunning(managed)) {
      throw new Error(`Process ${sessionId} is not running`);
    }
    if (input.length > 0) {
      managed.child.stdin.write(input);
    }
    if (end) {
      managed.child.stdin.end();
    }
  }

  async terminate(sessionId: string, signal: NodeJS.Signals = "SIGTERM"): Promise<void> {
    const managed = this.#getProcess(sessionId);
    if (!this.#isRunning(managed)) {
      return;
    }

    const pid = managed.child.pid;
    if (pid && process.platform === "win32") {
      try {
        // Kill the whole process tree forcefully on Windows
        await execFileAsync("taskkill", ["/PID", pid.toString(), "/T", "/F"]);
      } catch {
        try {
          managed.child.kill(signal);
        } catch {
          // Ignore
        }
      }
    } else if (pid) {
      try {
        process.kill(-pid, signal);
      } catch {
        try {
          managed.child.kill(signal);
        } catch {
          // Ignore
        }
      }
    }
  }

  list(): Array<{ sessionId: string; command: string; running: boolean; startedAt: string; endedAt?: string; exitCode?: number | null }> {
    this.prune();
    return Array.from(this.#processes.values()).map((p) => ({
      sessionId: p.sessionId,
      command: p.command,
      running: this.#isRunning(p),
      startedAt: new Date(p.startedAt).toISOString(),
      endedAt: p.endedAt ? new Date(p.endedAt).toISOString() : undefined,
      exitCode: p.exitCode,
    }));
  }

  prune(): void {
    const now = Date.now();
    for (const [id, p] of this.#processes.entries()) {
      if (!this.#isRunning(p) && p.endedAt && now - p.endedAt > this.#options.processRetentionMs) {
        this.#processes.delete(id);
      }
    }
  }

  #getProcess(sessionId: string): ManagedProcess {
    const managed = this.#processes.get(sessionId);
    if (!managed) {
      throw new Error(`Process session ${sessionId} not found`);
    }
    return managed;
  }

  #isRunning(p: ManagedProcess): boolean {
    return p.endedAt === undefined;
  }

  #appendOutput(managed: ManagedProcess, stream: ProcessOutputStream, data: Buffer): void {
    managed.totalOutputBytes += data.length;
    const chunk: OutputChunk = {
      seq: managed.nextSeq++,
      stream,
      data,
    };
    managed.chunks.push(chunk);
    managed.retainedBytes += data.length;

    // Prune oldest chunks if exceeding memory retention limit
    while (managed.retainedBytes > this.#options.maxRetainedOutputBytes && managed.chunks.length > 1) {
      const removed = managed.chunks.shift();
      if (removed) {
        managed.retainedBytes -= removed.data.length;
        managed.droppedOutputBytes += removed.data.length;
      }
    }

    for (const wake of managed.waiters) {
      wake();
    }
  }

  #recordStdinError(managed: ManagedProcess, err: unknown): void {
    managed.error = `Stdin error: ${errorMessage(err)}`;
  }

  #finish(managed: ManagedProcess, exitCode: number | null, signal: NodeJS.Signals | null): void {
    if (managed.endedAt !== undefined) return;
    managed.endedAt = Date.now();
    managed.exitCode = exitCode;
    managed.signal = signal;

    if (managed.timeoutHandle) {
      clearTimeout(managed.timeoutHandle);
      managed.timeoutHandle = undefined;
    }

    if (managed.cleanup) {
      managed.cleanup().catch(() => {});
    }

    for (const wake of managed.waiters) wake();
    for (const wake of managed.exitWaiters) wake();
  }

  #buildReadResult(managed: ManagedProcess, afterSeq: number, maxOutputBytes: number): ProcessReadResult {
    const relevant = managed.chunks.filter((c) => c.seq > afterSeq);
    let bytesAccumulated = 0;
    const stdoutParts: Buffer[] = [];
    const stderrParts: Buffer[] = [];
    const combinedParts: Buffer[] = [];
    let nextSeq = afterSeq;
    let hasMore = false;

    for (const chunk of relevant) {
      if (bytesAccumulated + chunk.data.length > maxOutputBytes && combinedParts.length > 0) {
        hasMore = true;
        break;
      }
      bytesAccumulated += chunk.data.length;
      nextSeq = chunk.seq;
      combinedParts.push(chunk.data);
      if (chunk.stream === "stdout") stdoutParts.push(chunk.data);
      else stderrParts.push(chunk.data);
    }

    const wallTimeMs = (managed.endedAt ?? Date.now()) - managed.startedAt;

    return {
      sessionId: managed.sessionId,
      command: managed.command,
      cwd: managed.cwd,
      running: this.#isRunning(managed),
      pid: managed.child.pid,
      startedAt: new Date(managed.startedAt).toISOString(),
      endedAt: managed.endedAt ? new Date(managed.endedAt).toISOString() : undefined,
      wallTimeMs,
      exitCode: managed.exitCode,
      signal: managed.signal,
      timedOut: managed.timedOut,
      error: managed.error,
      stdout: Buffer.concat(stdoutParts).toString("utf8"),
      stderr: Buffer.concat(stderrParts).toString("utf8"),
      output: Buffer.concat(combinedParts).toString("utf8"),
      nextSeq,
      hasMore,
      totalOutputBytes: managed.totalOutputBytes,
      droppedOutputBytes: managed.droppedOutputBytes,
    };
  }

  #makeCapacity(): void {
    if (this.#processes.size >= this.#options.maxProcesses) {
      // Remove oldest finished process
      for (const [id, p] of this.#processes.entries()) {
        if (!this.#isRunning(p)) {
          this.#processes.delete(id);
          return;
        }
      }
    }
  }
}
