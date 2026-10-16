import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

if (existsSync(".env") && typeof process.loadEnvFile === "function") process.loadEnvFile(".env");
const fix = process.argv.includes("--fix");
let issues = 0;
const report = (kind, message) => console.log("[preflight][" + kind + "] " + message);
const run = (name, args, options = {}) => {
  const result = spawnSync(name, args, { encoding: "utf8", timeout: 120000, windowsHide: true, ...options });
  return { ok: result.status === 0, output: ((result.stdout || "") + (result.stderr || "")).trim(), error: result.error?.message };
};
const available = (name, args = ["--version"]) => run(name, args).ok;
const need = (label, condition, hint) => {
  if (condition) report("OK", label);
  else { issues++; report("ACTION", label + ": " + hint); }
};
const major = Number(process.versions.node.split(".")[0]);
need("Node.js", major >= 24, "Install Node.js 24 LTS or newer");
need("Git", available("git"), "Install Git for Windows (winget install --id Git.Git -e)");
need("npm", run("cmd.exe", ["/d", "/s", "/c", "npm --version"]).ok, "Repair Node.js/npm installation");
const uvHome = join(process.env.USERPROFILE || "", ".local", "bin");
const uv = available("uv") ? "uv" : existsSync(join(uvHome, "uv.exe")) ? join(uvHome, "uv.exe") : null;
need("Astral uv", !!uv, "Install uv from https://docs.astral.sh/uv/getting-started/installation/");
if (process.platform === "win32") {
  const registry = run("reg.exe", ["query", "HKLM\\SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64", "/v", "Installed"]);
  const installed = registry.ok && /Installed\s+REG_DWORD\s+0x1\b/i.test(registry.output);
  need("Microsoft VC++ Runtime x64", installed, "Install Microsoft-supported VC++ x64 runtime: https://aka.ms/vs/17/release/vc_redist.x64.exe");
  if (!installed && fix) {
    report("ACTION", "VC++ installation requires separate elevation and user approval; no silent system installation performed");
  }
}
if (uv) {
  const py = run(uv, ["python", "find", "3.12"]);
  if (py.ok) report("OK", "MCP Python 3.12: " + py.output.split(/\r?\n/)[0]);
  else if (fix) {
    report("INFO", "Installing isolated Python 3.12 with uv");
    const result = run(uv, ["python", "install", "3.12"], { timeout: 240000 });
    need("MCP Python 3.12", result.ok, "uv python install 3.12 failed: " + (result.error || result.output));
  } else need("MCP Python 3.12", false, "Run preflight with --fix");
  if (fix && (process.env.MCP_GODOT_ENABLED || "").toLowerCase() === "true") {
    report("INFO", "Preparing Godot AI MCP dependencies for Python 3.12");
    const version = process.env.MCP_GODOT_VERSION || "4.3.0";
    const check = run(uv, ["tool", "run", "--python", "3.12", "--link-mode", "copy", "--from", "godot-ai==" + version, "godot-ai", "--version"], { timeout: 240000, env: { ...process.env, PYTHONUTF8: "1" } });
    need("Godot MCP " + version, check.ok, check.error || check.output.slice(-500));
  }
}
report("INFO", "Rust/Cargo and C++ build tools are not installed proactively: Python wheels should be used where available");
if (issues) report("SUMMARY", issues + " checks need attention; existing installations and caches were preserved");
else report("SUMMARY", "All applicable checks passed");
process.exitCode = issues ? 1 : 0;
