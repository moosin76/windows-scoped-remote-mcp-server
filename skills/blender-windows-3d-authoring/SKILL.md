# Blender + Windows MCP 3D Authoring 스킬

## 목적

WSR에서 Blender MCP와 Windows Computer Use MCP를 함께 사용해 실제 Blender 모델링을 반복 개선한다.

이 스킬은 DrapeFit 전용이 아니다. GAS 같은 다른 3D 제작 프로젝트에서도 그대로 재사용할 수 있도록 작성한다.

핵심 루프:

```text
Blender MCP / bpy로 3D 생성·수정
  ↓
Blender 구조 상태 조회
  ↓
Viewport Screenshot 또는 Windows Screenshot
  ↓
Vision + 필요시 OpenCV 정량 분석
  ↓
형태 판단
  ↓
Blender MCP / bpy로 수정
  ↓
재캡처·재검증
```

## 도구 우선순위

항상 다음 우선순위를 지킨다.

1. 대상 앱의 전용 MCP/API
2. 구조화된 상태 조회
3. Blender viewport screenshot
4. OpenCV 정량 분석
5. Windows Screenshot / Snapshot
6. Windows UI Automation(Click/Type/Shortcut 등)

Blender에서 가능한 작업을 마우스로 먼저 처리하지 않는다. 모델링/수정은 가능한 한 `bpy`와 Blender MCP를 사용한다.

Windows MCP는 다음 상황에 사용한다.

- Blender add-on 버튼
- file dialog
- popup
- Blender MCP로 접근하기 어려운 UI 상태
- 실제 전체 데스크톱 화면 검증

## Provider 구조

Blender:

```text
WSR
 ↓ stdio
uvx blender-mcp
 ↓ TCP
127.0.0.1:9876
 ↓
Blender MCP Add-on
 ↓
Blender
```

Windows:

```text
WSR
 ↓ stdio
uvx windows-mcp serve
 ↓
현재 로그인된 Windows Desktop Session
```

WSR namespace 적용 후 tool 이름은 `blender_*`, `windows_*` 형태로 노출된다.

## 작업 시작 체크

1. `mcp_provider_status`에서 `blender`, `windows`가 connected인지 확인한다.
2. Blender가 실행 중인지 확인한다.
3. Blender MCP 패널에서 **Start MCP Server**가 활성화되어 있어야 한다.
4. Blender MCP는 먼저 scene info 같은 읽기 tool을 smoke test한다.
5. Windows MCP는 필요할 때만 `DisplayInventory`/`Screenshot` 등을 확인한다.

## 권장 3D 제작 루프

### 1. 파라메트릭 스크립트 작성

반복 수정해야 하는 형상은 Blender UI 수작업보다 Python 파라미터를 명시적으로 둔다.

예:

```python
shoulder_width = 0.39
chest_circumference = 0.93
body_length = 0.60
sleeve_length = 0.177
```

추가 디자인 파라미터도 별도로 둔다.

```python
neck_width = ...
neck_depth_front = ...
armhole_depth = ...
waist_ease = ...
hem_ease = ...
sleeve_angle = ...
```

### 2. Blender MCP로 코드 실행

가능하면 `blender_execute_blender_code` 같은 bpy 실행 tool을 사용한다.

한 번에 너무 큰 스크립트를 보내기보다 다음처럼 나누는 것을 권장한다.

```text
scene reset
→ base geometry
→ modifiers/material
→ camera/view setup
→ save
```

실패하면 전체를 다시 보내지 말고 실패 구간만 수정한다.

### 3. 구조 상태 확인

스크린샷 전에 scene/object 정보를 먼저 확인한다.

권장 확인값:

- object 이름
- vertex/face 수
- dimensions
- location/rotation/scale
- modifier 목록
- active/selected object

숫자로 확인 가능한 것은 Vision에 맡기지 않는다.

### 4. 화면 관찰

Blender MCP viewport screenshot을 우선한다.

권장 고정 뷰:

- Front
- Right
- Back
- Perspective

가능하면 카메라/FOV/viewport framing을 고정해 iteration 간 비교 가능하게 유지한다.

### 5. Vision 분석

다음은 Vision으로 판단한다.

- 전체 비례
- 곡면의 자연스러움
- 실루엣
- 어깨/암홀/소매 각도
- 형태가 디자인 의도와 맞는지
- 국부 찌그러짐/부자연스러운 topology 징후

### 6. OpenCV 보조 검증

OpenCV는 이미지 생성용이 아니라 정량 검증용으로 사용한다.

추천 용도:

- silhouette contour
- object bounding box
- 좌우 대칭 오차
- 이전 iteration과 차이 이미지
- 고정 카메라에서 폭/높이 픽셀 비율
- reference와 정렬 후 silhouette overlap
- multi-view crop/center normalization

Blender의 실제 치수와 OpenCV 화면 측정을 혼동하지 않는다.

```text
Blender geometry = 실제 단위 권위
OpenCV screenshot = 시각 형태/비율 검증
Vision = 의미/디자인 판단
```

## OpenCV Windows 설치본 사용

현재 개발 PC 예시:

```text
OPENCV_ROOT=C:\opencv
DLL=C:\opencv\build\x64\vc16\bin
PYTHON_PACKAGE=C:\opencv\build\python
```

공식 Windows OpenCV 배포본은 Python minor version별 `cv2*.pyd`가 포함될 수 있다.
사용하는 Python 버전과 해당 바인딩 버전이 일치해야 한다.

실행 시 예:

```powershell
$env:PATH="C:\opencv\build\x64\vc16\bin;$env:PATH"
$env:PYTHONPATH="C:\opencv\build\python"
python -c "import cv2; print(cv2.__version__)"
```

`numpy`는 별도로 필요하다.

현재 개발 PC에서 실제 smoke한 조합:

```text
OpenCV 5.0.0
Python 3.9.25
NumPy 1.26.4
```

주의: 현재 `C:\\opencv`의 Python 3.9 바인딩은 NumPy 1.x ABI로 빌드되어 있어 `numpy==2.x`에서는 `_ARRAY_API not found` / `numpy.core.multiarray failed to import` 오류가 발생했다. 이 설치본을 사용할 때는 우선 다음처럼 고정한다.

```powershell
uv pip install --python <venv-python> "numpy<2"
```

실제 검증 결과 `numpy==1.26.4`에서 `cv2 5.0.0` import가 정상 동작했다.

PC 전역 PATH를 반드시 수정할 필요는 없다. 프로젝트/helper 실행 시 환경변수로 주입하는 방식을 우선한다.

OpenCV 소스 자체를 수정하지 않는 한 `C:\opencv`를 WSR workspace로 등록할 필요는 없다.

## Windows MCP 사용 원칙

기본 allowlist는 UI 관찰/입력 기능만 사용한다.

대표:

```text
windows_DisplayInventory
windows_Snapshot
windows_Screenshot
windows_Click
windows_Type
windows_Scroll
windows_Move
windows_Shortcut
windows_Wait
windows_WaitFor
```

파일/프로세스/PowerShell은 Windows MCP 대신 WSR Core의 Workspace/Exec 도구를 사용한다.

## 반복 개선 기록

각 iteration은 최소 다음을 남긴다.

```text
version
변경 파라미터
Blender 실제 dimensions
Front/Right/Perspective screenshot
OpenCV 측정값(사용한 경우)
Vision 판단
다음 수정 이유
```

최종 모델만 남기지 말고, 실패 원인과 유효했던 수정 규칙을 skill 또는 프로젝트 handoff에 축적한다.

## 프로젝트 간 재사용

### DrapeFit

- 공식 의류 실측값 → Blender parametric garment
- 스크린샷/실루엣 검증
- S/M/L grading
- 이후 body fitting / cloth simulation

### GAS

- 2D reference → Blender script 3D blockout
- 여러 각도 screenshot → Vision/OpenCV 비교
- topology/실루엣 반복 수정
- 게임용 asset export

프로젝트별 실제 치수/asset 규칙은 각 프로젝트 문서에서 관리하고 이 skill에는 특정 상품/게임 데이터 값을 하드코딩하지 않는다.

## 현재 검증된 운영 원칙

- Blender MCP/Python을 기본 조작 수단으로 사용한다.
- Windows MCP는 관찰과 UI fallback으로 제한한다.
- screenshot만 보고 실제 치수를 추정하지 않는다.
- 가능한 모든 치수는 Blender geometry에서 직접 읽는다.
- OpenCV는 고정된 viewport 조건에서 iteration 비교에 특히 유용하다.
- 생성 이미지가 아니라 실제 Blender viewport/render를 분석한다.

## 계속 보강할 항목

실제 프로젝트 작업 중 다음을 검증할 때마다 이 문서에 추가한다.

- Blender provider의 실제 tool 이름과 입력 schema
- viewport screenshot 호출 패턴
- 카메라 고정/4-view 자동 캡처 방법
- Windows Snapshot에서 Blender UI element 선택법
- OpenCV silhouette 분석 helper
- Blender save/export 안정 패턴
- 장시간 bpy 실행 시 timeout/recovery 패턴


## OpenCV silhouette helper

재사용 가능한 helper:

```text
skills/blender-windows-3d-authoring/scripts/opencv_silhouette.py
```

예:

```powershell
$env:PATH="C:\opencv\build\x64\vc16\bin;$env:PATH"
$env:PYTHONPATH="C:\opencv\build\python"
python opencv_silhouette.py --image render.png --mask-output render-mask.png
```

출력은 bbox, 화면 대비 폭/높이, contour area, centroid, 좌우 symmetry IoU를 JSON으로 반환한다.

## WSR에서 Provider Tool을 직접 호출하는 실제 패턴

2026-09-07 장난감 자동차 모델링에서 실제 검증된 방식이다. WSR 자체 Node 환경에서 MCP client를 연결한 뒤 namespaced tool을 호출한다.

```js
import 'dotenv/config';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const client = new Client({ name: '3d-authoring', version: '1' });
const transport = new StreamableHTTPClientTransport(
  new URL(`http://127.0.0.1:${process.env.MCP_PORT || 12000}/mcp`),
  {
    requestInit: {
      headers: process.env.MCP_AUTH_TOKEN
        ? { Authorization: `Bearer ${process.env.MCP_AUTH_TOKEN}` }
        : {},
    },
  },
);

await client.connect(transport);
try {
  await client.callTool({
    name: 'blender_get_scene_info',
    arguments: { user_prompt: '현재 장면 구조를 확인해줘.' },
  });

  await client.callTool({
    name: 'blender_execute_blender_code',
    arguments: { code: 'import bpy\nprint(len(bpy.context.scene.objects))' },
  });

  await client.callTool({
    name: 'blender_get_viewport_screenshot',
    arguments: { max_size: 1000 },
  });

  await client.callTool({
    name: 'windows_Snapshot',
    arguments: {
      use_vision: true,
      use_dom: false,
      use_annotation: false,
      use_ui_tree: false,
      display: [0],
    },
  });
} finally {
  await client.close();
}
```

실제 장난감 자동차 작업에서 모델링 수정은 `blender_execute_blender_code`, 관찰은 `blender_get_viewport_screenshot`, 전체 데스크톱/reference 관찰은 `windows_Snapshot`으로 분리했을 때 안정적이었다.

## 기준 마네킹 / 작업 복사본 패턴

의상이나 장비처럼 특정 캐릭터/바디를 기준으로 제작하는 경우, 바디를 매번 다시 불러오지 말고 **reference mannequin `.blend`를 먼저 고정**한다.

권장 구조:

```text
reference-body + reference-underlayer
-> immutable baseline .blend
-> generated/work copy .blend
-> garment/asset authoring
```

운영 원칙:

- 기준 `.blend`에는 바디, 기본 속옷/underlayer, 좌표계, material, collection 구조만 둔다.
- 바디와 underlayer는 선택 잠금 또는 전용 collection으로 분리한다.
- 실제 모델링은 기준 파일을 직접 수정하지 않고 작업 복사본에서 한다.
- 작업 복사본 경로는 `generated/` 또는 프로젝트의 non-authoritative work 영역을 우선한다.
- 제품/장비 치수의 authority는 reference body가 아니라 제품 spec/디자인 데이터에 둔다.
- 기준 파일은 재생성 스크립트와 함께 보관하면 다른 PC/프로젝트에서도 검증 가능하다.

실제 DrapeFit 검증 예:

```text
h162-w57 Body + h162-w57 Underwear
-> assets/mannequins/drapefit-reference-h162-w57-underwear.blend
-> generated/phase3-direct-blender/mlb-m-on-reference-working.blend
```

이 패턴은 GAS에서도 캐릭터 기본 모델 + 기본 장비/의상 상태를 기준 scene으로 고정한 뒤 게임 자산을 제작할 때 그대로 재사용할 수 있다.

## 실전 보강 — DrapeFit direct garment iteration (2026-09-07)

### Immutable baseline + working copy

사람/차량 등 반복 제작에서 기준 asset을 현재 작업 파일로 직접 수정하지 않는다.

권장:

```text
reference mannequin / base scene.blend   # immutable baseline
        ↓ Save As
working/generated/<asset>-working.blend  # 반복 작업
        ↓
final canonical asset
```

DrapeFit에서는 Body + Underwear를 먼저 기준 `.blend`로 고정하고, 상품 티셔츠는 generated working copy에서만 수정했다. GAS의 캐릭터/차량 기준 scene에도 같은 패턴을 사용한다.

### Blender MCP wrapper에서 Windows path

Node.js MCP client wrapper 안에서 Python script path를 동적으로 조합할 때는 forward slash가 가장 안전했다.

```js
const p = `D:/Godot/DrapeFit/tools/blender/${file}`;
const code = `path=r'${p}'\nexec(compile(open(path,encoding='utf-8').read(), path, 'exec'))`;
```

`D:\\...\\${file}`처럼 template interpolation 바로 앞에 backslash가 오면 `${file}`이 literal로 전달되는 실수가 생길 수 있다.

### heredoc shell 주의

`node - <<'NODE'` 형태는 Bash/Git Bash에서 사용한다. PowerShell의 `exec_command`에 그대로 넣으면 `<` parser error가 나며 Blender에는 호출이 도달하지 않는다.

- heredoc 필요 → `shell: bash`
- PowerShell → `.mjs` 파일을 저장 후 `node file.mjs` 실행하거나 PowerShell 문법 사용

### 구조 수치 우선, screenshot은 형태 검증

의상 iteration에서 실제 효과가 좋았던 순서:

```text
Blender geometry 수치/경계 검증
→ seam/boundary gap 수정
→ viewport 관찰
→ transparent render
→ OpenCV alpha silhouette
→ Vision/사람 눈 형태 판단
```

예: sleeve가 화면상 이상한 것을 감으로만 수정하지 않고 root→armhole nearest distance를 측정했다. 초기 median 약 77mm를 실제 armhole boundary 기반 root로 바꿔 약 1~2mm대로 줄였다.

### Transparent PNG + OpenCV alpha mask

OpenCV silhouette 검증은 배경 분리 threshold보다 **Blender transparent RGBA render의 alpha channel**을 사용하는 것이 안정적이다.

권장 캡처:

```text
Front / Right / Back / Perspective
800x800
fixed orthographic camera (정면/측면)
film_transparent = true
mannequin/reference objects hide_render = true
```

DrapeFit smoke에서 정상 측정된 예:

```text
Front symmetry IoU ≈ 0.9998
Front W/H aspect ≈ 1.101
Right depth/height aspect ≈ 0.443
```

숫자는 특정 상품 기준이므로 공용 skill의 acceptance threshold로 하드코딩하지 않는다.

### 상품 reference 이미지 역할 분리

의류 상품 이미지를 사용할 때 **단품(flat lay / ghost / 펼침) 이미지와 착용(worn) 이미지를 같은 authority로 취급하지 않는다.**

```text
공식 실측값 = canonical geometry의 치수 authority
단품 이미지 = neckline, sleeve opening, hem, seam/trim 같은 디자인 형태 참고
착용 이미지 = shoulder drop, armhole/underarm wrap, upper-arm fit, waist taper, drape silhouette 참고
reference mannequin = 실제 현재 body와의 공간 관계/곡률 검증
```

특히 단품 이미지의 전체 W/H나 행별 폭 비율을 그대로 착용 실루엣 목표값으로 사용하지 않는다. 펼쳐놓은 garment와 body에 착용된 garment는 중력, 체형, 포즈, 원단 신축 때문에 화면 비율이 달라진다.

### Canonical model과 fit simulation 분리

Body를 construction reference로 사용하는 경우에도 canonical object를 body surface에 억지로 projection하여 모든 penetration을 제거하지 않는다.

```text
canonical garment = rest size / 공식 치수 권위
fit copy           = Cloth 변형 결과
Body               = Collision surface
```

작은 체형에 큰 옷을 입히면 원래 큰 rest geometry가 중력/충돌에 의해 헐렁하게 내려오고, 큰 체형에 작은 옷을 입히면 cloth stretch/tension이 발생해야 한다. canonical mesh 자체를 체형마다 미리 변형하면 이 정보를 잃는다.

의상에는 Soft Body보다 Cloth + Collision을 우선한다. 과도한 strain은 후속 fit 평가에서 tight/invalid 상태로 해석할 수 있다.


### 연속 곡면 우선 — panel snap으로 volume을 만들지 않는다

DrapeFit 티셔츠 직접 모델링에서 `front/back panel -> side center snap` 방식은 수치상 seam gap이 작아도 화면에서는 종이접기처럼 보였다.

재사용 규칙:

- 몸통/차체/튜브형 부품처럼 volume이 중요한 형상은 가능한 한 **closed cross-section ring -> loft**로 생성한다.
- front/back surface를 한 점/한 선에 강제로 모아 volume을 만들지 않는다.
- joint/겨드랑이/휠아치처럼 두 곡면이 만나는 영역은 single point가 아니라 **shared arc / shared loop**를 사용한다.
- 화면에서 종이접기/핀치처럼 보이면 먼저 seam gap보다 `cross-section topology`와 `boundary loop` 구조를 확인한다.
- 여러 object를 나중에 join하더라도, construction 단계부터 서로 같은 boundary curve를 공유하게 만든다.

DrapeFit에서 실제로 안정적이었던 구조:

```text
Torso: 96-point continuous oval closed ring x vertical loft
Armhole: front boundary + shoulder + back boundary
Underarm: torso side arc
Sleeve root: armhole boundaries + underarm arc를 그대로 재사용
```

이 방식으로 torso side의 이웃 edge-length ratio max가 약 1.054로 유지됐고, 실제 mesh-surface 기준 torso/upper gap은 0.01mm 미만까지 수렴했다. 이 수치는 특정 모델의 acceptance threshold가 아니라, `continuous surface` 구조가 실제로 seam-snap 방식보다 안정적이었다는 작업 기록이다.

## OpenCV 기반 영상 멀티뷰 프레임 선택

DrapeFit/GAS처럼 회전 영상에서 정면/측면/후면 멀티뷰를 추출할 때는 단순히 영상을 4등분하지 않는다. 생성형 비디오 모델은 회전 속도가 비선형일 수 있으므로 실제 프레임 실루엣을 분석해 각도를 잡는다.

현재 개발 PC에서 검증된 실행 환경:

```text
OpenCV root: C:\opencv
OpenCV DLL: C:\opencv\build\x64\vc16\bin
OpenCV Python package: C:\opencv\build\python
ComfyUI embedded Python: C:\ComfyUI-Easy-Install\ComfyUI\python_embeded\python.exe
Python: 3.12.10
NumPy: 1.26.4
cv2: 5.0.0
```

확인 명령 예:

```powershell
$py='C:\ComfyUI-Easy-Install\ComfyUI\python_embeded\python.exe'
$env:PATH='C:\opencv\build\x64\vc16\bin;' + $env:PATH
$env:PYTHONPATH='C:\opencv\build\python'
& $py -c "import cv2, numpy; print(cv2.__version__); print(numpy.__version__)"
```

현재 ComfyUI embedded Python에는 `cv2 5.0.0`과 `numpy 1.26.4`가 이미 정상 import 되므로, 가능하면 이 환경을 우선 재사용한다. 시스템 기본 Python은 버전이나 NumPy 설치 상태가 맞지 않을 수 있으므로 무조건 사용하지 않는다.

### 회전 영상 각도 탐색 원칙

배경과 대상 의상의 색/채도 차이를 이용해 프레임별 garment silhouette을 추출하고 bounding box 폭을 계산한다.

```text
정면/후면 후보 = silhouette 폭이 큰 구간
좌/우 측면 후보 = silhouette 폭이 작은 구간
```

단, 최종 각도는 폭 extrema만으로 확정하지 않는다. 각 extrema 주변 `±3~5` 프레임을 후보로 뽑아 Vision/육안으로 정확한 정면·측면·후면 여부를 확인한다.

권장 순서:

```text
video decode
→ HSV/채도 기반 garment mask
→ morphology open/close
→ largest connected component
→ per-frame bounding box width/height/area
→ extrema 주변 후보 추출
→ Vision/육안 검증
→ 최종 0/90/180/270 저장
→ candidate/contact-sheet/임시 script 삭제
```

OpenCV는 각도를 완전히 자동 판정하는 권위가 아니라 **후보 위치를 빠르게 좁히는 정량 도구**로 사용한다. 생성형 영상은 자세/실루엣이 미세하게 morph될 수 있으므로 최종 선택은 시각 검증을 통과해야 한다.

### 업스케일 전 원칙

멀티뷰 재구성 입력은 먼저 원본 프레임의 시점 일관성과 silhouette 정확성을 확정한 뒤 업스케일한다. 업스케일은 형상 보존이 최우선이다.

우선순위:

```text
비생성형 ESRGAN / RealESRGAN / SwinIR 계열
→ 필요 시 매우 약한 detail restoration
→ diffusion 기반 생성형 upscale은 마지막 수단
```

업스케일 전후에 다음을 비교한다.

- neckline 폭/깊이
- shoulder width
- sleeve length/opening
- side silhouette
- hem contour
- logo 위치
- 전체 garment bounding box 비율

업스케일 후 형태가 바뀌면 원본 프레임을 authoritative reference로 유지하고 해당 업스케일 결과는 폐기한다.
