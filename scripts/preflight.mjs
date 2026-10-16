import { spawnSync } from "node:child_process";
import dotenv from "dotenv";
import { updateGodotVersion } from "./godot-version.mjs";
import { candidates, verify, selected } from "./mcp-python.mjs";
import { existsSync } from "node:fs";
import { join } from "node:path";

if (existsSync(".env")) dotenv.config({ path: ".env", override: true });
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
  let installed = candidates(uv);
  if (!installed.length && fix) {
    report("INFO", "Installing uv-managed default Python (no version pin)");
    const installedPython = run(uv, ["python", "install"], { timeout: 240000 });
    if (!installedPython.ok) report("WARN", installedPython.error || installedPython.output);
    installed = candidates(uv);
  }
  need("uv-managed Python candidates", installed.length > 0, "Run uv python install");
  if (installed.length) report("INFO", "Available Python interpreters: " + installed.join(", "));
  if (fix && (process.env.MCP_GODOT_ENABLED || "").toLowerCase() === "true") {
    report("INFO", "Selecting compatible Godot MCP Python without source builds");
    const setting = process.env.MCP_GODOT_VERSION || "auto";
    try {
      const version = await updateGodotVersion({ uv, setting });
      const check = verify(uv, "godot", "godot-ai==" + version, "godot-ai", { allowInstall: true });
      need("Godot MCP Python selection", check.ok, check.error);
      if (check.ok) report("OK", "Godot MCP " + version + " using Python " + check.python);
    } catch (e) { need("Godot MCP update", false, e.message); }
  }
  if (fix && (process.env.MCP_BLENDER_ENABLED || "").toLowerCase() === "true") {
    const version = process.env.MCP_BLENDER_VERSION || "1.0.3";
    const check = verify(uv, "blender", "git+https://projects.blender.org/lab/blender_mcp.git@v" + version + "#subdirectory=mcp", "blender-mcp", { allowInstall: true });
    need("Blender MCP Python selection", check.ok, check.error);
    if (check.ok) report("OK", "Blender MCP using Python " + check.python);
  }
}
report("INFO", "Rust/Cargo and C++ build tools are not installed proactively: Python wheels should be used where available");
if (issues) report("SUMMARY", issues + " checks need attention; existing installations and caches were preserved");
else report("SUMMARY", "All applicable checks passed");
process.exitCode = issues ? 1 : 0;
