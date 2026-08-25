# MCP Gateway 아키텍처 메모

## 현재 구조

```text
ChatGPT
  ↓ HTTPS / OAuth
Cloudflare Tunnel
  ↓
Windows Scoped Remote MCP Server
  ├─ Express / MCP endpoint
  │    └─ createMcpHandler (2026-07-28 + 2025 legacy fallback)
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

## MCP SDK v2와 inbound transport

WSR은 공식 TypeScript SDK v2 split package 구조를 사용한다.

```text
@modelcontextprotocol/server  → McpServer / createMcpHandler
@modelcontextprotocol/node    → Express/Node adapter
@modelcontextprotocol/client  → RemoteMcpProvider client
```

`createMcpHandler`는 하나의 `createMcpServer` factory를 양쪽 프로토콜 era에 사용한다.

```text
ChatGPT / MCP client
        ↓ POST /mcp
createMcpHandler
  ├─ modern (2026-07-28)
  │    ├─ server/discover
  │    └─ 요청별 protocol/client 정보가 담긴 _meta envelope
  └─ legacy (2025-era, stateless)
       ├─ initialize
       ├─ notifications/initialized
       └─ tools/list / tools/call
```

따라서 `server/discover` 응답을 application code에서 직접 흉내내거나 별도 tool catalog를 만들지 않는다. capability와 server identity는 `McpServer` 정의를 기반으로 SDK가 생성해야 하며, modern/legacy 모두 같은 tool 등록 factory를 사용해야 한다.

기존 OAuth Authorization Server router는 v2에서 제거되었으므로 현재는 공식 마이그레이션 브리지인 `@modelcontextprotocol/server-legacy/auth`를 사용한다. Resource Server와 authorization endpoint 동작을 보존하기 위한 임시 호환 계층이며, 장기적으로 전용 OAuth/IdP 구현으로 교체한다.

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

## Remote MCP Provider Scheduler

Remote MCP는 선택적 의존성이므로 하나의 Provider가 꺼져 있어도 WSR Core 기능은 계속 동작한다.

`ProviderScheduler`는 백그라운드에서 Provider 상태와 tool 목록을 주기적으로 확인한다.

```text
ProviderRegistry
       ↑
ProviderScheduler
   ┌───┴───────────────┐
   ↓                   ↓
CONNECTED          UNAVAILABLE
   ↓                   ↓
tools/list          reconnect
   ↓                   ↓
change detection    tools/list
   ↓                   ↓
Tool snapshot       Tool snapshot
```

기본 주기:

- 연결된 Provider health check: 10초
- 연결되지 않은 Provider retry: 5초

환경변수로 조정할 수 있다.

```env
MCP_PROVIDER_HEALTH_INTERVAL_MS=10000
MCP_PROVIDER_RETRY_INTERVAL_MS=5000
```

Tool 정의가 변경되면 Registry snapshot을 갱신한다. `createMcpHandler` factory가 요청마다 MCP Server를 구성하므로 다음 `tools/list` 요청에 최신 tool 목록이 반영된다.

MCP 세션을 장기간 유지하면서 즉시 `tools/list_changed` notification을 전달해야 하는 경우에는 향후 세션 관리 구조와 함께 별도로 구현한다.

<<<<<<< HEAD

## Provider별 outbound transport

WSR의 inbound MCP 서버는 SDK v2 split packages를 사용하지만, Remote Provider의 outbound transport는 Provider 특성에 따라 다르게 선택할 수 있다.

```text
RemoteMcpProvider
├─ streamable-http
│  └─ @modelcontextprotocol/client 2.x
│     └─ Godot MCP /mcp
└─ sse
   └─ @modelcontextprotocol/sdk 1.x compatibility client
      └─ CrystalDBA postgres-mcp /sse
```

현재 `@modelcontextprotocol/client 2.0.0`에는 legacy `SSEClientTransport`가 노출되지 않으므로 SSE Provider 호환성은 `@modelcontextprotocol/sdk 1.30.0`을 병행 사용한다. 이 호환 계층은 outbound Provider 연결에만 사용하며 WSR inbound의 MCP 2026-07-28 지원을 되돌리지 않는다.

검증된 Provider 구성은 Godot 45 tools + PostgreSQL 9 tools = 총 54 remote tools이다. Provider 상태는 `mcp_provider_status`로 확인한다.
=======
## Provider? outbound transport

WSR? inbound MCP ??? SDK v2 split packages? ?????, Remote Provider? outbound transport? Provider ??? ?? ??? ??? ? ??.

```text
RemoteMcpProvider
?? streamable-http
?  ?? @modelcontextprotocol/client 2.x
?     ?? Godot MCP /mcp
?? sse
   ?? @modelcontextprotocol/sdk 1.x compatibility client
      ?? CrystalDBA postgres-mcp /sse
```

?? `@modelcontextprotocol/client 2.0.0`?? legacy `SSEClientTransport`? ???? ???? SSE Provider ???? `@modelcontextprotocol/sdk 1.30.0`? ?? ????. ? ?? ??? outbound Provider ???? ???? WSR inbound? MCP 2026-07-28 ??? ???? ???.

??? Provider ??? Godot 45 tools + PostgreSQL 9 tools = ? 54 remote tools??. Provider ??? `mcp_provider_status`? ????.
>>>>>>> bc801171f3701eb530b6adcc49612293e251de7e
