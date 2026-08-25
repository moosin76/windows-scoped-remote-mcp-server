import type { CallToolResult } from "@modelcontextprotocol/server";
import { errorMessage } from "./errors.js";

export function formatResult(value: unknown): CallToolResult {
  const text =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const result: CallToolResult = {
    content: [{ type: "text", text }],
  };
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    result.structuredContent = value as Record<string, unknown>;
  }
  return result;
}

export function formatError(error: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: errorMessage(error) }],
    isError: true,
  };
}

export async function runTool<T>(
  action: () => Promise<T>,
): Promise<CallToolResult> {
  try {
    const result = await action();
    return formatResult(result);
  } catch (error) {
    return formatError(error);
  }
}
