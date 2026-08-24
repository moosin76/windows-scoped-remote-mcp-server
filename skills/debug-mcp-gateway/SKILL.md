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

ChatGPT의 '도구 목록 새로고침'이 실패하면 먼저 `tools/list` 단계의 응답을 검사한다.

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
