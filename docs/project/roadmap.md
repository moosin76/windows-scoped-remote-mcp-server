# WSR 개발 Roadmap

## 목적

이 문서는 Windows Scoped Remote MCP Server(WSR)의 현재 개발 우선순위와 장기 개선 항목을 구분한다.

WSR의 핵심 목표는 **Windows 개발 PC 전체를 인터넷에 노출하지 않고, 등록된 Workspace와 선택한 Provider만 ChatGPT 등 원격 MCP 클라이언트에 안전하게 제공하는 것**이다.

새 기능의 수를 늘리는 것보다 다음을 우선한다.

- Workspace 보안 경계 유지
- MCP/Provider 안정성
- Codex ↔ ChatGPT 작업 연속성
- 장애 진단과 운영 편의성
- 기존 기능 회귀 방지

---

# NOW — WSR Core 1차 완성

NOW는 현재 구현 우선순위다. 긴급한 보안/회귀 수정이 아니라면 아래 범위를 마치기 전 LATER 항목을 구현하지 않는다.

## NOW-01 — Project Handoff 기반 구축

**상태: 완료**

- [x] `AGENTS.md`를 WSR 공식 작업 지침으로 지정
- [x] 기존 `AGENT.md`는 호환 안내 파일로 유지
- [x] `docs/project/roadmap.md` 생성
- [x] `docs/project/plans/` 구조 생성
- [x] `docs/project/sessions/` 구조 생성
- [x] README/Skill 등 기존 `AGENT.md` 참조를 `AGENTS.md` 기준으로 정리
- [x] 실제 `workspace_context("wsr")`에서 Roadmap/Session이 수집되는지 검증

### 완료 조건

Codex나 ChatGPT/WSR에서 저장소만 읽고 현재 작업 상태, 다음 작업, 검증 결과를 복원할 수 있다.

---

## NOW-02 — `workspace_context` 마무리

**상태: 완료**

현재 브랜치: `feature/workspace-context`

- [x] 등록 Workspace의 Git branch/HEAD/status/recent commits 조회
- [x] `AGENTS.md`/`AGENT.md` 조회
- [x] Roadmap 조회
- [x] 최근 Session 조회
- [x] TODO 조회
- [x] Workspace를 전환하지 않는 read-only 정책
- [x] 단위 테스트
- [x] 전체 typecheck/test/build
- [x] `start.bat` cloudflared 버전 표시 및 공식 update 확인
- [x] WSR 자체 handoff 문서와 통합 검증
- [x] 변경사항 최종 diff 검토 및 checkpoint commit

### 완료 조건

`<workspace> 작업상황 확인해줘` 요청을 한 번의 `workspace_context` 호출로 복원할 수 있고, WSR 자신도 같은 방식으로 조회할 수 있다.

---

## NOW-03 — `workspace_resume`

**상태: 완료**

`workspace_context`의 원문 수집 결과를 기반으로 실제 작업 재개에 필요한 구조화된 힌트를 제공한다.

예상 기능:

- 현재 branch와 최신 session branch 불일치 감지
- dirty 상태 및 주요 변경 영역 요약
- 최신 Roadmap의 NOW/다음 작업 추출
- 최근 session의 미완료/다음 작업 추출
- `warnings`, `nextTasks`, `resumeSummary` 반환
- 완전 read-only 유지

### 완료 조건

AI가 모든 문서 원문을 다시 해석하지 않아도 현재 작업의 충돌/주의점과 다음 시작 지점을 빠르게 판단할 수 있다.

---

## NOW-04 — Provider Tool 변경 자동 알림

**상태: 구현 대기**

현재 `ProviderScheduler`는 Provider의 `tools/list` 변경을 감지해 Registry snapshot을 갱신한다. 다음 단계는 MCP 클라이언트가 변경 사실을 알 수 있도록 modern MCP의 tool 변경 알림 흐름을 연결하는 것이다.

구현 전 확인:

- 현재 사용 중인 MCP SDK v2 `createMcpHandler`의 2026-07-28 notification/subscription API
- legacy 세션에 미치는 영향
- ProviderScheduler와 세션 수명 분리
- 동일 변경에 대한 알림 폭주 방지

### 완료 조건

Provider Tool 목록이 바뀌었을 때 WSR 재시작 없이 Registry가 갱신되고, 지원하는 modern MCP 클라이언트가 tool 변경 사실을 전달받을 수 있다. legacy 호환은 깨지지 않는다.

---

## NOW-05 — `wsr_status` 운영 진단

**상태: 구현 대기**

WSR 자체의 실행 상태를 한 번에 확인하는 read-only 진단 Tool을 추가한다.

최소 후보 정보:

- WSR version/commit/uptime
- Node version
- active workspace와 등록 Workspace 수
- Provider 상태 요약
- Browser manager 상태
- cloudflared 설치 버전
- public endpoint 설정 여부(비밀값 제외)
- OAuth 활성화 여부(토큰/비밀값 제외)
- 최근 운영 오류 또는 진단 요약

### 완료 조건

`WSR 상태 확인해줘` 요청에서 여러 개의 개별 tool 호출 없이 핵심 운영 상태를 진단할 수 있고, 응답에 token/password/cookie/session 원문이 포함되지 않는다.

---

# LATER — Core 1차 완성 이후

아래 항목은 중요하지만 NOW 범위를 완료한 뒤 별도 계획으로 진행한다.

## Security Hardening

- OAuth `/authorize`, `/token`, client registration 등의 rate limiting
- 위험 Tool 그룹별 enable/disable 정책
- File write / Exec / Browser / Provider write 권한 세분화 검토
- 감사 로그(audit)와 민감정보 redaction 강화
- Cloudflare/WSR 배포 환경에 맞는 추가 HTTP 보안 점검

## Observability

- OpenTelemetry 기반 tracing/metrics 검토
- `traceparent`, `tracestate`, `baggage` 전파
- WSR → Remote Provider 호출 연계 추적
- 장애 분석용 구조화된 진단 정보

## OAuth / MCP 차세대 호환

- 현재 DCR 호환 동작 유지
- CIMD(Client ID Metadata Documents) 지원 여부 및 ChatGPT 호환 검증
- MCP SDK의 legacy auth bridge 제거 가능 시점 검토

## Provider Transport 현대화

- PostgreSQL Provider의 legacy SSE 의존성 제거 가능 여부 확인
- Provider별 Streamable HTTP 지원 상태에 따라 점진적 전환

## Codex Adapter

- Codex App Server 기반 persisted thread 조회 가능성 검증
- 초기에는 read-only thread/status/diff 조회만 고려
- WSR을 통해 Codex의 unrestricted PC 실행 권한을 우회 노출하지 않는다

## 기타 장기 개선

- Provider 설정/상태 UI 또는 관리 편의 기능
- WSR 배포/업데이트 자동화 개선
- 추가 MCP Provider(Blender 등)는 실제 프로젝트 수요가 생길 때 추가

---

# 구현 순서

```text
NOW-01 Handoff 기반
→ NOW-02 workspace_context 체크포인트
→ NOW-03 workspace_resume
→ NOW-04 Provider tools changed
→ NOW-05 wsr_status
→ WSR Core 1차 완료 판단
→ LATER hardening
```

# Core 1차 완료 기준

다음 조건을 모두 만족하면 WSR Core 1차 완성으로 판단한다.

1. Codex ↔ ChatGPT가 저장소 문서/Git을 통해 작업을 자연스럽게 인계할 수 있다.
2. 다른 Workspace를 전환하지 않고도 작업 상태를 조회할 수 있다.
3. 작업 재개 시 현재 상태와 다음 작업을 구조적으로 판단할 수 있다.
4. Provider 연결/도구 변화가 Gateway 재시작 없이 관리된다.
5. WSR 자체 운영 상태를 한 번에 진단할 수 있다.
6. 기존 Workspace 보안 경계, OAuth, Browser, Exec, Provider 기능의 회귀 테스트가 통과한다.
