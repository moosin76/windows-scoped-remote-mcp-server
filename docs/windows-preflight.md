# Windows preflight (WSR)

WSR의 Windows `start.bat`은 Node.js 24+ 여부를 먼저 검사하고, `uv` 설치 이후 `node scripts/preflight.mjs --fix`를 수행합니다. 스크립트 단독 실행은 **진단 전용**이며 `--fix`는 uv가 관리하는 Python 3.12를 설치하거나 Godot MCP 실행 패키지를 준비할 때만 사용합니다.

- Git / Node.js / npm / uv: 존재 및 버전 점검. Git과 Node.js 누락 시 공식 설치 안내를 표시합니다. Node.js 누락 상황에서는 스크립트를 실행할 수 없으므로 배치 실행기에서 선검사합니다.
- VC++ x64 Runtime: Windows HKLM 레지스트리의 Visual Studio 14.0 VC Runtimes x64 Installed 플래그를 확인합니다. 누락되어도 관리자 권한으로 조용히 설치하지 않고 Microsoft 공식 링크를 안내합니다.
- Python: 시스템 Python 버전과 무관하게 uv의 3.12 런타임을 사용합니다. Godot MCP 시작 명령에 `--python 3.12 --link-mode copy`가 적용됩니다. Blender MCP 역시 Python 3.12 환경을 사용합니다.
- Godot AI: `.env`의 `MCP_GODOT_ENABLED=true`일 때만 준비합니다. `MCP_GODOT_VERSION=auto`는 PyPI 최신 안정 배포를 24시간마다 확인하고 Python 3.12에서 실행 검증 후 `.godot-mcp-version.json`에 검증 버전을 저장합니다. 새 패키지 설치에 실패하거나 PyPI 연결이 안 되면 기존에 검증된 버전을 유지합니다. 예: `MCP_GODOT_VERSION=4.3.0`으로 명시하면 버전을 고정합니다. 업데이트와 에디터 애드온 설치는 별개이며 해당 에디터 프로젝트의 미완료 업데이트 백업을 자동 삭제하지 않습니다.
- Rust/Cargo / Visual Studio Build Tools: 바퀴(wheel) 패키지 설치로 충분하면 시스템에 설치하지 않습니다. 빌드가 꼭 필요한 패키지는 오류를 보고하고 별도 승인을 받습니다.
- 재시도/안전성: uv 캐시나 백업을 전역 삭제하지 않고 실패 내용을 남긴 뒤 WSR 자체 기동은 계속 진행합니다. 사용자가 수동 설치 후 재검사를 실행할 수 있습니다.

명령:

```bat
node scripts\preflight.mjs
node scripts\preflight.mjs --fix
```

주의: `--fix`에 의한 Python 패키지 다운로드는 네트워크가 필요합니다. 관리 권한이 필요한 VC++/시스템 도구 설치는 사용자 승인이 필요합니다.
