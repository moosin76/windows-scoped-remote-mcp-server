import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

import { loadConfig } from "../src/config.js";
import { FileService } from "../src/file-service.js";
import { startHttpServer } from "../src/http-server.js";
import { ProcessManager } from "../src/process-manager.js";
import { ProviderRegistry } from "../src/providers/provider-registry.js";
import { SandboxGuard } from "../src/sandbox.js";
import { WorkspaceManager } from "../src/workspace.js";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function resultJson(result: Awaited<ReturnType<Client["callTool"]>>): any {
  const content = result.content;
  if (!Array.isArray(content) || content.length === 0 || content[0]?.type !== "text") {
    throw new Error("Expected text tool result");
  }
  return JSON.parse(content[0].text);
}

describe("session-scoped workspace", () => {
  it("keeps WorkspaceManager forks independent", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "wsr-workspaces-"));
    cleanup.push(root);
    const a = path.join(root, "a");
    const b = path.join(root, "b");
    const manager = new WorkspaceManager([
      { name: "a", path: a },
      { name: "b", path: b },
    ]);

    const first = manager.fork();
    const second = manager.fork();
    first.switchWorkspace("b");

    expect(first.getActiveWorkspace().name).toBe("b");
    expect(second.getActiveWorkspace().name).toBe("a");
    expect(manager.getActiveWorkspace().name).toBe("a");
  });

  it("isolates active workspace between two legacy MCP sessions", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "wsr-mcp-sessions-"));
    cleanup.push(root);
    const alpha = path.join(root, "alpha");
    const beta = path.join(root, "beta");

    const config = loadConfig(
      {
        MCP_ALLOW_NO_AUTH: "true",
        MCP_OAUTH_ENABLED: "false",
        MCP_WORKSPACE_ROOT: alpha,
        MCP_WORKSPACE_ROOTS: `alpha:${alpha},beta:${beta}`,
      },
      root,
    );
    config.host = "127.0.0.1";
    config.port = 0;

    const workspaceManager = new WorkspaceManager(config.workspaceRoots);
    const sandbox = new SandboxGuard(workspaceManager);
    const fileService = new FileService({
      sandbox,
      maxChunkBytes: config.maxFileChunkBytes,
      maxEditFileBytes: config.maxEditFileBytes,
      maxOutputBytes: config.maxOutputBytes,
    });
    const processManager = new ProcessManager({
      maxProcesses: config.maxProcesses,
      maxRetainedOutputBytes: config.maxRetainedProcessOutputBytes,
      processRetentionMs: config.processRetentionMs,
      defaultMaxOutputBytes: config.maxOutputBytes,
    });
    const running = await startHttpServer(
      config,
      processManager,
      fileService,
      workspaceManager,
      undefined,
      new ProviderRegistry(),
    );

    const address = running.httpServer.address() as AddressInfo;
    const endpoint = new URL(`http://127.0.0.1:${address.port}/mcp`);
    const clientA = new Client({ name: "session-a", version: "1.0.0" });
    const clientB = new Client({ name: "session-b", version: "1.0.0" });

    try {
      await clientA.connect(new StreamableHTTPClientTransport(endpoint));
      await clientB.connect(new StreamableHTTPClientTransport(endpoint));
      expect(clientA.getProtocolEra()).toBe("legacy");
      expect(clientB.getProtocolEra()).toBe("legacy");

      await clientA.callTool({ name: "switch_workspace", arguments: { name: "alpha" } });
      await clientB.callTool({ name: "switch_workspace", arguments: { name: "beta" } });

      const activeA = resultJson(await clientA.callTool({ name: "get_active_workspace", arguments: {} }));
      const activeB = resultJson(await clientB.callTool({ name: "get_active_workspace", arguments: {} }));

      expect(activeA.name).toBe("alpha");
      expect(activeB.name).toBe("beta");
      expect(activeA.path).toBe(path.resolve(alpha));
      expect(activeB.path).toBe(path.resolve(beta));

      const listA = resultJson(await clientA.callTool({
        name: "list_directory",
        arguments: { path: ".", maxEntries: 10 },
      }));
      const listB = resultJson(await clientB.callTool({
        name: "list_directory",
        arguments: { path: ".", maxEntries: 10 },
      }));
      expect(listA.directory).toBe(path.resolve(alpha));
      expect(listB.directory).toBe(path.resolve(beta));

      const execA = resultJson(await clientA.callTool({
        name: "exec_command",
        arguments: { cmd: "(Get-Location).Path" },
      }));
      const execB = resultJson(await clientB.callTool({
        name: "exec_command",
        arguments: { cmd: "(Get-Location).Path" },
      }));
      expect(execA.cwd).toBe(path.resolve(alpha));
      expect(execB.cwd).toBe(path.resolve(beta));
    } finally {
      await clientA.close().catch(() => undefined);
      await clientB.close().catch(() => undefined);
      await running.close();
    }
  });
  it("isolates active workspace between two modern OpenAI sessions", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "wsr-modern-sessions-"));
    cleanup.push(root);
    const alpha = path.join(root, "alpha");
    const beta = path.join(root, "beta");

    const config = loadConfig(
      {
        MCP_ALLOW_NO_AUTH: "true",
        MCP_OAUTH_ENABLED: "false",
        MCP_WORKSPACE_ROOT: alpha,
        MCP_WORKSPACE_ROOTS: `alpha:${alpha},beta:${beta}`,
      },
      root,
    );
    config.host = "127.0.0.1";
    config.port = 0;

    const workspaceManager = new WorkspaceManager(config.workspaceRoots);
    const sandbox = new SandboxGuard(workspaceManager);
    const fileService = new FileService({
      sandbox,
      maxChunkBytes: config.maxFileChunkBytes,
      maxEditFileBytes: config.maxEditFileBytes,
      maxOutputBytes: config.maxOutputBytes,
    });
    const processManager = new ProcessManager({
      maxProcesses: config.maxProcesses,
      maxRetainedOutputBytes: config.maxRetainedProcessOutputBytes,
      processRetentionMs: config.processRetentionMs,
      defaultMaxOutputBytes: config.maxOutputBytes,
    });
    const running = await startHttpServer(
      config,
      processManager,
      fileService,
      workspaceManager,
      undefined,
      new ProviderRegistry(),
    );

    const address = running.httpServer.address() as AddressInfo;
    const endpoint = new URL(`http://127.0.0.1:${address.port}/mcp`);
    const modernOptions = {
      versionNegotiation: { mode: { pin: "2026-07-28" as const } },
    };
    const clientA = new Client({ name: "modern-a", version: "1.0.0" }, modernOptions);
    const clientB = new Client({ name: "modern-b", version: "1.0.0" }, modernOptions);

    try {
      await clientA.connect(
        new StreamableHTTPClientTransport(endpoint, {
          requestInit: { headers: { "x-openai-session": "chat-a" } },
        }),
      );
      await clientB.connect(
        new StreamableHTTPClientTransport(endpoint, {
          requestInit: { headers: { "x-openai-session": "chat-b" } },
        }),
      );
      expect(clientA.getProtocolEra()).toBe("modern");
      expect(clientB.getProtocolEra()).toBe("modern");

      await clientA.callTool({ name: "switch_workspace", arguments: { name: "alpha" } });
      await clientB.callTool({ name: "switch_workspace", arguments: { name: "beta" } });

      const activeA = resultJson(await clientA.callTool({ name: "get_active_workspace", arguments: {} }));
      const activeB = resultJson(await clientB.callTool({ name: "get_active_workspace", arguments: {} }));
      expect(activeA.name).toBe("alpha");
      expect(activeB.name).toBe("beta");

      const execA = resultJson(await clientA.callTool({
        name: "exec_command",
        arguments: { cmd: "(Get-Location).Path" },
      }));
      const execB = resultJson(await clientB.callTool({
        name: "exec_command",
        arguments: { cmd: "(Get-Location).Path" },
      }));
      expect(execA.cwd).toBe(path.resolve(alpha));
      expect(execB.cwd).toBe(path.resolve(beta));
    } finally {
      await clientA.close().catch(() => undefined);
      await clientB.close().catch(() => undefined);
      await running.close();
    }
  });

});
