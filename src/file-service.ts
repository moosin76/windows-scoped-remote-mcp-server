import { createHash, randomUUID } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import {
  appendFile,
  chmod,
  copyFile,
  cp,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  readlink,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

import { errorMessage } from "./errors.js";
import type { SandboxGuard } from "./sandbox.js";

const execFileAsync = promisify(execFile);

export type FileContentEncoding = "utf8" | "base64";

export interface FileServiceOptions {
  sandbox: SandboxGuard;
  maxChunkBytes: number;
  maxEditFileBytes: number;
  maxOutputBytes: number;
}

export interface ListDirectoryOptions {
  recursive?: boolean;
  maxDepth?: number;
  maxEntries?: number;
  includeHidden?: boolean;
  includeMetadata?: boolean;
}

interface DirectoryEntryResult {
  path: string;
  relativePath: string;
  name: string;
  type: "file" | "directory" | "symlink" | "other";
  size?: number;
  mode?: string;
  modifiedAt?: string;
}

function typeFromStats(stats: Awaited<ReturnType<typeof lstat>>): DirectoryEntryResult["type"] {
  if (stats.isFile()) return "file";
  if (stats.isDirectory()) return "directory";
  if (stats.isSymbolicLink()) return "symlink";
  return "other";
}

function decodeBase64(data: string): Buffer {
  if (data.length === 0) return Buffer.alloc(0);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
    throw new Error("Invalid base64 content");
  }
  return Buffer.from(data, "base64");
}

function decodeContent(data: string, encoding: FileContentEncoding): Buffer {
  return encoding === "base64" ? decodeBase64(data) : Buffer.from(data, "utf8");
}

export class FileService {
  readonly #sandbox: SandboxGuard;
  readonly #options: FileServiceOptions;

  constructor(options: FileServiceOptions) {
    this.#sandbox = options.sandbox;
    this.#options = options;
  }

  get workspaceRoot(): string {
    return this.#sandbox.workspaceRoot;
  }

  resolve(targetPath: string, baseDir?: string): string {
    return this.#sandbox.resolveSafe(targetPath, baseDir);
  }

  resolveWrite(targetPath: string, baseDir?: string): string {
    const resolved = this.#sandbox.resolveSafe(targetPath, baseDir);
    const activeRoot = this.#sandbox.workspaceRoot;
    const normalizedRoot = path.resolve(activeRoot).toLowerCase();
    const normalizedTarget = path.resolve(resolved).toLowerCase();
    const prefix = normalizedRoot.endsWith(path.sep) ? normalizedRoot : `${normalizedRoot}${path.sep}`;
    if (normalizedTarget !== normalizedRoot && !normalizedTarget.startsWith(prefix)) {
      throw new Error(`Write denied: path is outside the active workspace (${activeRoot}). Other workspaces are read-only.`);
    }
    return resolved;
  }

  async listDirectory(targetPath: string, options: ListDirectoryOptions = {}): Promise<{
    directory: string;
    relativePath: string;
    entries: DirectoryEntryResult[];
    totalEntries: number;
    truncated: boolean;
  }> {
    const resolved = this.resolve(targetPath);
    const maxDepth = options.maxDepth ?? (options.recursive ? 10 : 1);
    const maxEntries = options.maxEntries ?? 1000;
    const includeHidden = options.includeHidden ?? false;
    const includeMetadata = options.includeMetadata ?? true;

    const entries: DirectoryEntryResult[] = [];
    let truncated = false;

    const walk = async (currentDir: string, depth: number) => {
      if (depth > maxDepth || entries.length >= maxEntries) {
        if (entries.length >= maxEntries) truncated = true;
        return;
      }

      this.#sandbox.assertInside(currentDir);
      const items = await readdir(currentDir, { withFileTypes: true });

      for (const item of items) {
        if (!includeHidden && item.name.startsWith(".")) continue;
        if (entries.length >= maxEntries) {
          truncated = true;
          break;
        }

        const itemPath = path.join(currentDir, item.name);
        try {
          this.#sandbox.assertInside(itemPath);
          const stats = await lstat(itemPath);
          const relPath = path.relative(this.workspaceRoot, itemPath);

          const entry: DirectoryEntryResult = {
            path: itemPath,
            relativePath: relPath === "" ? "." : relPath,
            name: item.name,
            type: typeFromStats(stats),
          };

          if (includeMetadata) {
            entry.size = stats.size;
            entry.mode = (stats.mode & 0o777).toString(8);
            entry.modifiedAt = stats.mtime.toISOString();
          }

          entries.push(entry);

          if (item.isDirectory() && options.recursive && depth < maxDepth) {
            await walk(itemPath, depth + 1);
          }
        } catch {
          // If outside sandbox or inaccessible, skip
        }
      }
    };

    await walk(resolved, 1);
    const relativeToRoot = path.relative(this.workspaceRoot, resolved);

    return {
      directory: resolved,
      relativePath: relativeToRoot === "" ? "." : relativeToRoot,
      entries,
      totalEntries: entries.length,
      truncated,
    };
  }

  async statPath(targetPath: string): Promise<{
    path: string;
    relativePath: string;
    exists: boolean;
    type?: "file" | "directory" | "symlink" | "other";
    size?: number;
    mode?: string;
    modifiedAt?: string;
    symlinkTarget?: string;
  }> {
    const resolved = this.resolve(targetPath);
    const relativePath = path.relative(this.workspaceRoot, resolved);

    try {
      const stats = await lstat(resolved);
      let symlinkTarget: string | undefined;
      if (stats.isSymbolicLink()) {
        try {
          symlinkTarget = await readlink(resolved);
        } catch {
          // Ignore
        }
      }

      return {
        path: resolved,
        relativePath: relativePath === "" ? "." : relativePath,
        exists: true,
        type: typeFromStats(stats),
        size: stats.size,
        mode: (stats.mode & 0o777).toString(8),
        modifiedAt: stats.mtime.toISOString(),
        symlinkTarget,
      };
    } catch {
      return {
        path: resolved,
        relativePath: relativePath === "" ? "." : relativePath,
        exists: false,
      };
    }
  }

  async readFile(
    targetPath: string,
    options: { offset?: number; maxBytes?: number; encoding?: FileContentEncoding } = {},
  ): Promise<{
    path: string;
    relativePath: string;
    size: number;
    offset: number;
    bytesRead: number;
    hasMore: boolean;
    nextOffset?: number;
    encoding: FileContentEncoding;
    content: string;
  }> {
    const resolved = this.resolve(targetPath);
    const encoding = options.encoding ?? "utf8";
    const offset = options.offset ?? 0;
    const maxBytes = Math.min(options.maxBytes ?? this.#options.maxChunkBytes, this.#options.maxChunkBytes);

    const stats = await stat(resolved);
    const totalSize = stats.size;

    if (offset >= totalSize) {
      return {
        path: resolved,
        relativePath: path.relative(this.workspaceRoot, resolved),
        size: totalSize,
        offset,
        bytesRead: 0,
        hasMore: false,
        encoding,
        content: "",
      };
    }

    const handle = await open(resolved, "r");
    try {
      const buffer = Buffer.alloc(Math.min(maxBytes, totalSize - offset));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);
      const readBuffer = buffer.subarray(0, bytesRead);
      const hasMore = offset + bytesRead < totalSize;

      return {
        path: resolved,
        relativePath: path.relative(this.workspaceRoot, resolved),
        size: totalSize,
        offset,
        bytesRead,
        hasMore,
        nextOffset: hasMore ? offset + bytesRead : undefined,
        encoding,
        content: encoding === "base64" ? readBuffer.toString("base64") : readBuffer.toString("utf8"),
      };
    } finally {
      await handle.close();
    }
  }

  async writeFile(
    targetPath: string,
    content: string,
    options: {
      encoding?: FileContentEncoding;
      mode?: "overwrite" | "append" | "create_only";
      createDirectories?: boolean;
    } = {},
  ): Promise<{ path: string; relativePath: string; bytesWritten: number }> {
    const resolved = this.resolveWrite(targetPath);
    const encoding = options.encoding ?? "utf8";
    const mode = options.mode ?? "overwrite";
    const buffer = decodeContent(content, encoding);

    if (options.createDirectories) {
      await mkdir(path.dirname(resolved), { recursive: true });
    }

    if (mode === "create_only") {
      await writeFile(resolved, buffer, { flag: "wx" });
    } else if (mode === "append") {
      await appendFile(resolved, buffer);
    } else {
      await writeFile(resolved, buffer);
    }

    return {
      path: resolved,
      relativePath: path.relative(this.workspaceRoot, resolved),
      bytesWritten: buffer.length,
    };
  }

  async replaceInFile(
    targetPath: string,
    targetString: string,
    replacementString: string,
    options: { allowMultiple?: boolean } = {},
  ): Promise<{ path: string; relativePath: string; replacementsMade: number }> {
    const resolved = this.resolveWrite(targetPath);
    const stats = await stat(resolved);
    if (stats.size > this.#options.maxEditFileBytes) {
      throw new Error(`File size ${stats.size} exceeds maximum editable size of ${this.#options.maxEditFileBytes} bytes`);
    }

    const original = await readFile(resolved, "utf8");
    if (!original.includes(targetString)) {
      throw new Error(`Target text to replace not found in "${targetPath}"`);
    }

    let replacementsMade = 0;
    let modified = "";

    if (options.allowMultiple) {
      const parts = original.split(targetString);
      replacementsMade = parts.length - 1;
      modified = parts.join(replacementString);
    } else {
      const index = original.indexOf(targetString);
      const nextIndex = original.indexOf(targetString, index + targetString.length);
      if (nextIndex !== -1) {
        throw new Error(`Multiple occurrences of target text found in "${targetPath}". Set allowMultiple=true to replace all.`);
      }
      modified = original.slice(0, index) + replacementString + original.slice(index + targetString.length);
      replacementsMade = 1;
    }

    await writeFile(resolved, modified, "utf8");

    return {
      path: resolved,
      relativePath: path.relative(this.workspaceRoot, resolved),
      replacementsMade,
    };
  }

  async applyPatch(
    patchContent: string,
    workdir?: string,
  ): Promise<{ success: boolean; output: string }> {
    const cwd = workdir ? this.resolveWrite(workdir) : this.workspaceRoot;
    const tempPatchFile = path.join(this.workspaceRoot, `.patch_${randomUUID()}.diff`);

    try {
      await writeFile(tempPatchFile, patchContent, "utf8");
      const { stdout, stderr } = await execFileAsync("git", ["apply", "--whitespace=nowarn", tempPatchFile], {
        cwd,
        windowsHide: true,
      });
      return { success: true, output: (stdout + "\n" + stderr).trim() || "Patch applied successfully" };
    } finally {
      await rm(tempPatchFile, { force: true }).catch(() => {});
    }
  }

  async hashFile(
    targetPath: string,
    algorithm: "sha256" | "md5" | "sha1" = "sha256",
  ): Promise<{ path: string; relativePath: string; algorithm: string; hash: string }> {
    const resolved = this.resolve(targetPath);
    const hash = createHash(algorithm);
    const stream = createReadStream(resolved);

    await new Promise<void>((res, rej) => {
      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("end", () => res());
      stream.on("error", rej);
    });

    return {
      path: resolved,
      relativePath: path.relative(this.workspaceRoot, resolved),
      algorithm,
      hash: hash.digest("hex"),
    };
  }

  async makeDirectory(targetPath: string): Promise<{ path: string; relativePath: string }> {
    const resolved = this.resolveWrite(targetPath);
    await mkdir(resolved, { recursive: true });
    return {
      path: resolved,
      relativePath: path.relative(this.workspaceRoot, resolved),
    };
  }

  async copyPath(source: string, destination: string, overwrite = false): Promise<{ from: string; to: string }> {
    const src = this.resolve(source);
    const dest = this.resolveWrite(destination);

    const stats = await stat(src);
    if (stats.isDirectory()) {
      await cp(src, dest, { recursive: true, force: overwrite });
    } else {
      await copyFile(src, dest, overwrite ? 0 : constants.COPYFILE_EXCL);
    }

    return {
      from: path.relative(this.workspaceRoot, src),
      to: path.relative(this.workspaceRoot, dest),
    };
  }

  async movePath(source: string, destination: string): Promise<{ from: string; to: string }> {
    const src = this.resolveWrite(source);
    const dest = this.resolveWrite(destination);
    await rename(src, dest);
    return {
      from: path.relative(this.workspaceRoot, src),
      to: path.relative(this.workspaceRoot, dest),
    };
  }

  async removePath(targetPath: string, recursive = false): Promise<{ path: string; relativePath: string }> {
    const resolved = this.resolveWrite(targetPath);
    if (resolved === this.workspaceRoot) {
      throw new Error("Cannot delete the workspace root itself!");
    }
    await rm(resolved, { recursive, force: true });
    return {
      path: resolved,
      relativePath: path.relative(this.workspaceRoot, resolved),
    };
  }
}
