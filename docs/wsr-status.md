# wsr_status

## 목적

`wsr_status`는 WSR Gateway 자체의 현재 운영 상태를 한 번에 확인하는 read-only MCP Tool이다.

`workspace_context`와 `workspace_resume`이 프로젝트 작업 상태를 다룬다면 `wsr_status`는 WSR 서버 자체의 실행/연결 상태를 진단한다.

## 반환 정보

- WSR package version / 현재 Git commit / uptime
- Node.js version / OS platform / architecture
- 로컬 MCP host/port/path
- `MCP_PUBLIC_URL` 설정 여부와 공개 endpoint
- allowed host 개수
- OAuth/인증 활성 상태
- 현재 active Workspace와 등록 Workspace 개수
- Playwright browser 초기화/페이지 상태
- Remote MCP Provider 연결 여부와 Tool 개수
- 관리 중인 Process 개수와 실행 중 Process 개수
- cloudflared 실행 가능 여부와 설치 버전
- 운영상 확인할 warning

## 민감정보 보호

`wsr_status`는 상태 진단에 필요하지 않은 민감한 원문을 반환하지 않는다.

반환하지 않는 정보:

- `MCP_AUTH_TOKEN` 실제 값
- OAuth approval key 실제 값
- Cloudflare Tunnel token 실제 값
- Cookie / Authorization header
- MCP session ID
- 관리 Process의 session ID/명령 원문
- Provider `lastError` 원문
- Browser 현재 URL 및 profile 경로

인증과 Tunnel은 실제 값을 대신 다음과 같이 설정 여부만 반환한다.

```text
staticTokenConfigured: true/false
approvalKeyConfigured: true/false
cloudflareTunnelTokenConfigured: true/false
```

## 예시

```text
wsr_status()
```

예상 용도:

```text
"WSR 상태 확인해줘"
  -> wsr_status
  -> WSR/Workspace/Browser/Provider/cloudflared 상태 요약
```

## warning

현재 구현은 다음과 같은 운영상 주의 상태를 warning으로 제공한다.

- `MCP_ALLOW_NO_AUTH=true`
- `MCP_PUBLIC_URL` 미설정
- cloudflared 실행/버전 확인 실패
- 등록 Provider 연결 끊김

Provider의 실제 오류 문자열은 비밀번호/URI 등 민감정보가 포함될 가능성이 있으므로 `wsr_status`에는 포함하지 않는다. 세부 Provider 진단이 필요하면 별도의 Provider 상태/로그를 사용한다.

## 관련 보안 개선

`wsr_status` 구현 과정에서 기존 시작/Tunnel 로그에 Bearer token 원문을 출력하던 동작도 제거했다.

이제 로그에는 실제 토큰 대신 다음처럼 설정 여부만 표시한다.

```text
Authentication: Bearer token configured
```

WSR 로그와 session 문서에도 token/password/cookie/session 원문을 기록하지 않는다는 `AGENTS.md` 규칙을 따른다.
