import type { AppConfig } from "./config.js";

export function generateOpenApiSpec(config: AppConfig) {
  const publicUrl = config.publicUrl || `http://localhost:${config.port}`;

  return {
    openapi: "3.0.1",
    info: {
      title: "Windows Scoped Remote Dev Server",
      description: "Secure, sandboxed Windows remote filesystem and process execution plugin.",
      version: "1.0.0",
    },
    servers: [
      {
        url: publicUrl,
      },
    ],
    paths: {
      "/api/list-directory": {
        get: {
          operationId: "listDirectory",
          summary: "List files and folders in workspace",
          description: "List directory contents within the sandboxed workspace root.",
          parameters: [
            {
              name: "path",
              in: "query",
              required: false,
              schema: { type: "string", default: "." },
              description: "Directory path relative to workspace root.",
            },
            {
              name: "recursive",
              in: "query",
              required: false,
              schema: { type: "boolean", default: false },
              description: "List subdirectories recursively.",
            },
          ],
          responses: {
            "200": {
              description: "Directory listing response",
              content: {
                "application/json": {
                  schema: { type: "object" },
                },
              },
            },
          },
        },
        post: {
          operationId: "listDirectoryPost",
          summary: "List files and folders in workspace (POST)",
          description: "List directory contents within the sandboxed workspace root.",
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    path: { type: "string", default: "." },
                    recursive: { type: "boolean", default: false },
                    maxDepth: { type: "integer", default: 5 },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Directory listing response",
              content: {
                "application/json": {
                  schema: { type: "object" },
                },
              },
            },
          },
        },
      },
      "/api/read-file": {
        get: {
          operationId: "readFile",
          summary: "Read file contents",
          description: "Read text contents from a file within the workspace.",
          parameters: [
            {
              name: "path",
              in: "query",
              required: true,
              schema: { type: "string" },
              description: "File path to read.",
            },
          ],
          responses: {
            "200": {
              description: "File content response",
              content: {
                "application/json": {
                  schema: { type: "object" },
                },
              },
            },
          },
        },
        post: {
          operationId: "readFilePost",
          summary: "Read file contents (POST)",
          description: "Read text contents from a file within the workspace.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    path: { type: "string" },
                    offset: { type: "integer", default: 0 },
                    maxBytes: { type: "integer", default: 524288 },
                  },
                  required: ["path"],
                },
              },
            },
          },
          responses: {
            "200": {
              description: "File content response",
              content: {
                "application/json": {
                  schema: { type: "object" },
                },
              },
            },
          },
        },
      },
      "/api/write-file": {
        post: {
          operationId: "writeFile",
          summary: "Write or create a file",
          description: "Create or overwrite a file with given text content.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    path: { type: "string" },
                    content: { type: "string" },
                    mode: { type: "string", enum: ["overwrite", "append"], default: "overwrite" },
                  },
                  required: ["path", "content"],
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Write result",
              content: {
                "application/json": {
                  schema: { type: "object" },
                },
              },
            },
          },
        },
      },
      "/api/exec": {
        post: {
          operationId: "execCommand",
          summary: "Execute Windows shell command",
          description: "Run PowerShell or CMD commands in workspace and return output.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    cmd: { type: "string", description: "Command to execute (e.g. dir, git status, npm test)" },
                    shell: { type: "string", enum: ["powershell", "cmd"], default: "powershell" },
                    cwd: { type: "string", default: "." },
                    timeoutMs: { type: "integer", default: 30000 },
                  },
                  required: ["cmd"],
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Command execution output",
              content: {
                "application/json": {
                  schema: { type: "object" },
                },
              },
            },
          },
        },
      },
      "/api/stat": {
        get: {
          operationId: "statPath",
          summary: "Get file/folder metadata",
          description: "Get size, timestamps, and existence of a path.",
          parameters: [
            {
              name: "path",
              in: "query",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Path stat response",
              content: {
                "application/json": {
                  schema: { type: "object" },
                },
              },
            },
          },
        },
      },
    },
  };
}

export function generateAiPluginManifest(config: AppConfig) {
  const publicUrl = config.publicUrl || `http://localhost:${config.port}`;

  return {
    schema_version: "v1",
    name_for_human: "my-remote",
    name_for_model: "my_remote",
    description_for_human: "Windows Scoped Remote Developer Assistant with file and command tools.",
    description_for_model: "Remote tool for browsing files, reading/writing files, and running PowerShell commands within the sandboxed Windows workspace.",
    auth: {
      type: "none",
    },
    api: {
      type: "openapi",
      url: `${publicUrl}/openapi.json`,
    },
    logo_url: `${publicUrl}/icon.png`,
    contact_email: "support@ezcode.kr",
    legal_info_url: `${publicUrl}/health`,
  };
}
