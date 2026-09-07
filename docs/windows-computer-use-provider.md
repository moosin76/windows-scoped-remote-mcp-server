# Windows Computer Use MCP Provider

## 목적

WSR에서 CursorTouch/Windows-MCP를 local stdio Provider로 실행해 일반 Windows 데스크톱 UI를 관찰하고 조작한다.

이 Provider의 주 역할은 WSR이 이미 잘하는 파일/셸/프로세스/브라우저 자동화를 대체하는 것이 아니라, 그 사이에 남아 있던 **Windows Native Desktop UI**를 보완하는 것이다.

대표 사용 예:

```text
Blender MCP로 bpy 모델링 스크립트 실행
  ↓
Blender viewport / Windows Screenshot으로 결과 관찰
  ↓
시각 분석
  ↓
가능하면 Blender MCP로 수정 스크립트 실행
  ↓
필요한 경우에만 Windows UI Automation으로 Blender UI 직접 조작
  ↓
재캡처 / 재검증
```

## 실행 구조

Windows-MCP 소스를 WSR 저장소의 `mcp-servers/`에 복사하지 않는다.

```text
WSR
 ↓ stdio
uvx windows-mcp serve
 ↓
Windows UI Automation / mouse / keyboard / screenshot
 ↓
현재 로그인된 Windows Desktop Session
```

`uvx`는 첫 실행 시 PyPI의 `windows-mcp`와 의존성을 자동으로 내려받아 캐시한다. 이후 WSR이 Provider를 시작할 때 캐시된 환경을 재사용한다. WSR이 종료되면 stdio child process도 함께 종료된다.

현재 PC에서는 실제 첫 실행에서 Windows-MCP 의존성 설치와 tool discovery까지 확인했다.

## 기본 Tool Allowlist

WSR은 다음 13개 Windows-MCP 도구만 기본 노출한다.

```text
DisplayInventory
Snapshot
Screenshot
Click
Type
Scroll
Move
Shortcut
Wait
WaitFor
MultiSelect
MultiEdit
Clipboard
```

WSR namespace 적용 후에는 다음과 같은 이름으로 노출된다.

```text
windows_DisplayInventory
windows_Snapshot
windows_Screenshot
windows_Click
...
```

### 기본 제외 Tool

다음 Windows-MCP 도구는 기본 allowlist에서 제외한다.

```text
App
PowerShell
FileSystem
Process
Notification
Registry
Scrape
```

이유:

- `PowerShell`, `FileSystem`, `Process`: WSR Core가 이미 Workspace/Sandbox 경계와 함께 제공한다.
- `Scrape`: 웹 자동화는 WSR Playwright를 우선한다.
- `Registry`: 권한 범위가 넓고 현재 Visual Agent Loop에는 불필요하다.
- `App`: Windows-MCP upstream이 비영어 Windows에서 비활성화를 권장한다. 현재 PC는 한국어 Windows이므로 WSR의 프로세스/셸 기능으로 앱을 실행하고 Windows-MCP는 열린 앱의 UI 조작에 집중한다.
- `Notification`: 현재 개발 자동화 핵심 흐름에는 필요하지 않다.

필요한 Tool이 생기면 `MCP_WINDOWS_TOOLS` allowlist에 명시적으로 추가한다.

## 환경 설정

`.env.example` 기본값:

```env
MCP_WINDOWS_ENABLED=false
MCP_WINDOWS_COMMAND=uvx
MCP_WINDOWS_TOOLS=DisplayInventory,Snapshot,Screenshot,Click,Type,Scroll,Move,Shortcut,Wait,WaitFor,MultiSelect,MultiEdit,Clipboard
```

현재 개발 PC의 `.env`에서는 `MCP_WINDOWS_ENABLED=true`이며 `MCP_WINDOWS_COMMAND`는 로컬 `uvx.exe` 절대경로를 사용한다. 실제 사용자 경로나 비밀값은 Git에 커밋하지 않는다.

Provider가 Windows-MCP child process에 전달하는 환경:

```text
PYTHONUTF8=1
ANONYMIZED_TELEMETRY=false
WINDOWS_MCP_DISABLE_FLASH=1
```

- `PYTHONUTF8=1`: 한국어 Windows의 CP949 콘솔에서 Unicode help/log 출력이 깨지는 문제를 피한다.
- `ANONYMIZED_TELEMETRY=false`: upstream 익명 telemetry를 비활성화한다.
- `WINDOWS_MCP_DISABLE_FLASH=1`: screenshot 시 화면 테두리 flash overlay를 끈다.

## 관찰 우선순위

Visual Agent Loop에서는 다음 우선순위를 사용한다.

```text
1. 대상 앱의 전용 MCP/API
2. 구조화된 상태 조회
3. Screenshot + Vision
4. Windows UI Automation Snapshot
5. 좌표 기반 mouse/keyboard
```

Blender 예:

```text
blender_execute_blender_code
  ↓
blender_get_scene_info / blender_get_object_info
  ↓
blender_get_viewport_screenshot
  ↓
필요시 windows_Screenshot / windows_Snapshot
  ↓
필요시 windows_Click / windows_Type / windows_Shortcut
```

Windows-MCP를 먼저 사용해 마우스로 Blender를 모델링하는 방식은 기본 전략이 아니다. Blender MCP/Python으로 가능한 조작은 전용 API를 우선한다.

## 실제 Smoke Test

2026-09-07 현재 개발 PC에서 직접 확인:

- `uvx windows-mcp --help` 최초 실행 시 패키지/의존성 자동 설치
- `uvx windows-mcp serve --help` 성공 (`PYTHONUTF8=1` 적용)
- 전체 upstream tool 20개 discovery 성공
- 기본 allowlist 13개만 `tools/list`에 남는 것 확인
- `DisplayInventory` 실제 호출 성공
  - primary display: `3840x2160`
  - effective DPI: `144`
  - Windows scale: `1.5`
- `Screenshot(display=[0])` 실제 호출 성공
  - image/png 반환 확인
  - 원본 desktop size `3840x2160`
  - Windows-MCP가 좌표 변환용 screenshot scale metadata를 반환하는 것 확인

## 보안 원칙

Windows Computer Use는 현재 로그인된 사용자 데스크톱을 실제로 조작한다. 따라서 다음 원칙을 유지한다.

- Windows-MCP HTTP transport는 사용하지 않고 local stdio만 사용한다.
- Tool allowlist를 기본 최소권한으로 유지한다.
- 파일/프로세스/PowerShell은 Windows-MCP가 아니라 WSR의 기존 Sandbox/Workspace 도구를 우선한다.
- 화면 조작보다 전용 API/MCP 호출을 우선한다.
- 파괴적이거나 확인이 어려운 Desktop UI 조작은 필요할 때만 수행한다.

## Upstream

- CursorTouch/Windows-MCP
- PyPI package: `windows-mcp`
- 실행: `uvx windows-mcp serve`

Upstream CLI/tool 목록은 변경될 수 있으므로 Provider 업데이트 시 실제 `--help`와 `tools/list`를 다시 검증한다.
