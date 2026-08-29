# Git Bash 우선 셸 / PowerShell 7 fallback / WSR 한도 조정 Handoff

## 작업 목적

Windows WSR에서 Windows PowerShell 5.1의 UTF-8/BOM 문제를 피하고 사용자가 셸 설정을 신경 쓰지 않도록 기본 셸 선택을 자동화했다. 큰 문서와 긴 명령 출력에 대응하도록 파일/출력 한도도 상향했다.

## 현재 Git 상태

- 브랜치: `feature/pwsh-default-shell`
- 아직 커밋하지 않음
- main merge/push 하지 않음

브랜치 이름은 초기 PowerShell 7 테스트 단계에서 만든 이름이며, 최종 정책은 Git Bash 우선이다.

## 최종 기본 셸 정책

Windows에서 셸은 `.env`로 설정하지 않는다.

```text
WSR 시작
→ Git Bash 탐색
   ├─ PATH의 bash
   ├─ PATH의 git.exe에서 Git 설치 루트 유추
   ├─ C:\Program Files\Git\bin\bash.exe
   ├─ C:\Program Files\Git\usr\bin\bash.exe
   ├─ %LOCALAPPDATA%\Programs\Git\...
   └─ 기타 일반 Git for Windows 경로
→ 후보에 `uname -s` 실행
→ MINGW/MSYS/CYGWIN이면 Git Bash 확정
→ Git Bash가 없으면 pwsh 확인
→ pwsh가 없으면 winget으로 PowerShell 7 설치
→ PowerShell 7 사용
```

- 현재 PC에서는 `Default Shell: bash` 확인 완료.
- 실제 기본 `exec_command`에서 `/usr/bin/bash`, Bash 5.3.15, MINGW64 실행 확인.
- Git Bash가 PATH에 없어도 일반 Git for Windows 설치 경로를 탐색한다.
- `powershell`, `pwsh`, `cmd`, `bash`, `sh` 명시 선택 호환은 유지한다.
- `.env`의 `MCP_DEFAULT_SHELL` 설정은 제거했다.

## Git Bash 검증

현재 PC:

- Git Bash 5.3.15
- `MINGW64_NT-*` 확인
- 한글 stdout 정상
- 한글 파일 생성/Node 재읽기 정상
- UTF-8 without BOM 확인

## PowerShell 7 fallback 검증

현재 PC에 PowerShell 7을 `winget`으로 설치했다.

- PowerShell 7.6.5
- `pwsh` PATH 확인
- 한글 stdout 정상
- PowerShell 7용 임시 `.ps1`: UTF-8 without BOM
- Windows PowerShell 5.1 명시 선택 시 기존 UTF-8 호환 유지

## start.sh

Git Bash에서 WSR을 시작할 수 있도록 저장소 루트에 `start.sh`를 추가했다.

사용:

```bash
./start.sh
# 또는
bash start.sh
```

`start.bat`와 같은 핵심 흐름을 수행한다.

1. `node_modules` 없으면 `npm install`
2. `.env` 없으면 중단
3. `bin/cloudflared.exe` 없으면 다운로드
4. cloudflared 버전 표시 및 `cloudflared update`
5. `npx tsx src/server.ts` 실행

검증:

- `bash -n start.sh` PASS
- Git Bash에서 실행 가능 권한 확인
- `npm`, `curl`, `bin/cloudflared.exe` 탐지 확인
- UTF-8 without BOM 확인

현재 WSR 서버가 이미 실행 중이므로 포트 충돌을 피하기 위해 `start.sh`로 서버를 끝까지 중복 실행하는 테스트는 하지 않았다.

## UTF-8 규칙

`AGENTS.md` 규칙을 강화했다.

- 일반 소스/문서/SQL/JSON: UTF-8 without BOM
- Windows PowerShell 5.1 `Set-Content/Out-File -Encoding UTF8`로 프로젝트 파일 생성 금지
- WSR `write_file`/`apply_patch`, Git Bash, PowerShell 7을 우선
- Windows PowerShell 5.1용 임시 `.ps1`만 한글 소스 호환을 위해 BOM 허용

## WSR 한도 변경

```env
MCP_MAX_FILE_CHUNK_BYTES=4194304
MCP_MAX_EDIT_FILE_BYTES=134217728
MCP_MAX_OUTPUT_BYTES=4194304
```

- 파일 읽기 chunk: 1MB → 4MB
- 편집 가능 파일: 64MB → 128MB
- 프로세스 출력: 1MB → 4MB

`src/config.ts`의 환경변수 미지정 기본값도 같은 값으로 변경했다. 로컬 `.env`에도 반영했지만 `.env`는 Git 추적 대상이 아니다.

## 주요 변경 파일

- `.env.example`
- `AGENTS.md`
- `README.md`
- `start.sh` 신규
- `src/config.ts`
- `src/server.ts`
- `src/shells.ts` 신규
- `src/exec-tools.ts`
- `src/http-server.ts`
- `src/openapi.ts`
- `src/powershell-utf8.ts`
- `src/script-runner.ts`
- `test/shells.test.ts` 신규
- `test/powershell-utf8.test.ts`

## 최종 검증

- `npm run typecheck` PASS
- `npm test` PASS
  - 16 test files
  - 52 tests
- `npm run build` PASS
- `git diff --check` PASS
- Git Bash 기본 셸 실제 실행 PASS
- Git Bash 한글 UTF-8 / BOM 없음 PASS
- PowerShell 7 한글 UTF-8 PASS
- `start.sh` `bash -n` PASS

## 다음 작업

- 필요 시 브랜치명 정리 후 checkpoint commit
- 사용자가 요청할 때 main merge/push
- 웹사이트 Getting Started에도 `start.sh`를 추가할지는 별도 판단
