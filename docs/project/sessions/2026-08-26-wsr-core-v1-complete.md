# 2026-08-26 WSR Core 1차 완료 Handoff

## 작업 주체

ChatGPT/WSR

## 현재 Roadmap

WSR Core 1차 NOW 범위 완료.

다음 개발 우선순위는 `docs/project/roadmap.md`의 LATER 항목이며, 긴급 보안/회귀 수정이 아니라면 새 기능을 즉시 확장하지 않는다.

## 최종 기준 브랜치

main

## Core 기능 병합 기준

- Core 기능 main 병합 commit: `2623a82`
- 이 handoff 문서는 위 상태를 기준으로 작성했으며 문서 정리 후 main에 추가 반영한다.

## 완료한 NOW 범위

1. Project Handoff 기반
   - `AGENTS.md` canonical 규칙
   - Roadmap / plans / sessions 구조
   - Codex ↔ ChatGPT/WSR 저장소 기반 handoff
2. `workspace_context`
   - Git + instructions + Roadmap + session + TODO read-only 수집
3. `workspace_resume`
   - branch/session 불일치, dirty 영역, 다음 작업, warning 구조화
4. Provider Tool 변경 자동 알림
   - ProviderScheduler snapshot 변경 → modern MCP `tools/list_changed` notification fan-out
5. `wsr_status`
   - WSR/Workspace/Browser/Provider/cloudflared/인증 설정 상태 종합 진단

## 추가 완료 사항

- `start.bat` cloudflared 버전 표시 및 공식 update 확인
- 시작 로그/Tunnel 로그에서 Bearer token 원문 제거
- Tunnel 로그의 깨진 표시 문자열 정리
- `wsr_status`가 token/password/cookie/session/provider raw error를 반환하지 않도록 테스트

## 최종 검증

Core 기능 병합 직전 전체 검증:

- `npm run typecheck` 통과
- `npm test`: 14 test files / 41 tests 통과
- `npm run build` 통과
- `git diff --check` 통과
- 변경 코드/문서 strict UTF-8 및 U+FFFD 검사 통과
- Bearer token 원문 로그 패턴 회귀 검사 통과
- modern MCP `server/discover` / `tools/list` 회귀 통과
- legacy MCP `initialize` / `tools/list` / `tools/call` 회귀 통과
- session-scoped Workspace 격리 테스트 통과

## 현재 남은 운영 확인

코드는 main에 반영되었지만 현재 이 대화를 연결한 WSR 프로세스는 변경 전 프로세스다.

다음 WSR 재시작 + ChatGPT MCP 도구 새로고침 후 아래 실전 확인을 한다.

1. `wsr_status()` 호출
2. `workspace_resume(workspace="ec")` 호출
3. `workspace_context(workspace="wsr")`가 이 완료 session과 Roadmap을 수집하는지 확인
4. Provider Tool 목록 변경 시 지원하는 modern client가 변경 알림을 받을 수 있는지 운영 중 관찰

## LATER

다음 항목은 Core 1차 범위에서 의도적으로 제외했다.

- OAuth/HTTP rate limiting 및 세분화된 위험 Tool 정책
- audit/redaction 추가 강화
- OpenTelemetry tracing/metrics
- CIMD 및 legacy auth bridge 전환 검토
- PostgreSQL legacy SSE 현대화
- Codex App Server read-only Adapter
- Provider 관리 UI/추가 Provider

세부 항목은 `docs/project/roadmap.md`를 기준으로 한다.

## 다음 작업 시작 규칙

새 세션에서 WSR 개발을 다시 시작할 때:

1. `AGENTS.md`
2. `docs/project/roadmap.md`
3. 이 최신 session
4. 관련 설계 문서
5. 실제 Git 상태

순으로 확인한다.

## 주의사항

- remote push는 아직 수행하지 않았다.
- 비밀값은 문서/로그에 기록하지 않는다.
- Core 기능의 실전 활성화 확인 전에는 코드 문제와 단순 프로세스 재시작 미반영을 구분한다.
