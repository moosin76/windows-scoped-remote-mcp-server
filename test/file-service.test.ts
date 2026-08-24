import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SandboxGuard } from "../src/sandbox.js";
import { FileService } from "../src/file-service.js";
import { PathForbiddenError } from "../src/errors.js";

describe("FileService with Sandbox", () => {
  let tmpDir: string;
  let sandbox: SandboxGuard;
  let fileService: FileService;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "mcp-test-"));
    sandbox = new SandboxGuard(tmpDir);
    fileService = new FileService({
      sandbox,
      maxChunkBytes: 1024 * 1024,
      maxEditFileBytes: 1024 * 1024,
      maxOutputBytes: 1024 * 1024,
    });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it("writes and reads a file inside workspace", async () => {
    const writeResult = await fileService.writeFile("hello.txt", "Hello Windows MCP!", {
      encoding: "utf8",
    });
    expect(writeResult.bytesWritten).toBeGreaterThan(0);

    const readResult = await fileService.readFile("hello.txt");
    expect(readResult.content).toBe("Hello Windows MCP!");
    expect(readResult.hasMore).toBe(false);
  });

  it("replaces text in file", async () => {
    await fileService.writeFile("test.txt", "foo bar baz", { encoding: "utf8" });
    const replaceResult = await fileService.replaceInFile("test.txt", "bar", "qux");
    expect(replaceResult.replacementsMade).toBe(1);

    const content = await readFile(path.join(tmpDir, "test.txt"), "utf8");
    expect(content).toBe("foo qux baz");
  });

  it("blocks writing outside the workspace", async () => {
    await expect(
      fileService.writeFile("../outside.txt", "malicious payload"),
    ).rejects.toThrow(PathForbiddenError);
  });

  it("lists directory entries correctly", async () => {
    await fileService.writeFile("a.txt", "aaa");
    await fileService.writeFile("b.txt", "bbb");
    await fileService.makeDirectory("subdir");
    await fileService.writeFile("subdir/c.txt", "ccc");

    const list = await fileService.listDirectory(".", { recursive: true });
    expect(list.totalEntries).toBeGreaterThanOrEqual(3);
  });
});
