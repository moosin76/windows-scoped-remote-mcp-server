import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { McpProvider } from "./mcp-provider.js";

export interface NamespacedTool {
  readonly providerId: string;
  readonly remoteName: string;
  readonly tool: Tool;
}

/** Registry for remote MCP providers and their namespaced tools. */
export class ProviderRegistry {
  private readonly providers = new Map<string, McpProvider>();

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
    if (provider) this.providers.delete(id);
    return provider;
  }

  get(id: string): McpProvider | undefined {
    return this.providers.get(id);
  }

  list(): readonly McpProvider[] {
    return [...this.providers.values()];
  }

  async connectAll(): Promise<void> {
    for (const provider of this.providers.values()) {
      await provider.connect();
    }
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.providers.values()].map((provider) => provider.close()));
  }

  async listTools(): Promise<readonly NamespacedTool[]> {
    const result: NamespacedTool[] = [];
    const names = new Set<string>();

    for (const provider of this.providers.values()) {
      for (const tool of await provider.listTools()) {
        const remoteName = tool.name;
        const name = provider.namespacedToolName(remoteName);
        if (names.has(name)) throw new Error(`Duplicate namespaced MCP tool '${name}'`);
        names.add(name);
        result.push({ providerId: provider.id, remoteName, tool: { ...tool, name } });
      }
    }

    return result;
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
