# MCP 세션별 Workspace 격리

## 목적

WSR의 `active workspace`는 MCP 연결/대화별 상태여야 한다. 한 ChatGPT 채팅에서 `switch_workspace`를 호출했을 때 다른 채팅의 활성 Workspace가 변경되면 안 된다.

예:

```text
Chat A → ec
Chat B → wsr

Chat A에서 get_active_workspace → ec
Chat B에서 get_active_workspace → wsr
```

Workspace 목록과 Sandbox 정책은 공통으로 사용하지만, 현재 선택된 Workspace(`activeName`)만 세션별로 독립 관리한다.

## 배경

초기 구현은 하나의 전역 `WorkspaceManager`가 `activeName`을 가지고 있었다. 이 때문에 같은 WSR 서버에 연결된 여러 ChatGPT 채팅이 `switch_workspace` 상태를 공유했다.

처음에는 MCP 2025-era의 `Mcp-Session-Id`별로 `WorkspaceManager`를 fork하도록 수정했다. 하지만 실제 ChatGPT 연결은 MCP `2026-07-28` modern 경로를 사용했고, 이 경로에는 legacy `Mcp-Session-Id`가 없어서 채팅 간 간섭이 계속 발생했다.

실제 ChatGPT 요청을 확인한 결과 modern 요청에는 다음 헤더가 전달된다.

```text
mcp-protocol-version: 2026-07-28
x-openai-session: <session identifier>
x-openai-subject: <subject identifier>
```

`x-openai-session`은 ChatGPT 연결/대화를 구분하는 세션 키로 사용하고, `x-openai-subject`는 사용자 단위일 수 있으므로 Workspace 격리 키로 사용하지 않는다.

세션 식별자의 실제 값은 로그에 출력하지 않는다.

## 현재 구조

```text
WSR
├─ Workspace registry / Sandbox roots (공유)
│
├─ Legacy MCP session A
│   └─ WorkspaceManager fork → active=ec
├─ Legacy MCP session B
│   └─ WorkspaceManager fork → active=wsr
│
├─ Modern OpenAI session A (x-openai-session)
│   └─ WorkspaceManager fork → active=ec
└─ Modern OpenAI session B (x-openai-session)
    └─ WorkspaceManager fork → active=wsr
```

`WorkspaceManager.fork()`는 등록된 Workspace/Sandbox 설정을 공유 가능한 구성으로 복제하면서 `activeName` 상태를 독립시킨다.

## 프로토콜별 처리

### MCP 2025-era

legacy 연결은 `Mcp-Session-Id`를 세션 키로 사용한다. 세션 초기화 시 전용 `WorkspaceManager`와 해당 Workspace를 사용하는 MCP server/tool 집합을 생성한다.

### MCP 2026-07-28 / ChatGPT

modern 요청에서 `x-openai-session`이 있으면 해당 값을 key로 세션별 MCP server/tool 집합과 `WorkspaceManager`를 재사용한다.

장시간 실행되는 Gateway에서 세션 handler가 무한히 누적되지 않도록 retained modern session에는 수명 정책을 적용한다.

- 기본 idle TTL: 6시간 (`MCP_MODERN_SESSION_RETENTION_MS=21600000`)
- 기본 최대 retained session: 16개 (`MCP_MAX_MODERN_SESSIONS=16`)
- TTL이 지난 idle session은 다음 modern 요청 시 `handler.close()` 후 제거한다.
- 최대 개수에 도달하면 가장 오래 idle인 session부터 정리한다.
- 현재 요청을 처리 중인 session은 TTL/capacity 정리 대상에서 제외한다.
- 모든 retained session이 처리 중이라면 기존 session을 강제로 닫지 않고 새 요청은 stateless modern handler로 fallback한다.
- 동일 `x-openai-session`의 동시 요청은 session acquisition 단계에서 active reservation을 잡아 capacity 정리와의 race를 피한다.

이 정책 때문에 장시간 유휴 후 다시 연결된 채팅은 세션별 active workspace 상태가 초기값으로 돌아갈 수 있다. 이는 무제한 메모리 보존보다 안전성을 우선한 의도된 동작이다.

`x-openai-session`이 없는 일반 modern MCP client는 기존 stateless 동작을 유지한다. OpenAI 전용 헤더가 없는 client에 임의의 세션 의미를 부여하지 않는다.

## 적용 범위

세션별 Workspace는 다음 로컬 기능의 경로 기준에 적용된다.

- Workspace tools
- File tools
- Process / `exec_command`
- Browser screenshot/download 등 Workspace에 파일을 저장하는 기능

Playwright 브라우저 자체의 로그인 상태와 브라우저 인스턴스는 기존처럼 공유한다. 단, Workspace에 저장되는 결과물의 경로 해석은 호출한 MCP 세션의 활성 Workspace를 따른다.

Remote MCP Provider의 연결/Registry는 Workspace 선택과 별개의 Gateway 공유 기능이다.

## 보안 및 로그 규칙

- `Authorization`, Cookie, OAuth token 등 인증 정보는 진단 로그에 출력하지 않는다.
- `x-openai-session`의 실제 값도 로그에 출력하지 않는다.
- 필요한 경우 `openaiSession=present|absent` 정도만 기록한다.
- `x-openai-subject`를 Workspace 세션 key로 사용하지 않는다.
- Workspace fork가 기존 Sandbox root 제한을 우회해서는 안 된다.

## 테스트

`test/session-workspace.test.ts`에서 다음을 검증한다.

1. 두 legacy MCP 세션이 서로 다른 active workspace를 유지한다.
2. 두 modern OpenAI 세션이 서로 다른 active workspace를 유지한다.
3. 각 세션의 파일 목록 조회가 자신의 Workspace를 기준으로 동작한다.
4. 각 세션의 `exec_command`가 자신의 Workspace를 cwd로 사용한다.
5. retained modern session이 설정된 최대 개수를 넘지 않는다.
6. idle TTL이 지난 modern session이 다음 요청에서 정리된다.
7. `/health`에서 modern session limit/TTL과 Node memory 진단값을 확인할 수 있다.
8. 기존 MCP protocol compatibility가 유지된다.

2026-09-08 OOM 방어 수정 기준 전체 테스트는 17 files / 58 tests를 통과했다.

실제 ChatGPT에서도 서로 다른 두 채팅에서 각각 `ec`, `wsr`을 선택한 뒤 다시 조회하여 Workspace 상태가 서로 전파되지 않는 것을 확인했다.

## 운영 확인 절차

WSR의 세션 관련 코드를 변경한 경우 다음 순서로 확인한다.

1. `npm run typecheck`
2. `npm test`
3. `git diff --check`
4. WSR 서버 재시작
5. ChatGPT MCP 도구 새로고침/재연결
6. Chat A에서 Workspace A 선택
7. Chat B에서 Workspace B 선택
8. Chat A/B에서 각각 `get_active_workspace` 재조회
9. 서로의 선택이 변경되지 않는지 확인
10. 필요하면 파일 조회 또는 `exec_command`로 실제 경로까지 검증

## 관련 코드

- `src/workspace.ts` — WorkspaceManager fork
- `src/http-server.ts` — legacy/modern MCP 세션 routing
- `src/browser-manager.ts` — 세션 Workspace 기준 저장 경로
- `test/session-workspace.test.ts` — 세션 격리 회귀 테스트
