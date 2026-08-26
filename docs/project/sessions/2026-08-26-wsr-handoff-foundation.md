# 2026-08-26 WSR Handoff 기반 구축

## 작업 주체

ChatGPT/WSR

## 현재 Roadmap

- NOW-01 Project Handoff 기반 구축
- NOW-02 `workspace_context` 마무리 준비

## 작업 브랜치

- `feature/workspace-context`
- 작업 시작 기준 HEAD: `5d0c80c`

## 이번 세션 완료

- 기존 `AGENT.md` 내용을 기반으로 루트 `AGENTS.md`를 canonical 작업 지침으로 생성
- `AGENT.md`를 기존 참조 호환용 안내 파일로 변경
- `AGENTS.md`에 Codex ↔ ChatGPT/WSR 작업 인계 규칙 추가
- `docs/project/roadmap.md` 생성
  - NOW: Core 1차 완성 범위
  - LATER: Security hardening / Observability / OAuth 차세대 호환 / Provider transport / Codex Adapter
- `docs/project/plans/wsr-core-v1-completion.md` 생성
- `docs/project/sessions/` handoff 체계 시작

## 현재 브랜치에 이미 있던 작업

이번 handoff 기반 작업 전에 같은 브랜치에서 다음 변경이 진행되어 있었다.

- `workspace_context` read-only MCP tool 구현
- `docs/workspace-context.md`
- `test/workspace-context.test.ts`
- `src/mcp-server.ts` tool 등록
- `start.bat` cloudflared 현재 버전 표시 및 `cloudflared update` 확인
- README의 cloudflared update 동작 설명

이 변경들은 되돌리지 않고 같은 Core 1차 완성 체크포인트로 이어간다.

## 검증된 상태

handoff 구조 작업 직전 기준:

- `npm run typecheck` 통과
- `npm test`: 11 files / 34 tests 통과
- `npm run build` 통과
- `git diff --check` 통과
- `workspace_context("ec")` 실제 원격 호출 성공

handoff 문서 변경 후 재검증 결과:

- `workspace_context("wsr")`에서 `AGENTS.md`, Roadmap, 최신 Session 수집 성공
- `npm run typecheck` 통과
- `npm test`: 11 files / 34 tests 통과
- `npm run build` 통과
- `git diff --check` 통과
- 관련 문서 UTF-8 검증 통과

## 중요한 결정

1. WSR 공식 instruction 파일은 `AGENTS.md`로 통일한다.
2. 기존 `AGENT.md` 경로는 즉시 삭제하지 않고 호환 안내 파일로 유지한다.
3. 작업 상태의 공통 기준은 대화가 아니라 `Git + AGENTS.md + docs/project/`로 한다.
4. NOW 범위가 끝나기 전에는 긴급 보안/회귀 이외의 LATER 기능을 구현하지 않는다.
5. Codex Adapter는 Core 1차 완성 이후 LATER로 유지한다.
6. Docker 기반 cloudflared 관리는 추가하지 않는다.

## 미완료

- `feature/workspace-context` 최종 diff 정리 및 checkpoint commit
- checkpoint 이후 새 브랜치에서 NOW-03 `workspace_resume` 구현

## 다음 세션/다음 작업

가장 먼저 다음 순서로 진행한다.

1. NOW-02 현재 브랜치 전체 diff 최종 검토
2. `feature/workspace-context` checkpoint commit
3. 새 `feature/workspace-resume` 브랜치 생성
4. `docs/project/plans/wsr-core-v1-completion.md`의 NOW-03 설계에 따라 구현 시작

## 주의사항

- `main` merge/push는 사용자 명시 지시 없이 수행하지 않는다.
- 문서는 UTF-8로 유지한다.
- OAuth/Cloudflare/DB 비밀값을 session 문서에 기록하지 않는다.
