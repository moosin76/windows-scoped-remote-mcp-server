import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Tool } from "@modelcontextprotocol/server";
import type { McpProvider } from "./mcp-provider.js";

export interface NamespacedTool {
  readonly providerId: string;
  readonly remoteName: string;
  readonly tool: Tool;
}

export interface ProviderStatus {
  id: string;
  namespace: string;
  connected: boolean;
  toolCount: number;
  lastError?: string;
}

/** Registry for remote MCP providers and their namespaced tools. */
export interface ProviderRegistryOptions {
  snapshotCachePath?: string;
}

interface PersistedProviderToolSnapshot {
  version: 1;
  providers: Record<string, readonly NamespacedTool[]>;
}

export class ProviderRegistry {
  private readonly providers = new Map<string, McpProvider>();
  private readonly toolSnapshots = new Map<string, readonly NamespacedTool[]>();
  private readonly lastDiscoveryAttempt = new Map<string, number>();
  private readonly discoveryRetryMs = 5_000;
  private readonly snapshotCachePath?: string;
  private readonly persistedSnapshots = new Map<string, readonly NamespacedTool[]>();

  constructor(options: ProviderRegistryOptions = {}) {
    this.snapshotCachePath = options.snapshotCachePath;
    this.loadPersistedSnapshots();
  }

  add(provider: McpProvider): void {
    if (this.providers.has(provider.id)) {
      throw new Error(`MCP provider '${provider.id}' is already registered`);
    }
    if (
      [...this.providers.values()].some(
        (item) => item.namespace === provider.namespace,
      )
    ) {
      throw new Error(
        `MCP namespace '${provider.namespace}' is already registered`,
      );
    }
    this.providers.set(provider.id, provider);
    const cached = this.persistedSnapshots.get(provider.id);
    if (cached?.length) {
      const prefix = `${provider.namespace}_`;
      const compatible = cached.filter((entry) =>
        entry.providerId === provider.id &&
        entry.tool.name.startsWith(prefix),
      );
      if (compatible.length) {
        this.toolSnapshots.set(provider.id, Object.freeze(compatible.slice()));
      }
    }
  }

  remove(id: string): McpProvider | undefined {
    const provider = this.providers.get(id);
    if (provider) {
      this.providers.delete(id);
      this.toolSnapshots.delete(id);
    }
    return provider;
  }

  get(id: string): McpProvider | undefined {
    return this.providers.get(id);
  }

  list(): readonly McpProvider[] {
    return [...this.providers.values()];
  }

  /** Connect providers independently. One unavailable provider must not stop the gateway. */
  async connectAll(): Promise<void> {
    for (const provider of this.providers.values()) {
      try {
        await provider.connect();
        await this.refresh(provider.id);
      } catch (error) {
        console.warn(
          `[MCP Provider] '${provider.id}' unavailable: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  /**
   * Discover providers that are currently unavailable, with a small retry throttle.
   * This is safe to call whenever an MCP client asks for the current tool list.
   */
  async discoverAvailable(): Promise<void> {
    const now = Date.now();
    for (const provider of this.providers.values()) {
      if (provider.isConnected() && this.toolSnapshots.has(provider.id))
        continue;
      const lastAttempt = this.lastDiscoveryAttempt.get(provider.id) ?? 0;
      if (now - lastAttempt < this.discoveryRetryMs) continue;
      this.lastDiscoveryAttempt.set(provider.id, now);
      try {
        await provider.connect();
        await this.refresh(provider.id);
        console.log(
          `[MCP Provider] '${provider.id}' discovered (${this.toolSnapshots.get(provider.id)?.length ?? 0} tools)`,
        );
      } catch (error) {
        console.warn(
          `[MCP Provider] '${provider.id}' discovery failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
  async closeAll(): Promise<void> {
    await Promise.all(
      [...this.providers.values()].map((provider) => provider.close()),
    );
  }

  async refresh(id: string): Promise<readonly NamespacedTool[]> {
    const provider = this.providers.get(id);
    if (!provider) throw new Error(`MCP provider '${id}' is not registered`);

    const result: NamespacedTool[] = [];
    const names = new Set<string>();
    for (const tool of await provider.listTools()) {
      const remoteName = tool.name;
      const name = provider.namespacedToolName(remoteName);
      if (names.has(name))
        throw new Error(`Duplicate namespaced MCP tool '${name}'`);
      names.add(name);
      result.push({
        providerId: provider.id,
        remoteName,
        tool: { ...tool, name },
      });
    }

    const snapshot = Object.freeze(result.slice());
    this.toolSnapshots.set(id, snapshot);
    this.persistedSnapshots.set(id, snapshot);
    this.persistSnapshots();
    return snapshot;
  }

  async listTools(): Promise<readonly NamespacedTool[]> {
    for (const provider of this.providers.values()) {
      if (provider.isConnected() && !this.toolSnapshots.has(provider.id)) {
        await this.refresh(provider.id);
      }
    }
    return [...this.toolSnapshots.values()].flat();
  }

  /** Return the last discovered tool snapshot without performing network I/O. */
  listCachedTools(): readonly NamespacedTool[] {
    return [...this.toolSnapshots.values()].flat();
  }

  listStatuses(): readonly ProviderStatus[] {
    return this.list().map((provider) => ({
      id: provider.id,
      namespace: provider.namespace,
      connected: provider.isConnected(),
      toolCount: this.toolSnapshots.get(provider.id)?.length ?? 0,
      ...(provider.lastError ? { lastError: provider.lastError } : {}),
    }));
  }

  private loadPersistedSnapshots(): void {
    if (!this.snapshotCachePath || !existsSync(this.snapshotCachePath)) return;
    try {
      const parsed = JSON.parse(
        readFileSync(this.snapshotCachePath, "utf8"),
      ) as PersistedProviderToolSnapshot;
      if (parsed.version !== 1 || !parsed.providers || typeof parsed.providers !== "object") {
        return;
      }
      for (const [providerId, entries] of Object.entries(parsed.providers)) {
        if (!Array.isArray(entries)) continue;
        const valid = entries.filter((entry): entry is NamespacedTool =>
          !!entry &&
          typeof entry.providerId === "string" &&
          typeof entry.remoteName === "string" &&
          !!entry.tool &&
          typeof entry.tool.name === "string",
        );
        if (valid.length) {
          this.persistedSnapshots.set(providerId, Object.freeze(valid.slice()));
        }
      }
    } catch (error) {
      console.warn(
        `[MCP Provider] Could not read tool snapshot cache: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private persistSnapshots(): void {
    if (!this.snapshotCachePath) return;
    try {
      mkdirSync(dirname(this.snapshotCachePath), { recursive: true });
      const providers = Object.fromEntries(
        [...this.persistedSnapshots.entries()].map(([id, entries]) => [
          id,
          entries,
        ]),
      );
      const payload: PersistedProviderToolSnapshot = {
        version: 1,
        providers,
      };
      writeFileSync(
        this.snapshotCachePath,
        JSON.stringify(payload, null, 2) + "\n",
        "utf8",
      );
    } catch (error) {
      console.warn(
        `[MCP Provider] Could not persist tool snapshot cache: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  resolve(namespacedName: string): {
    provider: McpProvider;
    remoteName: string;
  } {
    for (const provider of this.providers.values()) {
      if (namespacedName.startsWith(`${provider.namespace}_`)) {
        return {
          provider,
          remoteName: provider.remoteToolName(namespacedName),
        };
      }
    }
    throw new Error(`No MCP provider owns tool '${namespacedName}'`);
  }
}
