import { describe, expect, it } from "vitest";
import type { AppConfig } from "../src/config.js";
import type { ProcessManager } from "../src/process-manager.js";
import type { WorkspaceManager } from "../src/workspace.js";
import type { BrowserManager } from "../src/browser-manager.js";
import type { ProviderRegistry } from "../src/providers/provider-registry.js";
import { collectWsrStatus } from "../src/wsr-status.js";

function config(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    host: "0.0.0.0",
    port: 12000,
    endpoint: "/mcp",
    publicUrl: "https://mcp.example.test",
    allowedHosts: ["mcp.example.test"],
    authToken: "super-secret-static-token",
    allowNoAuth: false,
    oauthEnabled: true,
    oauthApprovalKey: "super-secret-approval-key",
    oauthIssuerUrl: undefined,
    oauthResourceUrl: undefined,
    oauthStateFile: "state.json",
    oauthAccessTokenTtlSeconds: 3600,
    oauthRefreshTokenTtlSeconds: 3600,
    oauthAuthorizationCodeTtlSeconds: 300,
    workspaceRoots: [],
    workspaceRoot: "C:/repo/wsr",
    defaultCwd: "C:/repo/wsr",
    defaultShell: "powershell",
    maxRequestBody: "16mb",
    maxOutputBytes: 1024,
    maxRetainedProcessOutputBytes: 4096,
    processRetentionMs: 1000,
    maxProcesses: 10,
    maxFileChunkBytes: 1024,
    maxEditFileBytes: 1024,
    browserHeadless: false,
    browserUserDataDir: "C:/secret/browser-profile",
    cloudflareTunnelToken: "super-secret-cloudflare-token",
    godotMcpEnabled: true,
    godotMcpUrl: "http://127.0.0.1:8000/mcp",
    postgresqlMcpEnabled: false,
    postgresqlMcpUrl: undefined,
    mcpProviderHealthIntervalMs: 10000,
    mcpProviderRetryIntervalMs: 5000,
    ...overrides,
  };
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    config: config(),
    processManager: {
      list: () => [
        { sessionId: "secret-process-id", command: "npm test", running: true, startedAt: "now" },
        { sessionId: "other-id", command: "done", running: false, startedAt: "before" },
      ],
    } as unknown as ProcessManager,
    workspaceManager: {
      getActiveWorkspace: () => ({ name: "wsr", path: "C:/repo/wsr", isActive: true }),
      getAllWorkspaces: () => [
        { name: "wsr", path: "C:/repo/wsr", isActive: true },
        { name: "ec", path: "C:/repo/ec", isActive: false },
      ],
    } as unknown as WorkspaceManager,
    browserManager: {
      getStatus: () => ({ headless: false, initialized: true, pageOpen: true, pageCount: 2 }),
    } as unknown as BrowserManager,
    providerRegistry: {
      listStatuses: () => [
        { id: "godot", namespace: "godot", connected: true, toolCount: 45 },
        {
          id: "postgresql",
          namespace: "postgresql",
          connected: false,
          toolCount: 0,
          lastError: "password=must-never-leak",
        },
      ],
    } as unknown as ProviderRegistry,
    runtime: {
      projectRoot: "C:/repo/wsr",
      uptimeSeconds: () => 123.9,
      nodeVersion: "v24.0.0",
      platform: "win32" as const,
      arch: "x64",
      readVersion: async () => "1.2.3",
      readCommit: async () => "abc123def456",
      readCloudflared: async () => ({
        available: true,
        binaryName: "cloudflared.exe",
        version: "2026.8.2",
      }),
    },
    ...overrides,
  };
}

describe("collectWsrStatus", () => {
  it("returns a compact operational summary without exposing secret values", async () => {
    const result = await collectWsrStatus(dependencies());

    expect(result.server).toMatchObject({
      version: "1.2.3",
      commit: "abc123def456",
      uptimeSeconds: 123,
      nodeVersion: "v24.0.0",
      platform: "win32",
    });
    expect(result.workspace.active?.name).toBe("wsr");
    expect(result.workspace.registeredCount).toBe(2);
    expect(result.browser).toMatchObject({
      available: true,
      initialized: true,
      pageOpen: true,
      pageCount: 2,
    });
    expect(result.processes).toEqual({ retainedCount: 2, runningCount: 1 });
    expect(result.providers[1]).toEqual({
      id: "postgresql",
      namespace: "postgresql",
      connected: false,
      toolCount: 0,
    });
    expect(result.auth).toMatchObject({
      staticTokenConfigured: true,
      approvalKeyConfigured: true,
      cloudflareTunnelTokenConfigured: true,
    });
    expect(result.warnings).toContain("Provider 'postgresql'가 연결되지 않았다.");

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("super-secret-static-token");
    expect(serialized).not.toContain("super-secret-approval-key");
    expect(serialized).not.toContain("super-secret-cloudflare-token");
    expect(serialized).not.toContain("password=must-never-leak");
    expect(serialized).not.toContain("secret-process-id");
    expect(serialized).not.toContain("browser-profile");
  });

  it("warns when anonymous access, public URL, and cloudflared are not safely configured", async () => {
    const deps = dependencies({
      config: config({ allowNoAuth: true, authToken: undefined, publicUrl: undefined }),
      providerRegistry: undefined,
      browserManager: undefined,
      workspaceManager: undefined,
      runtime: {
        ...dependencies().runtime,
        readCloudflared: async () => ({
          available: false,
          binaryName: null,
          version: null,
        }),
      },
    });
    const result = await collectWsrStatus(deps);

    expect(result.auth.authRequired).toBe(false);
    expect(result.endpoint.publicUrlConfigured).toBe(false);
    expect(result.workspace.active).toBeNull();
    expect(result.browser.available).toBe(false);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("MCP_ALLOW_NO_AUTH"),
        expect.stringContaining("MCP_PUBLIC_URL"),
        expect.stringContaining("cloudflared"),
      ]),
    );
  });
});
