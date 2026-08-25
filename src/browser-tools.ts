import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { BrowserManager } from "./browser-manager.js";
import { runTool } from "./tool-result.js";

const navigateOutput = z.object({ url: z.string(), title: z.string(), status: z.number().int(), loginSessionPersisted: z.boolean() });
const screenshotOutput = z.object({ savedToFile: z.string().optional(), base64: z.string().optional(), mimeType: z.string().optional(), sizeBytes: z.number().int(), url: z.string() });
const savedImageOutput = z.object({ savedToFile: z.string(), sizeBytes: z.number().int(), selector: z.string(), url: z.string() });
const downloadOutput = z.object({ savedToFile: z.string(), suggestedFilename: z.string(), url: z.string() });
const clickOutput = z.object({ clicked: z.string(), currentUrl: z.string() });
const fillOutput = z.object({ filled: z.string(), valueLength: z.number().int() });
const contentOutput = z.object({ selector: z.string().optional(), type: z.enum(["text","html"]), content: z.string(), title: z.string().optional(), url: z.string().optional() });
const evaluateOutput = z.object({ result: z.unknown() });
const keyOutput = z.object({ pressed: z.string() });
const closeOutput = z.object({ status: z.literal("closed") });

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
      inputSchema: z.object({
        url: z
          .string()
          .url()
          .describe(
            "The URL to navigate to (e.g. https://example.com or http://localhost:3000)",
          ),
        headless: z
          .boolean()
          .optional()
          .describe(
            "Set to false to pop up a visible browser window on user's desktop, or true for background headless mode.",
          ),
        waitUntil: z
          .enum(["load", "domcontentloaded", "networkidle"])
          .default("domcontentloaded")
          .describe("When to consider navigation succeeded"),
        timeoutMs: z
          .number()
          .int()
          .min(1000)
          .max(60000)
          .default(30000)
          .describe("Navigation timeout in milliseconds"),
      }),
      outputSchema: navigateOutput,
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
      inputSchema: z.object({
        filePath: z
          .string()
          .optional()
          .describe(
            "Relative file path inside the workspace to save the PNG screenshot (e.g. 'screenshot.png' or 'docs/page.png').",
          ),
        fullPage: z
          .boolean()
          .default(false)
          .describe("Whether to capture the entire scrollable page"),
      }),
      outputSchema: screenshotOutput,
    },
    async ({ filePath, fullPage }) =>
      runTool(async () => {
        return await browserManager.screenshot(filePath, fullPage);
      }),
  );

  server.registerTool(
    "browser_save_image",
    {
      title: "Save Browser Image",
      description:
        "Save a single visible image element from the current browser page as a PNG file inside the workspace, without the surrounding page UI.",
      inputSchema: z.object({
        selector: z
          .string()
          .min(1)
          .describe(
            "CSS selector matching the image element to save (e.g. 'img' or an image selector)",
          ),
        filePath: z
          .string()
          .min(1)
          .describe(
            "Relative PNG file path inside the workspace (e.g. 'playwrite/meta-ai-generated.png')",
          ),
      }),
      outputSchema: savedImageOutput,
    },
    async ({ selector, filePath }) =>
      runTool(async () => {
        return await browserManager.saveImage(selector, filePath);
      }),
  );

  server.registerTool(
    "browser_download",
    {
      title: "Browser Download",
      description:
        "Click a download-capable element on the current page and save the browser's actual download to a workspace file.",
      inputSchema: z.object({
        selector: z
          .string()
          .min(1)
          .describe("CSS selector for the download button or link"),
        filePath: z
          .string()
          .min(1)
          .describe(
            "Relative file path inside the workspace for the downloaded file",
          ),
        timeoutMs: z
          .number()
          .int()
          .min(1000)
          .max(60000)
          .default(30000)
          .describe("Download timeout in milliseconds"),
      }),
      outputSchema: downloadOutput,
    },
    async ({ selector, filePath, timeoutMs }) =>
      runTool(async () => {
        return await browserManager.download(selector, filePath, timeoutMs);
      }),
  );

  server.registerTool(
    "browser_click",
    {
      title: "Browser Click Element",
      description:
        "Click an interactive element on the page matching a CSS selector or text.",
      inputSchema: z.object({
        selector: z
          .string()
          .min(1)
          .describe(
            "CSS selector or text locator (e.g. 'button.submit', '#login-btn', 'text=Sign In')",
          ),
        timeoutMs: z
          .number()
          .int()
          .min(1000)
          .max(30000)
          .default(10000)
          .describe("Click timeout in ms"),
      }),
      outputSchema: clickOutput,
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
      description:
        "Type or fill text into an input, textarea, or form field matching a CSS selector.",
      inputSchema: z.object({
        selector: z
          .string()
          .min(1)
          .describe(
            "CSS selector for the input element (e.g. 'input[name=\"q\"]', '#username')",
          ),
        value: z.string().describe("The text value to type into the field"),
        timeoutMs: z
          .number()
          .int()
          .min(1000)
          .max(30000)
          .default(10000)
          .describe("Timeout in ms"),
      }),
      outputSchema: fillOutput,
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
      inputSchema: z.object({
        selector: z
          .string()
          .optional()
          .describe(
            "Optional CSS selector to extract content from. If omitted, extracts from entire page body.",
          ),
        type: z
          .enum(["text", "html"])
          .default("text")
          .describe(
            "Format of content: 'text' (cleaned readable text) or 'html' (raw DOM HTML)",
          ),
      }),
      outputSchema: contentOutput,
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
      description:
        "Execute a JavaScript expression or script inside the active browser page context and return the result.",
      inputSchema: z.object({
        script: z
          .string()
          .min(1)
          .describe(
            "JavaScript code to evaluate (e.g. 'document.title', 'window.innerWidth', 'Array.from(document.querySelectorAll(\"a\")).map(a => a.href)')",
          ),
      }),
      outputSchema: evaluateOutput,
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
      description:
        "Press a keyboard key on the active page (e.g. 'Enter', 'Tab', 'Escape', 'ArrowDown', 'PageDown').",
      inputSchema: z.object({
        key: z
          .string()
          .min(1)
          .describe(
            "Key name (e.g. 'Enter', 'Escape', 'Tab', 'Backspace', 'ArrowDown')",
          ),
      }),
      outputSchema: keyOutput,
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
      description:
        "Close the currently running browser and page session to release memory.",
      inputSchema: z.object({}),
      outputSchema: closeOutput,
    },
    async () =>
      runTool(async () => {
        return await browserManager.close();
      }),
  );
}
