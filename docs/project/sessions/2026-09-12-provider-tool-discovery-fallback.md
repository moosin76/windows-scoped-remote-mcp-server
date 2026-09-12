# 2026-09-12 Provider Tool Discovery Fallback

## 작업 주체

ChatGPT / WSR

## 배경

DrapeFit 작업 중 WSR의 Windows-MCP Provider는 `mcp_provider_status`에서 `connected=true`, `toolCount=13`으로 정상 연결되어 있었지만, ChatGPT 측 동적 tool discovery/search에서 `windows_Snapshot`, `windows_DisplayInventory` 같은 provider tool이 바로 검색되지 않는 사례가 발생했다.

WSR Provider 자체의 연결/호출 기능은 정상이었고, 문제는 동적으로 proxy 등록된 provider tool이 MCP 클라이언트의 검색/필터 계층에서 발견되지 않을 수 있다는 운영상 취약점이었다.

## 구현한 수정

### 1. Provider proxy description 검색성 개선

`src/providers/provider-tools.ts`에서 동적 provider tool description 앞에 provider id를 명시적으로 붙인다.

예:

```text
[MCP Provider: windows] ...
[MCP Provider: blender] ...
```

upstream tool에 description이 없더라도 provider/remote tool 정보를 포함한 fallback description을 생성한다.

### 2. `mcp_provider_catalog` 추가

현재 Registry snapshot 기준으로 provider별 실제 discovered tool을 반환한다.

포함 정보:

- provider id / namespace
- connected / toolCount / lastError
- namespaced tool name
- upstream remote tool name
- upstream description

동적 provider tool이 클라이언트 검색에서 보이지 않을 때 실제 노출 목록을 안정적으로 확인하는 정적 복구 경로다.

### 3. `mcp_provider_call` 추가

클라이언트가 동적 provider tool을 직접 discover하지 못하는 경우 namespaced tool name으로 호출할 수 있는 정적 fallback이다.

보안 경계:

- `ProviderRegistry.listCachedTools()`에 이미 존재하는 tool만 호출 가능
- Registry snapshot에 없는 tool 이름은 거부
- 따라서 Windows-MCP의 `MCP_WINDOWS_TOOLS` allowlist나 다른 Provider의 discovery snapshot을 우회하지 않음
- upstream provider call 결과의 content/image 등을 그대로 유지
- upstream structuredContent가 없으면 provider/tool metadata를 structuredContent로 보완

### 4. MCP server instructions 보강

서버 instructions에 optional provider 지원과 복구 순서를 명시했다.

```text
mcp_provider_status
→ mcp_provider_catalog
→ 직접 provider tool
→ 필요 시 mcp_provider_call fallback
```

### 5. Windows Computer Use 문서 갱신

`docs/windows-computer-use-provider.md`에 Provider Tool Discovery 복구 경로와 allowlist 우회 방지 원칙을 추가했다.

## 변경 파일

- `src/providers/provider-tools.ts`
- `src/mcp-server.ts`
- `test/provider-tools.test.ts`
- `docs/windows-computer-use-provider.md`
- 이 문서

## 검증

완료:

- `npm run typecheck` 통과
- `test/provider-tools.test.ts` 4/4 통과
- `test/mcp-protocol-compat.test.ts` 3/3 통과
- 전체 `npm test` 17 files / 60 tests 통과
- `npm run build` 통과
- `git diff --check` 통과

전체 테스트 과정에서 새 `mcp_provider_call`에 modern MCP용 `outputSchema`가 필요하다는 회귀 테스트가 한 번 검출되었고, 스키마를 추가한 뒤 전체 테스트가 통과했다.

## 현재 런타임 주의

이 문서를 작성한 시점의 현재 ChatGPT 세션은 수정 전부터 실행 중인 WSR 프로세스에 연결되어 있다. 따라서 새 `mcp_provider_catalog`, `mcp_provider_call`, provider description prefix를 실제 ChatGPT tool discovery에 반영하려면 WSR 프로세스를 재시작한 뒤 tool refresh/reconnect가 필요하다.

현재 연결을 작업 중간에 끊지 않기 위해 이 세션에서는 WSR 자체를 self-restart하지 않았다.

재시작 후 확인할 것:

1. `mcp_provider_status`에서 Windows Provider `connected=true`, `toolCount=13`
2. `mcp_provider_catalog`에서 `windows_Snapshot`, `windows_Screenshot`, `windows_Click` 등 조회
3. ChatGPT tool discovery에서 `windows` 또는 `Windows-MCP` 검색 시 provider proxy tool 검색성 확인
4. 직접 tool discovery가 실패하는 경우 `mcp_provider_call`로 안전한 read-only Windows tool 호출 확인

## Git 주의

작업 시작 전부터 다음 변경/임시 파일이 존재했으며 이번 변경 범위에 포함하지 않는다.

- `skills/blender-windows-3d-authoring/SKILL.md`
- `.mcp_tmp_scripts/`
- `nul`
- `tmp/`

이 파일들은 임의 수정/삭제/커밋하지 않는다.
