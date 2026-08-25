# 새로운 MCP Provider 추가 Skill

## 목적

Godot, Blender 또는 다른 Remote MCP를 Windows Scoped Remote MCP Server에 추가할 때 사용하는 표준 절차다.

## 핵심 구조

```text
외부 MCP
   ↓ Streamable HTTP
RemoteMcpProvider
   ↓
ProviderRegistry
   ↓ namespace
WSR MCP Server
   ↓
ChatGPT / Claude 등 MCP Client
```

새 MCP마다 별도의 HTTP client나 Gateway 구현을 만들지 말고 `RemoteMcpProvider`를 재사용한다.

현재 SDK v2에서는 outbound client를 `@modelcontextprotocol/client`에서 가져온다. Provider가 legacy-only인지 modern discovery를 지원하는지 확인하고 negotiation 정책을 결정한다. 기존 Provider의 정책을 바꿀 때는 Godot처럼 2025 `initialize`만 지원하는 서버의 fallback도 함께 회귀 테스트한다.

## 1. 연결 정보 확인

먼저 MCP의 공식 연결 방법을 확인한다.

- MCP endpoint URL
- transport 방식
- 인증 필요 여부
- `tools/list` 지원 여부
- 각 tool의 JSON Schema
- 서버를 실행/종료하는 방법
- MCP가 실행되지 않았을 때의 동작

예: Godot MCP

```text
http://127.0.0.1:8000/mcp
```

## 2. Provider 등록

```ts
new RemoteMcpProvider({
  id: "godot",
  namespace: "godot",
  url: "http://127.0.0.1:8000/mcp",
});
```

Blender도 동일한 구조를 사용한다.

```ts
new RemoteMcpProvider({
  id: "blender",
  namespace: "blender",
  url: "http://127.0.0.1:xxxx/mcp",
});
```

## 3. Namespace 규칙

원격 MCP가 다음 tool을 제공한다면:

```text
get_scene
create_object
screenshot
```

WSR에서는:

```text
godot_get_scene
godot_create_object
godot_screenshot
```

처럼 Provider namespace를 앞에 붙인다.

namespace 충돌은 허용하지 않는다.

## 4. Provider는 선택적이어야 한다

Remote MCP 하나가 꺼져 있어도 WSR 전체가 종료되면 안 된다.

```text
WSR
├── Core tools          ← 계속 사용 가능
├── Playwright          ← 계속 사용 가능
└── Godot MCP           ← unavailable
```

연결 실패는 경고로 처리하고 Core WSR 기능을 계속 제공한다.

## 5. Provider Scheduler

모든 Remote MCP Provider는 `ProviderScheduler`의 상태 감시 대상이다.

Scheduler는 다음을 수행한다.

```text
주기적 health check
       ↓
Provider 연결 상태 확인
       ↓
tools/list
       ↓
Tool snapshot 갱신
       ↓
변경 감지
```

연결이 끊긴 Provider는 재연결을 시도한다.

기본값:

- 연결된 Provider health check: 10초
- 연결되지 않은 Provider retry: 5초

환경에 따라 다음 설정으로 변경할 수 있다.

```env
MCP_PROVIDER_HEALTH_INTERVAL_MS=10000
MCP_PROVIDER_RETRY_INTERVAL_MS=5000
```

## 6. Tool 목록 변경

MCP가 실행 중에 tool을 추가/삭제할 수 있다면 Scheduler가 `tools/list` 결과를 다시 가져와 변경을 감지한다.

```text
Remote MCP
  ↓
tools/list
  ↓
기존 snapshot과 비교
  ├─ 동일 → 유지
  └─ 변경 → Registry 갱신
```

현재 WSR은 요청마다 MCP Server를 구성하는 구조이므로 다음 `tools/list` 요청에는 최신 snapshot이 반영된다.

MCP 세션을 장기간 유지하는 클라이언트에서 즉시 UI 변경 알림이 필요하다면 향후 MCP `tools/list_changed` notification과 세션 관리 구조를 별도로 검토한다.

## 7. Provider 상태 오류 처리

Provider-specific tool 호출이 발생했는데 연결이 끊겨 있다면 WSR은 서버 전체를 종료하지 않고 MCP tool error를 반환한다.

예:

```text
MCP provider 'godot' (godot) is not connected.
Start the godot MCP server/editor and try again.
```

또한 `mcp_provider_status`를 통해 현재 Provider 상태를 확인할 수 있다.

## 8. Tool Schema

원격 MCP의 JSON Schema를 가능한 한 그대로 보존한다.

검증 대상:

- required
- optional
- string / number / integer / boolean
- enum
- array
- object
- default
- nested properties

WSR의 JSON Schema → Zod adapter를 사용한다.

## 9. 테스트

실제 MCP를 붙이기 전에 fake provider로 다음을 테스트한다.

```text
tools/list
  ↓
namespace 변환
  ↓
tools/call
  ↓
remote tool 이름 복원
  ↓
Provider 연결 실패
  ↓
Provider 재연결
  ↓
Tool 목록 변경 감지
```

Provider가 꺼진 상태에서도 Core WSR 기능이 유지되는지 확인한다.

## 10. 실제 검증 순서

1. Provider 설정 추가
2. WSR을 실행하고 Provider 연결 성공/실패 확인
3. Provider가 꺼진 상태에서도 WSR이 정상 시작되는지 확인
4. Provider를 실행
5. Scheduler가 자동 발견하는지 확인
6. `mcp_provider_status` 확인
7. `tools/list`에서 namespace tool 확인
8. 읽기 전용 tool 호출
9. Provider 종료
10. 다시 Provider tool 호출하여 명확한 unavailable 오류 확인
11. Provider 재실행
12. Scheduler가 자동 복구하는지 확인
13. MCP tool 목록이 변경되었을 때 Registry가 갱신되는지 확인
14. WSR inbound `server/discover`와 legacy `initialize`가 모두 계속 성공하는지 확인

## 11. 문서화

새 Provider를 추가하면 다음 문서에 필요한 내용을 반영한다.

- `README.md`
- `docs/mcp-gateway-architecture.md`
- 필요한 경우 `AGENT.md`

## 12. Git checkpoint

검증이 끝난 뒤 작은 단위로 커밋한다.

```text
feat: add <provider> MCP integration
```

또는 Scheduler/Provider 인프라 변경이라면 변경 목적을 명확하게 적는다.

## 원칙

- Provider 하나의 장애가 Gateway 전체 장애로 이어지지 않게 한다.
- `RemoteMcpProvider`를 재사용한다.
- namespace 충돌을 방지한다.
- schema를 임의로 단순화하지 않는다.
- 인증정보와 토큰을 Git에 커밋하지 않는다.
- Scheduler는 비동기 백그라운드 작업이며 MCP 요청을 막아서는 안 된다.
- 실패한 health check는 경고로 처리하고 다음 주기에 다시 시도한다.

<<<<<<< HEAD

## Transport 선택 규칙

Provider를 추가할 때 endpoint URL만 보고 transport를 추측하지 않는다. 서버가 Streamable HTTP인지 legacy SSE인지 먼저 확인한다.

- Streamable HTTP: 기본값 `transport: "streamable-http"`, 현재 Godot에서 사용.
- legacy SSE: `transport: "sse"`, 현재 CrystalDBA postgres-mcp에서 사용.

`@modelcontextprotocol/client 2.x`에는 legacy SSE transport가 없으므로 WSR은 SSE Provider에 한해 `@modelcontextprotocol/sdk 1.x` compatibility client를 사용한다. 신규 Provider가 SSE라면 이 경로를 재사용하고 Godot의 Streamable HTTP 경로를 변경하지 않는다.

PostgreSQL 예:
=======
## Transport ?? ??

Provider? ??? ? endpoint URL? ?? transport? ???? ???. ??? Streamable HTTP?? legacy SSE?? ?? ????.

- Streamable HTTP: ??? `transport: "streamable-http"`, ?? Godot?? ??.
- legacy SSE: `transport: "sse"`, ?? CrystalDBA postgres-mcp?? ??.

`@modelcontextprotocol/client 2.x`?? legacy SSE transport? ???? WSR? SSE Provider? ?? `@modelcontextprotocol/sdk 1.x` compatibility client? ????. ?? Provider? SSE?? ? ??? ????? Godot? Streamable HTTP ??? ???? ???.

PostgreSQL ?:
>>>>>>> bc801171f3701eb530b6adcc49612293e251de7e

```ts
new RemoteMcpProvider({
  id: "postgresql",
  namespace: "postgresql",
  url: config.postgresqlMcpUrl,
  transport: "sse",
});
```
