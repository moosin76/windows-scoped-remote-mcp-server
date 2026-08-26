# Workspace Development Context

## 목적

`workspace_context`는 등록된 Workspace의 현재 개발 상태를 한 번에 복원하기 위한 read-only MCP tool이다.

Codex, ChatGPT/WSR 또는 다른 개발 도구가 같은 프로젝트 저장소를 번갈아 작업하는 경우 대화 세션 자체를 공유하지 않아도 Git과 프로젝트 문서를 기준으로 작업을 이어갈 수 있게 한다.

## 수집 정보

- 대상 Workspace 이름과 경로
- 현재 활성 Workspace 여부
- Git repository 여부
- Git branch / HEAD
- working tree 변경 목록
- 최근 commit
- `AGENTS.md` 또는 `AGENT.md`
- Roadmap 문서
- 최근 session 문서
- 파일명에 `todo`가 포함된 Markdown 문서

## 동작 원칙

- 대상 Workspace를 자동으로 전환하지 않는다.
- 파일을 수정하지 않는다.
- 등록되지 않은 Workspace에는 접근하지 않는다.
- 다른 Workspace를 조회해도 cross-workspace read-only 정책을 유지한다.
- Codex 프로세스나 Codex App이 실행 중일 필요가 없다. 이 tool은 프로젝트 저장소에 남은 Git/문서 상태만 사용한다.

## 사용 예

```text
workspace_context(workspace="ec")
```

`workspace`를 생략하면 현재 활성 Workspace를 조회한다.

기본값은 최근 commit 5개, 최근 session 2개, 문서당 최대 32 KiB이며 tool 입력으로 조정할 수 있다.

## 프로젝트 인계 문서 권장 규칙

각 프로젝트의 `AGENTS.md`는 작업 종료 시 `docs/project/sessions/` 같은 세션 기록에 다음 내용을 남기도록 권장한다.

- 작업 주체
- 현재 Phase / Roadmap 항목
- 현재 branch와 관련 commit
- 완료 / 미완료 작업
- 주요 변경 파일
- 중요한 결정
- 테스트 및 미검증 항목
- 알려진 문제
- 다음 작업

이 규칙과 `workspace_context`를 함께 사용하면 Codex가 종료된 뒤에도 ChatGPT/WSR에서 저장소만으로 작업 상태를 복원할 수 있다.
