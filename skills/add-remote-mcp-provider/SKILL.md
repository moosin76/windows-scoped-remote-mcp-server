# 원격 MCP Provider 추가 스킬

## 목적

Godot, Blender 또는 다른 MCP 서버를 Windows Scoped Remote MCP Server에 연결할 때 사용하는 표준 절차다.

## 목표 구조

```text
외부 MCP 서버
    ↓ Streamable HTTP
RemoteMcpProvider
    ↓
ProviderRegistry
    ↓ namespace
McpServer
    ↓
ChatGPT
```

## 1. 외부 MCP 연결 정보 확인

먼저 다음을 확인한다.

- MCP endpoint URL
- transport 방식(Streamable HTTP 등)
- 인증 필요 여부
- 서버가 제공하는 `tools/list`
- 서버가 제공하는 tool의 JSON Schema
- 연결 종료 방식

Godot 예:

```text
http://127.0.0.1:8000/mcp
```

## 2. RemoteMcpProvider를 재사용한다

새 MCP마다 별도의 HTTP client를 만들지 않는다.

```ts
new RemoteMcpProvider({
  id: "godot",
  namespace: "godot",
  url: "http://127.0.0.1:8000/mcp",
});
```

Blender도 같은 방식으로 연결한다.

```ts
new RemoteMcpProvider({
  id: "blender",
  namespace: "blender",
  url: "http://127.0.0.1:xxxx/mcp",
});
```

## 3. Namespace 규칙

원격:

```text
get_scene
create_object
screenshot
```

Gateway:

```text
godot_get_scene
godot_create_object
godot_screenshot
```

Provider가 아닌 호출자가 namespace를 임의로 제거하지 않는다.

## 4. Tool Schema 검증

원격 MCP가 반환하는 JSON Schema를 그대로 `McpServer.registerTool()`에 넣지 않는다.

현재 Gateway는 JSON Schema를 MCP SDK 등록용 Zod shape으로 변환하는 adapter를 사용한다.

다음 항목을 테스트한다.

- required
- optional
- string/number/integer/boolean
- enum
- array
- object
- default가 있는 경우
- properties가 없는 빈 object schema

## 5. 테스트 순서

실제 서버를 붙이기 전에 가능한 경우 fake provider로 다음을 검증한다.

```text
tools/list
  ↓
namespace
  ↓
tools/call
  ↓
원격 tool 이름 복원
```

그 후 실제 서버를 연결한다.

## 6. 실제 연결 검증

Provider 추가 후:

1. 서버 재시작
2. 콘솔에서 Provider 연결 확인
3. remote tool 개수 확인
4. ChatGPT에서 MCP tool 목록 새로고침
5. 읽기 전용 tool 호출
6. 실제 변경 tool 호출
7. 결과 확인
8. 서버 재시작 후 다시 확인

## 7. 커밋

기능 추가가 정상 검증되면 별도 checkpoint를 만든다.

권장 형식:

```text
feat: add <provider> MCP integration
```

## 금지 사항

- Provider별로 `RemoteMcpProvider`를 복제하지 않는다.
- namespace 충돌을 무시하지 않는다.
- schema 변환 실패를 `any`로 숨겨버리지 않는다.
- 실제 연결 성공 전에 Gateway 전체를 대규모 리팩터링하지 않는다.
