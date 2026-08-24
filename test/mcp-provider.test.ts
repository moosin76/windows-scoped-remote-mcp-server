import { describe, expect, it } from "vitest";
import { RemoteMcpProvider } from "../src/providers/mcp-provider.js";

describe("RemoteMcpProvider namespace", () => {
  const provider = new RemoteMcpProvider({
    id: "godot",
    namespace: "godot",
    url: "http://127.0.0.1:8000/mcp",
  });

  it("prefixes remote tool names", () => {
    expect(provider.namespacedToolName("get_scene")).toBe("godot_get_scene");
  });

  it("removes its namespace before forwarding a call", () => {
    expect(provider.remoteToolName("godot_get_scene")).toBe("get_scene");
  });

  it("rejects names from another provider", () => {
    expect(() => provider.remoteToolName("blender_get_scene")).toThrow(
      "does not belong to provider",
    );
  });
});
