# Blender MCP Provider

## 목적

WSR에서 `ahujasid/blender-mcp`를 선택적 Provider로 연결하고 Blender 편집 기능을 `blender_*` namespace로 노출한다.

## 연결 구조

Blender add-on의 기본 `9876` 포트는 MCP HTTP endpoint가 아니다. Blender 내부 add-on이 여는 TCP socket이며, 실제 MCP server는 별도 stdio 프로세스로 실행된다.

```text
ChatGPT / MCP Client
        ↓
       WSR
        ↓ stdio
  uvx blender-mcp
        ↓ TCP socket
127.0.0.1:9876
        ↓
 Blender MCP Add-on
        ↓
     Blender
```

따라서 `http://127.0.0.1:9876/mcp` 같은 URL을 WSR Provider endpoint로 사용하지 않는다. WSR은 `StdioClientTransport`로 `uvx blender-mcp`를 실행하고 `BLENDER_HOST`, `BLENDER_PORT`를 자식 프로세스에 전달한다.

## Blender add-on 설치/업데이트

```bash
uvx blender-mcp install-addon
```

설치 후 Blender에서 다음 중 하나를 수행한다.

1. Preferences → Add-ons에서 `Interface: MCP for Blender`를 disable 후 enable
2. 또는 Blender 재시작
3. Blender MCP 패널에서 **Start MCP Server** 클릭

기본 포트는 `9876`이다.

## WSR 설정

루트 `.env`에 다음 값을 설정한다.

```env
MCP_BLENDER_ENABLED=true
MCP_BLENDER_COMMAND=uvx
MCP_BLENDER_HOST=127.0.0.1
MCP_BLENDER_PORT=9876
```

Windows에서 WSR 프로세스의 `PATH`에 `uvx`가 없다면 `MCP_BLENDER_COMMAND`에 실행 파일의 절대 경로를 지정할 수 있다.

```env
MCP_BLENDER_COMMAND=C:/Users/<user>/.local/bin/uvx.exe
```

실제 사용자 경로나 인증정보는 `.env.example`에 넣지 않는다.

## Provider 등록

`src/providers/provider-factory.ts`는 Blender가 활성화되면 다음 의미의 Provider를 등록한다.

```ts
new RemoteMcpProvider({
  id: "blender",
  namespace: "blender",
  transport: "stdio",
  command: config.blenderMcpCommand,
  args: ["blender-mcp"],
  env: {
    BLENDER_HOST: config.blenderMcpHost,
    BLENDER_PORT: String(config.blenderMcpPort),
  },
});
```

Blender MCP가 제공하는 `get_scene_info` 같은 tool은 WSR에서 `blender_get_scene_info`로 노출된다.

## 장애 격리와 재연결

Blender나 add-on socket이 실행되지 않아도 WSR Core는 계속 실행된다. Provider 연결 실패는 `ProviderRegistry`/`ProviderScheduler`가 unavailable 상태로 관리하며 이후 재연결을 시도한다.

stdio MCP child process가 종료되거나 통신 오류가 발생하면 해당 Provider 연결을 끊고 다음 재연결 시 새 `uvx blender-mcp` 프로세스를 시작한다.

## 검증 기준

구현 시 다음을 확인한다.

- stdio fake MCP에 `connect → tools/list → tools/call → close` 성공
- `MCP_BLENDER_ENABLED=false`에서 WSR 정상 동작
- Blender add-on socket `127.0.0.1:9876` 연결 가능
- 실제 `uvx blender-mcp`에서 `tools/list` 성공
- tool이 `blender_*` namespace로 노출
- 읽기 전용 tool인 `get_scene_info` 호출 성공
- Blender 종료 시 WSR Core가 종료되지 않음
- Blender 재실행 후 Scheduler가 Provider를 복구

## 2026-09-07 초기 연결 확인

개발 PC에서 `127.0.0.1:9876` socket이 열린 상태를 확인했고, WSR이 사용하는 Node MCP SDK의 `StdioClientTransport`로 `uvx blender-mcp`를 실행하여 실제 Blender 연결 및 `tools/list`를 확인했다. 당시 28개 tool이 반환되었다.

초기 smoke test에서 설치된 Blender add-on protocol이 오래되었다는 경고가 확인되어 `uvx blender-mcp install-addon`으로 add-on 파일을 업데이트했다. 업데이트된 add-on 코드를 Blender가 실제로 로드하려면 add-on disable/enable 또는 Blender 재시작 후 **Start MCP Server**가 필요하다.
