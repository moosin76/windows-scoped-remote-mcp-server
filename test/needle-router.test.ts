import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NeedleRouter } from "../src/needle/needle-router.js";

const roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), "wsr-needle-router-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const tools = [
  {
    name: "wsr_status",
    description: "Return WSR status",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
];

describe("NeedleRouter sidecar lifecycle", () => {
  it("reuses one persistent sidecar process across requests", async () => {
    const root = makeRoot();
    const scriptPath = path.join(root, "fake-sidecar.mjs");
    writeFileSync(
      scriptPath,
      `import readline from "node:readline";
let count = 0;
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const request = JSON.parse(line);
  count += 1;
  process.stdout.write(JSON.stringify({
    id: request.id,
    ok: true,
    confidence: 0.94,
    reasoning: "pid=" + process.pid + ";count=" + count,
    function_calls: [{ name: "wsr_status", arguments: {} }],
    suppressed_calls: []
  }) + "\\n");
});
`,
      "utf8",
    );

    const router = new NeedleRouter({
      enabled: true,
      pythonCommand: process.execPath,
      confidenceThreshold: 0.7,
      toolIndexPath: path.join(root, "tools.idx"),
      requestTimeoutMs: 2_000,
      scriptPath,
      cwd: root,
    });

    try {
      const first = await router.route("status", tools);
      const second = await router.route("status again", tools);

      expect(first.available).toBe(true);
      expect(first.recommended).toBe(true);
      expect(second.available).toBe(true);
      expect(second.recommended).toBe(true);
      const firstPid = first.reasoning?.match(/pid=(\d+)/)?.[1];
      const secondPid = second.reasoning?.match(/pid=(\d+)/)?.[1];
      expect(firstPid).toBeTruthy();
      expect(secondPid).toBe(firstPid);
      expect(first.reasoning).toContain("count=1");
      expect(second.reasoning).toContain("count=2");
    } finally {
      await router.close();
    }
  });

  it("uses separate reusable sidecars for different catalog fingerprints", async () => {
    const root = makeRoot();
    const scriptPath = path.join(root, "fake-sidecar.mjs");
    writeFileSync(
      scriptPath,
      `import readline from "node:readline";
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const request = JSON.parse(line);
  process.stdout.write(JSON.stringify({
    id: request.id,
    ok: true,
    confidence: 0.95,
    reasoning: "pid=" + process.pid + ";tool=" + request.tools[0].name,
    function_calls: [{ name: request.tools[0].name, arguments: {} }],
    suppressed_calls: []
  }) + "\\n");
});
`,
      "utf8",
    );

    const router = new NeedleRouter({
      enabled: true,
      pythonCommand: process.execPath,
      confidenceThreshold: 0.7,
      toolIndexPath: path.join(root, "tools.idx"),
      requestTimeoutMs: 2_000,
      maxSidecars: 3,
      scriptPath,
      cwd: root,
    });

    const otherTools = [
      {
        name: "get_active_workspace",
        description: "Get active workspace",
        parameters: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      },
    ];

    try {
      const first = await router.route("status", tools);
      const second = await router.route("workspace", otherTools);
      const third = await router.route("status again", tools);

      const firstPid = first.reasoning?.match(/pid=(\d+)/)?.[1];
      const secondPid = second.reasoning?.match(/pid=(\d+)/)?.[1];
      const thirdPid = third.reasoning?.match(/pid=(\d+)/)?.[1];
      expect(firstPid).toBeTruthy();
      expect(secondPid).toBeTruthy();
      expect(secondPid).not.toBe(firstPid);
      expect(thirdPid).toBe(firstPid);
    } finally {
      await router.close();
    }
  });

  it("isolates sidecar crashes and escalates instead of throwing", async () => {
    const root = makeRoot();
    const scriptPath = path.join(root, "crash-sidecar.mjs");
    writeFileSync(
      scriptPath,
      `process.stdin.once("data", () => {
  process.stderr.write("synthetic sidecar failure");
  process.exit(7);
});
`,
      "utf8",
    );

    const router = new NeedleRouter({
      enabled: true,
      pythonCommand: process.execPath,
      confidenceThreshold: 0.7,
      toolIndexPath: path.join(root, "tools.idx"),
      requestTimeoutMs: 2_000,
      scriptPath,
      cwd: root,
    });

    try {
      const result = await router.route("status", tools);
      expect(result.available).toBe(false);
      expect(result.recommended).toBe(false);
      expect(result.escalate).toBe(true);
      expect(result.error).toContain("sidecar exited");
    } finally {
      await router.close();
    }
  });

  it("does not spawn anything when routing is disabled", async () => {
    const root = makeRoot();
    const router = new NeedleRouter({
      enabled: false,
      pythonCommand: "definitely-does-not-exist",
      confidenceThreshold: 0.7,
      toolIndexPath: path.join(root, "tools.idx"),
      requestTimeoutMs: 1000,
      cwd: root,
    });
    const result = await router.route("status", tools);
    expect(result.enabled).toBe(false);
    expect(result.available).toBe(false);
    expect(result.escalate).toBe(true);
    expect(result.error).toContain("disabled");
  });
});
