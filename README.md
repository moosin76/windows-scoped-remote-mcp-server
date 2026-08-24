# 🛡️ Windows Scoped Remote MCP Server

Windows 환경에서 동작하는 **보안 격리형 원격 개발 MCP(Model Context Protocol) 서버**입니다.  
ChatGPT, Claude 등 최신 LLM 클라이언트와 연동하여, 대화만으로 지정된 로컬 작업 공간 내에서 **파일 생성/수정, PowerShell 명령어 실행, 프로젝트 빌드 및 디버깅**을 자율 수행할 수 있습니다.

---

## 📌 주요 특징

- **Windows 최적화 샌드박스 (`SandboxGuard`)**:
  - 지정한 `MCP_WORKSPACE_ROOT` 디렉토리 외부의 파일/폴더 접근 및 명령어 실행을 100% 원천 차단합니다.
- **ChatGPT 표준 OAuth 2.1 연동 (RFC 8414 / RFC 9728 / DCR / PKCE)**:
  - 동적 클라이언트 등록(DCR) 및 대화형 보안 승인 페이지(`/authorize`)를 제공하여, 비밀번호 토큰(`MCP_AUTH_TOKEN`)을 아는 인가된 사용자만 안전하게 연결합니다.
- **19종 풀스택 MCP 개발 도구 & OpenAPI 3.0 명세 탑재**:
  - 파일 및 디렉토리 CRUD, 패치 적용(`apply_patch`), 비동기 프로세스 및 PowerShell/CMD 실행, 상태 모니터링을 완벽 지원합니다.
- **Cloudflare Tunnel 기반 Zero Trust 통신**:
  - 복잡한 포트포워딩이나 방화벽 개방 없이 Cloudflare Tunnel을 통해 안전한 HTTPS 엔드포인트를 제공합니다.
- **프로젝트 무중단 전환 지원**:
  - `.env`에서 `MCP_WORKSPACE_ROOT`만 변경하면 기존 ChatGPT 인증 세션을 유지한 채로 작업 폴더를 즉시 전환할 수 있습니다.

---

## 🏗️ 시스템 아키텍처

```
┌────────────────────────────────────────────────────────┐
│                   ChatGPT (Web / App)                  │
└───────────────────────────┬────────────────────────────┘
                            │ HTTPS (Streamable HTTP / OAuth 2.1)
                            ▼
┌────────────────────────────────────────────────────────┐
│        Cloudflare Zero Trust Tunnel (mcp.yourdomain)   │
└───────────────────────────┬────────────────────────────┘
                            │ Local Proxy (HTTP localhost:<MCP_PORT>)
                            ▼
┌────────────────────────────────────────────────────────┐
│            Windows Scoped Remote MCP Server            │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Express Router (/mcp, /authorize, /openapi.json) │  │
│  └────────────────────────┬─────────────────────────┘  │
│                           │                            │
│  ┌────────────────────────▼─────────────────────────┐  │
│  │   SandboxGuard & ProcessManager & FileService    │  │
│  └────────────────────────┬─────────────────────────┘  │
└───────────────────────────┼────────────────────────────┘
                            │ 격리된 파일 & 명령어 실행
                            ▼
┌────────────────────────────────────────────────────────┐
│       내 로컬 작업 공간 (MCP_WORKSPACE_ROOT)            │
│      예: D:\Godot\mcp-test 또는 D:\Godot\MyGame         │
└────────────────────────────────────────────────────────┘
```

---

## 🛠️ 제공 도구 목록 (22 Tools)

| 도구명 (Tool) | 설명 |
| :--- | :--- |
| **`list_workspaces`** | 등록된 모든 다중 워크스페이스 목록, 별칭(Alias), 활성화 상태 조회 |
| **`get_active_workspace`** | 현재 활성화된 기본 작업 공간의 이름과 절대 경로 조회 |
| **`switch_workspace`** | 별칭(Alias) 또는 경로로 활성 작업 공간을 실시간 전환 |
| **`list_directory`** | 지정한 경로의 파일 및 하위 디렉토리 목록 조회 |
| **`read_file`** | 텍스트 파일 읽기 (오프셋 및 분할 읽기 지원) |
| **`write_file`** | 신규 파일 생성 및 덮어쓰기/이어쓰기 |
| **`edit_file`** | 특정 줄 번호 및 블록 단위의 정확한 코드 수정 |
| **`replace_in_file`** | 문자열 검색 및 대상 텍스트 일괄/단일 교체 |
| **`apply_patch`** | 표준 Unified Diff / Patch 형식으로 파일에 패치 적용 |
| **`make_directory`** | 신규 디렉토리 생성 |
| **`delete_file`** | 파일 및 빈 디렉토리 삭제 |
| **`move_file`** | 파일/폴더 이동 및 이름 변경 |
| **`copy_file`** | 파일/폴더 복사 |
| **`stat_path`** | 파일/폴더의 크기, 수정일, 속성 메타데이터 조회 |
| **`search_files`** | Glob 패턴으로 파일명 검색 |
| **`find_in_files`** | 파일 내부 텍스트 및 정규식 고속 검색 |
| **`exec_command`** | PowerShell 또는 CMD 명령어를 실행하고 결과 반환 |
| **`run_script`** | PowerShell, Batch, Node.js, Python 스크립트 실행 |
| **`read_process_output`** | 장기 실행 중인 백그라운드 프로세스의 출력 버퍼 읽기 |
| **`write_process_input`** | 실행 중인 프로세스의 표준 입력(stdin)으로 데이터 전송 |
| **`stop_process`** | 백그라운드 프로세스 종료 |
| **`list_processes`** | 현재 실행 중인 프로세스 목록 및 상태 조회 |

---

## ⚙️ 1. 환경 설정 가이드 (`.env`)

프로젝트 루트의 `.env.example` 파일을 복사하여 `.env` 파일을 생성한 후 설정합니다:

```cmd
copy .env.example .env
```

### 📋 주요 설정 항목 상세 설명

| 환경 변수 | 기본값 / 예시 | 필수 여부 | 설명 |
| :--- | :--- | :---: | :--- |
| **`MCP_PORT`** | `12000` | 선택 | 로컬에서 Express 서버가 실행될 포트 번호 (기본값: `12000`) |
| **`MCP_WORKSPACE_ROOTS`** | `test:C:\path\to\mcp-test, ether:C:\path\to\ether-chronicle` | **필수** | **ChatGPT가 조작할 수 있는 다중 작업 공간 (별칭:경로)** |
| **`MCP_AUTH_TOKEN`** | `your_secure_password` | **필수** | **ChatGPT OAuth 승인 페이지(`/authorize`)에서 입력할 보안 비밀번호** |
| **`MCP_PUBLIC_URL`** | `https://mcp.yourdomain.com` | **필수** | Cloudflare Tunnel을 통해 외부에 노출되는 공개 HTTPS 주소 |
| **`CLOUDFLARE_TUNNEL_TOKEN`** | `your_tunnel_token` | 선택 | Cloudflare Zero Trust 대시보드에서 발급받은 고정 터널 토큰 |
| **`MCP_DEFAULT_SHELL`** | `powershell` | 선택 | `exec_command` 실행 시 기본 쉘 (`powershell`, `cmd`, `pwsh`) |
| **`MCP_MAX_FILE_CHUNK_BYTES`** | `1048576` (1MB) | 선택 | `read_file` 1회 최대 읽기 바이트 크기 |
| **`MCP_MAX_EDIT_FILE_BYTES`** | `67108864` (64MB) | 선택 | `edit_file` / `write_file` 최대 수정 가능 파일 크기 |
| **`MCP_MAX_OUTPUT_BYTES`** | `1048576` (1MB) | 선택 | 터미널 명령어 실행 출력 버퍼 최대 크기 |

```dotenv
# [Server Port]
MCP_PORT=12000

# [Multi-Root Security & Directory Sandbox]
MCP_WORKSPACE_ROOTS=test:C:\path\to\mcp-test, ether:C:\path\to\ether-chronicle, server:C:\path\to\localRemoteMcp

# [Authentication - ChatGPT OAuth 2.1]
MCP_AUTH_TOKEN=your_secure_password_here

# [Public Domain & Cloudflare Tunnel]
MCP_PUBLIC_URL=https://mcp.yourdomain.com
CLOUDFLARE_TUNNEL_TOKEN=your_cloudflare_tunnel_token_here

# [Shell Configuration]
MCP_DEFAULT_SHELL=powershell

# [Limits - Safety Guardrails]
MCP_MAX_FILE_CHUNK_BYTES=1048576
MCP_MAX_EDIT_FILE_BYTES=67108864
MCP_MAX_OUTPUT_BYTES=1048576
```

---

## 🌐 2. Cloudflare Tunnel 및 도메인 연동

본 서버는 Cloudflare Zero Trust 터널을 통해 `.env`에 지정된 로컬 포트(`MCP_PORT`, 기본값: `12000`)를 보유하신 도메인의 서브도메인(`https://mcp.yourdomain.com`)으로 안전하게 노출합니다.

### 🔌 Cloudflare 대시보드 설정
1. [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/) ➔ **Networks** ➔ **Tunnels** 메뉴로 이동합니다.
2. **[Create a tunnel]**을 클릭하여 Cloudflared 터널을 생성합니다.
3. **Public Hostname** 추가:
   - **Subdomain**: `mcp` (또는 원하는 서브도메인)
   - **Domain**: `yourdomain.com` (보유하신 도메인 선택)
   - **Service Type**: `HTTP`
   - **URL**: `localhost:<MCP_PORT>` (예: `localhost:12000`)
4. 발급된 **터널 토큰(Token)**을 복사하여 `.env`의 `CLOUDFLARE_TUNNEL_TOKEN` 항목에 붙여넣습니다.

---

## 📦 3. Cloudflare 바이너리 (`bin/cloudflared.exe`) 안내

본 프로젝트는 터널을 자동으로 시작하기 위해 `cloudflared.exe` 바이너리를 사용합니다.

- **자동 다운로드 지원 (권장)**:
  - `start.bat` 또는 `start.ps1`을 최초 실행할 때 `bin/cloudflared.exe`가 없으면 **공식 Cloudflare GitHub Release에서 최신 바이너리를 자동으로 다운로드**하여 배치합니다.
  - 사용자가 별도로 다운로드할 필요 없이 `start.bat`만 실행하면 됩니다.
- **수동 다운로드 (오프라인 / 방화벽 환경)**:
  - 자동 다운로드가 제한된 환경인 경우, [Cloudflare 공식 릴리즈 페이지](https://github.com/cloudflare/cloudflared/releases)에서 `cloudflared-windows-amd64.exe` 파일을 다운로드한 뒤, 프로젝트 내 `bin/cloudflared.exe` 경로로 이름을 바꾸어 넣어주시면 됩니다.

---

## 🚀 4. 서버 실행 방법

### 방법 A. 원클릭 자동 실행 (`start.bat` / 권장)
`start.bat`을 더블 클릭하거나 콘솔에서 실행합니다:
```cmd
start.bat
```
*(자동으로 npm 패키지 설치 ➔ .env 확인 ➔ cloudflared 바이너리 확인 ➔ TypeScript 빌드 및 서버 + 터널을 한 번에 실행합니다)*

### 방법 B. 수동 터미널 실행
```bash
# 1. 의존성 설치
npm install

# 2. TypeScript 컴파일
npm run build

# 3. 테스트 실행
npm test

# 4. 서버 시작
npm start
```

---

## 🤖 5. ChatGPT 앱 / 플러그인 연결 가이드 (단계별)

### 1단계. ChatGPT 앱 등록
1. [ChatGPT 웹](https://chatgpt.com/)에 접속하여 **[설정] ➔ [플러그인 / 개발자 모드]**로 이동합니다.
2. **[+ 새 플러그인 / 앱 만들기]**를 클릭합니다.
3. 설정값을 다음과 같이 입력합니다:
   - **이름**: `my-remote` (또는 원하는 이름)
   - **연결 (Connection)**: `서버 URL` ➔ **`https://mcp.yourdomain.com/mcp`** (본인 도메인)
   - **인증 (Authentication)**: **`OAuth`** 선택
4. **[만들기]**를 클릭합니다.

### 2단계. 보안 로그인 승인
1. 등록된 앱 상세 화면에서 **`[연결 ➔]`** 버튼을 누릅니다.
2. 브라우저 팝업으로 **[Windows Scoped Remote MCP 승인]** 웹 페이지가 나타납니다.
3. 비밀번호 입력란에 `.env`에 설정된 **`MCP_AUTH_TOKEN`** 값을 입력하고 **[승인하고 ChatGPT로 돌아가기]**를 클릭합니다.

### 3단계. 권한 설정 ("모든 액션 허용")
- 앱 상세 화면의 **권한 (Permissions)** 옵션을 **`모든 액션 허용`**으로 설정합니다.
- *(도구를 호출할 때마다 매번 확인 팝업이 뜨지 않고 ChatGPT가 자율적으로 개발을 진행합니다)*

---

## 💬 6. 실전 대화형 개발 프롬프트 예시

새 채팅창(또는 `@ 플러그인` 채팅창)에서 다음과 같이 지시할 수 있습니다:

```text
# 1. 프로젝트 파일 목록 및 구조 파악
@my-remote 현재 작업 공간의 파일과 폴더 목록을 정리해서 보여줘

# 2. 웹 게임 / 프론트엔드 프로젝트 개발
@my-remote HTML5 Canvas로 브라우저에서 실행 가능한 레트로풍 벽돌깨기 게임(breakout.html)을 세련되게 만들어줘

# 3. Godot 4 게임 스크립트 작성
@my-remote Godot 4 기준으로 2D 캐릭터 이동, 대시, 점프 및 물리 충돌을 처리하는 Player.gd를 작성해줘

# 4. 패키지 설치 및 테스트 실행
@my-remote npm install 명령어로 필요한 라이브러리를 설치하고 npm test를 돌려 결과를 확인해줘
```

---

## 📂 7. 다중 프로젝트 관리 및 실시간 전환 방법

본 서버는 **다중 워크스페이스(Multi-Workspace)**를 지원하므로, 여러 프로젝트를 동시에 등록하고 대화 도중 실시간으로 전환할 수 있습니다.

### 방법 A. ChatGPT 대화로 실시간 전환 (서버 재부팅 없음 ⭐)
1. **현재 작업 공간 확인**:
   ```text
   @my-remote 현재 작업 공간이 어디로 설정되어 있는지 확인해줘
   ```
2. **등록된 전체 프로젝트 목록 확인**:
   ```text
   @my-remote 등록된 모든 워크스페이스 목록을 보여줘
   ```
3. **작업 공간 즉시 전환**:
   ```text
   @my-remote ether 프로젝트로 작업 공간을 전환해줘
   ```
   *(ChatGPT가 `switch_workspace(name: "ether")` 도구를 호출하여 서버 재부팅 없이 즉시 해당 프로젝트로 전환합니다)*

### 방법 B. 새 프로젝트 추가 등록 (`.env`)
1. `.env` 파일의 `MCP_WORKSPACE_ROOTS`에 새로운 프로젝트 별칭과 경로를 추가합니다:
   ```dotenv
   MCP_WORKSPACE_ROOTS=test:C:\path\to\mcp-test, ether:C:\path\to\ether-chronicle, mygame:C:\path\to\mygame
   ```
2. 터미널에서 `start.bat`을 재실행하면 추가된 프로젝트들도 즉시 접근 및 전환이 가능해집니다. (OAuth 인증 토큰 세션은 영구 보존됩니다)

---

## 🔒 8. 보안 및 문제 해결

- **Q. 외부인이 내 컴퓨터에 무단 접속할 위험은 없나요?**
  - **3중 보안 구조**로 완벽하게 보호됩니다:
    1. **비밀번호 인증**: `MCP_AUTH_TOKEN` 비밀번호를 아는 본인의 ChatGPT 계정만 접근 가능.
    2. **샌드박스 격리**: 파일 및 명령어가 오직 지정된 `MCP_WORKSPACE_ROOT` 내에서만 작동하며 상위 경로 접근 시 즉시 차단.
    3. **Cloudflare Zero Trust**: Cloudflare 대시보드에서 내 IP만 허용하는 방화벽 규칙을 추가할 수 있습니다.
- **Q. 터널이 연결되지 않거나 502 에러가 날 때**:
  - `start.bat` 창에서 로컬 서버(`port: .env의 MCP_PORT`)가 정상적으로 켜져 있는지 확인하고, 브라우저에서 `https://mcp.yourdomain.com/health`로 접속하여 `{ status: "ok" }` 응답이 나오는지 확인합니다.

---

## 📄 라이선스
MIT License
