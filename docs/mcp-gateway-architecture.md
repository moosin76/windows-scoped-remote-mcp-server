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

## Provider 장애 격리

Remote MCP는 WSR의 선택적 확장 기능입니다. Godot/Blender 등의 MCP가 실행되지 않은 상태에서도 Gateway 자체는 정상적으로 시작되어야 합니다.

```text
WSR Gateway
├── Core tools       ← 항상 사용 가능
├── Playwright       ← 별도 상태
└── Remote Providers
    ├── Godot        ← 연결 실패해도 Gateway 종료 금지
    └── Blender      ← 연결 실패해도 Gateway 종료 금지
```

Provider 연결 상태는 `mcp_provider_status`로 확인할 수 있습니다. Provider가 실행되지 않은 상태에서 이미 노출된 Provider tool을 호출하면 해당 Provider를 시작하라는 명확한 오류가 반환됩니다.
