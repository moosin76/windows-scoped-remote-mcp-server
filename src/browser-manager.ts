import { chromium, type BrowserContext, type Page } from "playwright";
import path from "node:path";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import type { SandboxGuard } from "./sandbox.js";

interface BrowserRuntimeState {
  context: BrowserContext | null;
  page: Page | null;
  headless: boolean;
  userDataDir: string;
}

export class BrowserManager {
  private readonly state: BrowserRuntimeState;

  constructor(
    private readonly sandbox: SandboxGuard,
    headless = false,
    userDataDir?: string,
    sharedState?: BrowserRuntimeState,
  ) {
    this.state = sharedState ?? {
      context: null,
      page: null,
      headless,
      userDataDir: userDataDir || path.resolve(process.cwd(), ".browser-profile"),
    };
    if (!existsSync(this.state.userDataDir)) {
      try {
        mkdirSync(this.state.userDataDir, { recursive: true });
      } catch {}
    }
  }

  /** Shares the Playwright page/login state while resolving saved files through
   * an independent sandbox (for example an MCP session workspace fork). */
  fork(sandbox: SandboxGuard): BrowserManager {
    return new BrowserManager(sandbox, this.state.headless, this.state.userDataDir, this.state);
  }

  getStatus(): {
    headless: boolean;
    initialized: boolean;
    pageOpen: boolean;
    pageCount: number;
  } {
    const pageOpen = Boolean(this.state.page && !this.state.page.isClosed());
    const pageCount = this.state.context
      ? this.state.context.pages().filter((page) => !page.isClosed()).length
      : 0;
    return {
      headless: this.state.headless,
      initialized: Boolean(this.state.context),
      pageOpen,
      pageCount,
    };
  }

  async setHeadless(headless: boolean): Promise<void> {
    if (this.state.headless !== headless) {
      this.state.headless = headless;
      await this.close();
    }
  }

  async getPage(): Promise<Page> {
    if (this.state.page && !this.state.page.isClosed()) {
      return this.state.page;
    }

    if (!this.state.context) {
      const launchOptions = {
        headless: this.state.headless,
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
        this.state.context = await chromium.launchPersistentContext(this.state.userDataDir, {
          ...launchOptions,
          channel: "msedge",
        });
      } catch {
        try {
          // 2. Fallback to Google Chrome preinstalled
          this.state.context = await chromium.launchPersistentContext(this.state.userDataDir, {
            ...launchOptions,
            channel: "chrome",
          });
        } catch {
          // 3. Fallback to bundled Chromium
          this.state.context = await chromium.launchPersistentContext(this.state.userDataDir, {
            ...launchOptions,
          });
        }
      }
    }

    const pages = this.state.context.pages();
    if (pages.length > 0 && !pages[0].isClosed()) {
      this.state.page = pages[0];
    } else {
      this.state.page = await this.state.context.newPage();
    }

    return this.state.page;
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

  async saveImage(selector: string, filePath: string) {
    const page = await this.getPage();
    const locator = page.locator(selector).first();
    await locator.waitFor({ state: "visible", timeout: 10000 });

    const resolvedPath = this.sandbox.resolveSafe(filePath);
    const dir = path.dirname(resolvedPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Capture only the image element, not the surrounding page UI.
    const buffer = await locator.screenshot({ type: "png" });
    writeFileSync(resolvedPath, buffer);
    return { savedToFile: resolvedPath, sizeBytes: buffer.length, selector, url: page.url() };
  }

  async download(selector: string, filePath: string, timeoutMs = 30000) {
    const page = await this.getPage();
    const locator = page.locator(selector).first();
    await locator.waitFor({ state: "visible", timeout: timeoutMs });

    const resolvedPath = this.sandbox.resolveSafe(filePath);
    const dir = path.dirname(resolvedPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: timeoutMs }),
      locator.click({ force: true, timeout: timeoutMs }),
    ]);

    await download.saveAs(resolvedPath);
    return {
      savedToFile: resolvedPath,
      suggestedFilename: download.suggestedFilename(),
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
    if (this.state.page) {
      await this.state.page.close().catch(() => {});
      this.state.page = null;
    }
    if (this.state.context) {
      await this.state.context.close().catch(() => {});
      this.state.context = null;
    }
    return { status: "closed" };
  }
}
