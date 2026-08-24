import { chromium, type BrowserContext, type Page } from "playwright";
import path from "node:path";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import type { SandboxGuard } from "./sandbox.js";

export class BrowserManager {
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private headless: boolean;
  private userDataDir: string;

  constructor(
    private readonly sandbox: SandboxGuard,
    headless = false,
    userDataDir?: string,
  ) {
    this.headless = headless;
    this.userDataDir =
      userDataDir || path.resolve(process.cwd(), ".browser-profile");
    if (!existsSync(this.userDataDir)) {
      try {
        mkdirSync(this.userDataDir, { recursive: true });
      } catch {}
    }
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

    if (!this.context) {
      const launchOptions = {
        headless: this.headless,
        viewport: { width: 1280, height: 720 },
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-blink-features=AutomationControlled",
        ],
        ignoreDefaultArgs: ["--enable-automation"],
      };

      try {
        // 1. Try Microsoft Edge preinstalled on Windows (preserves Edge/Chrome sessions)
        this.context = await chromium.launchPersistentContext(this.userDataDir, {
          ...launchOptions,
          channel: "msedge",
        });
      } catch {
        try {
          // 2. Fallback to Google Chrome preinstalled
          this.context = await chromium.launchPersistentContext(this.userDataDir, {
            ...launchOptions,
            channel: "chrome",
          });
        } catch {
          // 3. Fallback to bundled Chromium
          this.context = await chromium.launchPersistentContext(this.userDataDir, {
            ...launchOptions,
          });
        }
      }
    }

    const pages = this.context.pages();
    if (pages.length > 0 && !pages[0].isClosed()) {
      this.page = pages[0];
    } else {
      this.page = await this.context.newPage();
    }

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
      loginSessionPersisted: true,
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
    return { status: "closed" };
  }
}
