# 🛡️ Windows Scoped Remote MCP Server

Windows 환경에서 동작하는 **보안 격리형 원격 개발 MCP(Model Context Protocol) 서버**입니다.

ChatGPT, Claude 등 MCP를 지원하는 LLM 클라이언트와 연결하여 실제 Windows 개발 환경의 파일, 터미널, 프로세스, 브라우저, 여러 Workspace를 대화형으로 다룰 수 있습니다.

또한 Godot, Blender 등 별도의 Remote MCP를 **Provider**로 연결할 수 있어 하나의 Gateway에서 다양한 개발 도구를 함께 사용할 수 있습니다.

### ❤️ 프로젝트 후원

WSR이 유용했다면 GitHub Sponsors를 통해 프로젝트를 후원할 수 있습니다.

**[💖 GitHub Sponsors로 후원하기](https://github.com/sponsors/moosin76)**

후원은 WSR의 유지보수와 새로운 MCP Provider 및 기능 개발에 사용됩니다.

---

## 주요 특징

- **Windows SandboxGuard** — 설정한 Workspace 경계 안에서 파일과 명령 실행을 제한합니다.
- **Multi-Workspace** — 여러 프로젝트를 등록하고 활성 Workspace를 전환할 수 있으며, ChatGPT/MCP 세션별로 활성 Workspace 상태가 독립됩니다.
- **파일/코드 관리** — 조회, 생성, 수정, 이동, 복사, 삭제, patch 적용 등을 지원합니다.
- **PowerShell / CMD / 프로세스 관리** — 개발 명령 실행과 백그라운드 프로세스를 관리합니다.
- **Playwright 브라우저 자동화** — 실제 브라우저를 열고 탐색, 입력, 클릭, 스크린샷 등을 수행합니다.
- **Remote MCP Provider** — Godot, Blender 등 원하는 MCP를 Gateway에 추가할 수 있습니다.
- **Provider 장애 격리** — 하나의 MCP가 꺼져 있어도 WSR Core와 다른 Provider는 계속 사용할 수 있습니다.
- **Provider Scheduler** — MCP의 연결 상태와 `tools/list`를 주기적으로 확인하고 자동 재연결 및 Tool Registry 갱신을 수행합니다.
- **Provider Tool 변경 알림** — Remote MCP의 Tool 목록이 바뀌면 지원하는 modern MCP 클라이언트에 `tools/list_changed` 알림을 전달합니다.
- **Project Handoff / Resume** — `workspace_context`와 `workspace_resume`으로 Git, AGENTS, Roadmap, Session 문서를 기반으로 다른 AI/세션에서 작업 상태를 이어받을 수 있습니다.
- **WSR 운영 진단** — `wsr_status` 하나로 WSR, Workspace, Provider, Browser, cloudflared 및 인증 설정 상태를 비밀값 없이 확인할 수 있습니다.
- **OAuth 2.1 / Cloudflare Tunnel 지원** — 원격 MCP 클라이언트와 안전하게 연결할 수 있는 구성을 제공합니다.
- **MCP 2026-07-28 + legacy 호환** — `server/discover` 기반 최신 stateless 요청과 2025 `initialize` 흐름을 같은 `/mcp` endpoint에서 지원합니다.

---

## 아키텍처

```text
                         ChatGPT / Claude
                                │
                         MCP / HTTPS
                                │
                       Cloudflare Tunnel
                                │
                                ▼
                 Windows Scoped Remote MCP Server
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                 │
           Workspace        Playwright          Providers
              │                 │                 │
       Files / Process      Browser tools    ┌────┼─────┐
                                             │    │     │
                                           Godot Blender ...
                                             │    │
                                         godot_* blender_*
```

WSR 자체는 Gateway 역할을 하고, 외부 MCP는 `RemoteMcpProvider`를 통해 연결합니다.

HTTP MCP 계층은 공식 TypeScript SDK v2의 `createMcpHandler`를 사용합니다. `2026-07-28` 클라이언트에는 `server/discover`와 요청별 `_meta` envelope를 제공하고, 기존 클라이언트에는 같은 tool 정의로 2025-era stateless `initialize` fallback을 제공합니다.

```text
POST /mcp
  ├─ MCP 2026-07-28 → server/discover / per-request envelope
  └─ MCP 2025-era  → initialize / notifications/initialized
```

---

## Remote MCP Provider

사용자마다 필요한 MCP가 다르므로 WSR은 특정 MCP 하나에 종속되지 않습니다.

예를 들어:

```text
WSR
├── Godot MCP
├── Blender MCP
├── Playwright
└── 사용자가 추가한 MCP
```

각 Provider에는 namespace를 사용합니다.

| MCP        | Namespace 예시 |
| :--------- | :------------- |
| Godot      | `godot_*`      |
| Blender    | `blender_*`    |
| Browser    | `browser_*`    |
| 새로운 MCP | `<provider>_*` |

예를 들어 Blender MCP의 `get_scene`은 WSR에서 `blender_get_scene`으로 노출됩니다.

### MCP를 추가하는 가장 쉬운 방법

프로젝트를 받은 후 ChatGPT에게 다음처럼 요청할 수 있습니다.

```text
이 windows-scoped-remote-mcp-server 프로젝트에 Blender MCP를 추가해줘.
AGENTS.md와 skills/add-remote-mcp-provider/SKILL.md를 먼저 읽고
기존 RemoteMcpProvider / ProviderRegistry 구조를 따라 작업해줘.
Blender MCP의 연결 방법과 필요한 설정을 확인하고
blender_* namespace를 사용해줘.
테스트와 문서도 업데이트하고 typecheck와 전체 테스트까지 실행해줘.
```

자세한 절차는 `skills/add-remote-mcp-provider/SKILL.md`를 참고하세요.

---

## Provider가 꺼져 있어도 WSR은 계속 실행됩니다

Remote MCP는 선택적 의존성입니다.

```text
Godot MCP OFF
     │
     ▼
Godot Provider = unavailable
     │
     ├── WSR Core       → 계속 사용 가능
     ├── Playwright     → 계속 사용 가능
     └── 다른 Provider  → 계속 사용 가능
```

Provider 연결 실패 때문에 WSR 전체가 종료되지 않습니다.

Provider-specific tool을 호출했을 때 연결되어 있지 않으면 명확한 오류를 반환합니다.

```text
MCP provider 'godot' (godot) is not connected.
Start the godot MCP server/editor and try again.
```

현재 상태는 `mcp_provider_status` tool로 확인할 수 있습니다.

---

## Provider Scheduler

WSR은 `ProviderScheduler`를 백그라운드에서 실행하여 Remote MCP의 상태를 지속적으로 관리합니다.

```text
                    ProviderScheduler
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
        CONNECTED                    UNAVAILABLE
             │                           │
        tools/list                    reconnect
             │                           │
       변경 여부 확인                tools/list
             │                           │
             └─────────────┬─────────────┘
                           ▼
                    Tool Registry 갱신
```

기본값:

- 연결된 Provider health check: **10초**
- 연결되지 않은 Provider retry: **5초**

환경변수로 변경할 수 있습니다.

```env
MCP_PROVIDER_HEALTH_INTERVAL_MS=10000
MCP_PROVIDER_RETRY_INTERVAL_MS=5000
```

### MCP를 켰다 꺼도 자동으로 따라갑니다

```text
WSR 실행
   ↓
Godot OFF
   ↓
Provider unavailable
   ↓
Godot 실행
   ↓
Scheduler가 자동 발견
   ↓
tools/list
   ↓
godot_* Tool Registry 갱신
```

따라서 Provider를 켜거나 다시 실행하기 위해 WSR 자체를 재시작할 필요가 없습니다.

Remote MCP의 Tool 정의가 변경되면 `tools/list` 결과를 비교하여 Registry snapshot도 갱신합니다.

Remote MCP의 Tool 정의가 바뀌면 Registry snapshot을 갱신한 뒤, 지원하는 modern MCP 클라이언트에는 표준 `tools/list_changed` 알림을 fan-out합니다. 알림을 지원하지 않는 legacy 클라이언트도 다음 `tools/list` 요청에서 최신 Registry를 받습니다. Provider의 실행/종료나 Tool 목록 변경 때문에 WSR 자체를 다시 시작할 필요는 없습니다.

---

## 프로젝트 작업 인계와 재개

WSR은 Codex, ChatGPT/WSR 등 서로 다른 AI 작업 환경 사이에서 **대화 기록이 아니라 저장소 자체를 공통 기준**으로 사용합니다.

공통 기준은 Git 상태, `AGENTS.md`, Roadmap, TODO, Session/Handoff 문서입니다.

`workspace_context`는 등록된 Workspace를 전환하지 않고 다음 정보를 read-only로 수집합니다.

- 현재 Git branch / HEAD / dirty 상태 / 최근 commit
- `AGENTS.md` 또는 `AGENT.md`
- Roadmap
- 최근 Session/Handoff 문서
- TODO 문서

`workspace_resume`는 이 정보를 다시 해석해 작업 재개에 필요한 힌트를 구조화합니다.

```text
workspace_context(workspace="ec")
workspace_resume(workspace="ec")

→ branch/session 불일치 경고
→ dirty 변경 영역 요약
→ Roadmap의 다음 작업
→ 최신 handoff 기준 resume summary
```

두 Tool 모두 대상 Workspace를 전환하거나 수정하지 않습니다. 따라서 ChatGPT에서 다른 프로젝트의 상태를 확인하면서 현재 활성 Workspace를 그대로 유지할 수 있습니다.

자세한 동작은 `docs/workspace-context.md`와 `docs/workspace-resume.md`를 참고하세요.

---

## WSR 운영 상태 진단

`wsr_status`는 여러 개의 진단 Tool을 따로 호출하지 않고 WSR의 핵심 운영 상태를 한 번에 확인하는 read-only Tool입니다.

주요 정보:

- WSR version / Git commit / uptime / Node version
- active Workspace와 등록 Workspace 수
- Provider 연결 상태와 Tool 개수
- Browser manager 초기화/페이지 상태
- cloudflared 설치 및 버전
- public endpoint, OAuth, static auth, Tunnel token의 **설정 여부**
- 운영상 주의가 필요한 warning

응답에는 실제 token/password/cookie/session 값이나 Provider raw error를 포함하지 않습니다. WSR 시작 로그와 Tunnel 연결 로그 역시 Bearer token 원문을 출력하지 않습니다.

자세한 내용은 `docs/wsr-status.md`를 참고하세요.

---

## Multi-Workspace

여러 프로젝트를 하나의 WSR에서 관리할 수 있습니다.

```env
MCP_WORKSPACE_ROOTS=game:D:\Godot\MyGame,tools:D:\project\tools,reference:D:\project\reference
MCP_WORKSPACE_ROOT=D:\Godot\MyGame
```

현재 활성 Workspace는 기본 작업 대상으로 사용하고, 다른 등록 Workspace는 교차 Workspace 기능을 통해 읽기/검색/분석/복사 중심으로 사용할 수 있습니다.

활성 Workspace 상태는 MCP 세션별로 독립됩니다. 따라서 서로 다른 ChatGPT 채팅에서 각각 `game`, `tools`처럼 다른 Workspace를 선택해도 `switch_workspace` 상태가 다른 채팅으로 전파되지 않습니다. MCP 2025-era는 `Mcp-Session-Id`, ChatGPT의 MCP 2026-07-28 연결은 `x-openai-session`을 기준으로 세션을 구분합니다.

Workspace 경계를 벗어난 파일 및 명령 접근은 SandboxGuard가 차단합니다. 세부 구현은 `docs/session-scoped-workspaces.md`를 참고하세요.

---

## Playwright

Playwright가 통합되어 실제 브라우저를 MCP를 통해 조작할 수 있습니다.

```text
ChatGPT
   ↓
"브라우저에서 페이지를 열고 버튼을 눌러줘"
   ↓
WSR
   ↓
Playwright
   ↓
실제 브라우저
```

지원 예:

- URL 이동
- 요소 클릭
- 입력/폼 작성
- 키보드 입력
- 페이지 내용 조회
- JavaScript 평가
- 스크린샷
- 브라우저 세션 관리

---

## 설치

```cmd
git clone <repository-url>
cd windows-scoped-remote-mcp-server
npm install
copy .env.example .env
npm run build
npm test
```

Windows에서는 CMD/PowerShell용 `start.bat`와 Git Bash용 `start.sh`를 모두 지원합니다.

```cmd
start.bat
```

```bash
./start.sh
# 또는
bash start.sh
```

두 시작 스크립트는 `bin\cloudflared.exe`가 없으면 최신 Windows 64-bit 바이너리를 내려받습니다. 바이너리가 준비된 뒤에는 현재 버전을 표시하고 `cloudflared update`로 공식 업데이트 서버를 확인합니다. 업데이트 확인이 실패해도 기존 바이너리로 WSR 시작을 계속합니다.

WSR의 Windows 기본 셸은 자동으로 선택됩니다. Git Bash가 설치되어 있으면 PATH 등록 여부와 관계없이 일반적인 Git for Windows 설치 경로까지 탐색해 Git Bash를 우선 사용합니다. Git Bash를 찾지 못하면 PowerShell 7(`pwsh`)을 사용하며, PowerShell 7도 없으면 `winget`으로 설치를 시도합니다.

---

## 주요 환경변수

| 변수                              | 기본값                      | 설명                                   |
| :-------------------------------- | :-------------------------- | :------------------------------------- |
| `MCP_PORT`                        | `12000`                     | WSR HTTP 서버 포트                     |
| `MCP_WORKSPACE_ROOT`              | 현재 경로                   | 활성 Workspace                         |
| `MCP_WORKSPACE_ROOTS`             | `MCP_WORKSPACE_ROOT`        | Multi-Workspace 목록                   |
| `MCP_AUTH_TOKEN`                  | 없음                        | 인증용 토큰                            |
| `MCP_PUBLIC_URL`                  | 없음                        | 공개 MCP URL                           |
| `CLOUDFLARE_TUNNEL_TOKEN`         | 없음                        | Cloudflare Tunnel 토큰                 |
| `MCP_BROWSER_HEADLESS`            | `false`                     | Playwright Headless 여부               |
| `MCP_PROVIDER_HEALTH_INTERVAL_MS` | `10000`                     | 연결된 Provider 검사 주기(ms)          |
| `MCP_PROVIDER_RETRY_INTERVAL_MS`  | `5000`                      | 연결되지 않은 Provider 재연결 주기(ms) |
| `MCP_GODOT_ENABLED`               | `false`                     | Godot MCP Provider 활성화              |
| `MCP_GODOT_URL`                   | `http://127.0.0.1:8000/mcp` | Godot MCP endpoint                     |

민감한 토큰과 비밀번호는 `.env`에만 저장하고 Git에 커밋하지 마세요.

---

## 개발

```cmd
npm run typecheck
npm test
npm run build
```

MCP SDK는 v2 split package 구조를 사용합니다.

- 서버 및 `createMcpHandler`: `@modelcontextprotocol/server`
- Node/Express adapter: `@modelcontextprotocol/node`
- Remote Provider client: `@modelcontextprotocol/client`
- 기존 내장 OAuth Authorization Server 호환 계층: `@modelcontextprotocol/server-legacy/auth`

마지막 항목은 공식 v1→v2 마이그레이션 브리지이며 deprecated 상태입니다. discovery 복구와 기존 OAuth 동작 보존을 위해 유지하되, 장기적으로는 전용 OAuth/IdP 라이브러리로 분리해야 합니다.

새 MCP Provider를 추가할 때는 다음 문서를 먼저 읽는 것을 권장합니다.

- `AGENTS.md` — 프로젝트 작업 규칙
- `docs/mcp-gateway-architecture.md` — Gateway / Provider 구조
- `docs/workspace-context.md` — Workspace 작업 상태 수집
- `docs/workspace-resume.md` — 작업 재개 힌트
- `docs/provider-tool-change-notifications.md` — Provider Tool 변경 알림
- `docs/wsr-status.md` — WSR 운영 진단
- `skills/add-remote-mcp-provider/SKILL.md` — MCP 추가 절차
- `skills/test-mcp-provider/SKILL.md` — Provider 테스트
- `skills/debug-mcp-gateway/SKILL.md` — MCP 문제 해결

---

## 실제 검증 사례

현재 WSR은 Godot MCP와 실제 연결하여 다음 작업을 검증했습니다.

```text
ChatGPT
  ↓
WSR
  ↓
Godot MCP
  ↓
Godot Editor
  ↓
Scene 생성 / 수정 / 저장
```

테스트 Scene:

```text
res://mcp_test.tscn

McpTest (Node3D)
├── TestCube (MeshInstance3D)
├── Camera3D
└── DirectionalLight3D
```

이 흐름은 WSR이 단순한 파일 MCP가 아니라 실제 개발 도구를 연결하는 Gateway라는 것을 보여주는 대표적인 테스트 사례입니다.

---

## 보안 원칙

WSR은 개발 자동화를 위해 강력한 기능을 제공하므로 다음 원칙을 중요하게 취급합니다.

- Workspace 외부 접근을 SandboxGuard로 제한합니다.
- 다른 Workspace를 수정하지 않도록 교차 Workspace 권한을 분리합니다.
- 인증 토큰과 Cloudflare Tunnel 토큰을 소스 코드에 저장하지 않으며, 운영 로그에도 Bearer token 원문을 출력하지 않습니다.
- 보안 기능을 절대적인 안전 보장으로 표현하지 않고 설정된 경계와 권한 모델을 기준으로 설명합니다.
- 원격 MCP Provider 하나의 장애가 전체 Gateway 장애로 이어지지 않도록 격리합니다.

---

## License

MIT License

## PostgreSQL MCP (CrystalDBA)

WSR은 Remote MCP Provider별로 transport를 선택할 수 있습니다. 현재 검증된 구성은 다음과 같습니다.

| Provider | Endpoint | Transport | Tools |
| --- | --- | --- | ---: |
| Godot | `http://127.0.0.1:8000/mcp` | Streamable HTTP | 45 |
| PostgreSQL (CrystalDBA postgres-mcp) | `http://127.0.0.1:10021/sse` | legacy SSE | 9 |

PostgreSQL Provider를 활성화하려면 루트 `.env`에 다음 값을 설정합니다.

```env
MCP_POSTGRESQL_ENABLED=true
MCP_POSTGRESQL_URL=http://127.0.0.1:10021/sse
```

Docker 실행 환경은 `mcp-servers/postgres-mcp/`에 있으며 실제 `DATABASE_URI`는 해당 디렉터리의 `.env`에만 둡니다. DB 비밀번호나 실제 연결 문자열은 Git에 커밋하지 않습니다.

PostgreSQL MCP가 제공하는 9개 도구는 WSR namespace 적용 후 `postgresql_*` 형태로 노출됩니다. 실제 연결에서는 `list_schemas`, `list_objects`, `get_object_details`, `explain_query`, `analyze_workload_indexes`, `analyze_query_indexes`, `analyze_db_health`, `get_top_queries`, `execute_sql`을 확인했습니다.

자세한 설치/운영 방법은 `docs/postgresql-mcp-provider.md`와 `mcp-servers/postgres-mcp/README.md`를 참고하세요.
