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
