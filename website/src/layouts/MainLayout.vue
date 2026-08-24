<template>
  <q-layout view="hHh lpr fFf" class="site-layout">
    <q-header class="site-header">
      <q-toolbar class="site-toolbar">
        <router-link class="brand" to="/"><img class="brand-icon" src="/wsr-logo.png" alt="WSR" /><span class="brand-name">WSR</span></router-link>
        <q-space />
        <div class="desktop-nav">
          <router-link to="/features">{{ t('nav.features') }}</router-link>
          <router-link to="/architecture">{{ t('nav.architecture') }}</router-link>
          <router-link to="/getting-started">{{ t('nav.quickstart') }}</router-link>
          <router-link to="/mcp-extension">{{ t('nav.extension') }}</router-link>
        </div>
        <q-btn flat round dense class="theme-btn" @click="toggleTheme" :aria-label="isDark ? '라이트 모드' : '다크 모드'"><q-icon :name="isDark ? 'light_mode' : 'dark_mode'" size="18px" /></q-btn>
        <q-btn flat round dense class="lang-btn"><span class="lang-label">{{ locale === 'ko' ? 'KR' : 'EN' }}</span><q-icon name="expand_more" size="16px" /><q-menu class="lang-menu"><q-list dense><q-item clickable v-close-popup @click="setLocale('ko')"><q-item-section>한국어</q-item-section></q-item><q-item clickable v-close-popup @click="setLocale('en')"><q-item-section>English</q-item-section></q-item></q-list></q-menu></q-btn>
        <a class="github-btn" href="https://github.com/moosin76/windows-scoped-remote-mcp-server" target="_blank" rel="noreferrer">GitHub ↗</a>
      </q-toolbar>
    </q-header>
    <q-page-container><router-view /><footer class="site-footer"><div class="footer-inner"><div><div class="footer-brand">Windows Scoped Remote MCP Server</div><div class="footer-copy">ChatGPT와 Windows 개발환경을 연결하는 MCP Gateway</div></div><div class="footer-links"><router-link to="/features">{{ t('nav.features') }}</router-link><router-link to="/architecture">{{ t('nav.architecture') }}</router-link><router-link to="/getting-started">{{ t('nav.quickstart') }}</router-link><router-link to="/mcp-extension">{{ t('nav.extension') }}</router-link><a href="https://github.com/moosin76/windows-scoped-remote-mcp-server" target="_blank" rel="noreferrer">GitHub ↗</a><a class="sponsor-link" href="https://github.com/sponsors/moosin76" target="_blank" rel="noreferrer">♥ 후원하기</a></div><div class="footer-bottom">© 2026 Windows Scoped Remote MCP Server · Open Source</div></div></footer></q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
const locale = ref<'ko' | 'en'>('ko')
const isDark = ref(true)
const messages = { ko: { nav: { features:'주요 기능', architecture:'아키텍처', quickstart:'시작하기', extension:'MCP 확장' } }, en: { nav: { features:'Features', architecture:'Architecture', quickstart:'Get started', extension:'MCP Extension' } } }
const t = (key: 'nav.features'|'nav.architecture'|'nav.quickstart'|'nav.extension') => { const [g,k] = key.split('.') as ['nav', keyof typeof messages.ko.nav]; return messages[locale.value][g][k] }
const applyTheme = (dark: boolean) => { isDark.value = dark; document.body.classList.toggle('theme-dark', dark); document.body.classList.toggle('theme-light', !dark); localStorage.setItem('wsr-theme', dark ? 'dark' : 'light') }
const toggleTheme = () => applyTheme(!isDark.value)
const setLocale = (v: 'ko'|'en') => { locale.value = v; window.dispatchEvent(new CustomEvent('wsr-locale-change', { detail:v })) }
onMounted(() => applyTheme(localStorage.getItem('wsr-theme') !== 'light'))
</script>

<style scoped>
.site-layout { background:var(--wsr-bg); color:var(--wsr-text); transition:background .25s ease,color .25s ease; }
.site-header { background:color-mix(in srgb,var(--wsr-bg) 88%,transparent); backdrop-filter:blur(18px); border-bottom:1px solid var(--wsr-line); transition:background .25s ease,border-color .25s ease; }
.site-toolbar { height:76px; width:min(1160px,calc(100% - 48px)); margin:auto; padding:0; }
.brand { display:flex;align-items:center;gap:10px;color:var(--wsr-text);text-decoration:none;font-weight:800;letter-spacing:.16em; }
.brand-icon { display:block;width:32px;height:32px;object-fit:contain;border-radius:8px; }
.desktop-nav { display:flex;gap:30px;margin-right:14px; }
.desktop-nav a { color:var(--wsr-muted);text-decoration:none;font-size:13px;transition:color .2s; }
.desktop-nav a:hover { color:var(--wsr-text); }
.theme-btn,.lang-btn { color:var(--wsr-muted); }
.lang-btn { margin-right:5px; }.lang-label{font-size:10px;font-weight:700;letter-spacing:.08em}
.lang-menu { background:var(--wsr-surface);color:var(--wsr-text);border:1px solid var(--wsr-line); }
.github-btn { border:1px solid var(--wsr-line);border-radius:20px;padding:9px 15px;color:var(--wsr-muted);text-decoration:none;font-size:12px;font-weight:650;transition:.2s; }
.github-btn:hover { color:var(--wsr-text);border-color:var(--wsr-muted-2); }
.site-footer{margin-top:80px;border-top:1px solid var(--wsr-line);background:var(--wsr-surface);color:var(--wsr-text)}.footer-inner{width:min(1160px,calc(100% - 48px));margin:auto;padding:42px 0 26px}.footer-brand{font-size:14px;font-weight:750;letter-spacing:.02em}.footer-copy{margin-top:8px;color:var(--wsr-muted);font-size:12px}.footer-links{display:flex;flex-wrap:wrap;gap:20px;margin-top:26px}.footer-links a{color:var(--wsr-muted);text-decoration:none;font-size:12px}.footer-links a:hover{color:var(--wsr-text)}.footer-links .sponsor-link{font-weight:700}.footer-bottom{margin-top:30px;padding-top:18px;border-top:1px solid var(--wsr-line);color:var(--wsr-muted-2);font-size:11px}@media(max-width:700px){.site-toolbar{width:calc(100% - 32px)}.desktop-nav{display:none}.github-btn{display:none}.footer-inner{width:calc(100% - 32px)}}
</style>
