# 2026-09-07 Windows Computer Use MCP Provider

## 목표

WSR 시작 시 CursorTouch/Windows-MCP를 stdio child process로 자동 준비/실행하고, 필요할 때 Windows 화면 관찰과 Native UI 조작을 사용할 수 있게 한다.

## 브랜치

- `feature/windows-computer-use-provider`
- `feature/blender-mcp-provider`의 stdio Provider 구현 및 Blender 로그 필터 수정 위에서 분기
- 직전 Blender 로그 필터 수정은 `b533339 fix: Blender MCP INFO 로그 필터링`으로 체크포인트 완료

## 설계 결정

Windows-MCP 소스를 `mcp-servers/`에 복사하지 않는다.

```text
WSR start
  ↓
ProviderRegistry
  ↓
RemoteMcpProvider(stdio)
  ↓
uvx windows-mcp serve --tools <allowlist>
  ↓
Windows UI Automation / screenshot / mouse / keyboard
```

`uvx`가 첫 실행에서 PyPI package와 Python 의존성을 자동 다운로드/캐시하므로 별도 설치 단계가 필요 없다. 이후 WSR 수명과 함께 child process를 시작/종료한다.

## 기본 Allowlist

13개:

- DisplayInventory
- Snapshot
- Screenshot
- Click
- Type
- Scroll
- Move
- Shortcut
- Wait
- WaitFor
- MultiSelect
- MultiEdit
- Clipboard

기본 제외:

- App
- PowerShell
- FileSystem
- Process
- Notification
- Registry
- Scrape

WSR Core와 중복되는 시스템 기능은 WSR의 Sandbox/Workspace 경계를 계속 사용하고 Windows-MCP는 Desktop UI에 집중한다. 한국어 Windows 환경 때문에 upstream 권고에 따라 App도 기본 제외했다.

## 구현

- `src/config.ts`
  - `MCP_WINDOWS_ENABLED`
  - `MCP_WINDOWS_COMMAND`
  - `MCP_WINDOWS_TOOLS`
- `src/providers/provider-factory.ts`
  - id/namespace `windows`
  - stdio command `uvx windows-mcp serve`
  - `--tools` allowlist 전달
  - `PYTHONUTF8=1`
  - `ANONYMIZED_TELEMETRY=false`
  - `WINDOWS_MCP_DISABLE_FLASH=1`
  - stdio stderr는 warnings-only
- `.env.example` Windows Provider 섹션 추가
- 로컬 `.env`에서 Provider 활성화 및 로컬 `uvx.exe` 절대 경로 설정
- `test/windows-mcp-provider.test.ts` 추가
- README / MCP gateway architecture / roadmap 업데이트
- `docs/windows-computer-use-provider.md` 추가

## 실제 Upstream 확인

현재 설치된 PyPI package를 `uvx`로 직접 실행해 확인했다.

- `windows-mcp` CLI는 `serve` subcommand 사용
- `serve --tools` / `--exclude-tools` 지원
- stdio가 기본 transport
- 현재 전체 tool discovery: 20개
- `--tools`로 WSR 기본 allowlist 13개만 남기는 것 확인

한국어 Windows CP949 환경에서는 `windows-mcp serve --help`가 Unicode em dash 출력 때문에 `UnicodeEncodeError`가 발생했다. `PYTHONUTF8=1` 적용 시 정상 동작하므로 Provider 환경에 항상 전달한다.

## 실제 Desktop Read Smoke

- `DisplayInventory` 성공
  - primary display 3840x2160
  - effective DPI 144
  - scale 1.5
- `Screenshot(display=[0])` 성공
  - PNG image content 반환
  - 원본 3840x2160
  - screenshot coordinate scale metadata 반환 확인

## 검증 결과

- `npm run typecheck` 성공
- `npm test` 성공: 17 files / 56 tests
- `npm run build` 성공
- `git diff --check` 성공
- factory + 실제 local `.env` 기반 Windows Provider 연결 성공
  - `connected=true`
  - `toolCount=13`
  - WSR namespace 적용된 `windows_*` 13개 확인
  - `windows_DisplayInventory` 실제 Provider call 성공

## 재시작 후 남은 검증

1. WSR 재시작
2. `mcp_provider_status`에서 `windows` connected 확인
3. WSR를 통해 `windows_DisplayInventory` / `windows_Screenshot` 실제 호출
4. 안전한 쓰기 smoke: 테스트 앱에서 Snapshot → Type 또는 Shortcut 수행

## Visual Agent Loop 방향

목표는 무조건 Windows mouse/keyboard로 앱을 조작하는 것이 아니다.

```text
Act (전용 MCP/API)
→ Observe (구조화 상태 / screenshot)
→ Analyze
→ Correct (가능하면 전용 MCP/API)
→ 필요시 Windows UI Automation fallback
→ Verify
```

Blender에서는 `blender_execute_blender_code` / scene info / viewport screenshot을 우선하고 Windows-MCP는 Add-on UI, file dialog, popup 등 전용 API로 처리하기 어려운 상황에 사용한다.
