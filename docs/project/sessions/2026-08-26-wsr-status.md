# 2026-08-26 WSR 운영 상태 진단

## 작업 주체

ChatGPT/WSR

## Roadmap

NOW-05 — `wsr_status`

## 작업 브랜치

- `feature/wsr-status`
- 시작 기준: main `8574da7`

## 완료한 작업

- `wsr_status` read-only MCP Tool 구현
- WSR package version / Git commit / uptime / Node/OS 정보 수집
- MCP endpoint 및 public URL 설정 상태 수집
- 인증/OAuth/Cloudflare token의 **설정 여부만** 반환
- active Workspace / 등록 Workspace 수 수집
- Browser 초기화/페이지 상태 조회용 `BrowserManager.getStatus()` 추가
- Provider 연결 여부/Tool 개수 수집
- Process retained/running 개수 수집
- cloudflared 실행 가능 여부/버전 수집
- 운영상 warning 생성
- modern MCP `tools/list`에서 `wsr_status` 노출 회귀 검사 추가
- `docs/wsr-status.md` 작성

## 보안 개선

`wsr_status` 구현 중 기존 WSR 시작 로그와 Cloudflare Tunnel 연결 로그에 Bearer token 실제 값이 출력되는 문제를 확인했다.

다음과 같이 수정했다.

- `src/server.ts`: 실제 Bearer token 로그 제거
- `src/tunnel.ts`: 실제 Authorization header/token 로그 제거
- 인증 상태는 `Bearer token configured` 등 설정 여부로만 표시
- Tunnel 로그의 기존 깨진 표시 문자열도 정상 UTF-8 출력으로 정리

`wsr_status` 결과에도 다음 원문을 포함하지 않는다.

- static auth token
- OAuth approval key
- Cloudflare Tunnel token
- Provider raw error
- Process session ID/command
- Browser URL/profile path
- Cookie/session/Authorization 원문

## 주요 파일

- `src/wsr-status.ts`
- `src/wsr-status-tools.ts`
- `src/browser-manager.ts`
- `src/mcp-server.ts`
- `src/server.ts`
- `src/tunnel.ts`
- `test/wsr-status.test.ts`
- `test/mcp-protocol-compat.test.ts`
- `docs/wsr-status.md`

## 검증

중간 검증:

- `npm run typecheck` 통과
- `test/wsr-status.test.ts`: 2/2 통과
- `test/mcp-protocol-compat.test.ts`: 3/3 통과
- targeted 총 2 files / 5 tests 통과
- `git diff --check` 통과

최종 검증:

- `npm run typecheck` 통과
- 전체 `npm test`: 14 files / 41 tests 통과
- `npm run build` 통과
- `git diff --check` 통과
- 변경 문서/코드 strict UTF-8 및 U+FFFD 검사 통과
- Bearer token 원문 로그 패턴 회귀 검사 통과 (`SECRET_LOG_OK`)

## 다음 작업

1. Roadmap NOW-05 및 Core 1차 완료 상태 반영
2. 전체 회귀/UTF-8/secret-log 검사
3. checkpoint commit
4. main 병합
5. WSR 재시작 후 `workspace_resume`, Provider Tool 변경 알림, `wsr_status` 실전 확인

## 주의사항

- remote push는 수행하지 않는다.
- 현재 실행 중인 WSR 프로세스에는 이 브랜치 코드가 아직 반영되지 않았다.
