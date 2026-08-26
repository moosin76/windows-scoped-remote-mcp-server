# 2026-08-26 Provider Tool 변경 자동 알림

## 작업 주체

ChatGPT/WSR

## Roadmap

NOW-04 — Provider Tool 변경 자동 알림

## 작업 브랜치

- `feature/provider-tools-changed`
- 시작 기준: main `32f5595`

## 완료한 작업

- ProviderScheduler의 기존 Tool snapshot 변경 감지를 modern MCP 알림과 연결
- `RunningHttpServer.notifyToolsChanged()` 추가
- 기본 modern handler와 `x-openai-session`별 live modern handler로 알림 fan-out
- MCP SDK의 `handler.notify.toolsChanged()` 사용
- modern `server/discover`가 `tools.listChanged` capability를 제공하는지 회귀 테스트 추가
- legacy initialize/tools/list/tools/call 흐름 유지 확인
- 알림 fan-out 단위 테스트 추가
- `docs/provider-tool-change-notifications.md` 작성

## 주요 파일

- `src/http-server.ts`
- `src/server.ts`
- `test/tool-list-changed.test.ts`
- `test/mcp-protocol-compat.test.ts`
- `docs/provider-tool-change-notifications.md`

## 중요한 결정

1. SDK가 Tool 등록 시 `tools.listChanged` capability를 이미 제공하므로 WSR에서 protocol era별 capability를 별도로 조작하지 않는다.
2. 실제 필요한 연결점은 ProviderScheduler 변경 이벤트에서 live modern handler의 `notify.toolsChanged()`를 호출하는 것이다.
3. 기본 modern handler와 `x-openai-session` handler를 모두 fan-out 대상으로 한다.
4. legacy 세션은 modern subscription fan-out에 포함하지 않고 기존 호환 경로를 그대로 둔다.
5. 구독 중인 클라이언트가 없어도 notification publish는 안전하다.

## 검증

중간 targeted 검증:

- `npm run typecheck` 통과
- `test/tool-list-changed.test.ts` 통과
- `test/mcp-protocol-compat.test.ts` 통과
- `test/provider-scheduler.test.ts` 통과
- targeted 총 3 files / 8 tests 통과
- `git diff --check` 통과

최종 전체 회귀 검증은 checkpoint commit 전에 다시 수행한다.

## 다음 작업

1. 전체 typecheck/test/build/diff/UTF-8 검증
2. checkpoint commit 후 main 병합
3. NOW-05 `wsr_status` 구현

## 주의사항

- remote push는 수행하지 않는다.
- 현재 실행 중인 WSR 프로세스에는 새 코드가 아직 반영되지 않았다.
