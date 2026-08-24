import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import type { AppConfig } from "./config.js";
import { FileService } from "./file-service.js";
import { runTool } from "./tool-result.js";

export function registerFileTools(
  server: McpServer,
  config: AppConfig,
  fileService: FileService,
): void {
  server.registerTool(
    "list_directory",
    {
      title: "List Directory",
      description: "List files and folders within the sandboxed workspace.",
      inputSchema: z.object({
        path: z
          .string()
          .default(".")
          .describe("Directory path relative to workspace root."),
        recursive: z
          .boolean()
          .default(false)
          .describe("List subdirectories recursively."),
        maxDepth: z.number().int().min(1).max(20).optional(),
        maxEntries: z.number().int().min(1).max(5000).default(1000),
        includeHidden: z.boolean().default(false),
        includeMetadata: z.boolean().default(true),
      }),
    },
    async ({
      path,
      recursive,
      maxDepth,
      maxEntries,
      includeHidden,
      includeMetadata,
    }) =>
      runTool(async () => {
        return fileService.listDirectory(path, {
          recursive,
          maxDepth,
          maxEntries,
          includeHidden,
          includeMetadata,
        });
      }),
  );

  server.registerTool(
    "stat_path",
    {
      title: "Get Path Metadata",
      description:
        "Check if a file or directory exists and get its metadata (size, modified time, type).",
      inputSchema: z.object({
        path: z.string().describe("Target file or directory path."),
      }),
    },
    async ({ path }) =>
      runTool(async () => {
        return fileService.statPath(path);
      }),
  );

  server.registerTool(
    "read_file",
    {
      title: "Read File Content",
      description:
        "Read content from a file (UTF-8 or base64 chunks) inside the sandboxed workspace.",
      inputSchema: z.object({
        path: z.string().describe("File path."),
        offset: z
          .number()
          .int()
          .min(0)
          .default(0)
          .describe("Byte offset to start reading."),
        maxBytes: z
          .number()
          .int()
          .min(1)
          .max(config.maxFileChunkBytes)
          .default(config.maxFileChunkBytes),
        encoding: z.enum(["utf8", "base64"]).default("utf8"),
      }),
    },
    async ({ path, offset, maxBytes, encoding }) =>
      runTool(async () => {
        return fileService.readFile(path, { offset, maxBytes, encoding });
      }),
  );

  server.registerTool(
    "write_file",
    {
      title: "Write File Content",
      description:
        "Write or append content to a file inside the sandboxed workspace.",
      inputSchema: z.object({
        path: z.string().describe("File path."),
        content: z.string().describe("Content to write (text or base64)."),
        encoding: z.enum(["utf8", "base64"]).default("utf8"),
        mode: z
          .enum(["overwrite", "append", "create_only"])
          .default("overwrite"),
        createDirectories: z.boolean().default(true),
      }),
    },
    async ({ path, content, encoding, mode, createDirectories }) =>
      runTool(async () => {
        return fileService.writeFile(path, content, {
          encoding,
          mode,
          createDirectories,
        });
      }),
  );

  server.registerTool(
    "replace_in_file",
    {
      title: "Replace Text in File",
      description: "Search and replace an exact string in a file.",
      inputSchema: z.object({
        path: z.string().describe("File path."),
        targetString: z.string().min(1).describe("Exact substring to match."),
        replacementString: z.string().describe("Replacement substring."),
        allowMultiple: z
          .boolean()
          .default(false)
          .describe("Replace all occurrences."),
      }),
    },
    async ({ path, targetString, replacementString, allowMultiple }) =>
      runTool(async () => {
        return fileService.replaceInFile(
          path,
          targetString,
          replacementString,
          { allowMultiple },
        );
      }),
  );

  server.registerTool(
    "apply_patch",
    {
      title: "Apply Git Patch",
      description:
        "Apply a standard unified diff / patch to files in the workspace.",
      inputSchema: z.object({
        patch: z.string().min(1).describe("Diff/patch content."),
        workdir: z.string().optional().describe("Directory to apply patch in."),
      }),
    },
    async ({ patch, workdir }) =>
      runTool(async () => {
        return fileService.applyPatch(patch, workdir);
      }),
  );

  server.registerTool(
    "upload_file",
    {
      title: "Upload File Chunk",
      description:
        "Upload base64 chunks to write a binary or text file to the host.",
      inputSchema: z.object({
        path: z.string().describe("Destination file path."),
        dataBase64: z.string().describe("Base64 encoded chunk data."),
        mode: z.enum(["overwrite", "append"]).default("overwrite"),
      }),
    },
    async ({ path, dataBase64, mode }) =>
      runTool(async () => {
        return fileService.writeFile(path, dataBase64, {
          encoding: "base64",
          mode,
          createDirectories: true,
        });
      }),
  );

  server.registerTool(
    "download_file",
    {
      title: "Download File Chunk",
      description: "Download a file chunk as base64 from the workspace.",
      inputSchema: z.object({
        path: z.string().describe("Source file path."),
        offset: z.number().int().min(0).default(0),
        maxBytes: z.number().int().default(config.maxFileChunkBytes),
      }),
    },
    async ({ path, offset, maxBytes }) =>
      runTool(async () => {
        return fileService.readFile(path, {
          offset,
          maxBytes,
          encoding: "base64",
        });
      }),
  );

  server.registerTool(
    "hash_file",
    {
      title: "Calculate File Hash",
      description:
        "Calculate cryptographic checksum (SHA256, MD5, SHA1) of a file.",
      inputSchema: z.object({
        path: z.string().describe("File path."),
        algorithm: z.enum(["sha256", "md5", "sha1"]).default("sha256"),
      }),
    },
    async ({ path, algorithm }) =>
      runTool(async () => {
        return fileService.hashFile(path, algorithm);
      }),
  );

  server.registerTool(
    "make_directory",
    {
      title: "Make Directory",
      description:
        "Create a directory (and parent directories) inside the workspace.",
      inputSchema: z.object({
        path: z.string().describe("Directory path to create."),
      }),
    },
    async ({ path }) =>
      runTool(async () => {
        return fileService.makeDirectory(path);
      }),
  );

  server.registerTool(
    "copy_path",
    {
      title: "Copy File or Folder",
      description: "Copy a file or directory within the sandboxed workspace.",
      inputSchema: z.object({
        source: z.string().describe("Source path."),
        destination: z.string().describe("Destination path."),
        overwrite: z.boolean().default(false),
      }),
    },
    async ({ source, destination, overwrite }) =>
      runTool(async () => {
        return fileService.copyPath(source, destination, overwrite);
      }),
  );

  server.registerTool(
    "move_path",
    {
      title: "Move or Rename Path",
      description: "Move or rename a file or directory within the workspace.",
      inputSchema: z.object({
        source: z.string().describe("Source path."),
        destination: z.string().describe("Destination path."),
      }),
    },
    async ({ source, destination }) =>
      runTool(async () => {
        return fileService.movePath(source, destination);
      }),
  );

  server.registerTool(
    "remove_path",
    {
      title: "Delete File or Folder",
      description:
        "Permanently delete a file or directory inside the workspace.",
      inputSchema: z.object({
        path: z.string().describe("Path to delete."),
        recursive: z
          .boolean()
          .default(false)
          .describe("Required for directories."),
      }),
    },
    async ({ path, recursive }) =>
      runTool(async () => {
        return fileService.removePath(path, recursive);
      }),
  );
}
