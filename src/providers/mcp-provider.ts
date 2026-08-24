import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export interface McpProvider {
  readonly id: string;
  readonly namespace: string;
  readonly lastError?: string;
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

/** Generic MCP-over-Streamable-HTTP provider. */
export class RemoteMcpProvider implements McpProvider {
  readonly id: string;
  readonly namespace: string;

  private readonly url: URL;
  private readonly client: Client;
  private transport?: StreamableHTTPClientTransport;
  private connected = false;
  private _lastError?: string;

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

  get lastError(): string | undefined {
    return this._lastError;
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
      this._lastError = undefined;
    } catch (error) {
      await transport.close().catch(() => undefined);
      this.connected = false;
      this._lastError = error instanceof Error ? error.message : String(error);
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
    await this.ensureConnected();
    try {
      const result = await this.client.listTools();
      return result.tools;
    } catch (error) {
      this.markDisconnected(error);
      throw this.unavailableError(error);
    }
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<Awaited<ReturnType<Client["callTool"]>>> {
    await this.ensureConnected();
    try {
      return await this.client.callTool({ name, arguments: args });
    } catch (error) {
      this.markDisconnected(error);
      throw this.unavailableError(error);
    }
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

  private async ensureConnected(): Promise<void> {
    if (this.connected) return;
    try {
      await this.connect();
    } catch {
      throw this.unavailableError();
    }
  }

  private markDisconnected(error: unknown): void {
    this.connected = false;
    this._lastError = error instanceof Error ? error.message : String(error);
    this.transport = undefined;
  }

  private unavailableError(cause?: unknown): Error {
    const detail = this._lastError ?? (cause instanceof Error ? cause.message : undefined);
    return new Error(
      `MCP provider '${this.id}' (${this.namespace}) is not connected. ` +
      `Start the ${this.id} MCP server/editor and try again.` +
      (detail ? ` Connection error: ${detail}` : ""),
    );
  }
}
