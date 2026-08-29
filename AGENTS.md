# Windows Scoped Remote MCP Server 작업 지침

## 프로젝트 목적

이 프로젝트는 Windows 로컬 개발 환경을 LLM에게 안전하게 노출하는 **MCP Gateway/Remote Development Server**다.

주요 책임은 다음과 같다.

- 제한된 Workspace 안에서 파일을 읽고 쓰고 검색한다.
- 다른 등록 Workspace는 기본적으로 참조/분석/복사 대상으로 취급한다.
- Playwright를 통해 브라우저를 제어한다.
- PowerShell/CMD/스크립트와 프로세스를 관리한다.
- Cloudflare Tunnel과 OAuth를 통해 원격 ChatGPT 연결을 제공한다.
- 외부 MCP 서버(Godot, Blender 등)를 Provider로 연결하고 namespace를 붙여 하나의 MCP Gateway로 노출한다.

## 현재 기준점

Remote MCP Provider Gateway는 실제 Godot MCP와 연결되어 검증되었다. 작업 시작 시 문서에 기록된 과거 커밋을 기준으로 추정하지 말고 `git status`와 `git log -1`로 현재 기준점을 확인한다.

검증된 흐름:

```text
ChatGPT
  ↓
Cloudflare Tunnel
  ↓
Windows Scoped Remote MCP Server
  ↓
ProviderRegistry
  ↓
RemoteMcpProvider
  ↓
Godot MCP
  ↓
Godot Editor
```

Godot에서는 MCP를 통해 테스트 Scene을 생성/저장하는 것까지 확인했다.

현재 MCP 계층은 공식 TypeScript SDK v2 split package 구조를 사용한다.

- inbound server: `@modelcontextprotocol/server`
- Node HTTP adapter: `@modelcontextprotocol/node`
- outbound Provider client: `@modelcontextprotocol/client`
- legacy OAuth Authorization Server bridge: `@modelcontextprotocol/server-legacy/auth`

HTTP endpoint는 `createMcpHandler`의 modern `2026-07-28` 경로와 기본 stateless legacy fallback을 함께 사용한다. `server/discover`를 application code에서 직접 구현하거나 응답을 수동 조립하지 않는다.

## 핵심 설계 원칙

### 1. 이 프로젝트 자체가 독립 프로젝트다

게임 프로젝트의 하위 기능으로 취급하지 않는다. 이 서버는 여러 차기 게임/프로젝트에서도 재사용할 **개발 인프라**다.

### 2. Gateway와 Provider를 분리한다

Gateway는 MCP tool 등록, namespace, routing, 보안 경계, 연결 수명을 관리한다.

Provider는 특정 외부 시스템과의 연결 및 실제 tool 호출을 담당한다.

```text
Gateway
├── Workspace / File / Process / Browser (기존 로컬 기능)
└── ProviderRegistry
    ├── Godot Provider
    ├── Blender Provider
    └── Future Providers
```

### 3. 외부 MCP는 범용 Provider로 연결한다

Godot 전용 코드를 `RemoteMcpProvider`에 넣지 않는다.

```text
RemoteMcpProvider
  ├── URL
  ├── connect / close
  ├── tools/list
  ├── tools/call
  └── namespace 변환
```

Godot/Blender는 설정만 다른 Provider 인스턴스가 되어야 한다.

### 4. Tool namespace는 underscore 방식을 사용한다

```text
workspace_*
browser_*
godot_*
blender_*
```

원격 tool이 `get_scene`이면 Gateway에는 `godot_get_scene`으로 노출한다.

호출 시에는 Provider가 다시 `get_scene`으로 변환한다.

### 5. 기존 기능을 불필요하게 대규모 리팩터링하지 않는다

현재 `mcp-server.ts`는 기존 Workspace/Browser/File/Exec tool 등록을 담당한다. 새로운 Provider 계층을 추가할 때 기존 로컬 기능을 전부 Provider로 옮기는 것을 기본 전략으로 삼지 않는다.

### 6. Schema 변환은 Gateway 경계에서 처리한다

외부 MCP의 JSON Schema를 MCP SDK의 등록 형식에 맞게 변환한다. 원격 서버 자체의 schema를 임의로 수정하지 않는다.

### 7. 실패 시 기존 기능을 보호한다

외부 Provider 하나가 연결되지 않아도 Workspace/Browser 등 핵심 로컬 MCP가 불필요하게 같이 죽지 않도록 설계한다. Provider 추가 시 연결 실패 정책을 명시적으로 결정한다.

## Workspace 보안 규칙

현재 활성 Workspace는 읽기/쓰기 대상이다.

다른 Workspace는 기본적으로:

- 목록 조회
- 읽기
- 검색
- 분석
- 활성 Workspace로 복사

만 허용하고, cross-workspace 도구를 통한 직접 수정은 금지한다.

이 정책을 MCP Provider 추가 과정에서 우회하지 않는다.

## 개발 워크플로우

모든 구조적 변경은 다음 순서로 진행한다.

1. 현재 Git 상태 확인
2. 관련 코드 분석
3. 변경 범위 최소화
4. 단위 테스트 추가/수정
5. `npm run typecheck` 또는 프로젝트에 정의된 typecheck 실행
6. `npm test`
7. 실제 MCP 서버가 필요한 경우 통합 테스트
8. `server/discover` (`2026-07-28`)와 legacy `initialize` 직접 테스트
9. 서버 재시작
10. ChatGPT의 MCP 도구 새로고침 확인
11. 실제 읽기 tool 호출
12. 실제 쓰기/변경 tool 호출
13. Git checkpoint commit

## MCP Provider 추가 시 반드시 확인할 것

- Provider id가 유일한가?
- namespace가 유일한가?
- tool 이름 충돌이 없는가?
- 원격 JSON Schema가 안전하게 변환되는가?
- tool description/annotations가 유지되는가?
- namespace가 call 단계에서 정확히 제거되는가?
- 연결 실패가 Gateway 전체를 불필요하게 중단시키지 않는가?
- close 시 연결/세션이 정리되는가?
- tools/list가 ChatGPT에서 정상 새로고침되는가?
- tools/call이 실제 원격 서버까지 전달되는가?

## 변경 금지/주의

- `.env`의 비밀값을 Git에 커밋하지 않는다.
- OAuth state/token 파일을 문서나 테스트에 복사하지 않는다.
- Cloudflare Tunnel token을 소스 코드에 넣지 않는다.
- 원격 MCP tool을 이름만 바꾸어 무조건 등록하지 말고 schema를 검증한다.
- 실제 게임 프로젝트의 데이터를 이 프로젝트의 테스트 목적으로 임의 변경하지 않는다.

## 문서 언어

프로젝트의 개발 문서는 기본적으로 **한국어**로 작성한다. 코드의 식별자, API 이름, tool 이름, 환경 변수 이름은 원래 표기를 유지한다.

## Remote MCP 연결 실패 처리 원칙

Remote MCP Provider는 선택 기능으로 취급합니다.

- 특정 Provider가 꺼져 있거나 연결에 실패해도 WSR Gateway 전체가 종료되어서는 안 됩니다.
- 시작 시 Provider별로 독립적으로 연결을 시도하고 실패한 Provider는 warning으로 기록합니다.
- 기본 Workspace/File/Process/Playwright 기능은 Provider 상태와 관계없이 계속 사용할 수 있어야 합니다.
- `mcp_provider_status`를 통해 현재 Provider 연결 상태와 마지막 오류를 확인할 수 있어야 합니다.
- 이미 등록된 Provider tool의 호출 중 연결이 끊어지면 사용자에게 어떤 Provider가 꺼져 있는지와 재시작해야 할 대상을 명확하게 반환합니다.
- 가능하면 Provider 호출 시 재연결을 한 번 시도한 후 실패를 사용자 친화적인 MCP tool error로 반환합니다.
- 새로운 Provider를 추가할 때도 이 원칙을 유지합니다.

## Remote MCP Provider 운영 원칙

Remote MCP Provider는 선택적 의존성으로 취급한다. 하나의 Provider가 꺼지거나 일시적으로 장애가 발생해도 WSR Core 기능과 다른 Provider가 영향을 받지 않아야 한다.

`ProviderScheduler`는 백그라운드에서 다음을 담당한다.

- 연결된 Provider health check
- 연결되지 않은 Provider 자동 재연결
- `tools/list` 재조회
- Tool snapshot 변경 감지
- Provider 상태 로그

기본값은 health check 10초, retry 5초이며 `MCP_PROVIDER_HEALTH_INTERVAL_MS`와 `MCP_PROVIDER_RETRY_INTERVAL_MS`로 변경할 수 있다.

Provider tool 호출이 실패할 경우 Gateway를 종료하지 말고 사용자에게 Provider가 unavailable임을 명확하게 반환한다.

현재 WSR은 요청마다 MCP Server를 구성하므로 Scheduler가 갱신한 Registry snapshot은 다음 `tools/list` 요청에 반영된다. 장기 세션과 `tools/list_changed` notification은 별도의 세션 관리 작업으로 다룬다.

## PostgreSQL MCP 운영 규칙

- PostgreSQL Provider는 CrystalDBA `postgres-mcp`를 사용하며 현재 transport는 legacy SSE이다.
- Godot Provider의 Streamable HTTP 설정을 PostgreSQL 때문에 변경하지 않는다. Provider별 transport를 명시적으로 선택한다.
- PostgreSQL 기본 endpoint는 `http://127.0.0.1:10021/sse`이다.
- 실제 `DATABASE_URI`, DB 계정, 비밀번호는 `.env`에만 저장하고 Git에 커밋하지 않는다.
- 운영 DB에서는 `restricted`와 최소권한 계정을 우선한다. 개발/참고용 DB에서만 필요에 따라 `unrestricted`를 사용한다.
- Provider 추가/수정 후에는 `npm run typecheck`, `npm test`, `git diff --check`를 수행한다.
- 실제 연결 검증 시 `mcp_provider_status`에서 Provider별 connected/toolCount를 확인하고, PostgreSQL은 최소 `list_schemas`와 `list_objects`를 호출한다.

## MCP 세션별 Workspace 규칙

- Workspace 목록과 Sandbox root는 공유하지만 `active workspace`는 MCP 세션별로 독립되어야 한다.
- legacy MCP에서는 `Mcp-Session-Id`, ChatGPT의 MCP `2026-07-28` modern 요청에서는 `x-openai-session`을 세션 구분에 사용한다.
- `x-openai-subject`는 사용자 단위일 수 있으므로 Workspace 세션 key로 사용하지 않는다.
- `x-openai-session`, Authorization, Cookie 등 세션/인증 원문 값을 로그나 문서에 기록하지 않는다.
- `switch_workspace` 변경이 다른 ChatGPT 채팅으로 전파되는지 반드시 두 개 이상의 세션으로 회귀 테스트한다.
- File/Exec 및 Workspace에 저장하는 Browser 도구는 호출 세션의 활성 Workspace를 따라야 한다.
- 세부 설계는 `docs/session-scoped-workspaces.md`를 기준으로 한다.

## 문서 인코딩 규칙

- 모든 프로젝트 소스와 문서는 **UTF-8 without BOM**으로 저장하는 것을 기본 규칙으로 한다.
- Markdown, TypeScript/JavaScript, YAML, JSON, SQL, 환경 변수 예제 등 텍스트 파일은 UTF-8 without BOM을 사용한다.
- Windows PowerShell 5.1의 `Set-Content`/`Out-File -Encoding UTF8`은 BOM을 만들 수 있으므로 소스/문서 생성에 사용하지 않는다.
- PowerShell 7(`pwsh`) 또는 WSR의 `write_file`/`apply_patch`를 우선 사용한다.
- 예외적으로 Windows PowerShell 5.1에서 실행해야 하는 **임시 `.ps1` 실행 파일**은 한글 소스 디코딩 호환을 위해 BOM을 허용한다. 저장소의 일반 소스/문서에는 적용하지 않는다.
- 새 문서를 만들거나 기존 문서를 수정할 때 한글이 `?`, `U+FFFD` 등으로 깨지지 않았는지 확인한다.
- 기존 파일의 BOM은 특별한 호환성 이유가 없다면 제거한다.
- 문서 작업 후에는 UTF-8 디코딩 검사와 BOM 검사를 수행하고, 인코딩 오류나 replacement character(`U+FFFD`)가 없는지 확인한다.

## AI 도구 간 작업 인계 규칙

WSR은 Codex, ChatGPT/WSR 등 서로 다른 AI 작업 환경에서 이어서 개발할 수 있어야 한다. 대화 자체를 기준 상태로 삼지 않고 **Git + `AGENTS.md` + `docs/project/` 문서**를 공통 기준으로 사용한다.

의미 있는 작업 단위를 종료하거나 다른 AI 도구/세션으로 넘길 때는 `docs/project/sessions/`에 handoff 기록을 남긴다. 단순 질의, 상태 조회, 코드 변경이 없는 짧은 확인은 예외로 할 수 있다.

세션 기록에는 작업 범위에 맞게 다음 항목을 남긴다.

- 작업 주체(Codex, ChatGPT/WSR 등)
- 현재 Roadmap 항목
- 현재 Git 브랜치와 관련 커밋
- 완료한 작업
- 미완료 작업
- 주요 변경 파일/영역
- 중요한 설계/보안 결정
- 테스트/검증 결과와 미검증 항목
- 알려진 문제/주의사항
- 다음 세션에서 가장 먼저 할 작업

작업 종료 전에는 `git status`, 필요한 경우 `git diff`와 최근 커밋을 확인하여 문서와 실제 저장소 상태가 일치하는지 검증한다.

세션 기록은 대화 로그가 아니라 **다른 작업 주체가 저장소만 읽고도 작업을 재개할 수 있는 handoff 문서**로 작성한다.

## 프로젝트 상태 문서

WSR 자체 개발 상태는 다음 문서를 기준으로 한다.

- `docs/project/roadmap.md` — 지금 할 것과 나중에 할 것, 우선순위와 완료 조건
- `docs/project/plans/` — 구조적 변경이나 여러 작업으로 이루어진 구현 계획
- `docs/project/sessions/` — 실제 작업 진행과 handoff 기록

작업 시작 시 기본 순서는 다음과 같다.

1. `AGENTS.md` 확인
2. `docs/project/roadmap.md` 확인
3. 관련 `docs/project/plans/` 문서 확인
4. 기존 설계 문서와 코드 확인
5. `git status` / 최근 커밋 확인
6. 구현 및 검증
7. Roadmap/세션 문서 갱신

장기적으로 유지할 설계나 보안 결정은 세션 문서에만 남기지 말고 관련 설계 문서에도 반영한다.

## 현재 작업 범위 관리

`docs/project/roadmap.md`의 **지금 할 것(NOW)** 범위가 현재 기본 우선순위다. NOW에 없는 기능은 긴급한 보안/회귀 수정이 아니라면 즉시 구현하지 않고 **나중에 할 것(LATER)** 또는 별도 계획으로 기록한다.

새 기능 제안 시 다음 순서로 판단한다.

1. WSR Core 1차 완성에 필요한가?
2. 원격 Windows 개발의 보안 경계를 강화하는가?
3. Codex ↔ ChatGPT 작업 연속성을 개선하는가?
4. 장애 진단이나 Provider 운영을 단순화하는가?
5. 현재 기능을 복잡하게 만들지 않고 명확한 이득이 있는가?

이 기준에 맞지 않는 기능은 LATER로 분리한다.
