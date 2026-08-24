import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { BrowserManager } from "./browser-manager.js";
import { runTool } from "./tool-result.js";

export function registerBrowserTools(
  server: McpServer,
  browserManager: BrowserManager,
): void {
  server.registerTool(
    "browser_navigate",
    {
      title: "Browser Navigate",
      description:
        "Open or navigate the browser to a given URL. Returns page title and HTTP status code.",
      inputSchema: {
        url: z.string().url().describe("The URL to navigate to (e.g. https://example.com or http://localhost:3000)"),
        headless: z
          .boolean()
          .optional()
          .describe("Set to false to pop up a visible browser window on user's desktop, or true for background headless mode."),
        waitUntil: z
          .enum(["load", "domcontentloaded", "networkidle"])
          .default("domcontentloaded")
          .describe("When to consider navigation succeeded"),
        timeoutMs: z.number().int().min(1000).max(60000).default(30000).describe("Navigation timeout in milliseconds"),
      },
    },
    async ({ url, headless, waitUntil, timeoutMs }) =>
      runTool(async () => {
        if (headless !== undefined) {
          await browserManager.setHeadless(headless);
        }
        return await browserManager.navigate(url, waitUntil, timeoutMs);
      }),
  );

  server.registerTool(
    "browser_screenshot",
    {
      title: "Browser Screenshot",
      description:
        "Capture a screenshot of the current browser page. Can save directly as a PNG file inside the workspace or return base64.",
      inputSchema: {
        filePath: z
          .string()
          .optional()
          .describe("Relative file path inside the workspace to save the PNG screenshot (e.g. 'screenshot.png' or 'docs/page.png')."),
        fullPage: z.boolean().default(false).describe("Whether to capture the entire scrollable page"),
      },
    },
    async ({ filePath, fullPage }) =>
      runTool(async () => {
        return await browserManager.screenshot(filePath, fullPage);
      }),
  );

  server.registerTool(
    "browser_click",
    {
      title: "Browser Click Element",
      description: "Click an interactive element on the page matching a CSS selector or text.",
      inputSchema: {
        selector: z.string().min(1).describe("CSS selector or text locator (e.g. 'button.submit', '#login-btn', 'text=Sign In')"),
        timeoutMs: z.number().int().min(1000).max(30000).default(10000).describe("Click timeout in ms"),
      },
    },
    async ({ selector, timeoutMs }) =>
      runTool(async () => {
        return await browserManager.click(selector, timeoutMs);
      }),
  );

  server.registerTool(
    "browser_fill",
    {
      title: "Browser Fill Input",
      description: "Type or fill text into an input, textarea, or form field matching a CSS selector.",
      inputSchema: {
        selector: z.string().min(1).describe("CSS selector for the input element (e.g. 'input[name=\"q\"]', '#username')"),
        value: z.string().describe("The text value to type into the field"),
        timeoutMs: z.number().int().min(1000).max(30000).default(10000).describe("Timeout in ms"),
      },
    },
    async ({ selector, value, timeoutMs }) =>
      runTool(async () => {
        return await browserManager.fill(selector, value, timeoutMs);
      }),
  );

  server.registerTool(
    "browser_get_content",
    {
      title: "Browser Get Page Content",
      description:
        "Extract readable text or raw HTML from the current page or a specific container selector.",
      inputSchema: {
        selector: z.string().optional().describe("Optional CSS selector to extract content from. If omitted, extracts from entire page body."),
        type: z.enum(["text", "html"]).default("text").describe("Format of content: 'text' (cleaned readable text) or 'html' (raw DOM HTML)"),
      },
    },
    async ({ selector, type }) =>
      runTool(async () => {
        return await browserManager.getContent(selector, type);
      }),
  );

  server.registerTool(
    "browser_evaluate",
    {
      title: "Browser Evaluate JavaScript",
      description: "Execute a JavaScript expression or script inside the active browser page context and return the result.",
      inputSchema: {
        script: z.string().min(1).describe("JavaScript code to evaluate (e.g. 'document.title', 'window.innerWidth', 'Array.from(document.querySelectorAll(\"a\")).map(a => a.href)')"),
      },
    },
    async ({ script }) =>
      runTool(async () => {
        return await browserManager.evaluate(script);
      }),
  );

  server.registerTool(
    "browser_press_key",
    {
      title: "Browser Press Key",
      description: "Press a keyboard key on the active page (e.g. 'Enter', 'Tab', 'Escape', 'ArrowDown', 'PageDown').",
      inputSchema: {
        key: z.string().min(1).describe("Key name (e.g. 'Enter', 'Escape', 'Tab', 'Backspace', 'ArrowDown')"),
      },
    },
    async ({ key }) =>
      runTool(async () => {
        return await browserManager.pressKey(key);
      }),
  );

  server.registerTool(
    "browser_close",
    {
      title: "Browser Close",
      description: "Close the currently running browser and page session to release memory.",
      inputSchema: {},
    },
    async () =>
      runTool(async () => {
        return await browserManager.close();
      }),
  );
}
