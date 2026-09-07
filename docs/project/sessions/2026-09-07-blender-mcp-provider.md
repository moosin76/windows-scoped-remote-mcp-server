# 2026-09-07 Blender MCP Provider

## 목표

WSR에서 Blender MCP를 실제 프로젝트 용도로 연결한다.

## 브랜치

- `feature/blender-mcp-provider`
- `main`에서 분기
- 기존 `fix/long-exec-command`의 별도 변경은 포함하지 않음

## 확인된 Blender MCP 구조

Blender add-on의 `9876` 포트는 MCP HTTP endpoint가 아니라 Blender 내부 add-on TCP socket이다.

실제 MCP server는 `uvx blender-mcp`로 실행되는 stdio 프로세스이며 이 프로세스가 `BLENDER_HOST` / `BLENDER_PORT`를 사용해 Blender add-on에 연결한다.

```text
WSR
 ↓ stdio
uvx blender-mcp
 ↓ TCP
127.0.0.1:9876
 ↓
Blender add-on
```

## 구현

- `RemoteMcpProvider` transport에 `stdio` 추가
- stdio 설정에 `command`, `args`, `env`, `cwd` 지원
- legacy SDK의 `StdioClientTransport` 사용
- 기존 Streamable HTTP / SSE 경로 유지
- Blender Provider 등록
  - id: `blender`
  - namespace: `blender`
  - command: `uvx blender-mcp`
- 환경변수 추가
  - `MCP_BLENDER_ENABLED`
  - `MCP_BLENDER_COMMAND`
  - `MCP_BLENDER_HOST`
  - `MCP_BLENDER_PORT`
- stdio fake MCP fixture 및 회귀 테스트 추가
- README / Provider Skill / architecture / roadmap 문서 업데이트

## 로컬 설정

루트 `.env`에는 Blender Provider를 활성화했다. 실제 `uvx.exe` 절대 경로는 로컬 `.env`에만 두고 Git에는 커밋하지 않는다.

Blender add-on socket `127.0.0.1:9876`이 열린 것을 확인했다.

## Blender add-on 업데이트

초기 smoke에서 현재 Blender 프로세스가 로드한 add-on이 구 protocol이라는 경고가 확인됐다.

다음을 실행해 디스크의 add-on은 최신 protocol 5로 업데이트했다.

```bash
uvx blender-mcp install-addon
```

현재 실행 중인 Blender 프로세스는 아직 이전 add-on 코드를 메모리에 로드하고 있으므로, 최종적으로는 Blender Preferences에서 add-on disable/enable 또는 Blender 재시작 후 **Start MCP Server**가 필요하다.

## 검증

### 자동 검증

- `npm run typecheck` 성공
- `npm test` 성공: 16 files / 54 tests
- `npm run build` 성공
- stdio fake MCP: connect / tools/list / tools/call / close 성공

### 실제 Blender 검증

WSR에서 사용하는 구현 빌드 결과로 `RemoteMcpProvider(transport="stdio")`를 생성해 실제 Blender에 연결했다.

결과:

- `connected=true`
- Blender MCP tools: 28개
- `get_scene_info` 존재 확인
- `get_scene_info` 실제 호출 성공
- `ProviderRegistry`를 `.env` Blender 설정으로 생성한 통합 smoke 성공
- registry status: `blender`, connected, toolCount 28
- namespace 적용된 `blender_*` tool 28개 확인

현재 로드된 구 add-on에서도 fallback으로 핵심 연결은 성공하지만, protocol 경고 제거를 위해 Blender add-on reload가 남아 있다.

## 다음 단계

1. Blender add-on disable/enable 또는 Blender 재시작
2. Blender MCP 패널에서 **Start MCP Server**
3. WSR 재시작 후 ChatGPT MCP 도구 새로고침
4. `mcp_provider_status`에서 Blender connected 확인
5. ChatGPT에서 `blender_get_scene_info` 호출 확인

## 10초 주기 Blender INFO 로그 정리

WSR 재시작 후 Blender MCP 콘솔에 `Processing request of type ListToolsRequest`가 약 10초마다 반복되는 것을 확인했다. 이는 오류가 아니라 `ProviderScheduler`의 기본 health/tool-list 검사 주기(10초)가 `tools/list`를 호출하고, stdio child process의 stderr가 WSR 콘솔에 그대로 상속되어 Blender MCP의 INFO 로그가 노출된 것이다.

Blender stdio Provider에는 `stdioStderrMode: "warnings"`를 적용했다. Scheduler의 10초 health/tool-change 검사는 유지하되 Blender MCP의 일반 INFO stderr는 소비해서 버리고 `WARNING` / `ERROR` / `CRITICAL`만 WSR 콘솔로 전달한다. 범용 stdio Provider 기본값은 기존 호환을 위해 `inherit`로 유지한다.

검증:

- `npm run typecheck` 성공
- `test/mcp-provider.test.ts` 성공: 5 tests
- `npm run build` 성공
- 실제 Blender stdio Provider에서 `tools/list` 3회 반복: 28 tools 유지, stderr INFO 출력 없음
