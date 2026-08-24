# MCP Provider 테스트 스킬

## 최소 테스트

모든 Remote MCP Provider는 최소한 다음을 검증한다.

### Namespace

```text
remote: get_scene
gateway: godot_get_scene
```

### Reverse routing

```text
godot_get_scene → get_scene
```

### 충돌

같은 id 또는 namespace를 가진 Provider 등록을 거부한다.

### Tool 목록

원격 tool 개수가 Gateway에 정상 반영되는지 확인한다.

### Tool 호출

namespace가 붙은 Gateway tool 호출이 원격 tool 호출로 정확히 전달되는지 확인한다.

## 테스트 명령

```powershell
npm run typecheck
npm test
```

실제 MCP 서버가 필요한 통합 테스트는 별도로 실행하고, 로컬 unit test가 네트워크/실행 중인 Godot 등에 의존하지 않도록 한다.

MCP SDK 또는 HTTP transport를 변경했다면 `test/mcp-protocol-compat.test.ts`에서 다음도 확인한다.

- `server/discover` + `MCP-Protocol-Version: 2026-07-28` → 200
- legacy `initialize` → 200
- `notifications/initialized` → 202
- modern/legacy `tools/list`와 `tools/call`
- bearer auth 및 OAuth metadata endpoint

실제 Godot 회귀 테스트에서는 provider 연결, 45개 tool 발견, namespaced `godot_*` 45개 노출, 읽기 전용 tool 호출을 확인한다.

## 변경 후 확인

```text
unit test
  ↓
typecheck
  ↓
integration test
  ↓
WSR restart
  ↓
ChatGPT tool refresh
  ↓
real tool call
```

## PostgreSQL SSE ?? ???

PostgreSQL Provider? ??? ?? ??? ??? ????.

1. `mcp_provider_status`?? `postgresql`? connected?? toolCount? 9?? ??.
2. `list_schemas` ?? ?? ??.
3. `list_objects`? ??? ???? ??? ?? ?? ??? ????? ??.
4. Godot Provider? ?? Streamable HTTP? ???? ?? toolCount? ????? ??.
5. ?? remote tool ?? ?? ?? 54(45 + 9)?? ??.

???? ?? ??? ??? `npm run typecheck`, `npm test`, `git diff --check`? ??? ????.
