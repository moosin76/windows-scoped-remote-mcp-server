# 2026-09-21 Needle Fast Tool Router PoC

## 작업 주체

ChatGPT / WSR (`@ezremote`)

## Roadmap

- NOW-06 — Needle Fast Tool Router PoC

## Git

- branch: `feature/needle-fast-tool-router`
- base: `dd25ae3 docs: Needle router를 NOW 로드맵에 추가`
- 실제 WSR 재시작/live 확인 전 checkpoint 단계

## 완료한 작업

- `cactus-needle 3.0.4`를 Windows Python 3.14.6에 설치하고 local inference 확인
- `needle_route` 추천 전용 MCP Tool 구현
- `MCP_NEEDLE_*` 설정 추가, 기본 비활성화
- TypeScript `NeedleRouter` + Python JSONL sidecar 구현
- catalog fingerprint별 persistent sidecar pool 구현
- timeout / crash / malformed output / model load 실패 격리
- telemetry opt-out 및 Windows Node→Python pipe UTF-8 강제
- Core Tool catalog 구현
- `ProviderRegistry.listCachedTools()` allowlisted snapshot만 Provider 후보로 사용
- Provider lexical pre-shortlist: 최대 5개, 강한 match는 1개까지 축소
- AI caller가 사용자 요청을 짧은 영어 canonical command로 정규화하도록 정책 변경
- literal alias/path/URL/branch/object/schema/table/ID는 원문 보존
- `originalQuery` 추가: Needle에는 보내지 않고 Provider `user_prompt` 복원에 사용
- Provider가 명확하면 `scope=providers + providerId`, Core는 `scope=core`
- `skills/needle-fast-routing/SKILL.md` 작성
- README / architecture / plan / roadmap 갱신

## 실제 Needle 3 결과

- `Check WSR status` → `wsr_status`, confidence 1.0
- `Switch workspace to 'df'` → `switch_workspace(name="df")`, confidence 1.0
- `Get the current active workspace` → `get_active_workspace`, confidence 1.0
- `Get Blender scene information` + providerId=blender → `blender_get_scene_info`, confidence 1.0
- `List PostgreSQL schemas` + providerId=postgresql → `postgresql_list_schemas`, confidence 1.0
- `Open http://localhost:5174 in the browser` → `browser_navigate(url=...)`, confidence 1.0
- 애매한 `Inspect it appropriately` → confidence 약 0.52, `recommended=false`, `escalate=true`

대표 성능:

- Core cold sidecar: 약 2.4초
- Core warm: 약 0.35초
- 강한 Provider shortlist: 약 0.54~0.64초
- peak RAM: 약 102~103MB/sidecar

## 검증

- `npm run typecheck` 통과
- `npm test`: 19 files / 70 tests 통과
- `npm run build` 통과
- `git diff --check` 통과
- Python `py_compile` / `cactus-needle 3.0.4` import 통과
- 실제 Needle 3 local inference 통과
- 동일 catalog sidecar 재사용 / fingerprint별 별도 sidecar 재사용 테스트 통과
- sidecar crash 시 route가 throw하지 않고 escalate하는 테스트 통과
- `needle_route`가 Provider Tool을 직접 실행하지 않는 테스트 통과

## 중요한 결정

- Needle은 recommendation only. 실제 실행 권한은 기존 WSR Tool handler에만 있다.
- 한글을 Needle에 직접 처리시키는 대신 AI caller가 canonical English query로 변환한다.
- Needle 3 base engine은 한 Python process에서 catalog 교체 재초기화 시 `needle_init failed`가 발생할 수 있어 fingerprint별 process pool로 격리한다.
- Provider `user_prompt`는 Needle이 생성하지 않는다.
- 낮은 confidence는 자동 실행하지 않는다.

## 남은 작업

1. feature branch checkpoint commit
2. root `main`의 기존 Remote Desktop Commander 미커밋 변경을 보존하면서 merge
3. root `.env`에 `MCP_NEEDLE_ENABLED=true` 적용
4. 사용자가 WSR 서버를 한 번 재시작
5. ChatGPT에서 새 `needle_route` Tool 노출 확인
6. live Core/Blender/PostgreSQL smoke
7. live 확인 후 Roadmap NOW-06 완료 처리

## 주의사항

현재 root `main`에는 Needle 작업과 무관한 기존 미커밋 변경이 있다.

- `start.sh`
- `scripts/sync-desktop-commander-workspaces.ts`
- `test/desktop-commander-sync.test.ts`

이 변경은 Needle feature worktree에서 수정하지 않았으며 merge 시에도 보존해야 한다.
