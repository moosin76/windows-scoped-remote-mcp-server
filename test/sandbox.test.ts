import { describe, it, expect } from "vitest";
import path from "node:path";
import { SandboxGuard } from "../src/sandbox.js";
import { PathForbiddenError } from "../src/errors.js";

describe("SandboxGuard", () => {
  const root = path.resolve("d:/Godot/localRemoteMcp");
  const guard = new SandboxGuard(root);

  it("should allow paths inside workspace root", () => {
    expect(guard.isInside(path.join(root, "src", "server.ts"))).toBe(true);
    expect(guard.isInside(path.join(root, "test.txt"))).toBe(true);
    expect(guard.isInside(root)).toBe(true);
  });

  it("should block parent directory traversal (..)", () => {
    const outside = path.join(root, "..", "another-folder");
    expect(guard.isInside(outside)).toBe(false);
    expect(() => guard.assertInside(outside)).toThrow(PathForbiddenError);
  });

  it("should block other drive letters or system folders", () => {
    expect(guard.isInside("C:\\Windows\\System32")).toBe(false);
    expect(() => guard.assertInside("C:\\Windows\\System32")).toThrow(PathForbiddenError);
    expect(guard.isInside("C:\\Users")).toBe(false);
  });

  it("should safely resolve relative paths within workspace", () => {
    const safe = guard.resolveSafe("./src/config.ts");
    expect(guard.isInside(safe)).toBe(true);
  });

  it("should reject relative paths that resolve outside workspace", () => {
    expect(() => guard.resolveSafe("../../../Windows/System32")).toThrow(PathForbiddenError);
  });
});
