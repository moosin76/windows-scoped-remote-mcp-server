# 2026-10-06 — GAS MCP Provider 연결

## 작업 주체

ChatGPT / WSR

## 작업 범위

Game Assets Studio Desktop MCP를 WSR Remote MCP Provider Gateway에 연결한다.

- GAS endpoint: `http://127.0.0.1:52214/mcp`
- transport: Streamable HTTP
- Provider id: `gas`
- namespace: `gas`
- GAS MCP 인증: 없음, localhost 전용

## Git

- branch: `feature/gas-mcp-provider`
- base: `feature/godot-ai-mcp-v4.3` at `e67079c`
- main merge / push: 미수행

## 완료

- `AppConfig`에 `MCP_GAS_ENABLED`, `MCP_GAS_URL` 추가
- `createProviderRegistry()`에서 GAS를 범용 `RemoteMcpProvider` Streamable HTTP 인스턴스로 등록
- 기본 예제 endpoint를 `http://127.0.0.1:52214/mcp`로 문서화
- 로컬 `.env`에 GAS Provider 활성화
- GAS Provider 단위 테스트 추가
- 기존 Godot/Windows Provider 테스트가 로컬 `.env`의 GAS 설정에 영향받지 않도록 환경 격리 보강
- README / MCP Gateway Architecture에 GAS Provider 추가

## 실제 연결 검증

GAS packaged Desktop이 실행 중인 상태에서 source registry를 직접 사용해 실제 endpoint에 연결했다.

- connected: true
- discovered tools: 16
- remote `project_close` 호출 성공
- 결과: `{ ok: true, data: { closed: false, reason: "NO_PROJECT_OPEN" } }`
- namespace 적용 후 WSR 공개 이름은 `gas_project_close` 등 `gas_*` 형식

## 자동 검증

- `npm run typecheck` PASS
- `npm test` PASS — 23 files / 83 tests
- `npm run build` PASS
- `git diff --check` PASS

## 운영 특성

GAS Desktop MCP는 Desktop 프로세스가 소유한다.

- GAS Desktop 실행 중 → WSR Provider 연결 가능
- GAS Desktop 종료 → GAS Provider unavailable
- WSR Core 및 다른 Provider는 계속 동작
- ProviderScheduler가 재연결을 주기적으로 시도

## 미완료 / 다음 작업

WSR 현재 실행 프로세스는 변경 전 코드로 시작되어 있으므로 한 번 재시작이 필요하다.

재시작 후:

1. `mcp_provider_status`에서 `gas` connected / toolCount 16 확인
2. Provider catalog에서 `gas_*` Tool 노출 확인
3. WSR Gateway를 통해 `gas_project_close` 같은 안전한 Tool 실제 호출
4. ChatGPT Plugin tool schema 새로고침 후 GAS namespace 노출 확인
5. live 검증 결과를 이 문서에 추가하고 checkpoint commit
