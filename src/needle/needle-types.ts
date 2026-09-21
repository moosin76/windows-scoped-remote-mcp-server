export type NeedleScope = "all" | "core" | "providers";

export interface NeedleToolSchema {
  name: string;
  description?: string;
  parameters: Record<string, unknown>;
  providerId?: string;
}

export interface NeedleFunctionCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface NeedleRouteRequest {
  query: string;
  originalQuery?: string;
  scope?: NeedleScope;
  providerId?: string;
}

export interface NeedleSidecarResponse {
  id: number;
  ok: boolean;
  error?: string;
  function_calls?: NeedleFunctionCall[];
  suppressed_calls?: NeedleFunctionCall[];
  confidence?: number | null;
  reasoning?: string | null;
  escalate?: boolean;
  prefill_tps?: number | null;
  decode_tps?: number | null;
  peak_ram_mb?: number | null;
}

export interface NeedleRouteResult {
  enabled: boolean;
  available: boolean;
  catalogCount: number;
  catalogProviderIds: string[];
  confidence: number | null;
  confidenceThreshold: number;
  functionCalls: NeedleFunctionCall[];
  suppressedCalls: NeedleFunctionCall[];
  reasoning: string | null;
  recommended: boolean;
  escalate: boolean;
  latencyMs: number;
  metrics?: {
    prefillTps?: number;
    decodeTps?: number;
    peakRamMb?: number;
  };
  error?: string;
}
