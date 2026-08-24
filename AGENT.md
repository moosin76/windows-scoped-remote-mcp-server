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

현재 Git 기준 커밋은 `f0b082c`이며 Remote MCP Provider Gateway가 실제 Godot MCP와 연결되어 검증되었다.

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
8. 서버 재시작
9. ChatGPT의 MCP 도구 새로고침 확인
10. 실제 읽기 tool 호출
11. 실제 쓰기/변경 tool 호출
12. Git checkpoint commit

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
