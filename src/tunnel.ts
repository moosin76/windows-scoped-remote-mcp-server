import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type { AppConfig } from "./config.js";

export interface TunnelInstance {
  process: ChildProcess;
  publicUrl?: string;
  stop: () => void;
}

export function findCloudflaredBinary(projectRoot: string): string | undefined {
  const candidateNames = [
    "cloudflared-windows-amd64.exe",
    "cloudflared.exe",
    "cloudflared",
  ];

  // 1. Check bin/ directory in project
  for (const name of candidateNames) {
    const p = path.join(projectRoot, "bin", name);
    if (existsSync(p)) return p;
  }

  // 2. Check root directory
  for (const name of candidateNames) {
    const p = path.join(projectRoot, name);
    if (existsSync(p)) return p;
  }

  // 3. System PATH check
  return "cloudflared";
}

export async function startCloudflareTunnel(
  config: AppConfig,
  projectRoot: string,
): Promise<TunnelInstance> {
  const binary = findCloudflaredBinary(projectRoot);
  if (!binary) {
    throw new Error("cloudflared binary not found in bin/ or system PATH");
  }

  let args: string[] = [];
  const token = config.cloudflareTunnelToken;

  if (token && token.trim() !== "") {
    // If it's a token
    if (token.startsWith("eyJh") || token.length > 50) {
      args = ["tunnel", "run", "--token", token];
    } else {
      args = ["tunnel", "run", token];
    }
    console.log(`[Tunnel] Connecting to Cloudflare using configured Tunnel Token...`);
  } else {
    // Quick Tunnel mode
    args = ["tunnel", "--url", `http://localhost:${config.port}`];
  }

  console.log(`[Tunnel] Launching Cloudflare Tunnel with ${path.basename(binary)}...`);

  const child = spawn(binary, args, {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let publicUrl = config.publicUrl;
  let fixedTunnelAnnounced = false;

  const urlRegex = /https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/;

  const checkOutput = (data: Buffer) => {
    const text = data.toString("utf8");
    
    // Quick tunnel URL detection
    const match = text.match(urlRegex);
    if (match && !publicUrl) {
      publicUrl = match[0];
      console.log(`\n============================================================`);
      console.log(` [Cloudflare Quick Tunnel Connected!]`);
      console.log(` 🌐 Public URL:    ${publicUrl}`);
      console.log(` 🔌 MCP Endpoint:  ${publicUrl}${config.endpoint}`);
      if (config.authToken) {
        console.log(` 🔐 Authentication: Bearer token configured`);
      }
      console.log(`============================================================\n`);
    }

    // Named tunnel connection success detection
    if (!fixedTunnelAnnounced && (text.includes("Registered tunnel connection") || text.includes("Connection registered"))) {
      console.log(`\n============================================================`);
      console.log(` [Cloudflare Fixed Tunnel Connected & Active!]`);
      if (config.publicUrl) {
        console.log(` 🌐 Public URL:    ${config.publicUrl}`);
        console.log(` 🔌 MCP Endpoint:  ${config.publicUrl}${config.endpoint}`);
      }
      if (config.authToken) {
        console.log(` 🔐 Authentication: Bearer token configured`);
      }
      console.log(`============================================================\n`);
      fixedTunnelAnnounced = true;
    }
  };

  child.on("error", (err) => {
    console.error(`[Tunnel Error] Failed to start cloudflared: ${err.message}`);
  });

  child.on("exit", (code) => {
    console.log(`[Tunnel] cloudflared process exited with code ${code}`);
  });

  const stop = () => {
    try {
      child.kill("SIGTERM");
    } catch {
      // Ignore
    }
  };

  return {
    process: child,
    publicUrl,
    stop,
  };
}



