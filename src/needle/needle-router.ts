import { createHash } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import type {
  NeedleRouteResult,
  NeedleSidecarResponse,
  NeedleToolSchema,
} from "./needle-types.js";

export interface NeedleRouterOptions {
  enabled: boolean;
  pythonCommand: string;
  confidenceThreshold: number;
  toolIndexPath: string;
  requestTimeoutMs: number;
  maxSidecars?: number;
  scriptPath?: string;
  cwd?: string;
}

interface PendingRequest {
  resolve: (value: NeedleSidecarResponse) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

interface SidecarState {
  fingerprint: string;
  child: ChildProcessWithoutNullStreams;
  stdoutBuffer: string;
  stderrTail: string;
  pending: Map<number, PendingRequest>;
  lastUsedAt: number;
}

export class NeedleRouter {
  private nextId = 1;
  private readonly sidecars = new Map<string, SidecarState>();
  private readonly scriptPath: string;
  private readonly cwd: string;
  private readonly maxSidecars: number;

  constructor(private readonly options: NeedleRouterOptions) {
    this.cwd = options.cwd ?? process.cwd();
    this.scriptPath =
      options.scriptPath ?? path.resolve(this.cwd, "scripts", "needle_router.py");
    this.maxSidecars = Math.max(1, options.maxSidecars ?? 3);
  }

  async route(
    query: string,
    tools: readonly NeedleToolSchema[],
    catalogProviderIds: readonly string[] = [],
  ): Promise<NeedleRouteResult> {
    const startedAt = performance.now();
    const unavailable = (error: string): NeedleRouteResult => ({
      enabled: this.options.enabled,
      available: false,
      catalogCount: tools.length,
      catalogProviderIds: [...catalogProviderIds],
      confidence: null,
      confidenceThreshold: this.options.confidenceThreshold,
      functionCalls: [],
      suppressedCalls: [],
      reasoning: null,
      recommended: false,
      escalate: true,
      latencyMs: Math.round(performance.now() - startedAt),
      error,
    });

    if (!this.options.enabled) {
      return unavailable("Needle routing is disabled.");
    }
    if (!query.trim()) {
      return unavailable("Needle query must not be empty.");
    }
    if (tools.length === 0) {
      return unavailable("Needle tool catalog is empty.");
    }

    const sidecarTools = tools.map(({ providerId: _providerId, ...tool }) => tool);
    const fingerprint = this.catalogFingerprint(sidecarTools);

    try {
      const response = await this.sendRequest(fingerprint, {
        query,
        tools: sidecarTools,
        tool_index_path: this.options.toolIndexPath,
      });
      const functionCalls = Array.isArray(response.function_calls)
        ? response.function_calls
        : [];
      const suppressedCalls = Array.isArray(response.suppressed_calls)
        ? response.suppressed_calls
        : [];
      const confidence =
        typeof response.confidence === "number" ? response.confidence : null;

      if (!response.ok) {
        return unavailable(response.error || "Needle sidecar returned an error.");
      }

      const recommended =
        functionCalls.length > 0 &&
        confidence !== null &&
        confidence >= this.options.confidenceThreshold;
      const metrics: NonNullable<NeedleRouteResult["metrics"]> = {};
      if (typeof response.prefill_tps === "number")
        metrics.prefillTps = response.prefill_tps;
      if (typeof response.decode_tps === "number")
        metrics.decodeTps = response.decode_tps;
      if (typeof response.peak_ram_mb === "number")
        metrics.peakRamMb = response.peak_ram_mb;

      return {
        enabled: true,
        available: true,
        catalogCount: tools.length,
        catalogProviderIds: [...catalogProviderIds],
        confidence,
        confidenceThreshold: this.options.confidenceThreshold,
        functionCalls,
        suppressedCalls,
        reasoning:
          typeof response.reasoning === "string" ? response.reasoning : null,
        recommended,
        escalate: !recommended,
        latencyMs: Math.round(performance.now() - startedAt),
        ...(Object.keys(metrics).length > 0 ? { metrics } : {}),
      };
    } catch (error) {
      return unavailable(error instanceof Error ? error.message : String(error));
    }
  }

  async close(): Promise<void> {
    const states = [...this.sidecars.values()];
    this.sidecars.clear();
    for (const state of states) {
      state.child.kill();
    }
    await Promise.all(
      states.map(
        (state) =>
          new Promise<void>((resolve) => {
            if (
              state.child.exitCode !== null ||
              state.child.signalCode !== null
            ) {
              resolve();
              return;
            }
            const timer = setTimeout(resolve, 1_000);
            state.child.once("exit", () => {
              clearTimeout(timer);
              resolve();
            });
          }),
      ),
    );
  }

  private catalogFingerprint(tools: readonly Record<string, unknown>[]): string {
    return createHash("sha256")
      .update(JSON.stringify(tools))
      .digest("hex");
  }

  private async sendRequest(
    fingerprint: string,
    payload: Record<string, unknown>,
  ): Promise<NeedleSidecarResponse> {
    const state = this.ensureProcess(fingerprint);
    state.lastUsedAt = Date.now();
    const id = this.nextId++;

    return await new Promise<NeedleSidecarResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        state.pending.delete(id);
        reject(
          new Error(
            `Needle sidecar request timed out after ${this.options.requestTimeoutMs}ms`,
          ),
        );
        this.restartProcess(state);
      }, this.options.requestTimeoutMs);

      state.pending.set(id, { resolve, reject, timer });
      try {
        state.child.stdin.write(
          JSON.stringify({ id, ...payload }) + "\n",
          "utf8",
        );
      } catch (error) {
        clearTimeout(timer);
        state.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private ensureProcess(fingerprint: string): SidecarState {
    const existing = this.sidecars.get(fingerprint);
    if (
      existing &&
      existing.child.exitCode === null &&
      existing.child.signalCode === null
    ) {
      existing.lastUsedAt = Date.now();
      return existing;
    }
    if (existing) this.sidecars.delete(fingerprint);

    this.evictIdleSidecarIfNeeded();

    const child = spawn(this.options.pythonCommand, [this.scriptPath], {
      cwd: this.cwd,
      env: {
        ...process.env,
        NEEDLE_TELEMETRY: "0",
        DO_NOT_TRACK: "1",
        PYTHONUNBUFFERED: "1",
        PYTHONUTF8: "1",
      },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const state: SidecarState = {
      fingerprint,
      child,
      stdoutBuffer: "",
      stderrTail: "",
      pending: new Map(),
      lastUsedAt: Date.now(),
    };
    this.sidecars.set(fingerprint, state);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) =>
      this.consumeStdout(state, chunk),
    );

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      state.stderrTail = (state.stderrTail + chunk).slice(-8_192);
    });

    child.on("error", (error) => {
      this.failAll(
        state,
        new Error(`Needle sidecar failed to start: ${error.message}`),
      );
      if (this.sidecars.get(fingerprint) === state) {
        this.sidecars.delete(fingerprint);
      }
    });

    child.on("exit", (code, signal) => {
      const suffix = state.stderrTail.trim()
        ? ` stderr=${state.stderrTail.trim()}`
        : "";
      this.failAll(
        state,
        new Error(
          `Needle sidecar exited (code=${code ?? "null"}, signal=${signal ?? "null"}).${suffix}`,
        ),
      );
      if (this.sidecars.get(fingerprint) === state) {
        this.sidecars.delete(fingerprint);
      }
    });

    return state;
  }

  private evictIdleSidecarIfNeeded(): void {
    if (this.sidecars.size < this.maxSidecars) return;
    const candidate = [...this.sidecars.values()]
      .filter((state) => state.pending.size === 0)
      .sort((a, b) => a.lastUsedAt - b.lastUsedAt)[0];
    if (!candidate) return;
    this.sidecars.delete(candidate.fingerprint);
    candidate.child.kill();
  }

  private consumeStdout(state: SidecarState, chunk: string): void {
    state.stdoutBuffer += chunk;
    while (true) {
      const newline = state.stdoutBuffer.indexOf("\n");
      if (newline < 0) break;
      const line = state.stdoutBuffer.slice(0, newline).trim();
      state.stdoutBuffer = state.stdoutBuffer.slice(newline + 1);
      if (!line) continue;

      let response: NeedleSidecarResponse;
      try {
        response = JSON.parse(line) as NeedleSidecarResponse;
      } catch {
        state.stderrTail = (
          state.stderrTail + `\n[malformed stdout] ${line}`
        ).slice(-8_192);
        continue;
      }

      if (!Number.isInteger(response.id)) continue;
      const pending = state.pending.get(response.id);
      if (!pending) continue;
      clearTimeout(pending.timer);
      state.pending.delete(response.id);
      state.lastUsedAt = Date.now();
      pending.resolve(response);
    }
  }

  private failAll(state: SidecarState, error: Error): void {
    for (const pending of state.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    state.pending.clear();
  }

  private restartProcess(state: SidecarState): void {
    if (this.sidecars.get(state.fingerprint) === state) {
      this.sidecars.delete(state.fingerprint);
    }
    state.child.kill();
  }
}
