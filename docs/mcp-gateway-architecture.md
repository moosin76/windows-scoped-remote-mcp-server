# MCP Gateway 아키텍처 메모

## 현재 구조

```text
ChatGPT
  ↓ HTTPS / OAuth
Cloudflare Tunnel
  ↓
Windows Scoped Remote MCP Server
  ├─ Express / MCP endpoint
  ├─ Workspace tools
  ├─ File tools
  ├─ Process / Exec tools
  ├─ Playwright tools
  └─ ProviderRegistry
       ├─ Godot Remote MCP
       └─ Future: Blender Remote MCP
```

## Provider 계층

```text
McpProvider
├─ id
├─ namespace
├─ connect()
├─ close()
├─ isConnected()
├─ listTools()
├─ callTool()
├─ namespacedToolName()
└─ remoteToolName()
```

현재 `RemoteMcpProvider`는 Streamable HTTP MCP 서버를 위한 범용 구현이다.

## Tool 흐름

```text
Remote MCP tools/list
      ↓
ProviderRegistry.refresh()
      ↓
namespace 적용
      ↓
JSON Schema → Zod shape
      ↓
McpServer.registerTool()
      ↓
ChatGPT
```

호출:

```text
ChatGPT: godot_get_scene
      ↓
ProviderRegistry.resolve()
      ↓
Godot Provider: get_scene
      ↓
Godot MCP
```

## 향후 확장

Blender를 붙일 때는 새로운 전용 transport 구현보다 `RemoteMcpProvider`를 우선 재사용한다.

```text
ProviderRegistry
├─ godot / godot
└─ blender / blender
```

Provider 수가 많아질 때는 설정 기반 Provider 생성과 연결 상태/health 관리로 확장한다.
