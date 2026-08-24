import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export interface McpProvider {
  readonly id: string;
  readonly namespace: string;
  connect(): Promise<void>;
  close(): Promise<void>;
  isConnected(): boolean;
  listTools(): Promise<readonly Tool[]>;
  callTool(name: string, args?: Record<string, unknown>): Promise<Awaited<ReturnType<Client["callTool"]>>>;
  namespacedToolName(remoteToolName: string): string;
  remoteToolName(namespacedToolName: string): string;
}

export interface RemoteMcpProviderOptions {
  id: string;
  namespace: string;
  url: string;
  clientName?: string;
  clientVersion?: string;
  requestInit?: RequestInit;
}

/**
 * Generic MCP-over-Streamable-HTTP provider.
 *
 * This class deliberately does not know anything about Godot, Blender, or
 * another specific MCP implementation. The gateway can reuse it for any
 * compatible remote MCP server.
 */
export class RemoteMcpProvider implements McpProvider {
  readonly id: string;
  readonly namespace: string;

  private readonly url: URL;
  private readonly client: Client;
  private transport?: StreamableHTTPClientTransport;
  private connected = false;

  constructor(options: RemoteMcpProviderOptions) {
    this.id = options.id;
    this.namespace = options.namespace;
    this.url = new URL(options.url);
    this.client = new Client({
      name: options.clientName ?? "windows-scoped-remote-mcp-gateway",
      version: options.clientVersion ?? "1.0.0",
    });
    this.requestInit = options.requestInit;
  }

  private readonly requestInit?: RequestInit;

  async connect(): Promise<void> {
    if (this.connected) return;

    const transport = new StreamableHTTPClientTransport(this.url, {
      requestInit: this.requestInit,
    });

    try {
      await this.client.connect(transport);
      this.transport = transport;
      this.connected = true;
    } catch (error) {
      await transport.close().catch(() => undefined);
      throw error;
    }
  }

  async close(): Promise<void> {
    this.connected = false;
    this.transport = undefined;
    await this.client.close().catch(() => undefined);
  }

  isConnected(): boolean {
    return this.connected;
  }

  async listTools(): Promise<readonly Tool[]> {
    this.requireConnected();
    const result = await this.client.listTools();
    return result.tools;
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<Awaited<ReturnType<Client["callTool"]>>> {
    this.requireConnected();
    return this.client.callTool({ name, arguments: args });
  }

  namespacedToolName(remoteToolName: string): string {
    return `${this.namespace}_${remoteToolName}`;
  }

  remoteToolName(namespacedToolName: string): string {
    const prefix = `${this.namespace}_`;
    if (!namespacedToolName.startsWith(prefix)) {
      throw new Error(`Tool '${namespacedToolName}' does not belong to provider '${this.id}'`);
    }
    return namespacedToolName.slice(prefix.length);
  }

  private requireConnected(): void {
    if (!this.connected) {
      throw new Error(`MCP provider '${this.id}' is not connected`);
    }
  }
}



