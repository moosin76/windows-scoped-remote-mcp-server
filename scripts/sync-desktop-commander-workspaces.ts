import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse as parseDotenv } from "dotenv";

function option(name: string, fallback: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function fail(message: string): never {
  console.error(`[RDC sync] ${message}`);
  process.exit(2);
}

const envPath = path.resolve(option("--env", path.join(process.cwd(), ".env")));
const configPath = path.resolve(
  option("--config", path.join(os.homedir(), ".claude-server-commander", "config.json")),
);

if (!existsSync(envPath)) fail(`WSR env not found: ${envPath}`);
if (!existsSync(configPath)) {
  console.log(`[RDC sync] Desktop Commander config not found; skipping: ${configPath}`);
  process.exit(0);
}

const env = parseDotenv(readFileSync(envPath));
const rawRoots = env.MCP_WORKSPACE_ROOTS?.trim();
if (!rawRoots) fail("MCP_WORKSPACE_ROOTS is empty or missing; existing RDC config was not changed.");
const directories: string[] = [];
const seen = new Set<string>();

for (const entry of rawRoots.split(",")) {
  const trimmed = entry.trim();
  const separator = trimmed.indexOf(":");
  if (separator <= 0) continue;

  const candidate = trimmed.slice(separator + 1).trim();
  if (!candidate) continue;

  const resolved = path.resolve(candidate);
  try {
    if (!statSync(resolved).isDirectory()) continue;
  } catch {
    console.warn(`[RDC sync] Skipping missing workspace: ${resolved}`);
    continue;
  }

  const key = process.platform === "win32" ? resolved.toLowerCase() : resolved;
  if (seen.has(key)) continue;
  seen.add(key);
  directories.push(resolved);
}

if (directories.length === 0) {
  fail("No valid WSR workspace directories were found; refusing to write an empty RDC allowlist.");
}
let config: Record<string, unknown>;
try {
  config = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
} catch (error) {
  fail(`Desktop Commander config is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
}

const current = Array.isArray(config.allowedDirectories) ? config.allowedDirectories : undefined;
if (JSON.stringify(current) === JSON.stringify(directories)) {
  console.log(`[RDC sync] allowedDirectories already matches ${directories.length} WSR workspaces.`);
  process.exit(0);
}

const nextConfig = { ...config, allowedDirectories: directories };
const tempPath = `${configPath}.${process.pid}.${Date.now()}.tmp`;
try {
  writeFileSync(tempPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");
  renameSync(tempPath, configPath);
} catch (error) {
  fail(`Failed to update Desktop Commander config: ${error instanceof Error ? error.message : String(error)}`);
}

console.log(`[RDC sync] allowedDirectories updated from ${directories.length} WSR workspaces.`);
for (const directory of directories) console.log(`[RDC sync]   ${directory}`);
