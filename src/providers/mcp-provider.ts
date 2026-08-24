import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import type { Tool } from "@modelcontextprotocol/client";
import { Client as LegacyClient } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

export interface McpProvider {
  readonly id: string;
  readonly namespace: string;
  readonly lastError?: string;
  connect(): Promise<void>;
  close(): Promise<void>;
  isConnected(): boolean;
  listTools(): Promise<readonly Tool[]>;
  callTool(
    name: string,
    args?: Record<string, unknown>,
  ): Promise<Awaited<ReturnType<Client["callTool"]>>>;
  namespacedToolName(remoteToolName: string): string;
  remoteToolName(namespacedToolName: string): string;
}

export type RemoteMcpTransport = "streamable-http" | "sse";

export interface RemoteMcpProviderOptions {
  id: string;
  namespace: string;
  url: string;
  clientName?: string;
  clientVersion?: string;
  requestInit?: RequestInit;
  transport?: RemoteMcpTransport;
}

/** Generic remote MCP provider supporting Streamable HTTP and legacy SSE transports. */
export class RemoteMcpProvider implements McpProvider {
  readonly id: string;
  readonly namespace: string;

  private readonly url: URL;
  private readonly clientName: string;
  private readonly clientVersion: string;
  private readonly requestInit?: RequestInit;
  private readonly transportType: RemoteMcpTransport;
  private client?: Client;
  private legacyClient?: LegacyClient;
  private connected = false;
  private _lastError?: string;
  private connecting?: Promise<void>;

  constructor(options: RemoteMcpProviderOptions) {
    this.id = options.id;
    this.namespace = options.namespace;
    this.url = new URL(options.url);
    this.clientName = options.clientName ?? "windows-scoped-remote-mcp-gateway";
    this.clientVersion = options.clientVersion ?? "1.0.0";
    this.requestInit = options.requestInit;
    this.transportType = options.transport ?? "streamable-http";
  }

  get lastError(): string | undefined {
    return this._lastError;
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    if (this.connecting) return this.connecting;

    this.connecting = this.createConnection();
    try {
      await this.connecting;
    } finally {
      this.connecting = undefined;
    }
  }

  private async createConnection(): Promise<void> {
    if (this.transportType === "sse") {
      const client = new LegacyClient({
        name: this.clientName,
        version: this.clientVersion,
      });
      const transport = new SSEClientTransport(this.url, {
        requestInit: this.requestInit,
      });

      try {
        await client.connect(transport);
        this.legacyClient = client;
        this.connected = true;
        this._lastError = undefined;
      } catch (error) {
        await transport.close().catch(() => undefined);
        await client.close().catch(() => undefined);
        this.connected = false;
        this._lastError = error instanceof Error ? error.message : String(error);
        throw error;
      }
      return;
    }

    const client = new Client({
      name: this.clientName,
      version: this.clientVersion,
    });
    const transport = new StreamableHTTPClientTransport(this.url, {
      requestInit: this.requestInit,
    });

    try {
      await client.connect(transport);
      this.client = client;
      this.connected = true;
      this._lastError = undefined;
    } catch (error) {
      await transport.close().catch(() => undefined);
      await client.close().catch(() => undefined);
      this.connected = false;
      this._lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  async close(): Promise<void> {
    this.connected = false;
    const client = this.client;
    const legacyClient = this.legacyClient;
    this.client = undefined;
    this.legacyClient = undefined;
    await Promise.all([
      client?.close().catch(() => undefined),
      legacyClient?.close().catch(() => undefined),
    ]);
  }

  isConnected(): boolean {
    return this.connected;
  }

  async listTools(): Promise<readonly Tool[]> {
    await this.ensureConnected();
    try {
      const result = this.transportType === "sse"
        ? await this.legacyClient!.listTools()
        : await this.client!.listTools();
      return result.tools as readonly Tool[];
    } catch (error) {
      await this.markDisconnected(error);
      throw this.unavailableError(error);
    }
  }

  async callTool(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<Awaited<ReturnType<Client["callTool"]>>> {
    await this.ensureConnected();
    try {
      if (this.transportType === "sse") {
        return await this.legacyClient!.callTool({
          name,
          arguments: args,
        }) as Awaited<ReturnType<Client["callTool"]>>;
      }
      return await this.client!.callTool({ name, arguments: args });
    } catch (error) {
      await this.markDisconnected(error);
      throw this.unavailableError(error);
    }
  }

  namespacedToolName(remoteToolName: string): string {
    return `${this.namespace}_${remoteToolName}`;
  }

  remoteToolName(namespacedToolName: string): string {
    const prefix = `${this.namespace}_`;
    if (!namespacedToolName.startsWith(prefix)) {
      throw new Error(
        `Tool '${namespacedToolName}' does not belong to provider '${this.id}'`,
      );
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

  private async markDisconnected(error: unknown): Promise<void> {
    this.connected = false;
    this._lastError = error instanceof Error ? error.message : String(error);
    const client = this.client;
    const legacyClient = this.legacyClient;
    this.client = undefined;
    this.legacyClient = undefined;
    await Promise.all([
      client?.close().catch(() => undefined),
      legacyClient?.close().catch(() => undefined),
    ]);
  }

  private unavailableError(cause?: unknown): Error {
    const detail =
      this._lastError ?? (cause instanceof Error ? cause.message : undefined);
    return new Error(
      `MCP provider '${this.id}' (${this.namespace}) is not connected. ` +
        `Start the ${this.id} MCP server/editor and try again.` +
        (detail ? ` Connection error: ${detail}` : ""),
    );
  }
}
