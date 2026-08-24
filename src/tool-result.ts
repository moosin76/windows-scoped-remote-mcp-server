import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { errorMessage } from "./errors.js";

export function formatResult(value: unknown): CallToolResult {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return {
    content: [{ type: "text", text }],
  };
}

export function formatError(error: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: errorMessage(error) }],
    isError: true,
  };
}

export async function runTool<T>(action: () => Promise<T>): Promise<CallToolResult> {
  try {
    const result = await action();
    return formatResult(result);
  } catch (error) {
    return formatError(error);
  }
}
