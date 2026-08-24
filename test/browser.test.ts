import { describe, expect, it } from "vitest";
import { BrowserManager } from "../src/browser-manager.js";
import { SandboxGuard } from "../src/sandbox.js";

describe("BrowserManager (Playwright)", () => {
  it("initializes and handles page lifecycle safely", async () => {
    const sandbox = new SandboxGuard(process.cwd());
    const browserManager = new BrowserManager(sandbox, true);

    try {
      // Test page initialization and evaluation
      const page = await browserManager.getPage();
      expect(page).toBeDefined();

      const evalRes = await browserManager.evaluate("1 + 1");
      expect(evalRes.result).toBe(2);

      const navRes = await browserManager.navigate("data:text/html,<h1>Hello MCP</h1>");
      expect(navRes.status).toBe(200);

      const content = await browserManager.getContent("h1", "text");
      expect(content.content).toBe("Hello MCP");
    } finally {
      await browserManager.close();
    }
  }, 30000);
});
