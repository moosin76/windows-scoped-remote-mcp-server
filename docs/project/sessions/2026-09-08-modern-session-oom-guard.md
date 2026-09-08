# 2026-09-08 Modern MCP Session OOM 방어

## 작업 주체

ChatGPT / WSR

## 배경

DrapeFit의 Blender fitting 작업을 장시간 진행하던 중 WSR Node 프로세스가 다음 오류로 종료되었다.

```text
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
```

장애 시점 V8 heap은 약 4.07GB였고, 프로세스 uptime은 약 20시간이었다.

## 원인 분석

`src/http-server.ts`의 modern OpenAI MCP 경로는 `x-openai-session`별로 다음 객체를 새로 만들고 `modernSessions` Map에 보관한다.

- modern MCP handler/server
- `WorkspaceManager` fork
- session sandbox/file service
- BrowserManager fork

기존 구현에는 modern session의 TTL, 최대 개수 제한, 종료 시점 정리가 없었다. 따라서 ChatGPT 재연결이나 새 대화/session identifier가 장시간 누적될 경우 session handler들이 서버 종료 전까지 계속 유지될 수 있었다.

legacy MCP session은 transport close에서 제거되지만 modern session에는 같은 수명 정책이 없었다.

`ProcessManager`도 메모리를 사용하지만 기본적으로 최대 process 수와 1시간 retention이 있어 이번 4GB 장기 누적의 1차 원인보다는 modern session cache가 더 강한 원인 후보로 판단했다.

## 구현한 수정

### Modern session 수명 제한

기본값:

- `MCP_MODERN_SESSION_RETENTION_MS=21600000` — idle 6시간
- `MCP_MAX_MODERN_SESSIONS=16`

동작:

- TTL을 지난 idle session은 다음 modern 요청에서 `handler.close()` 후 Map에서 제거한다.
- 최대 개수 도달 시 가장 오래 idle인 session부터 정리한다.
- 현재 요청을 처리 중인 session은 정리하지 않는다.
- 모든 retained session이 active라면 기존 session을 강제 종료하지 않고 새 요청을 stateless modern handler로 fallback한다.
- session acquisition 시점에 `activeRequests` reservation을 잡아 capacity 정리와 동시 요청 race를 피한다.
- 같은 session id가 concurrent create 경합을 일으킬 경우 기존 생성된 session을 다시 확인해 재사용한다.

### 운영 진단 강화

`GET /health`에 다음 정보를 추가했다.

- `modernMcpSessions`
- `modernMcpSessionLimit`
- `modernMcpSessionRetentionMs`
- `memory.rssBytes`
- `memory.heapUsedBytes`
- `memory.heapTotalBytes`
- `memory.externalBytes`
- `memory.arrayBuffersBytes`

장기 실행 시 session 수와 Node heap 증가 추세를 직접 확인할 수 있다.

### Node heap 안전 여유

`start.sh`, `start.bat`, `start.ps1`은 사용자가 별도 `--max-old-space-size`를 지정하지 않은 경우 기본으로 다음 값을 추가한다.

```text
NODE_OPTIONS=--max-old-space-size=8192
```

이는 session 누수를 대신하는 해결책이 아니라, Blender/대형 파일/MCP 응답의 순간적인 메모리 피크에 대한 안전 여유다.

## 변경 파일

- `src/config.ts`
- `src/http-server.ts`
- `.env.example`
- `start.sh`
- `start.bat`
- `start.ps1`
- `test/session-workspace.test.ts`
- `docs/session-scoped-workspaces.md`
- 이 문서

## 검증

완료:

- `npm run typecheck` 통과
- `npx vitest run test/session-workspace.test.ts` — 5/5 통과
- capacity 회귀 테스트에서 `Closed reason=capacity` 확인
- TTL 회귀 테스트에서 `Closed reason=expired` 확인
- `npm test` — 17 files / 58 tests 통과
- `npm run build` 통과
- `bash -n start.sh` 통과
- PowerShell parser로 `start.ps1` 문법 통과
- `git diff --check` 통과

## 아직 필요한 운영 검증

현재 실행 중인 WSR 프로세스는 수정 이전 코드로 시작되었으므로 새 로직 활성화를 위해 WSR을 한 번 재시작해야 한다.

재시작 후 확인:

```text
curl http://127.0.0.1:12000/health
```

기대값:

- `modernMcpSessionLimit: 16`
- `modernMcpSessionRetentionMs: 21600000`
- `memory.*` 필드 존재
- 시작 콘솔의 `NODE_OPTIONS`에 `--max-old-space-size=8192` 표시

그 후 장시간 DrapeFit/Blender 작업 중 `modernMcpSessions`와 `memory.heapUsedBytes`가 지속적으로 무한 증가하지 않는지 관찰한다.

## 주의

- `.env`의 실제 비밀값은 변경하거나 문서에 기록하지 않았다.
- 기존 `skills/blender-windows-3d-authoring/SKILL.md` 변경과 `tmp/` 작업물은 이번 수정 범위가 아니므로 건드리지 않는다.
- 이번 수정은 `feature/windows-computer-use-provider` 브랜치 위에서 수행되었다.
- main merge/push는 사용자 요청 전까지 하지 않는다.

## DrapeFit 복귀 지점

WSR 재시작/검증 후 DrapeFit fitting은 다음 Blender 작업 파일에서 이어간다.

```text
D:\Godot\DrapeFit\generated\phase3-triposplat\mlb-m-fitting-working.blend
```

현재 주요 오브젝트:

- `MLB_M_CANONICAL_SHORTSLEEVE_V3` — 공식 M 반팔 길이/소매축을 맞춘 canonical 후보
- `MLB_M_CLOTH_SURFACE_V3` — 4개 opening, non-manifold 0인 single-layer
- `MLB_M_FIT_RIGID_V1` — 형태 보존 rigid placement
- `MLB_M_FIT_CLEAR_V1` — 가슴/허리 얕은 관통을 최소 보정한 fitting 후보

다음 작업은 `FIT_CLEAR_V1`에서 cuff 중심과 마네킹 상완 중심축을 비교하고, canonical 형태/17.7cm 소매 길이를 유지한 채 fitting copy의 소매 opening만 미세 정렬하는 것이다.
