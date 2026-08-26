# WSR Core 1차 완성 구현 계획

## 목적

현재 WSR은 Workspace/File/Exec/Browser, session-scoped workspace, Remote MCP Provider, OAuth/Cloudflare Tunnel 등 핵심 기반이 이미 동작한다.

이 계획의 목적은 새로운 기능을 무분별하게 늘리는 것이 아니라 **작업 연속성, 동적 Provider 운영, 자체 진단**을 보강하여 Core 1차 완성 상태를 만드는 것이다.

기준 Roadmap: `docs/project/roadmap.md`

---

## 현재 기준점

작업 시작 시 반드시 실제 Git 상태를 다시 확인한다. 이 문서 작성 시 기준은 다음과 같다.

- 작업 브랜치: `feature/workspace-context`
- `workspace_context` 구현 및 테스트 완료 상태
- `start.bat` cloudflared version/update 확인 보강 상태
- WSR 자체 `AGENTS.md` / Roadmap / Session 기반 구축 중

기존 미커밋 변경을 잃거나 별도 기능과 섞지 않는다.

---

# 구현 단계

## 1. Handoff 기반 마무리

### 작업

- `AGENTS.md`를 canonical instruction으로 유지
- `AGENT.md`는 호환 안내만 유지
- README와 Skill의 canonical 문서 참조를 `AGENTS.md`로 변경
- Roadmap/Session 문서가 `workspace_context("wsr")`에서 실제 검색되는지 검증
- UTF-8 / `git diff --check` 검증

### 테스트

- `workspace_context("wsr")`
- instructions.path = `AGENTS.md`
- roadmap.path = `docs/project/roadmap.md`
- recentSessions에 현재 session 문서 포함

---

## 2. 현재 `feature/workspace-context` 체크포인트 완료

### 작업

- `workspace_context` 코드와 문서 최종 diff 검토
- cloudflared update 변경과 README 설명 검토
- typecheck/test/build 재검증
- 필요 시 MCP protocol compatibility test에 tool 노출 assertion 보강
- 현재 session 문서 갱신

### 완료 후

사용자 지시에 따라 checkpoint commit한다. `main` merge/push는 별도 명시 지시가 있을 때만 수행한다.

---

## 3. `workspace_resume` 구현

### 권장 브랜치

`feature/workspace-resume`

### 설계 원칙

- `workspace_context`를 재사용하고 중복 Git/파일 탐색 로직을 만들지 않는다.
- read-only를 유지한다.
- AI가 재개 판단에 필요한 **구조화 정보**만 추가한다.
- 문서 내용을 임의로 완료 처리하지 않는다.

### 예상 반환 구조

```text
workspace
context
resumeSummary
warnings[]
nextTasks[]
branchMismatch?
dirtySummary?
```

### 우선 탐지 규칙

1. 현재 Git branch와 최신 session에 명시된 branch 불일치
2. dirty workspace인데 최근 session에 변경 내용이 기록되지 않은 경우 경고
3. Roadmap NOW의 첫 미완료 항목
4. 최신 session의 `다음 작업`, `미완료`, `주의사항` 추출
5. 최근 커밋 이후 변경된 파일의 상위 영역 요약

### 테스트 케이스

- branch 일치
- branch 불일치
- session 없음
- roadmap 없음
- clean/dirty workspace
- AGENTS만 있는 일반 저장소
- WSR처럼 NOW/LATER Roadmap이 있는 저장소

---

## 4. Provider Tool 변경 자동 알림

### 권장 브랜치

`feature/provider-tools-changed`

### 구현 전 조사

현재 설치된 `@modelcontextprotocol/*` SDK의 실제 타입/API를 로컬 `node_modules`에서 확인한다. 기억이나 문서 예시만으로 notification API를 추측하지 않는다.

확인 항목:

- 2026-07-28 modern session의 subscription/listen 지원 방식
- `toolsChanged` 또는 동등 notification API
- `createMcpHandler`와 session lifecycle 연결점
- legacy 요청에서 안전하게 no-op 가능한지

### 설계 원칙

- ProviderScheduler는 Registry 갱신 책임을 유지한다.
- 알림 전송 책임을 Scheduler에 과도하게 결합하지 않는다.
- 같은 snapshot에 대해 반복 알림하지 않는다.
- notification 실패가 WSR Core나 ProviderScheduler를 중단시키면 안 된다.

### 테스트

- Provider tool 목록 변경 → snapshot 변경 1회 감지
- 동일 목록 반복 → 중복 알림 없음
- modern client → notification 경로 동작
- legacy client → 회귀 없음
- Provider disconnected/reconnected → Core 유지

---

## 5. `wsr_status` 구현

### 권장 브랜치

`feature/wsr-status`

### 설계 원칙

- read-only
- 비밀정보 출력 금지
- 상태 수집 실패가 전체 응답 실패로 이어지지 않도록 부분 진단 허용
- 운영자가 실제 장애 위치를 빠르게 찾을 수 있는 정보만 제공

### 최소 필드 후보

```text
server
  version/commit
  uptime
  nodeVersion
workspace
  active
  count
providers[]
browser
cloudflared
publicEndpointConfigured
oauthEnabled
warnings[]
```

### 비밀정보 금지 목록

- `MCP_AUTH_TOKEN`
- `CLOUDFLARE_TUNNEL_TOKEN`
- OAuth access/refresh token
- Cookie/Authorization header
- raw `x-openai-session`
- DB password/URI credential

### 테스트

- 정상 상태
- cloudflared 없음
- Provider 일부 unavailable
- Browser 미초기화
- Git 정보 조회 불가
- 응답 내 secret fixture 미포함 검증

---

# 공통 검증

각 기능 작업 완료 시 기본적으로 다음을 수행한다.

```text
npm run typecheck
npm test
npm run build
git diff --check
UTF-8 문서 검증
```

MCP tool을 추가/수정했으면 추가로:

- modern `server/discover`
- modern `tools/list`
- legacy `initialize`
- legacy `tools/list`
- 실제 tool call

을 확인한다.

# 범위 밖

다음은 이 계획에서 구현하지 않는다.

- rate limiting / 권한 세분화
- OpenTelemetry
- CIMD 전환
- PostgreSQL transport 교체
- Codex Adapter
- Docker 기반 cloudflared 관리

해당 항목은 `docs/project/roadmap.md`의 LATER에서 관리한다.
