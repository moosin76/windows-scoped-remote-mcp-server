import type { ProviderRegistry } from "./provider-registry.js";

export interface ProviderSchedulerOptions {
  /** Health/tool discovery interval for connected providers. Default: 10 seconds. */
  intervalMs?: number;
  /** Retry interval for unavailable providers. Default: 5 seconds. */
  retryIntervalMs?: number;
  onToolsChanged?: (providerId: string) => void;
}

/** Background scheduler for optional remote MCP providers. */
export class ProviderScheduler {
  private readonly registry: ProviderRegistry;
  private readonly intervalMs: number;
  private readonly retryIntervalMs: number;
  private readonly onToolsChanged?: (providerId: string) => void;
  private timer?: ReturnType<typeof setTimeout>;
  private running = false;
  private polling = false;
  private readonly nextRetryAt = new Map<string, number>();
  private readonly snapshotHashes = new Map<string, string>();
  private readonly knownConnectionStates = new Map<string, boolean>();

  constructor(registry: ProviderRegistry, options: ProviderSchedulerOptions = {}) {
    this.registry = registry;
    this.intervalMs = options.intervalMs ?? 10_000;
    this.retryIntervalMs = options.retryIntervalMs ?? 5_000;
    this.onToolsChanged = options.onToolsChanged;
  }

  start(): void {
    if (this.running || this.registry.list().length === 0) return;
    this.running = true;
    void this.poll();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    while (this.polling) await new Promise((resolve) => setTimeout(resolve, 10));
  }

  async pollNow(): Promise<void> {
    await this.poll();
  }

  private schedule(delayMs: number): void {
    if (!this.running) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.poll(), delayMs);
  }

  private async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    let nextDelay = this.intervalMs;

    try {
      const now = Date.now();
      for (const provider of this.registry.list()) {
        if (!provider.isConnected()) {
          const retryAt = this.nextRetryAt.get(provider.id) ?? 0;
          if (now < retryAt) {
            nextDelay = Math.min(nextDelay, Math.max(100, retryAt - now));
            continue;
          }

          try {
            await provider.connect();
            const changed = await this.refreshAndDetectChange(provider.id);
            this.nextRetryAt.delete(provider.id);
            if (changed) this.onToolsChanged?.(provider.id);
            this.recordConnected(provider.id);
          } catch (error) {
            this.nextRetryAt.set(provider.id, Date.now() + this.retryIntervalMs);
            nextDelay = Math.min(nextDelay, this.retryIntervalMs);
            this.recordDisconnected(provider.id, error);
          }
          continue;
        }

        try {
          const changed = await this.refreshAndDetectChange(provider.id);
          this.recordConnected(provider.id);
          if (changed) {
            this.onToolsChanged?.(provider.id);
            console.log(`[MCP Provider Scheduler] '${provider.id}' tool list changed`);
          }
        } catch (error) {
          this.nextRetryAt.set(provider.id, Date.now() + this.retryIntervalMs);
          nextDelay = Math.min(nextDelay, this.retryIntervalMs);
          this.recordDisconnected(provider.id, error);
        }
      }
    } finally {
      this.polling = false;
      this.schedule(nextDelay);
    }
  }

  private recordConnected(providerId: string): void {
    const wasConnected = this.knownConnectionStates.get(providerId);
    this.knownConnectionStates.set(providerId, true);

    if (wasConnected !== true) {
      const count = this.registry.listCachedTools().filter((tool) => tool.providerId === providerId).length;
      console.log(`[MCP Provider Scheduler] '${providerId}' connected (${count} tools)`);
    }
  }

  private recordDisconnected(providerId: string, error: unknown): void {
    const wasConnected = this.knownConnectionStates.get(providerId);
    this.knownConnectionStates.set(providerId, false);

    // Only report a transition from connected -> disconnected.
    // Repeated unavailable -> unavailable checks stay silent.
    if (wasConnected === true) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[MCP Provider Scheduler] '${providerId}' disconnected: ${message}`);
    }
  }

  private async refreshAndDetectChange(providerId: string): Promise<boolean> {
    const tools = await this.registry.refresh(providerId);
    const hash = JSON.stringify(tools.map(({ remoteName, tool }) => ({ remoteName, tool })));
    const previous = this.snapshotHashes.get(providerId);
    this.snapshotHashes.set(providerId, hash);
    return previous !== undefined && previous !== hash;
  }
}
