# 2026-08-26 WSR Core 1차 공개 문서/웹 반영

## 작업 주체

ChatGPT/WSR

## 작업 범위

WSR Core 1차 NOW 기능이 `main`에 병합된 뒤 공개 README와 GitHub Pages용 웹사이트의 설명을 실제 구현 상태와 일치시키는 작업.

## 작업 브랜치

- `docs/core-v1-public-docs`
- 시작 기준: `main` `0b81bfd`

## 완료한 작업

### README.md

- `workspace_context` 기반 Project Handoff 설명 추가
- `workspace_resume` 기반 작업 재개 설명 추가
- `wsr_status` 운영 진단 설명 추가
- Provider Tool 목록 변경 시 modern MCP `tools/list_changed` 알림 동작 반영
- Provider 서버의 실행/종료/Tool 변경 때문에 매번 WSR을 재시작해야 한다는 오래된 설명 제거
- 관련 설계 문서 링크 추가
- Bearer token 원문을 운영 로그에 출력하지 않는 보안 정책 명시

### 웹사이트

다음 페이지의 한국어/영어 내용을 함께 갱신했다.

- `website/src/pages/IndexPage.vue`
  - Project handoff / 운영 진단을 핵심 기능에 반영
  - Codex/다른 개발 도구와 저장소 기반으로 작업을 이어가는 흐름 추가
- `website/src/pages/FeaturesPage.vue`
  - `PROJECT HANDOFF` 카드 추가
  - `OPERATIONS` 카드 추가
  - `workspace_context`, `workspace_resume`, `wsr_status`, Provider 자동 갱신 설명 추가
  - 기존 화면 데모의 깨진 표시 문자열 정리
- `website/src/pages/ArchitecturePage.vue`
  - Workspace 계층을 `Workspace & Handoff Context`로 보강
  - active Workspace를 바꾸지 않는 read-only context/resume 흐름 반영
  - 기존 깨진 context 표시 정리
- `website/src/pages/GettingStartedPage.vue`
  - Step 06 `VERIFY` 추가
  - WSR 재시작/Tool 새로고침 후 `wsr_status`, `workspace_context`, `workspace_resume` 확인 절차 추가
- `website/src/pages/McpExtensionPage.vue`
  - Provider transport 설명을 현재 구조에 맞게 수정
  - Scheduler의 health/reconnect/tools/list/notification 동작 반영
  - 최초 Provider 추가 시 재시작과 이후 runtime 자동 추적을 구분

## 검증

### 코드/빌드

- `website/npm run typecheck` 통과
- `npx quasar build -m spa` 통과
- 실제 headed Playwright 브라우저에서 다음 경로 HTTP 200 확인
  - `/`
  - `/features`
  - `/architecture`
  - `/getting-started`
  - `/mcp-extension`
- 위 페이지에서 desktop 1280px 기준 horizontal overflow 없음 확인
- Features: 8개 feature card 렌더 및 새 Handoff/Operations 카드 확인
- Architecture: `Workspace & Handoff Context`, `workspace_context · workspace_resume` 확인
- Getting Started: Step 06 및 세 Core Tool 예제 확인
- MCP Extension: `tools/list_changed`와 Scheduler notify 설명 확인
- Home에서 KR → EN locale 전환 후 `Handoff & diagnostics` 렌더 확인
- 기존 가시적 깨짐 문자열(`CHATGPT 횞 WSR`, `??read`, `??connected`, `??context`) 미검출

### 알려진 로컬 웹 검증 이슈

`npm run lint:check`는 `oxfmt --check`에서 이번 변경 전부터 포맷 기준에 맞지 않는 웹 파일 11개를 전체적으로 보고하므로 통과하지 않았다. 이 작업에서는 관련 없는 사이트 전체 포맷 diff를 만들지 않았다.

`npm run build` (`quasar build -m ssg`)는 SSR Client/Server 컴파일까지 완료한 후 Windows 로컬 SSG renderer 단계에서 다음 오류로 중단된다.

```text
ERR_UNSUPPORTED_ESM_URL_SCHEME
Received protocol 'd:'
```

반면 동일 소스의 Vue typecheck와 SPA production build, 실제 dev browser 렌더는 모두 통과했다. 이 Windows SSG 경로 문제는 공개 문서 동기화와 분리해서 후속 진단할 수 있다. GitHub Pages workflow는 별도 환경에서 실행되므로 실제 배포 시 Actions 결과도 확인한다.

## 인코딩

변경된 README/Vue/세션 문서는 UTF-8 기준으로 유지한다. Features/Architecture에 있던 BOM은 재저장 과정에서 제거했다.

## 다음 작업

1. 변경 파일 strict UTF-8 / U+FFFD / BOM 검사
2. `git diff --check`
3. checkpoint commit
4. `main` 병합
5. remote push는 사용자 지시 전까지 수행하지 않음

## 주의사항

- 웹사이트가 실제 GitHub Pages에 반영되려면 `main`을 remote에 push하여 Actions deployment가 실행되어야 한다.
- SSG의 Windows `D:` ESM URL 오류는 별도 build-tool 이슈로 추적한다.
