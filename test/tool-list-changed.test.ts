import { describe, expect, it, vi } from "vitest";
import { notifyModernToolListChanged } from "../src/http-server.js";

describe("notifyModernToolListChanged", () => {
  it("fans tools/list_changed out to every modern handler", () => {
    const first = vi.fn();
    const second = vi.fn();
    const handlers = [
      { notify: { toolsChanged: first } },
      { notify: { toolsChanged: second } },
    ] as any;

    expect(notifyModernToolListChanged(handlers)).toBe(2);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("is safe when there are no live modern handlers", () => {
    expect(notifyModernToolListChanged([])).toBe(0);
  });
});
