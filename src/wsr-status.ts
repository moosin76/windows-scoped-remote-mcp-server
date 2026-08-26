import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { AppConfig } from "./config.js";
import type { ProcessManager } from "./process-manager.js";
import type { WorkspaceManager } from "./workspace.js";
import type { BrowserManager } from "./browser-manager.js";
import type { ProviderRegistry } from "./providers/provider-registry.js";
import { findCloudflaredBinary } from "./tunnel.js";

const execFileAsync = promisify(execFile);

export interface WsrStatusResult {
  server: {
    name: string;
    version: string;
    commit: string | null;
    uptimeSeconds: number;
    nodeVersion: string;
    platform: NodeJS.Platform;
    arch: string;
  };
  endpoint: {
    host: string;
    port: number;
    mcpPath: string;
    publicUrlConfigured: boolean;
    publicUrl: string | null;
    allowedHostCount: number;
  };
  auth: {
    authRequired: boolean;
    allowNoAuth: boolean;
    oauthEnabled: boolean;
    staticTokenConfigured: boolean;
    approvalKeyConfigured: boolean;
    cloudflareTunnelTokenConfigured: boolean;
  };
  workspace: {
    active: { name: string; path: string } | null;
    registeredCount: number;
  };
  browser: {
    available: boolean;
    headless: boolean | null;
    initialized: boolean;
    pageOpen: boolean;
    pageCount: number;
  };
  providers: Array<{
    id: string;
    namespace: string;
    connected: boolean;
    toolCount: number;
  }>;
  processes: {
    retainedCount: number;
    runningCount: number;
  };
  cloudflared: {
    available: boolean;
    binaryName: string | null;
    version: string | null;
  };
  warnings: string[];
}

export interface WsrStatusRuntime {
  projectRoot?: string;
  uptimeSeconds?: () => number;
  nodeVersion?: string;
  platform?: NodeJS.Platform;
  arch?: string;
  readVersion?: (projectRoot: string) => Promise<string>;
  readCommit?: (projectRoot: string) => Promise<string | null>;
  readCloudflared?: (
    projectRoot: string,
  ) => Promise<WsrStatusResult["cloudflared"]>;
}

export interface WsrStatusDependencies {
  config: AppConfig;
  processManager: ProcessManager;
  workspaceManager?: WorkspaceManager;
  browserManager?: BrowserManager;
  providerRegistry?: ProviderRegistry;
  runtime?: WsrStatusRuntime;
}

async function readPackageVersion(projectRoot: string): Promise<string> {
  const raw = await readFile(path.join(projectRoot, "package.json"), "utf8");
  const parsed = JSON.parse(raw) as { version?: unknown };
  return typeof parsed.version === "string" ? parsed.version : "unknown";
}

async function readGitCommit(projectRoot: string): Promise<string | null> {
  try {
    const result = await execFileAsync(
      "git",
      ["-C", projectRoot, "rev-parse", "--short=12", "HEAD"],
      { timeout: 3_000, windowsHide: true },
    );
    return result.stdout.trim() || null;
  } catch {
    return null;
  }
}

function parseCloudflaredVersion(output: string): string | null {
  const match = output.match(/cloudflared version\s+([^\s]+)/i);
  return match?.[1] ?? null;
}

async function readCloudflaredStatus(
  projectRoot: string,
): Promise<WsrStatusResult["cloudflared"]> {
  const binary = findCloudflaredBinary(projectRoot);
  if (!binary) {
    return { available: false, binaryName: null, version: null };
  }

  try {
    const result = await execFileAsync(binary, ["version"], {
      timeout: 3_000,
      windowsHide: true,
    });
    return {
      available: true,
      binaryName: path.basename(binary),
      version: parseCloudflaredVersion(`${result.stdout}\n${result.stderr}`),
    };
  } catch {
    return {
      available: false,
      binaryName: path.basename(binary),
      version: null,
    };
  }
}

export async function collectWsrStatus({
  config,
  processManager,
  workspaceManager,
  browserManager,
  providerRegistry,
  runtime = {},
}: WsrStatusDependencies): Promise<WsrStatusResult> {
  const projectRoot = runtime.projectRoot ?? process.cwd();
  const readVersion = runtime.readVersion ?? readPackageVersion;
  const readCommit = runtime.readCommit ?? readGitCommit;
  const readCloudflared = runtime.readCloudflared ?? readCloudflaredStatus;
  const [version, commit, cloudflared] = await Promise.all([
    readVersion(projectRoot).catch(() => "unknown"),
    readCommit(projectRoot).catch(() => null),
    readCloudflared(projectRoot).catch(() => ({
      available: false,
      binaryName: null,
      version: null,
    })),
  ]);

  const activeWorkspace = workspaceManager?.getActiveWorkspace() ?? null;
  const registeredWorkspaces = workspaceManager?.getAllWorkspaces() ?? [];
  const providerStatuses = providerRegistry?.listStatuses() ?? [];
  const processStatuses = processManager.list();
  const browserStatus = browserManager?.getStatus();

  const warnings: string[] = [];
  if (config.allowNoAuth) {
    warnings.push("MCP_ALLOW_NO_AUTH가 활성화되어 인증 없이 접근할 수 있다.");
  }
  if (!config.publicUrl) {
    warnings.push("MCP_PUBLIC_URL이 설정되지 않았다.");
  }
  if (!cloudflared.available) {
    warnings.push("cloudflared 실행 파일 또는 버전을 확인하지 못했다.");
  }
  for (const provider of providerStatuses) {
    if (!provider.connected) {
      warnings.push(`Provider '${provider.id}'가 연결되지 않았다.`);
    }
  }

  return {
    server: {
      name: "windows-scoped-remote-mcp",
      version,
      commit,
      uptimeSeconds: Math.max(
        0,
        Math.floor((runtime.uptimeSeconds ?? process.uptime)()),
      ),
      nodeVersion: runtime.nodeVersion ?? process.version,
      platform: runtime.platform ?? process.platform,
      arch: runtime.arch ?? process.arch,
    },
    endpoint: {
      host: config.host,
      port: config.port,
      mcpPath: config.endpoint,
      publicUrlConfigured: Boolean(config.publicUrl),
      publicUrl: config.publicUrl ?? null,
      allowedHostCount: config.allowedHosts?.length ?? 0,
    },
    auth: {
      authRequired: !config.allowNoAuth,
      allowNoAuth: config.allowNoAuth,
      oauthEnabled: config.oauthEnabled,
      staticTokenConfigured: Boolean(config.authToken),
      approvalKeyConfigured: Boolean(config.oauthApprovalKey),
      cloudflareTunnelTokenConfigured: Boolean(config.cloudflareTunnelToken),
    },
    workspace: {
      active: activeWorkspace
        ? { name: activeWorkspace.name, path: activeWorkspace.path }
        : null,
      registeredCount: registeredWorkspaces.length,
    },
    browser: browserStatus
      ? { available: true, ...browserStatus }
      : {
          available: false,
          headless: null,
          initialized: false,
          pageOpen: false,
          pageCount: 0,
        },
    providers: providerStatuses.map((provider) => ({
      id: provider.id,
      namespace: provider.namespace,
      connected: provider.connected,
      toolCount: provider.toolCount,
    })),
    processes: {
      retainedCount: processStatuses.length,
      runningCount: processStatuses.filter((item) => item.running).length,
    },
    cloudflared,
    warnings,
  };
}
