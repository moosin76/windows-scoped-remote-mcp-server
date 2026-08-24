import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import path from "node:path";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import type { SandboxGuard } from "./sandbox.js";

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private headless: boolean;

  constructor(private readonly sandbox: SandboxGuard, headless = true) {
    this.headless = headless;
  }

  async setHeadless(headless: boolean): Promise<void> {
    if (this.headless !== headless) {
      this.headless = headless;
      await this.close();
    }
  }

  async getPage(): Promise<Page> {
    if (this.page && !this.page.isClosed()) {
      return this.page;
    }

    if (!this.browser || !this.browser.isConnected()) {
      try {
        // 1. Try standard bundled chromium
        this.browser = await chromium.launch({
          headless: this.headless,
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });
      } catch {
        try {
          // 2. Fallback to Windows preinstalled Microsoft Edge
          this.browser = await chromium.launch({
            channel: "msedge",
            headless: this.headless,
            args: ["--no-sandbox"],
          });
        } catch {
          // 3. Fallback to Google Chrome
          this.browser = await chromium.launch({
            channel: "chrome",
            headless: this.headless,
            args: ["--no-sandbox"],
          });
        }
      }
    }

    if (!this.context) {
      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 720 },
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      });
    }

    this.page = await this.context.newPage();
    return this.page;
  }

  async navigate(
    url: string,
    waitUntil: "load" | "domcontentloaded" | "networkidle" = "domcontentloaded",
    timeoutMs = 30000,
  ) {
    const page = await this.getPage();
    const response = await page.goto(url, { waitUntil, timeout: timeoutMs });
    const title = await page.title();
    return {
      url: page.url(),
      title,
      status: response?.status() ?? 200,
    };
  }

  async screenshot(filePath?: string, fullPage = false) {
    const page = await this.getPage();
    const buffer = await page.screenshot({ fullPage });

    if (filePath) {
      const resolvedPath = this.sandbox.resolveSafe(filePath);
      const dir = path.dirname(resolvedPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(resolvedPath, buffer);
      return {
        savedToFile: resolvedPath,
        sizeBytes: buffer.length,
        url: page.url(),
      };
    }

    return {
      base64: buffer.toString("base64"),
      mimeType: "image/png",
      sizeBytes: buffer.length,
      url: page.url(),
    };
  }

  async click(selector: string, timeoutMs = 10000) {
    const page = await this.getPage();
    await page.click(selector, { timeout: timeoutMs });
    return { clicked: selector, currentUrl: page.url() };
  }

  async fill(selector: string, value: string, timeoutMs = 10000) {
    const page = await this.getPage();
    await page.fill(selector, value, { timeout: timeoutMs });
    return { filled: selector, valueLength: value.length };
  }

  async getContent(selector?: string, type: "text" | "html" = "text") {
    const page = await this.getPage();
    if (selector) {
      const el = page.locator(selector).first();
      const content = type === "html" ? await el.innerHTML() : await el.innerText();
      return { selector, type, content };
    } else {
      const content = type === "html" ? await page.content() : await page.innerText("body");
      return { type, content, title: await page.title(), url: page.url() };
    }
  }

  async evaluate(script: string) {
    const page = await this.getPage();
    const result = await page.evaluate(script);
    return { result };
  }

  async pressKey(key: string) {
    const page = await this.getPage();
    await page.keyboard.press(key);
    return { pressed: key };
  }

  async close() {
    if (this.page) {
      await this.page.close().catch(() => {});
      this.page = null;
    }
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
    return { status: "closed" };
  }
}
