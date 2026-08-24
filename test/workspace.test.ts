import { describe, expect, it } from "vitest";
import { parseWorkspaceRoots, WorkspaceManager } from "../src/workspace.js";
import { SandboxGuard } from "../src/sandbox.js";

describe("WorkspaceManager & Multi-Root Sandbox", () => {
  it("parses alias syntax and multiple workspace roots", () => {
    const raw = "test:d:\\Godot\\mcp-test, ether:d:\\Godot\\ether-chronicle, server:d:\\Godot\\localRemoteMcp";
    const roots = parseWorkspaceRoots(raw, "d:\\Godot\\fallback");

    expect(roots).toHaveLength(3);
    expect(roots[0].name).toBe("test");
    expect(roots[0].path.toLowerCase()).toContain("mcp-test");
    expect(roots[1].name).toBe("ether");
    expect(roots[1].path.toLowerCase()).toContain("ether-chronicle");
    expect(roots[2].name).toBe("server");
    expect(roots[2].path.toLowerCase()).toContain("localremotemcp");
  });

  it("manages active workspace and switches seamlessly", () => {
    const raw = "test:d:\\Godot\\mcp-test, ether:d:\\Godot\\ether-chronicle";
    const roots = parseWorkspaceRoots(raw, "d:\\Godot\\fallback");
    const manager = new WorkspaceManager(roots);

    expect(manager.getActiveWorkspace().name).toBe("test");
    expect(manager.getAllWorkspaces()).toHaveLength(2);

    const switched = manager.switchWorkspace("ether");
    expect(switched.name).toBe("ether");
    expect(manager.getActiveWorkspace().name).toBe("ether");
  });

  it("enforces multi-root sandbox boundaries", () => {
    const raw = "test:d:\\Godot\\mcp-test, ether:d:\\Godot\\ether-chronicle";
    const roots = parseWorkspaceRoots(raw, "d:\\Godot\\fallback");
    const manager = new WorkspaceManager(roots);
    const sandbox = new SandboxGuard(manager);

    // Inside test
    expect(sandbox.isInside("d:\\Godot\\mcp-test\\package.json")).toBe(true);
    // Inside ether
    expect(sandbox.isInside("d:\\Godot\\ether-chronicle\\src\\main.ts")).toBe(true);
    // Outside (e.g. C:\Windows or D:\Other)
    expect(sandbox.isInside("c:\\Windows\\System32")).toBe(false);
    expect(sandbox.isInside("d:\\SecretFolder\\passwords.txt")).toBe(false);

    expect(() => sandbox.assertInside("c:\\Windows\\cmd.exe")).toThrow();
  });
});
