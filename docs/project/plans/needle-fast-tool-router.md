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
- 사용자의 언어와 무관하게 AI caller가 `query`를 짧은 영어 canonical command로 정규화한다. alias/path/URL/branch/object/schema/table/ID 같은 literal 값은 원문을 보존한다.
- 원문이 canonical query와 다르면 `originalQuery`로 함께 전달한다. `originalQuery`는 Needle inference에는 보내지 않고 Provider `user_prompt` 복원과 평가/진단에만 사용한다.
- 하나의 Needle conversation을 MCP 세션 사이에서 공유하지 않는다. 동일 Tool catalog sidecar는 요청 사이에 agent state를 reset한다.

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

Python sidecar는 lazy start한다. 첫 `needle_route` 호출에서 시작한다. Needle 3 base engine은 한 Python process 안에서 Tool catalog를 안전하게 교체하기 어렵기 때문에 catalog fingerprint별 persistent sidecar를 재사용하고, TypeScript `NeedleRouter`가 제한된 LRU pool로 관리한다.

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

Provider 후보는 반드시 `ProviderRegistry.listCachedTools()`의 현재 namespaced allowlisted snapshot에서만 가져온다.

Tool 수가 많을 때 전체 Provider catalog를 그대로 전달하지 않는다.

1. AI caller가 Core 요청은 `scope=core`, 명확한 Provider 요청은 `scope=providers + providerId`로 먼저 제한한다.
2. WSR이 Provider 이름/namespace/Tool name/description을 이용해 후보를 lexical pre-shortlist한다.
3. Provider Tool은 최대 5개만 Needle에 전달하고, 강한 lexical match가 있으면 1개까지 축소한다.
4. Needle은 shortlist 안에서 exact Tool + arguments를 추천한다.

Provider schema의 `user_prompt`는 Needle 입력에서 제거하고 route 후 `originalQuery`로 복원한다.

## MCP Tool

`needle_route`

입력:
- `query`: AI caller가 만든 짧은 영어 canonical routing command
- `originalQuery`: 선택적 원문. Needle inference에는 전달하지 않음
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
- `MCP_NEEDLE_REQUEST_TIMEOUT_MS=60000`
- `MCP_NEEDLE_MAX_CATALOG_TOOLS=24`

Python:
```bash
python -m pip install cactus-needle
```

첫 모델/엔진 fetch 이후 inference는 로컬에서 동작한다.

## 구현 체크리스트

- [x] Config 추가
- [x] TypeScript NeedleRouter child-process client
- [x] Python JSONL sidecar
- [x] Core/Provider Tool catalog adapter
- [x] `needle_route` MCP Tool 등록
- [x] optional dependency / failure isolation
- [x] telemetry opt-out
- [x] 단위 테스트
- [x] README / architecture / Skill 문서
- [x] typecheck / test / build
- [x] Windows 실기기 Needle inference 검증

## 2차 이후

PoC 정확도와 latency를 측정한 뒤에만 다음을 검토한다.

- confidence 기반 LLM fallback
- Needle embedding을 이용한 Tool/문서 retrieval
- WSR 실제 요청 로그를 익명/정제한 evaluation dataset
- WSR 전용 Needle fine-tune
- 자동 Tool 실행

자동 실행은 충분한 평가 데이터와 별도 보안 검토 전에는 구현하지 않는다.


## 2026-09-21 Windows 실기기 PoC 결과

환경:

- Windows x64
- Python 3.14.6
- `cactus-needle 3.0.4`
- CPU inference
- telemetry opt-out
- RTX 3050은 Needle용으로 사용하지 않음

검증된 canonical routing:

| 사용자 의도 | Needle canonical query | 결과 | confidence |
| --- | --- | --- | ---: |
| WSR 상태 | `Check WSR status` | `wsr_status` | 1.0 |
| df 전환 | `Switch workspace to 'df'` | `switch_workspace(name="df")` | 1.0 |
| 현재 workspace | `Get the current active workspace` | `get_active_workspace` | 1.0 |
| Blender scene | `Get Blender scene information` + `providerId=blender` | `blender_get_scene_info` | 1.0 |
| PostgreSQL schema | `List PostgreSQL schemas` + `providerId=postgresql` | `postgresql_list_schemas` | 1.0 |
| localhost 브라우저 | `Open http://localhost:5174 in the browser` | `browser_navigate(url=...)` | 1.0 |

대표 latency:

- Core cold sidecar: 약 2.4초
- Core warm: 약 0.35초
- 강한 Provider shortlist(1 Tool): 약 0.54~0.64초
- peak RAM: 약 102~103MB/sidecar
- 애매한 요청은 confidence 0.52 수준에서 `recommended=false / escalate=true`

초기 한글 원문을 그대로 Needle에 넣었을 때 Tool/argument 오분류가 있었으므로, AI caller가 영어 canonical query를 생성하고 literal identifier를 보존하는 정책으로 확정했다.

전체 회귀 검증:

- `npm run typecheck` 통과
- `npm test`: 19 files / 70 tests 통과
- `npm run build` 통과
- `git diff --check` 통과
- Python `py_compile` / `cactus-needle` import 통과
