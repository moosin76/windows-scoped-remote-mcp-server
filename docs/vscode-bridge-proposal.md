# VS Code 연동 / Terminal Bridge 구상

> 상태: **아이디어/설계 후보 — 아직 구현하지 않음**
>
> 이 문서는 향후 WSR의 VS Code 연동 기능을 개발할 때 참고하기 위한 사전 검토 문서다. 현재 단계에서는 실제 Extension이나 WSR API를 만들지 않는다.

## 1. 목적

사용자가 VS Code에서 직접 실행한 개발 프로세스와 터미널 정보를 WSR이 관찰할 수 있게 한다.

현재 WSR이 직접 실행한 프로세스는 stdout/stderr를 관리하는 방향으로 확장할 수 있지만, 사용자가 VS Code의 통합 터미널에서 직접 실행한 프로세스는 WSR이 그 터미널의 화면/출력을 자동으로 알 수 없다.

이를 해결하기 위해 **VS Code Extension을 Bridge/Companion으로 두고 WSR과 연결하는 방식**을 검토한다.

핵심 목표:

- VS Code 터미널에서 실행한 프로세스 발견
- Terminal ID와 Process ID(PID) 추적
- 프로세스 상태 확인
- 터미널 출력(stdout/stderr 또는 VS Code가 제공하는 terminal output) 수집
- 최근 로그를 WSR을 통해 LLM이 조회할 수 있도록 연결
- 향후 열린 파일, Workspace, 디버깅 상태 등 VS Code 전용 정보로 확장

## 2. 예상 구조

```text
                         ChatGPT / LLM
                              │
                              ▼
                       WSR MCP Gateway
                              │
             ┌────────────────┴────────────────┐
             │                                 │
       기존 WSR 기능                    VS Code Bridge
             │                                 │
   ┌─────────┼──────────┐              ┌───────┼────────┐
   │         │          │              │       │        │
 Files    Processes  Playwright     Terminal  Files   Debug
   │                    │              │
   └────── Remote MCP ──┘              │
          │                            │
     Godot / Blender             VS Code Terminal
                                      │
                                  Process / PID
```

VS Code Extension은 WSR 전체를 대체하지 않는다. **VS Code 안에서만 알 수 있는 상태를 WSR에 전달하는 Bridge** 역할을 담당한다.

## 3. 핵심 아이디어

### Terminal ID + Process ID를 함께 관리

PID만 저장하는 것보다 VS Code Terminal ID와 PID를 함께 관리하는 것을 권장한다.

예상 정보:

```json
{
  "terminalId": "...",
  "processId": 12345,
  "name": "Godot Server",
  "cwd": "D:\\Godot\\game",
  "command": "godot --path D:\\Godot\\game",
  "shell": "powershell",
  "status": "running",
  "startTime": "..."
}
```

PID는 프로세스 자체를 추적하고, Terminal ID는 어떤 VS Code 터미널에서 실행된 것인지 추적하는 용도로 사용한다.

## 4. 로그 수집 방식

### 중요한 점

PID만 가지고는 나중에 해당 프로세스의 VS Code 터미널 화면을 그대로 읽을 수 있다고 가정하면 안 된다.

따라서 Extension이 **프로세스/터미널이 시작된 시점부터 필요한 출력을 수집하거나 관찰할 수 있는 구조**를 먼저 검증해야 한다.

예상 구조:

```text
VS Code Terminal
      │
      ▼
WSR Bridge Extension
      │
      ├── terminalId
      ├── processId
      ├── status
      ├── stdout/log buffer
      ├── stderr/error buffer
      └── exit status
             │
             ▼
          WSR API
             │
             ▼
          MCP tools
             │
             ▼
            LLM
```

단, VS Code Extension API가 실제로 어느 수준까지 통합 터미널의 출력물을 안정적으로 제공하는지는 **구현 전에 공식 API 기준으로 검증해야 한다.** 지원하지 않는 것을 가정하여 설계하지 않는다.

## 5. 예상 MCP/Bridge 기능

향후 실제 설계 시 다음 기능을 검토한다.

```text
vscode_list_terminals
vscode_get_terminal
vscode_get_process
vscode_get_terminal_logs
vscode_get_terminal_errors
vscode_list_processes
vscode_get_workspace
```

이름은 실제 구현 단계에서 WSR의 namespace 규칙에 맞춰 결정한다.

예상 사용 흐름:

```text
사용자:
"현재 실행 중인 개발 서버 확인해줘"

LLM
 ↓
VS Code Bridge
 ↓
Terminal / Process Registry
 ↓
현재 프로세스와 상태 반환
```

또는:

```text
사용자:
"방금 실행한 Godot 서버 로그에 에러가 있는지 확인해줘"

LLM
 ↓
VS Code Bridge
 ↓
Godot Terminal
 ↓
최근 로그 / 에러
 ↓
WSR + Godot MCP
 ↓
코드 분석 및 수정
```

## 6. 추천 로그 API 개념

실제 개발 시 `process_logs` 또는 동등한 API를 다음과 같이 설계하는 것을 검토한다.

```text
process_logs(
    processId,
    lines = 100,
    stream = "all"
)
```

가능한 stream:

- `stdout`
- `stderr`
- `all`

추가로 다음도 검토한다.

- 최근 N줄
- 최근 N초
- 특정 시간 이후 로그
- error/warning 필터
- 프로세스 종료 여부
- exit code

로그 전체를 무제한 보관하지 않고 **최근 로그 버퍼 + 필요 시 제한된 조회** 방식으로 운영하는 것을 권장한다.

## 7. WSR과의 역할 분리

### WSR

- MCP Gateway
- Sandbox / Workspace 접근 제어
- 파일 시스템
- PowerShell / 프로세스 관리
- Playwright
- Remote MCP Provider
- VS Code Bridge가 제공하는 정보를 LLM에게 전달하는 역할

### VS Code Extension

- VS Code 내부 상태 관찰
- Terminal 식별
- Terminal/Process 관계 추적
- 가능한 범위의 Terminal output 수집
- Workspace/editor/debugging 등 VS Code 전용 상태 제공
- WSR과의 연결/인증 관리

이렇게 분리하면 향후 다른 IDE에도 별도의 Bridge를 붙일 수 있다.

```text
WSR
 ├── VS Code Bridge
 ├── JetBrains Bridge (future)
 └── Other IDE Bridge (future)
```

## 8. 개발 전에 반드시 검증할 것

실제 구현을 시작할 때는 먼저 아래 사항을 조사한다.

1. VS Code Extension API에서 통합 터미널 목록을 조회할 수 있는 범위
2. Terminal ID/Terminal 객체의 수명과 안정적인 식별 방법
3. `Terminal.processId`로 얻는 PID의 의미와 사용 가능 시점
4. 사용자가 직접 입력/실행한 shell 명령을 Extension이 안정적으로 감지할 수 있는지
5. 통합 터미널의 stdout/stderr를 공식 API만으로 수집할 수 있는지
6. Shell Integration API가 이 목적에 어떤 기능을 제공하는지
7. 출력 수집이 불가능한 경우 어떤 대체 방법이 있는지
8. Windows PowerShell/CMD와 Git Bash 등 shell별 차이
9. WSR과 Extension 사이 통신 방식
10. 인증 및 localhost 보안
11. Workspace별 권한 및 Sandbox 경계
12. Extension이 종료되거나 VS Code가 재시작되었을 때 Registry 정리/복구

## 9. 권장 개발 순서

이 기능은 바로 코딩하지 않고 다음 순서로 진행한다.

### Phase 0 — 조사

- VS Code 공식 Extension API 조사
- Terminal / Shell Integration / Process 관련 API 검증
- 최소 PoC Extension으로 실제 출력 수집 가능 여부 확인

### Phase 1 — Bridge PoC

아주 작은 Extension을 만들어:

```text
VS Code
 └─ Terminal
      ↓
 Extension
      ↓
 terminalId / PID / 상태
```

를 수집한다.

### Phase 2 — 로그 PoC

실제:

```text
npm run dev
```

등을 실행하여 로그를 수집할 수 있는지 검증한다.

### Phase 3 — WSR 연결

Bridge → WSR의 명확한 API를 정의한다.

예상:

```text
POST /api/vscode/register
POST /api/vscode/heartbeat
POST /api/vscode/terminal-events
GET  /api/vscode/terminals
GET  /api/vscode/terminals/:id/logs
```

실제 API는 보안 검토 후 결정한다.

### Phase 4 — MCP 노출

LLM이 사용할 MCP tool을 추가한다.

### Phase 5 — 보안/권한

- Extension 인증
- Workspace 경계
- 로그 민감정보 필터링
- 토큰/API Key 노출 방지
- 연결 해제 및 재연결

### Phase 6 — 실제 개발 Workflow 테스트

예:

```text
VS Code에서 서버 실행
 → 서버 에러 발생
 → ChatGPT에게 로그 확인 요청
 → WSR이 로그 조회
 → 코드 분석
 → 수정
 → 서버 재실행
 → 로그 재확인
```

## 10. 현재 상태

**아직 구현하지 않았다.**

이번 단계에서 확인한 것은 "VS Code Extension + WSR Bridge" 방식이 기술적으로 검토할 가치가 있고, WSR의 역할과도 잘 맞는다는 것이다.

따라서 현재 WSR 코드에 VS Code 관련 기능을 임의로 추가하지 않는다.

다음에 이 기능을 개발할 때 이 문서를 먼저 읽고 **실제 VS Code API 조사 → 구현 가능 범위 확정 → 세부 플랜 작성 → PoC → 본 구현** 순서로 진행한다.

## 11. 향후 확장 가능성

VS Code Bridge가 안정화되면 단순 터미널 로그를 넘어 다음 정보도 검토할 수 있다.

- 현재 열린 파일
- 활성 editor
- 선택된 코드 영역
- Workspace 정보
- Git 상태
- 디버거 상태
- Breakpoint
- 현재 실행 중인 Task
- Problems 패널 정보
- 테스트 실행 결과

다만 이 모든 기능을 한 번에 만들지 않는다. **터미널/프로세스 관찰을 첫 번째 목표**로 한다.

## 12. 설계 원칙

- 이 기능은 WSR Core와 느슨하게 결합한다.
- VS Code가 없어도 WSR은 정상 동작해야 한다.
- Extension 연결 실패가 WSR 전체 장애가 되어서는 안 된다.
- VS Code 전용 정보는 Bridge가 담당한다.
- WSR의 Sandbox 정책을 우회하는 통로로 만들지 않는다.
- PID를 안다고 해서 임의 프로세스 접근 권한을 자동 부여하지 않는다.
- 로그는 민감정보를 포함할 수 있으므로 노출 범위를 제한한다.
- 구현 전 공식 VS Code API의 실제 지원 범위를 검증한다.
