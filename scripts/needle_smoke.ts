import path from "node:path";
import { loadConfig } from "../src/config.js";
import { NeedleRouter } from "../src/needle/needle-router.js";
import { selectNeedleToolCatalog } from "../src/needle/needle-tools.js";
import type { NeedleScope } from "../src/needle/needle-types.js";
import { createProviderRegistry } from "../src/providers/provider-factory.js";

interface EvalCase {
  query: string;
  scope: NeedleScope;
  providerId?: string;
}

const cases: EvalCase[] = [
  { query: "Check WSR status", scope: "core" },
  { query: "Switch workspace to 'df'", scope: "core" },
  { query: "Get the current active workspace", scope: "core" },
  { query: "Get Blender scene information", scope: "providers", providerId: "blender" },
  { query: "List PostgreSQL schemas", scope: "providers", providerId: "postgresql" },
  { query: "Open http://localhost:5174 in the browser", scope: "core" },
  { query: "Inspect it appropriately", scope: "all" },
];

const config = loadConfig(process.env, process.cwd());
const registry = createProviderRegistry(config);
const router = new NeedleRouter({
  enabled: true,
  pythonCommand: config.needlePython,
  confidenceThreshold: config.needleConfidenceThreshold,
  toolIndexPath: config.needleToolIndexPath,
  requestTimeoutMs: config.needleRequestTimeoutMs,
  scriptPath: path.resolve(import.meta.dirname, "needle_router.py"),
  cwd: process.cwd(),
});

const selectedCases = process.env.NEEDLE_SMOKE_FILTER
  ? cases.filter((item) =>
      [item.query, item.scope, item.providerId ?? ""]
        .join(" ")
        .toLocaleLowerCase()
        .includes(process.env.NEEDLE_SMOKE_FILTER!.toLocaleLowerCase()),
    )
  : cases;

try {
  for (const item of selectedCases) {
    const selection = selectNeedleToolCatalog(
      item.query,
      item.scope,
      item.providerId,
      registry,
      config.needleMaxCatalogTools,
    );
    const result = await router.route(
      item.query,
      selection.tools,
      selection.providerIds,
    );
    console.log(
      JSON.stringify(
        {
          query: item.query,
          scope: item.scope,
          providerIds: selection.providerIds,
          catalogCount: selection.tools.length,
          available: result.available,
          confidence: result.confidence,
          recommended: result.recommended,
          escalate: result.escalate,
          latencyMs: result.latencyMs,
          functionCalls: result.functionCalls,
          suppressedCalls: result.suppressedCalls,
          reasoning: result.reasoning,
          metrics: result.metrics,
          error: result.error,
        },
        null,
        2,
      ),
    );
  }
} finally {
  await router.close();
}
