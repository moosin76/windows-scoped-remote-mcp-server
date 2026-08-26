# Provider Tool 변경 자동 알림

## 목적

WSR의 `ProviderScheduler`는 Remote MCP Provider의 `tools/list` 결과가 변경되면 Registry snapshot을 갱신한다. 이 문서는 그 변경 사실을 modern MCP 2026-07-28 클라이언트에 전달하는 흐름을 설명한다.

## 동작 흐름

```text
Remote MCP Provider
  -> tools/list 변경
  -> ProviderScheduler 변경 감지
  -> ProviderRegistry snapshot 갱신
  -> RunningHttpServer.notifyToolsChanged()
  -> live modern McpHttpHandler.notify.toolsChanged()
  -> notifications/tools/list_changed
  -> subscriptions/listen을 사용 중인 modern client가 변경 감지
```

## WSR 구조

WSR에는 modern MCP용 handler가 두 종류 있다.

- 일반 modern 요청용 기본 `mcpHandler`
- `x-openai-session`별로 유지되는 `modernSessions` handler

Provider Tool snapshot이 바뀌면 현재 살아 있는 모든 modern handler에 tool-list changed notification을 fan-out한다.

legacy MCP 세션은 이 fan-out 대상에 포함하지 않는다. 기존 legacy initialize/tools/list/tools/call 호환 흐름은 그대로 유지한다.

## SDK 동작

현재 WSR이 사용하는 MCP TypeScript SDK v2는 `McpHttpHandler.notify.toolsChanged()`를 제공한다. 이 호출은 handler의 event bus에 `notifications/tools/list_changed` 이벤트를 publish하고, 열린 `subscriptions/listen` stream이 있을 경우 클라이언트에 전달한다.

구독 중인 클라이언트가 없어도 호출은 안전하다.

## 주의사항

- ProviderScheduler의 기존 snapshot 변경 감지를 그대로 사용하므로 동일한 tool 목록에 대해 반복 알림을 만들지 않는다.
- 클라이언트가 `subscriptions/listen`을 지원/사용하지 않으면 자동 갱신 여부는 클라이언트 구현에 달려 있다.
- WSR Registry 자체는 알림과 관계없이 Scheduler가 계속 최신 상태로 유지한다.
- 알림 기능 때문에 legacy 프로토콜 경로를 제거하거나 Provider 연결 정책을 바꾸지 않는다.
