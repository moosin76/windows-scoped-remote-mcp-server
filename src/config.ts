import dotenv from "dotenv";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { normalizeCanonicalPath } from "./paths.js";
import { parseWorkspaceRoots, type ParsedWorkspace } from "./workspace.js";

dotenv.config();

export interface AppConfig {
  host: string;
  port: number;
  endpoint: string;
  publicUrl: string | undefined;
  allowedHosts: string[] | undefined;
  authToken: string | undefined;
  allowNoAuth: boolean;
  oauthEnabled: boolean;
  oauthApprovalKey: string | undefined;
  oauthIssuerUrl: string | undefined;
  oauthResourceUrl: string | undefined;
  oauthStateFile: string;
  oauthAccessTokenTtlSeconds: number;
  oauthRefreshTokenTtlSeconds: number;
  oauthAuthorizationCodeTtlSeconds: number;
  workspaceRoots: ParsedWorkspace[];
  workspaceRoot: string;
  defaultCwd: string;
  defaultShell: string;
  maxRequestBody: string;
  maxOutputBytes: number;
  maxRetainedProcessOutputBytes: number;
  processRetentionMs: number;
  maxProcesses: number;
  maxFileChunkBytes: number;
  maxEditFileBytes: number;
  cloudflareTunnelToken: string | undefined;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") {
    return fallback;
  }
  if (["1", "true", "yes", "on"].includes(value.toLowerCase())) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(value.toLowerCase())) {
    return false;
  }
  throw new Error(`Invalid boolean value: ${value}`);
}

function parseInteger(
  value: string | undefined,
  fallback: number,
  name: string,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (value === undefined || value === "") {
    return fallback;
  }
  const normalized = value.trim();
  const parsed = /^[+-]?\d+$/.test(normalized) ? Number(normalized) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    const range =
      maximum === Number.MAX_SAFE_INTEGER
        ? `greater than or equal to ${minimum}`
        : `between ${minimum} and ${maximum}`;
    throw new Error(`${name} must be an integer ${range}`);
  }
  return parsed;
}

function normalizeEndpoint(value: string | undefined): string {
  const endpoint = value?.trim() || "/mcp";
  if (!endpoint.startsWith("/")) {
    throw new Error("MCP_ENDPOINT must start with '/'");
  }
  return endpoint.length > 1 ? endpoint.replace(/\/+$/, "") : endpoint;
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  processCwd = process.cwd(),
): AppConfig {
  const allowNoAuth = parseBoolean(env.MCP_ALLOW_NO_AUTH, false);
  const authToken = env.MCP_AUTH_TOKEN?.trim() || undefined;
  const oauthEnabled = parseBoolean(env.MCP_OAUTH_ENABLED, true);
  const oauthApprovalKey =
    env.MCP_OAUTH_APPROVAL_KEY?.trim() || authToken;

  const fallbackWorkspace = normalizeCanonicalPath(
    env.MCP_WORKSPACE_ROOT?.trim() || env.MCP_DEFAULT_CWD?.trim() || processCwd,
  );
  const rawWorkspaceRoots = env.MCP_WORKSPACE_ROOTS?.trim() || env.MCP_WORKSPACE_ROOT?.trim();
  const workspaceRoots = parseWorkspaceRoots(rawWorkspaceRoots, fallbackWorkspace);
  const workspaceRoot = workspaceRoots[0].path;
  const defaultCwd = workspaceRoot;

  const allowedHosts = env.MCP_ALLOWED_HOSTS?.split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);

  const endpoint = normalizeEndpoint(env.MCP_ENDPOINT);
  const publicUrl = env.MCP_PUBLIC_URL?.trim().replace(/\/+$/, "") || undefined;

  // Shell default: on Windows powershell, on POSIX bash
  let defaultShell = env.MCP_DEFAULT_SHELL?.trim() || env.SHELL?.trim();
  if (!defaultShell) {
    defaultShell = process.platform === "win32" ? "powershell" : "/bin/bash";
  }

  const cloudflareTunnelToken = env.CLOUDFLARE_TUNNEL_TOKEN?.trim() || undefined;

  return {
    host: env.MCP_HOST?.trim() || "0.0.0.0",
    port: parseInteger(env.MCP_PORT, 12000, "MCP_PORT", 1, 65_535),
    endpoint,
    publicUrl,
    allowedHosts: allowedHosts && allowedHosts.length > 0 ? allowedHosts : undefined,
    authToken,
    allowNoAuth,
    oauthEnabled,
    oauthApprovalKey,
    oauthIssuerUrl: env.MCP_OAUTH_ISSUER?.trim() || publicUrl,
    oauthResourceUrl:
      env.MCP_OAUTH_RESOURCE?.trim() || (publicUrl ? `${publicUrl}${endpoint}` : undefined),
    oauthStateFile: path.resolve(
      env.MCP_OAUTH_STATE_FILE?.trim() || path.join(processCwd, ".mcp-oauth-state.json"),
    ),
    oauthAccessTokenTtlSeconds: parseInteger(
      env.MCP_OAUTH_ACCESS_TOKEN_TTL_SECONDS,
      60 * 60,
      "MCP_OAUTH_ACCESS_TOKEN_TTL_SECONDS",
      300,
    ),
    oauthRefreshTokenTtlSeconds: parseInteger(
      env.MCP_OAUTH_REFRESH_TOKEN_TTL_SECONDS,
      30 * 24 * 60 * 60,
      "MCP_OAUTH_REFRESH_TOKEN_TTL_SECONDS",
      3600,
    ),
    oauthAuthorizationCodeTtlSeconds: parseInteger(
      env.MCP_OAUTH_AUTHORIZATION_CODE_TTL_SECONDS,
      5 * 60,
      "MCP_OAUTH_AUTHORIZATION_CODE_TTL_SECONDS",
      60,
    ),
    workspaceRoots,
    workspaceRoot,
    defaultCwd,
    defaultShell,
    maxRequestBody: env.MCP_MAX_REQUEST_BODY?.trim() || "16mb",
    maxOutputBytes: parseInteger(env.MCP_MAX_OUTPUT_BYTES, 1024 * 1024, "MCP_MAX_OUTPUT_BYTES", 16 * 1024),
    maxRetainedProcessOutputBytes: parseInteger(
      env.MCP_MAX_RETAINED_PROCESS_OUTPUT_BYTES,
      4 * 1024 * 1024,
      "MCP_MAX_RETAINED_PROCESS_OUTPUT_BYTES",
      64 * 1024,
    ),
    processRetentionMs: parseInteger(env.MCP_PROCESS_RETENTION_MS, 60 * 60 * 1000, "MCP_PROCESS_RETENTION_MS", 1000),
    maxProcesses: parseInteger(env.MCP_MAX_PROCESSES, 128, "MCP_MAX_PROCESSES", 1),
    maxFileChunkBytes: parseInteger(env.MCP_MAX_FILE_CHUNK_BYTES, 1024 * 1024, "MCP_MAX_FILE_CHUNK_BYTES", 4096),
    maxEditFileBytes: parseInteger(env.MCP_MAX_EDIT_FILE_BYTES, 64 * 1024 * 1024, "MCP_MAX_EDIT_FILE_BYTES", 4096),
    cloudflareTunnelToken,
  };
}
