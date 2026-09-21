import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { ProviderRegistry, NamespacedTool } from "../providers/provider-registry.js";
import type { NeedleRouter } from "./needle-router.js";
import type { NeedleScope, NeedleToolSchema } from "./needle-types.js";

const EMPTY_PARAMETERS = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

const PROVIDER_CONTROL_NAMES = new Set([
  "mcp_provider_status",
  "mcp_provider_catalog",
  "mcp_provider_call",
]);

export const CORE_NEEDLE_TOOLS: readonly NeedleToolSchema[] = Object.freeze([
  {
    name: "list_workspaces",
    description:
      "List all registered WSR workspaces and identify the active workspace.",
    parameters: EMPTY_PARAMETERS,
  },
  {
    name: "get_active_workspace",
    description:
      "Get the currently active WSR workspace.",
    parameters: EMPTY_PARAMETERS,
  },
  {
    name: "switch_workspace",
    description:
      "Switch the active WSR workspace by alias or path.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          minLength: 1,
          description: "Workspace alias or absolute path, for example df, gas, wsr.",
        },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "workspace_context",
    description:
      "Collect read-only Git, AGENTS, roadmap, session and TODO context for a workspace without switching it.",
    parameters: {
      type: "object",
      properties: {
        workspace: { type: "string", minLength: 1 },
        recentCommits: { type: "integer", minimum: 1, maximum: 20, default: 5 },
        recentSessions: { type: "integer", minimum: 0, maximum: 5, default: 2 },
        maxDocumentBytes: {
          type: "integer",
          minimum: 1024,
          maximum: 131072,
          default: 32768,
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "workspace_resume",
    description:
      "Build read-only resume hints and next tasks for a workspace from Git and project handoff documents.",
    parameters: {
      type: "object",
      properties: {
        workspace: { type: "string", minLength: 1 },
        recentCommits: { type: "integer", minimum: 1, maximum: 20, default: 5 },
        recentSessions: { type: "integer", minimum: 1, maximum: 5, default: 2 },
        maxDocumentBytes: {
          type: "integer",
          minimum: 1024,
          maximum: 131072,
          default: 32768,
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "wsr_status",
    description:
      "Return WSR gateway operational status: version, workspace, providers, browser and processes.",
    parameters: EMPTY_PARAMETERS,
  },
  {
    name: "exec_command",
    description:
      "Execute a shell command inside the active workspace sandbox. On Windows Git Bash is preferred.",
    parameters: {
      type: "object",
      properties: {
        cmd: { type: "string", minLength: 1 },
        workdir: { type: "string" },
        shell: { type: "string", enum: ["powershell", "cmd", "pwsh", "bash", "sh"] },
        timeoutMs: { type: "integer", minimum: 0, default: 0 },
      },
      required: ["cmd"],
      additionalProperties: false,
    },
  },
  {
    name: "read_file",
    description:
      "Read a file inside the active workspace sandbox.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        offset: { type: "integer", minimum: 0, default: 0 },
        maxBytes: { type: "integer", minimum: 1 },
        encoding: { type: "string", enum: ["utf8", "base64"], default: "utf8" },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    name: "write_file",
    description:
      "Write or append a file inside the active workspace sandbox.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
        encoding: { type: "string", enum: ["utf8", "base64"], default: "utf8" },
        mode: {
          type: "string",
          enum: ["overwrite", "append", "create_only"],
          default: "overwrite",
        },
        createDirectories: { type: "boolean", default: true },
      },
      required: ["path", "content"],
      additionalProperties: false,
    },
  },
  {
    name: "browser_navigate",
    description:
      "Open or navigate the Playwright browser to a URL.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", format: "uri" },
      },
      required: ["url"],
      additionalProperties: false,
    },
  },
  {
    name: "mcp_provider_status",
    description:
      "Inspect optional MCP provider connectivity or use the stable provider control plane.",
    parameters: {
      type: "object",
      properties: {
        op: { type: "string", enum: ["status", "catalog", "call"], default: "status" },
        tool: { type: "string", minLength: 1 },
        arguments: { type: "object" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "mcp_provider_catalog",
    description:
      "List only the provider tools already discovered and allowlisted by ProviderRegistry.",
    parameters: EMPTY_PARAMETERS,
  },
  {
    name: "mcp_provider_call",
    description:
      "Fallback that invokes an already discovered allowlisted provider tool. Needle only recommends this WSR tool; needle_route never executes it.",
    parameters: {
      type: "object",
      properties: {
        tool: { type: "string", minLength: 1 },
        arguments: { type: "object" },
      },
      required: ["tool"],
      additionalProperties: false,
    },
  },
]);

export interface NeedleCatalogSelection {
  tools: NeedleToolSchema[];
  providerIds: string[];
}

function normaliseToken(token: string): string {
  const value = token.toLocaleLowerCase();
  if (/^[a-z0-9]+$/.test(value) && value.length > 3 && value.endsWith("s")) {
    return value.slice(0, -1);
  }
  return value;
}

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLocaleLowerCase()
      .split(/[^\p{L}\p{N}]+/gu)
      .map(normaliseToken)
      .filter((token) => token.length >= 2),
  );
}

function overlapScore(queryTokens: Set<string>, text: string): number {
  let score = 0;
  for (const token of tokens(text)) {
    if (queryTokens.has(token)) score += 1;
  }
  return score;
}

function providerToolToNeedle(entry: NamespacedTool): NeedleToolSchema {
  const raw = entry.tool.inputSchema;
  const parameters =
    raw && typeof raw === "object"
      ? (structuredClone(raw) as Record<string, unknown>)
      : { ...EMPTY_PARAMETERS };

  // Provider tools such as Blender require user_prompt to contain the user's
  // exact original wording. Needle should not fabricate or paraphrase it.
  // Hide it from inference and inject it back after routing.
  const properties = parameters.properties;
  if (properties && typeof properties === "object" && !Array.isArray(properties)) {
    delete (properties as Record<string, unknown>).user_prompt;
  }
  if (Array.isArray(parameters.required)) {
    parameters.required = parameters.required.filter(
      (name) => name !== "user_prompt",
    );
  }

  return {
    name: entry.tool.name,
    description:
      `[Provider ${entry.providerId}] ` +
      (entry.tool.description ?? `Call provider tool ${entry.remoteName}.`),
    parameters,
    providerId: entry.providerId,
  };
}

function scoreProvider(
  query: string,
  queryTokens: Set<string>,
  providerId: string,
  namespace: string,
  tools: readonly NamespacedTool[],
): number {
  const lower = query.toLocaleLowerCase();
  let score = 0;
  if (lower.includes(providerId.toLocaleLowerCase())) score += 20;
  if (lower.includes(namespace.toLocaleLowerCase())) score += 20;
  score += overlapScore(queryTokens, `${providerId} ${namespace}`) * 8;
  for (const entry of tools) {
    const description = `${entry.tool.name} ${entry.remoteName} ${entry.tool.description ?? ""}`;
    score = Math.max(score, overlapScore(queryTokens, description) * 3);
  }
  return score;
}

function providerToolScore(
  queryTokens: Set<string>,
  entry: NamespacedTool,
): number {
  return (
    overlapScore(queryTokens, `${entry.tool.name} ${entry.remoteName}`) * 10 +
    overlapScore(queryTokens, entry.tool.description ?? "")
  );
}

function rankProviderTools(
  queryTokens: Set<string>,
  tools: readonly NamespacedTool[],
): NamespacedTool[] {
  return tools
    .map((entry, index) => ({
      entry,
      index,
      score: providerToolScore(queryTokens, entry),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ entry }) => entry);
}

export function selectNeedleToolCatalog(
  query: string,
  scope: NeedleScope,
  providerId: string | undefined,
  registry: ProviderRegistry | undefined,
  maxCatalogTools: number,
): NeedleCatalogSelection {
  const coreTools = CORE_NEEDLE_TOOLS.filter(
    (tool) => !PROVIDER_CONTROL_NAMES.has(tool.name),
  );
  const providerControlTools = CORE_NEEDLE_TOOLS.filter((tool) =>
    PROVIDER_CONTROL_NAMES.has(tool.name),
  );
  const base =
    scope === "providers"
      ? providerId
        ? []
        : providerControlTools
      : scope === "core"
        ? coreTools
        : [...coreTools, ...providerControlTools];

  if (scope === "core" || !registry) {
    return { tools: base.slice(0, maxCatalogTools), providerIds: [] };
  }

  const cached = registry.listCachedTools();
  const statuses = registry.listStatuses();
  if (providerId && !statuses.some((status) => status.id === providerId)) {
    throw new Error(`Unknown MCP provider '${providerId}'.`);
  }

  const queryTokens = tokens(query);
  let selectedProviderId = providerId;
  if (!selectedProviderId) {
    const ranked = statuses
      .map((status) => ({
        id: status.id,
        score: scoreProvider(
          query,
          queryTokens,
          status.id,
          status.namespace,
          cached.filter((entry) => entry.providerId === status.id),
        ),
      }))
      .sort((a, b) => b.score - a.score);
    // In the broad 'all' scope, do not guess a Provider from generic
    // description overlap. Automatic Provider selection requires an explicit
    // provider id/namespace token in the canonical query (score >= 20).
    if (ranked[0] && ranked[0].score >= 20) selectedProviderId = ranked[0].id;
  }

  if (!selectedProviderId) {
    return { tools: base.slice(0, maxCatalogTools), providerIds: [] };
  }

  const selected = rankProviderTools(
    queryTokens,
    cached.filter((entry) => entry.providerId === selectedProviderId),
  );
  const remaining = Math.max(0, maxCatalogTools - base.length);
  const providerShortlistLimit = Math.min(5, remaining);
  const topScore = selected[0]
    ? providerToolScore(queryTokens, selected[0])
    : 0;
  const strongMatchFloor = topScore > 0 ? topScore * 0.75 : 0;
  const shortlisted = selected
    .slice(0, providerShortlistLimit)
    .filter(
      (entry, index) =>
        index === 0 ||
        topScore === 0 ||
        providerToolScore(queryTokens, entry) >= strongMatchFloor,
    );
  const providerTools = shortlisted.map(providerToolToNeedle);
  return {
    tools: [...base, ...providerTools].slice(0, maxCatalogTools),
    providerIds: providerTools.length > 0 ? [selectedProviderId] : [],
  };
}

const functionCallOutput = z.object({
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()),
});

const routeOutput = z.object({
  enabled: z.boolean(),
  available: z.boolean(),
  catalogCount: z.number().int(),
  catalogProviderIds: z.array(z.string()),
  confidence: z.number().nullable(),
  confidenceThreshold: z.number(),
  functionCalls: z.array(functionCallOutput),
  suppressedCalls: z.array(functionCallOutput),
  reasoning: z.string().nullable(),
  recommended: z.boolean(),
  escalate: z.boolean(),
  latencyMs: z.number().int(),
  metrics: z
    .object({
      prefillTps: z.number().optional(),
      decodeTps: z.number().optional(),
      peakRamMb: z.number().optional(),
    })
    .optional(),
  error: z.string().optional(),
});

export function registerNeedleRouteTool(
  server: McpServer,
  router: NeedleRouter,
  registry: ProviderRegistry | undefined,
  maxCatalogTools: number,
): void {
  server.registerTool(
    "needle_route",
    {
      title: "Needle Fast Tool Router",
      description:
        "Recommend WSR tool calls locally with Needle 3. Before calling, normalize the user's request into a concise English imperative while preserving literal identifiers such as workspace aliases, paths, URLs, branch names, object names, schema/table names, and IDs exactly. Returns tool names, arguments and confidence only; it never executes the recommended tools. Low confidence escalates to normal LLM reasoning.",
      inputSchema: z.object({
        query: z
          .string()
          .min(1)
          .describe(
            "Concise English canonical routing command. Preserve literal identifiers exactly, e.g. Switch workspace to 'df'.",
          ),
        originalQuery: z
          .string()
          .optional()
          .describe(
            "Optional original user request for diagnostics/evaluation only. It is never sent to Needle.",
          ),
        scope: z.enum(["all", "core", "providers"]).default("all"),
        providerId: z
          .string()
          .min(1)
          .optional()
          .describe("Optional ProviderRegistry id such as blender, godot or postgresql."),
      }),
      outputSchema: routeOutput,
    },
    async ({ query, originalQuery, scope, providerId }) => {
      try {
        const selection = selectNeedleToolCatalog(
          query,
          scope,
          providerId,
          registry,
          maxCatalogTools,
        );
        const result = await router.route(
          query,
          selection.tools,
          selection.providerIds,
        );

        // Restore exact original wording for Provider tools that expose the
        // conventional user_prompt argument. This preserves provider audit/
        // trajectory semantics while keeping Needle focused on routing.
        const exactUserPrompt = originalQuery ?? query;
        if (registry) {
          const providerTools = registry.listCachedTools();
          for (const call of [...result.functionCalls, ...result.suppressedCalls]) {
            const entry = providerTools.find(
              (candidate) => candidate.tool.name === call.name,
            );
            const inputSchema = entry?.tool.inputSchema as
              | { properties?: Record<string, unknown> }
              | undefined;
            if (inputSchema?.properties?.user_prompt) {
              call.arguments.user_prompt = exactUserPrompt;
            }
          }
        }

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: error instanceof Error ? error.message : String(error),
            },
          ],
          isError: true,
        };
      }
    },
  );
}
