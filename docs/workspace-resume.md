# workspace_resume

## 목적

`workspace_resume`은 `workspace_context`가 수집한 Git/프로젝트 문서를 다시 사용해, 다른 AI 도구나 새 세션이 작업을 재개할 때 필요한 구조화된 힌트를 제공하는 read-only MCP Tool이다.

`workspace_context`가 원문 중심의 사실 수집이라면 `workspace_resume`은 다음 질문에 빠르게 답하는 역할을 한다.

- 현재 브랜치와 최신 session 브랜치가 같은가?
- 미커밋 변경은 어느 영역에 있는가?
- Roadmap의 현재 NOW 항목은 무엇인가?
- 최신 session에 남은 작업/다음 작업/주의사항은 무엇인가?
- 가장 먼저 확인할 작업 후보는 무엇인가?

## 반환 정보

- 현재 Git branch/HEAD/dirty/status
- 사용한 instructions/roadmap/session/TODO 경로
- `resumeSummary`
- `warnings[]`
- `nextTasks[]`
- `branchMismatch`
- `dirtySummary`
- Roadmap 현재 항목과 미완료 체크박스
- 최신 session의 branch/미완료/다음 작업/주의사항
- 최근 commit

## 안전 원칙

- Workspace를 전환하지 않는다.
- 파일을 수정하지 않는다.
- Git 명령은 읽기 전용으로만 실행한다.
- Markdown 해석이 애매할 경우 강한 결론을 만들지 않고 warning/후보 형태로 반환한다.
- 실제 프로젝트 상태의 최종 기준은 Git과 저장소 문서다.

## 예시

```text
workspace_resume(workspace="ec")
```

현재 브랜치와 최신 session 브랜치가 다르면 `branchMismatch`와 warning을 반환한다. 현재 작업 트리에 변경이 있으면 경로와 주요 영역을 `dirtySummary`로 제공한다.

## 관계

```text
workspace_context
  -> Git + AGENTS + Roadmap + Session + TODO 원문 수집

workspace_resume
  -> 위 사실을 기반으로 재개 힌트 구조화
```
