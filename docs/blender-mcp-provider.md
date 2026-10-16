# Blender Lab 공식 MCP Provider

## 목적

WSR에서 **Blender Lab 공식 MCP**를 `blender_*` 이름으로 연결한다. 기존 커뮤니티 `ahujasid/blender-mcp`와 다른 제품이므로 두 애드온을 혼용하지 않는다.

- Blender 확장 기능: Blender Lab `MCP` (검증 버전 1.0.3)
- 서버 소스: https://projects.blender.org/lab/blender_mcp
- 공식 MCP 서버: Git 태그 `v1.0.3`의 `mcp/` Python 프로젝트
- 실행: `uvx --python 3.12 --link-mode copy --from "git+https://projects.blender.org/lab/blender_mcp.git@v1.0.3#subdirectory=mcp" blender-mcp --transport stdio`
- Blender 기본 소켓: `127.0.0.1:9876`

## 연결 구조

```text
ChatGPT → WSR Gateway → StdioClientTransport
                         → uvx (Python 3.12, Blender Lab 공식 MCP)
                         → Blender Lab 애드온 TCP socket 127.0.0.1:9876
                         → Blender
```

`9876`은 **Blender 애드온 소켓 포트**이지 MCP HTTP 엔드포인트가 아니다. WSR의 `MCP_BLENDER_HOST` / `MCP_BLENDER_PORT`는 공식 서버 프로세스의 `BLENDER_MCP_HOST` / `BLENDER_MCP_PORT`로 전달한다. `--host` / `--port` 명령줄 옵션은 공식 서버의 별도 HTTP transport에 해당하므로 소켓 연결 설정과 혼동하지 않는다.

## 설치와 설정

1. Blender `Edit → Preferences → Get Extensions`에서 Blender Lab Extensions 저장소(`https://lab.blender.org/`)를 등록하고, 공식 `MCP` 확장 기능을 설치·활성화한다.
2. 애드온 Preferences에서 `Host: localhost`, `Port: 9876`, `Server is running`을 확인한다. Auto Start를 사용할 수 있다.
3. uv/uvx 및 Python 3.12를 설치한다. `uv python install 3.12` 명령을 사용할 수 있다.
4. WSR 루트 `.env`에 아래 값을 사용한다.

```env
MCP_BLENDER_ENABLED=true
MCP_BLENDER_COMMAND=uvx
MCP_BLENDER_VERSION=1.0.3
MCP_BLENDER_HOST=127.0.0.1
MCP_BLENDER_PORT=9876
```

`MCP_BLENDER_VERSION`은 설치된 공식 Blender Lab 애드온 버전과 맞춰 지정한다. 공식 태그 버전이 실제 저장소에 존재해야 한다. WSR은 특정 사용자 계정 경로를 저장하지 않으며 시작 스크립트에서 `uvx` 실행 가능 여부를 확인한다. 공식 서버의 Python을 3.12로 고정하여 Python 3.15 등 신규 릴리스에서 wheel 부재로 빌드 실패하는 문제를 방지한다.

## 검증

- Blender를 연 상태에서 공식 애드온의 `Server is running` 확인
- WSR Provider 상태 `blender.connected=true` 확인
- `blender_get_objects_summary` 호출, 장면 오브젝트 표시 확인
- 공식 MCP v1.0.3은 2026-10-16 테스트에서 **26개 도구**를 반환했다. 예전 커뮤니티 MCP의 28개 도구와 이름/기능이 다르다.
- WSR Provider Registry는 정상 연결 시 `tools/list`를 다시 가져와 저장된 도구 스냅샷을 갱신한다.
- Blender 애드온을 종료한 뒤 기존 도구 호출이 실패해도 WSR 본체는 유지되어야 하며 재시작 시 Provider가 자동 복구되어야 한다.
- 로컬에서 읽기 검증 후 ChatGPT 원격 MCP 도구 목록 새로고침을 수행한다.

## 실제 연결 검증 (2026-10-16)

Windows 11 / Blender 5.2 / Blender Lab 공식 MCP 1.0.3에서 `uvx --python 3.12`로 공식 stdio 서버를 시작하고 SDK `Client.listTools()`가 26개 도구를 돌려주는 것을 확인했다. `get_objects_summary` 읽기 호출에서는 `Scene` 및 `Camera`, `Cube`, `Light`가 반환되었다. WSR 서버 재시작 후 `mcp_provider_status`에서 Blender Provider 연결 및 26개 도구가 확인되었고, `mcp_provider_call(blender_get_objects_summary)`를 통해 실제 장면 조회도 성공했다. Blender 프로그램을 종료하면 공식 MCP 서버가 연결되어 있어도 애드온 소켓(9876)은 닫혀 장면 조회가 실패한다. 이 경우 Blender를 실행하고 애드온 서버를 시작하면 된다.

## 주의

공식 MCP는 `execute_blender_code` 등 Blender 내부에서 Python을 실행하는 강력한 도구를 제공한다. WSR의 접근 제어를 유지하고 신뢰할 수 있는 클라이언트만 사용한다. `main` 병합 및 다른 프로젝트 수정은 별도 지시가 없는 한 하지 않는다.

공식 소스: https://projects.blender.org/lab/blender_mcp
