# PostgreSQL MCP Provider 준비

## 상태

WSR에는 PostgreSQL MCP를 연결할 수 있도록 Provider 설정을 준비했다. 다만 **특정 PostgreSQL MCP 구현은 아직 선택하지 않았다.**

WSR의 `RemoteMcpProvider`는 **Streamable HTTP와 SSE transport**를 지원한다. crystaldba/postgres-mcp는 SSE로 연결하며 `http://127.0.0.1:10021/sse` 형태의 endpoint를 사용한다.

## 설정

```env
MCP_POSTGRESQL_ENABLED=false
MCP_POSTGRESQL_URL=http://127.0.0.1:<port>/mcp
```

활성화 시 namespace는:

```text
postgresql_*
```

예를 들어 원격 MCP가 `list_tables`를 제공하면 WSR에서는 다음처럼 노출된다.

```text
postgresql_list_tables
```

## 연결 전 확인사항

1. 사용할 PostgreSQL MCP 프로젝트/패키지
2. transport 방식 — Streamable HTTP / stdio / SSE 등
3. endpoint/port
4. DB 접속 문자열 전달 방식
5. 읽기 전용 모드 지원 여부
6. SQL 실행 tool의 쓰기 권한 범위
7. schema/database 선택 방식
8. secrets 보관 방식

## 보안 원칙

DB 비밀번호나 connection string을 README나 Git에 커밋하지 않는다.

가능하면 처음 연결은 **읽기 전용 DB 계정**으로 하고 다음 기능부터 검증한다.

```text
list databases/schemas
list tables
inspect columns
read/query SELECT
```

DDL/DML (`INSERT`, `UPDATE`, `DELETE`, `DROP`, migration 등)은 실제 MCP가 제공하는 권한 모델을 확인한 뒤 별도로 결정한다.

## Provider Scheduler

PostgreSQL MCP도 Godot과 동일하게 Scheduler 관리 대상이다.

```text
MCP OFF
  ↓
unavailable (WSR core 정상)
  ↓
MCP ON
  ↓
auto reconnect
  ↓
tools/list
  ↓
postgresql_* registry 갱신
```

## 실제 추가 작업 시 순서

1. `skills/add-remote-mcp-provider/SKILL.md` 확인
2. PostgreSQL MCP 구현 선택
3. 공식 실행/연결 방법 확인
4. SSE endpoint(`/sse`)와 transport 확인
5. WSR `.env`에 `MCP_POSTGRESQL_URL=http://127.0.0.1:10021/sse` 설정
6. WSR 재시작
7. Provider 연결 로그 확인
8. `mcp_provider_status` 확인
9. `postgresql_*` tools 확인
10. 읽기 전용 호출부터 검증
11. Scheduler disconnect/reconnect 검증
12. 문서 및 테스트 보강

### stdio MCP인 경우

선택한 PostgreSQL MCP가 stdio 전용이면 현재 `RemoteMcpProvider`에 바로 연결하지 않는다. 그 경우 WSR에 **stdio provider/launcher adapter**를 추가할지, 별도 HTTP/SSE bridge로 감쌀지 먼저 설계한다.
