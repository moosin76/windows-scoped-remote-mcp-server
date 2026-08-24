# PostgreSQL MCP Docker 환경

WSR에서 [CrystalDBA postgres-mcp](https://github.com/crystaldba/postgres-mcp)를 사용하기 위한 Docker Compose 환경이다.

`postgres-mcp`는 `stdio`와 `SSE` transport를 지원하며, 이 구성에서는 WSR과 별도 Docker 컨테이너를 연결하기 위해 **SSE**를 사용한다.

## 전체 연결 구조

```text
WSR
  │
  │ SSE
  │ http://127.0.0.1:10021/sse
  ▼
postgres-mcp container
  │
  │ DATABASE_URI
  │ host.docker.internal:10020
  ▼
Windows host :10020
  │
  ▼
PostgreSQL container :5432
  └─ ether_chronicle
```

기존 PostgreSQL Compose는 Windows 호스트의 `10020` 포트로 PostgreSQL `5432`를 노출한다고 가정한다.

## 1. 사전 요구사항

- Docker Desktop
- 실행 중인 PostgreSQL
- PostgreSQL 접속 정보
- WSR 저장소

현재 개발 DB 예시:

```text
Database: ether_chronicle
User:     postgres
Host:     host.docker.internal
Port:     10020
```

## 2. postgres-mcp 환경 파일 생성

```cmd
cd mcp-servers\postgres-mcp
copy .env.example .env
```

생성된 `.env`를 확인한다.

```env
DATABASE_URI=postgresql://postgres:postgres@host.docker.internal:10020/ether_chronicle
POSTGRES_MCP_PORT=10021
POSTGRES_MCP_ACCESS_MODE=unrestricted
```

`DATABASE_URI`에는 실제 DB 계정을 사용한다. 실제 비밀번호와 연결 문자열이 들어가는 `.env`는 Git에 커밋하지 않는다.

### Access Mode

개발 DB에서 읽기/쓰기를 모두 허용하려면:

```env
POSTGRES_MCP_ACCESS_MODE=unrestricted
```

읽기 중심으로 제한하려면:

```env
POSTGRES_MCP_ACCESS_MODE=restricted
```

운영 DB에 연결할 때는 별도의 최소 권한 DB 계정과 `restricted` 사용을 우선 검토한다.

## 3. Docker 실행

이미지를 받아 실행한다.

```cmd
docker compose pull
docker compose up -d
```

상태 확인:

```cmd
docker compose ps
```

로그 확인:

```cmd
docker compose logs -f postgres-mcp
```

정상 실행 시 대략 다음과 같은 시작 로그를 볼 수 있다.

```text
SSE transport detected, adding --sse-host=0.0.0.0
postgres-mcp --access-mode=unrestricted --transport=sse --sse-host=0.0.0.0
```

종료:

```cmd
docker compose down
```

## 4. SSE Endpoint

Docker 컨테이너의 `8000` 포트를 기본적으로 Windows의 `10021`에 연결한다.

```text
http://127.0.0.1:10021/sse
```

브라우저에서 일반 웹 페이지처럼 확인하는 endpoint가 아니라 MCP SSE client가 연결하는 endpoint다.

## 5. WSR 설정

WSR 루트의 `.env`에 다음을 추가한다.

```env
# [PostgreSQL MCP Server]
MCP_POSTGRESQL_ENABLED=true
MCP_POSTGRESQL_URL=http://127.0.0.1:10021/sse
```

Godot과 함께 사용하는 예:

```env
# [Godot AI MCP Bridge]
MCP_GODOT_ENABLED=true
MCP_GODOT_URL=http://127.0.0.1:8000/mcp

# [PostgreSQL MCP Server]
MCP_POSTGRESQL_ENABLED=true
MCP_POSTGRESQL_URL=http://127.0.0.1:10021/sse
```

그 다음 WSR을 재시작한다.

```cmd
start.bat
```

WSR은 Godot에는 Streamable HTTP transport를 사용하고 PostgreSQL MCP에는 SSE transport를 사용한다.

## 6. 정상 연결 확인

WSR 시작 로그에서 PostgreSQL Provider가 연결되고 tool이 발견되는지 확인한다.

또는 WSR의 다음 tool로 상태를 확인한다.

```text
mcp_provider_status
```

연결 후 PostgreSQL MCP tool은 WSR에서 `postgresql_*` namespace로 노출된다.

예:

```text
postgresql_list_schemas
postgresql_list_objects
postgresql_get_object_details
postgresql_execute_sql
postgresql_explain_query
```

처음에는 `list_schemas`, `list_objects` 같은 읽기 tool부터 호출해 연결을 검증한다.

## 7. 문제 해결

### `No database URL provided`

```text
ValueError: No database URL provided
```

`mcp-servers/postgres-mcp/.env`가 없거나 `DATABASE_URI`가 전달되지 않은 경우다.

```cmd
copy .env.example .env
docker compose up -d --force-recreate
```

후 다시 로그를 확인한다.

### `POST /sse 405 Method Not Allowed`

```text
POST /sse HTTP/1.1 405 Method Not Allowed
```

Streamable HTTP client가 SSE endpoint에 연결하려 할 때 발생한다. 현재 WSR은 PostgreSQL Provider에 `SSEClientTransport`를 사용하도록 구성되어 있으므로, 이 로그가 계속 보이면 **수정된 WSR을 재시작했는지** 확인한다.

정상 SSE 연결에서는 client가 SSE stream을 열고 서버가 알려주는 message endpoint를 통해 MCP 요청을 전송한다.

### PostgreSQL에 접속할 수 없음

Windows의 PostgreSQL 호스트 포트가 실제로 `10020`인지 확인한다.

```cmd
docker ps
```

필요하면 Windows에서 직접 DB 접속도 검증한다.

```text
postgresql://postgres:***@127.0.0.1:10020/ether_chronicle
```

## 8. 주요 postgres-mcp 기능

공식 프로젝트가 제공하는 주요 기능에는 다음이 포함된다.

- 스키마/오브젝트 탐색
- SQL 실행
- EXPLAIN/query plan 분석
- 데이터베이스 health 분석
- index 분석 및 튜닝 지원

일부 성능 분석 기능은 PostgreSQL의 `pg_stat_statements`, `hypopg` 같은 확장을 추가로 활용할 수 있다. 기본 연결 검증과 스키마 조회에는 필수 사항이 아니다.

## 9. 관련 문서

- `../../docs/postgresql-mcp-provider.md`
- `../../skills/add-remote-mcp-provider/SKILL.md`
- CrystalDBA postgres-mcp: https://github.com/crystaldba/postgres-mcp
