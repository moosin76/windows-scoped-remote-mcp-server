import { fileURLToPath } from "node:url";
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

describe("RemoteMcpProvider stdio transport", () => {
  it("connects to a stdio server and forwards tool calls", async () => {
    const fixturePath = fileURLToPath(
      new URL("./fixtures/stdio-mcp-server.mjs", import.meta.url),
    );
    const provider = new RemoteMcpProvider({
      id: "stdio-test",
      namespace: "stdio_test",
      transport: "stdio",
      command: process.execPath,
      args: [fixturePath],
    });

    try {
      await provider.connect();
      const tools = await provider.listTools();
      expect(tools.map((tool) => tool.name)).toEqual(["ping"]);

      const result = await provider.callTool("ping", { value: "hello" });
      expect(result.content).toEqual([{ type: "text", text: "hello" }]);
    } finally {
      await provider.close();
    }
  });

  it("requires a command for stdio transport", () => {
    expect(
      () =>
        new RemoteMcpProvider({
          id: "invalid-stdio",
          namespace: "invalid_stdio",
          transport: "stdio",
        }),
    ).toThrow("requires command for stdio transport");
  });
});
