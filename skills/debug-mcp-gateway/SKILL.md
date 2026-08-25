# MCP Gateway 장애 분석 스킬

## 목적

MCP 도구 새로고침 실패, Provider 연결 실패, Cloudflare Tunnel 오류 등을 단계별로 분리해서 진단한다.

## 진단 순서

### 1. 로컬 Gateway

먼저 WSR의 `/health`와 로컬 MCP endpoint가 살아 있는지 확인한다.

```text
http://localhost:12000/health
http://localhost:12000/mcp
```

### 2. Provider 연결

서버 로그에서 Provider별 연결 상태를 확인한다.

```text
[MCP Providers] ...
[Godot MCP] Connected ...
```

연결 실패라면 Gateway의 tool schema 문제와 구분한다.

### 3. tools/list

ChatGPT의 '도구 목록 새로고침'이 실패하면 `server/discover`를 먼저 확인한 뒤 `tools/list` 단계의 응답을 검사한다.

최신 클라이언트는 다음 순서로 시작할 수 있다.

```text
server/discover (2026-07-28)
  ├─ 성공 → modern per-request flow
  └─ 미지원 → legacy initialize fallback
```

`server/discover`가 400이면 다음을 확인한다.

- `@modelcontextprotocol/server` v2와 `createMcpHandler`를 사용 중인가?
- `MCP-Protocol-Version`, `Mcp-Method`, 필요한 경우 `Mcp-Name` header가 body와 일치하는가?
- 요청 `params._meta`에 protocol version/client info/client capabilities가 있는가?
- Express body parser가 소비한 body를 Node adapter에 전달하는가?

수동 `server/discover` handler로 우회하지 않는다. SDK의 modern handler가 capability와 server identity를 생성하도록 한다.

주요 의심 항목:

- duplicate tool name
- invalid tool name
- invalid input schema
- JSON Schema → Zod 변환 실패
- malformed annotations
- Provider 연결 중 예외

### 4. tools/call

목록 새로고침은 성공하지만 실제 tool 호출이 실패하면:

```text
namespace tool name
  ↓
ProviderRegistry.resolve()
  ↓
remote tool name
  ↓
provider.callTool()
```

각 단계를 확인한다.

### 5. Cloudflare

Error 1033은 우선 Cloudflare Tunnel/cloudflared 상태를 의심한다.

```text
ChatGPT
 ↓
Cloudflare
 ↓
cloudflared
 ↓
localhost:12000
```

Gateway 코드 변경 전에 tunnel connection 로그를 확인한다.

## 원칙

하나의 오류를 여러 계층의 문제로 동시에 추측하지 않는다.

항상:

```text
Transport
→ Gateway
→ Provider
→ tools/list
→ tools/call
→ Remote MCP
```

순서로 좁힌다.

## Provider가 꺼진 경우

WSR 전체가 종료되는지부터 확인하지 말고 다음 순서로 확인합니다.

1. `mcp_provider_status` 호출
2. 해당 Provider의 `connected` 상태 확인
3. `lastError` 확인
4. Provider 프로그램/Editor가 실행 중인지 확인
5. Provider를 다시 시작한 뒤 필요한 경우 WSR을 재시작하거나 도구 목록을 새로 고침

Provider 연결 실패는 WSR Gateway 전체 장애로 취급하지 않습니다.

<<<<<<< HEAD

## SSE endpoint 405 진단

legacy SSE endpoint에 Streamable HTTP transport로 연결하면 `POST /sse` 요청이 발생하면서 `405 Method Not Allowed`가 반복될 수 있다.

이 경우 다음 순서로 확인한다.

1. Provider URL이 실제로 `/sse` endpoint인지 확인.
2. Provider 등록의 `transport`가 `"sse"`인지 확인.
3. PostgreSQL Docker 로그에서 `POST /sse 405`가 사라졌는지 확인.
4. `mcp_provider_status`에서 PostgreSQL이 connected / 9 tools인지 확인.
5. `list_schemas` 또는 `list_objects`를 실제 호출해 응답을 확인.

Godot처럼 `/mcp` Streamable HTTP Provider에는 이 해결책을 적용하지 않는다.
=======
## SSE endpoint 405 ??

legacy SSE endpoint? Streamable HTTP transport? ???? `POST /sse` ??? ????? `405 Method Not Allowed`? ??? ? ??.

? ?? ?? ??? ????.

1. Provider URL? ??? `/sse` endpoint?? ??.
2. Provider ??? `transport`? `"sse"`?? ??.
3. PostgreSQL Docker ???? `POST /sse 405`? ????? ??.
4. `mcp_provider_status`?? PostgreSQL? connected / 9 tools?? ??.
5. `list_schemas` ?? `list_objects`? ?? ??? ??? ??.

Godot?? `/mcp` Streamable HTTP Provider?? ? ???? ???? ???.
>>>>>>> bc801171f3701eb530b6adcc49612293e251de7e
