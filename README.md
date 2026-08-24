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
- **Multi-Workspace** — 여러 프로젝트를 등록하고 활성 Workspace를 전환할 수 있습니다.
- **파일/코드 관리** — 조회, 생성, 수정, 이동, 복사, 삭제, patch 적용 등을 지원합니다.
- **PowerShell / CMD / 프로세스 관리** — 개발 명령 실행과 백그라운드 프로세스를 관리합니다.
- **Playwright 브라우저 자동화** — 실제 브라우저를 열고 탐색, 입력, 클릭, 스크린샷 등을 수행합니다.
- **Remote MCP Provider** — Godot, Blender 등 원하는 MCP를 Gateway에 추가할 수 있습니다.
- **Provider 장애 격리** — 하나의 MCP가 꺼져 있어도 WSR Core와 다른 Provider는 계속 사용할 수 있습니다.
- **Provider Scheduler** — MCP의 연결 상태와 `tools/list`를 주기적으로 확인하고 자동 재연결 및 Tool Registry 갱신을 수행합니다.
- **OAuth 2.1 / Cloudflare Tunnel 지원** — 원격 MCP 클라이언트와 안전하게 연결할 수 있는 구성을 제공합니다.

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

| MCP | Namespace 예시 |
| :--- | :--- |
| Godot | `godot_*` |
| Blender | `blender_*` |
| Browser | `browser_*` |
| 새로운 MCP | `<provider>_*` |

예를 들어 Blender MCP의 `get_scene`은 WSR에서 `blender_get_scene`으로 노출됩니다.

### MCP를 추가하는 가장 쉬운 방법

프로젝트를 받은 후 ChatGPT에게 다음처럼 요청할 수 있습니다.

```text
이 windows-scoped-remote-mcp-server 프로젝트에 Blender MCP를 추가해줘.
AGENT.md와 skills/add-remote-mcp-provider/SKILL.md를 먼저 읽고
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

현재 HTTP 계층은 MCP 요청마다 Server를 구성하는 구조이므로 다음 `tools/list` 요청에 최신 Tool Registry가 반영됩니다. 장기 세션에서 클라이언트 UI까지 즉시 알림을 보내는 `tools/list_changed` notification은 향후 세션 관리 구조와 함께 확장할 수 있습니다.

---

## Multi-Workspace

여러 프로젝트를 하나의 WSR에서 관리할 수 있습니다.

```env
MCP_WORKSPACE_ROOTS=game:D:\Godot\MyGame,tools:D:\project\tools,reference:D:\project\reference
MCP_WORKSPACE_ROOT=D:\Godot\MyGame
```

현재 활성 Workspace는 기본 작업 대상으로 사용하고, 다른 등록 Workspace는 교차 Workspace 기능을 통해 읽기/검색/분석/복사 중심으로 사용할 수 있습니다.

Workspace 경계를 벗어난 파일 및 명령 접근은 SandboxGuard가 차단합니다.

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

Windows에서는 `start.bat`를 사용하는 방법도 지원합니다.

```cmd
start.bat
```

---

## 주요 환경변수

| 변수 | 기본값 | 설명 |
| :--- | :--- | :--- |
| `MCP_PORT` | `12000` | WSR HTTP 서버 포트 |
| `MCP_WORKSPACE_ROOT` | 현재 경로 | 활성 Workspace |
| `MCP_WORKSPACE_ROOTS` | `MCP_WORKSPACE_ROOT` | Multi-Workspace 목록 |
| `MCP_AUTH_TOKEN` | 없음 | 인증용 토큰 |
| `MCP_PUBLIC_URL` | 없음 | 공개 MCP URL |
| `CLOUDFLARE_TUNNEL_TOKEN` | 없음 | Cloudflare Tunnel 토큰 |
| `MCP_BROWSER_HEADLESS` | `false` | Playwright Headless 여부 |
| `MCP_PROVIDER_HEALTH_INTERVAL_MS` | `10000` | 연결된 Provider 검사 주기(ms) |
| `MCP_PROVIDER_RETRY_INTERVAL_MS` | `5000` | 연결되지 않은 Provider 재연결 주기(ms) |
| `MCP_GODOT_ENABLED` | `false` | Godot MCP Provider 활성화 |
| `MCP_GODOT_URL` | `http://127.0.0.1:8000/mcp` | Godot MCP endpoint |

민감한 토큰과 비밀번호는 `.env`에만 저장하고 Git에 커밋하지 마세요.

---

## 개발

```cmd
npm run typecheck
npm test
npm run build
```

새 MCP Provider를 추가할 때는 다음 문서를 먼저 읽는 것을 권장합니다.

- `AGENT.md` — 프로젝트 작업 규칙
- `docs/mcp-gateway-architecture.md` — Gateway / Provider 구조
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
- 인증 토큰과 Cloudflare Tunnel 토큰을 소스 코드에 저장하지 않습니다.
- 보안 기능을 절대적인 안전 보장으로 표현하지 않고 설정된 경계와 권한 모델을 기준으로 설명합니다.
- 원격 MCP Provider 하나의 장애가 전체 Gateway 장애로 이어지지 않도록 격리합니다.

---

## License

MIT License
