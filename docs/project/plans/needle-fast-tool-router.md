# Needle Fast Tool Router 구현 계획

## 목적

Needle 3를 WSR의 선택적 로컬 System-1 Tool Router로 연결한다. 대형 LLM이 모든 WSR Tool을 직접 탐색하기 전에, 자연어 요청을 작은 로컬 모델로 빠르게 `tool + arguments` 후보로 구조화하는 PoC를 만든다.

## 설계 원칙

- Needle은 Tool을 직접 실행하지 않는다. 1차 구현은 추천 전용 `needle_route` Tool만 제공한다.
- 기존 Workspace Sandbox, Provider allowlist, MCP Tool handler가 실제 실행 권한의 유일한 경계다.
- Needle 설치/모델 로드 실패가 WSR Core 시작 실패로 이어지지 않아야 한다.
- 기본값은 비활성화이며 `MCP_NEEDLE_ENABLED=true`일 때만 Tool을 노출한다.
- 원격 API는 사용하지 않는다. `cactus-needle` Python 런타임과 로컬 Needle 3 weights를 사용한다.
- Needle telemetry는 child process에서 기본 비활성화한다.
- 하나의 Needle conversation을 MCP 세션 사이에서 공유하지 않는다. 각 route 요청 전에 agent state를 reset한다.

## 1차 구조

```text
ChatGPT / Claude
      |
      v
   WSR MCP
      |
 needle_route
      |
      v
NeedleRouter (TypeScript)
      |
      | JSONL / stdio
      v
scripts/needle_router.py
      |
      v
 cactus-needle / Needle 3
```

Python sidecar는 lazy start한다. 첫 `needle_route` 호출에서 시작하고, Tool catalog fingerprint가 바뀌면 새 Needle agent를 구성한다.

## Tool catalog

1차 PoC에서 다음 WSR Core Tool을 수동 catalog로 제공한다.

- `list_workspaces`
- `get_active_workspace`
- `switch_workspace`
- `workspace_context`
- `workspace_resume`
- `wsr_status`
- `exec_command`
- `read_file`
- `write_file`
- `browser_navigate`
- `mcp_provider_status`
- `mcp_provider_catalog`
- `mcp_provider_call`

여기에 `ProviderRegistry.listCachedTools()`의 현재 namespaced Provider Tool을 동적으로 합친다. Needle 3는 5개 초과 Tool에 built-in retrieval을 사용하므로 전체 catalog를 전달할 수 있다.

## MCP Tool

`needle_route`

입력:
- `query`: 사용자의 자연어 작업 요청
- `scope`: `all | core | providers` (기본 `all`)
- `providerId`: providers scope를 특정 Provider로 좁힐 때 사용

출력:
- enabled / available
- catalogCount
- confidence
- functionCalls
- suppressedCalls
- reasoning
- escalate
- recommended: confidence threshold 이상 여부

실제 Tool 실행은 하지 않는다.

## 설정

- `MCP_NEEDLE_ENABLED=false`
- `MCP_NEEDLE_PYTHON=python`
- `MCP_NEEDLE_CONFIDENCE_THRESHOLD=0.70`
- `MCP_NEEDLE_TOOL_INDEX_PATH=.cache/needle/wsr-tools.idx`

Python:
```bash
python -m pip install cactus-needle
```

첫 모델/엔진 fetch 이후 inference는 로컬에서 동작한다.

## 구현 체크리스트

- [ ] Config 추가
- [ ] TypeScript NeedleRouter child-process client
- [ ] Python JSONL sidecar
- [ ] Core/Provider Tool catalog adapter
- [ ] `needle_route` MCP Tool 등록
- [ ] optional dependency / failure isolation
- [ ] telemetry opt-out
- [ ] 단위 테스트
- [ ] README / architecture / Skill 문서
- [ ] typecheck / test / build
- [ ] Windows 실기기 Needle inference 검증

## 2차 이후

PoC 정확도와 latency를 측정한 뒤에만 다음을 검토한다.

- confidence 기반 LLM fallback
- Needle embedding을 이용한 Tool/문서 retrieval
- WSR 실제 요청 로그를 익명/정제한 evaluation dataset
- WSR 전용 Needle fine-tune
- 자동 Tool 실행

자동 실행은 충분한 평가 데이터와 별도 보안 검토 전에는 구현하지 않는다.
