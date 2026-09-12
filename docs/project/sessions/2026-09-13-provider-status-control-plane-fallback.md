# 2026-09-13 Provider Status Control-Plane Fallback

## 작업 주체

ChatGPT / WSR

## 배경

DrapeFit 작업 중 WSR를 재시작한 뒤 `exec_command`, `browser_*`, `mcp_provider_status`는 ChatGPT tool discovery에서 정상 확인됐지만, 직전 커밋 `14daf06`에서 추가한 `mcp_provider_catalog`와 `mcp_provider_call`은 클라이언트 검색 결과에 나타나지 않는 현상이 다시 확인됐다.

소스와 실행 코드에는 두 도구가 모두 등록되어 있었으므로 Provider 연결이나 WSR 서버 등록 자체의 문제라기보다 클라이언트 측 tool discovery/search/cache가 새 정적 도구 이름을 안정적으로 노출하지 않는 운영상 문제로 판단했다.

## 수정 방향

새 도구 이름이 검색되지 않아도 이미 안정적으로 노출되는 `mcp_provider_status` 하나만으로 복구할 수 있도록 control-plane 기능을 통합했다.

`mcp_provider_status`는 이제 다음 동작을 지원한다.

- 인자 없음 또는 `op="status"`: 기존과 동일한 Provider 연결 상태 조회
- `op="catalog"`: Registry snapshot 기준 실제 discovered/allowed provider tool 목록 조회
- `op="call"`: namespaced tool 이름과 arguments를 받아 Registry snapshot에 있는 허용된 tool만 호출

별도 `mcp_provider_catalog`, `mcp_provider_call` 도구는 기존 호환성을 위해 그대로 유지한다.

## 보안 경계

`op="call"`은 `ProviderRegistry.listCachedTools()`에 존재하는 namespaced tool만 허용한다.

따라서 다음을 우회하지 않는다.

- Windows-MCP `MCP_WINDOWS_TOOLS` allowlist
- Provider별 discovery snapshot
- WSR Provider namespace/routing 경계

Registry에 없는 tool은 오류와 현재 허용된 namespaced tool 목록을 반환한다.

## 변경 파일

- `src/providers/provider-tools.ts`
- `src/mcp-server.ts`
- `test/provider-tools.test.ts`
- 이 문서

## 검증

검증 완료:

- `npm run typecheck` 통과
- `test/provider-tools.test.ts` 5/5 통과
- 전체 `npm test` 통과: 17 files / 61 tests
- `npm run build` 통과
- `git diff --check` 통과

## 재시작 후 확인

WSR 재시작 후 ChatGPT에서 최소 `mcp_provider_status`가 보이면 다음 순서로 복구 가능해야 한다.

```text
mcp_provider_status(op="catalog")
→ windows_Snapshot 등 실제 provider tool 이름 확인
→ 직접 provider tool 호출
→ 직접 discovery가 안 되면 mcp_provider_status(op="call", tool="windows_Snapshot", arguments={...})
```

이 구조의 목적은 클라이언트가 새 `mcp_provider_catalog` / `mcp_provider_call` 이름을 캐시 때문에 놓치더라도 Provider 기능을 잃지 않게 하는 것이다.

## 기존 dirty 상태 주의

작업 시작 전부터 다음 항목은 존재했으며 이번 변경 범위에 포함하지 않는다.

- `skills/blender-windows-3d-authoring/SKILL.md`
- `.mcp_tmp_scripts/`
- `nul`
- `tmp/`
