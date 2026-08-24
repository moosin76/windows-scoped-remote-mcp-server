# GitHub Pages 배포

이 사이트는 Quasar SSG로 정적 HTML을 생성하고 GitHub Pages에 GitHub Actions로 배포합니다.

## 1. 로컬 SSG

```bash
npm install
npm run build
```

`npm run build`는 `quasar build -m ssg`를 실행하며 결과는 `dist/ssg`에 생성됩니다.

> Quasar SSG는 현재 Beta 단계입니다. 배포 방식과 API가 변경될 수 있으므로 Quasar 업그레이드 시 공식 문서를 확인하세요.

## 2. GitHub Pages 활성화

GitHub 저장소에서:

1. **Settings → Pages**로 이동
2. **Build and deployment → Source**를 **GitHub Actions**로 선택
3. `main` 브랜치에 `website/**` 변경사항을 push
4. Actions의 **Deploy website to GitHub Pages** workflow가 실행되는지 확인

워크플로는 `website` 디렉터리에서 `npm ci` → `npm run build`를 실행하고 `website/dist/ssg`를 GitHub Pages에 배포합니다.

## 3. Custom Domain

GitHub 저장소의 **Settings → Pages → Custom domain**에서 사용할 도메인을 먼저 등록합니다.

예를 들어 `wsr.example.com`을 사용할 경우 Cloudflare DNS에 다음 레코드를 추가합니다.

```text
Type:  CNAME
Name:  wsr
Target: moosin76.github.io
```

GitHub Pages의 custom domain을 GitHub에 먼저 등록한 후 DNS를 설정하는 것을 권장합니다.

이 프로젝트는 GitHub Actions 방식으로 배포하므로 저장소에 `CNAME` 파일을 직접 추가할 필요가 없습니다.

## 4. HTTPS

DNS가 전파되면 GitHub 저장소의 **Settings → Pages**에서 HTTPS가 활성화되는지 확인하고 가능하면 **Enforce HTTPS**를 켭니다.

## 5. URL 구조

SSG가 다음 페이지를 각각 정적 HTML로 생성합니다.

```text
/
/features/
/architecture/
/getting-started/
/mcp-extension/
```

따라서 Vue Router의 history mode를 유지하면서도 GitHub Pages에서 각 URL을 직접 접근할 수 있습니다.

## 참고

- Quasar SSG: https://quasar.dev/quasar-cli-vite/developing-ssg/
- Quasar SSG 배포: https://quasar.dev/quasar-cli-vite/developing-ssg/deploying/
- GitHub Pages Actions: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- GitHub Pages Custom Domain: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site
