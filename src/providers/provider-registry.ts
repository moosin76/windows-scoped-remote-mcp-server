import type { Tool } from "@modelcontextprotocol/sdk/types.js";
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
export class ProviderRegistry {
  private readonly providers = new Map<string, McpProvider>();
  private readonly toolSnapshots = new Map<string, readonly NamespacedTool[]>();
  private readonly lastDiscoveryAttempt = new Map<string, number>();
  private readonly discoveryRetryMs = 5_000;

  add(provider: McpProvider): void {
    if (this.providers.has(provider.id)) {
      throw new Error(`MCP provider '${provider.id}' is already registered`);
    }
    if ([...this.providers.values()].some((item) => item.namespace === provider.namespace)) {
      throw new Error(`MCP namespace '${provider.namespace}' is already registered`);
    }
    this.providers.set(provider.id, provider);
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
        console.warn(`[MCP Provider] '${provider.id}' unavailable: ${error instanceof Error ? error.message : String(error)}`);
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
      if (provider.isConnected() && this.toolSnapshots.has(provider.id)) continue;
      const lastAttempt = this.lastDiscoveryAttempt.get(provider.id) ?? 0;
      if (now - lastAttempt < this.discoveryRetryMs) continue;
      this.lastDiscoveryAttempt.set(provider.id, now);
      try {
        await provider.connect();
        await this.refresh(provider.id);
        console.log(`[MCP Provider] '${provider.id}' discovered (${this.toolSnapshots.get(provider.id)?.length ?? 0} tools)`);
      } catch (error) {
        console.warn(`[MCP Provider] '${provider.id}' discovery failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  async closeAll(): Promise<void> {
    await Promise.all([...this.providers.values()].map((provider) => provider.close()));
  }

  async refresh(id: string): Promise<readonly NamespacedTool[]> {
    const provider = this.providers.get(id);
    if (!provider) throw new Error(`MCP provider '${id}' is not registered`);

    const result: NamespacedTool[] = [];
    const names = new Set<string>();
    for (const tool of await provider.listTools()) {
      const remoteName = tool.name;
      const name = provider.namespacedToolName(remoteName);
      if (names.has(name)) throw new Error(`Duplicate namespaced MCP tool '${name}'`);
      names.add(name);
      result.push({ providerId: provider.id, remoteName, tool: { ...tool, name } });
    }

    const snapshot = Object.freeze(result.slice());
    this.toolSnapshots.set(id, snapshot);
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

  resolve(namespacedName: string): { provider: McpProvider; remoteName: string } {
    for (const provider of this.providers.values()) {
      if (namespacedName.startsWith(`${provider.namespace}_`)) {
        return { provider, remoteName: provider.remoteToolName(namespacedName) };
      }
    }
    throw new Error(`No MCP provider owns tool '${namespacedName}'`);
  }
}
