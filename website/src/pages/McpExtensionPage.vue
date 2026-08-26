<template>
  <q-page class="extension-page">
    <section class="hero section-shell">
      <div class="eyebrow">MCP EXTENSIBILITY</div>
      <h1 v-if="locale === 'ko'">필요한 MCP를<br /><span>연결하고 확장하세요.</span></h1>
      <h1 v-else>Connect the MCPs<br /><span>your workflow needs.</span></h1>
      <p>{{ tr('hero') }}</p><div class="ai-callout"><strong>{{ tr('aiCalloutTitle') }}</strong><p>{{ tr('aiCalloutText') }}</p><div class="flow-line"><span>① MCP 서버 준비</span><b>→</b><span>② AI에게 연결 요청</span><b>→</b><span>③ WSR 반영/재시작</span><b>→</b><span>④ 이후 상태 자동 추적</span></div></div>
    </section>

    <section class="section-shell intro-grid">
      <div><div class="eyebrow">01 · HOW IT WORKS</div><h2>{{ tr('howTitle') }}</h2></div>
      <div><p>{{ tr('howText') }}</p><div class="flow"><span>Remote MCP</span><b>→</b><span>RemoteMcpProvider</span><b>→</b><span>WSR Gateway</span><b>→</b><span>ChatGPT</span></div></div>
    </section>

    <section class="section-shell cards-section">
      <div class="section-head"><div class="eyebrow">02 · ADD A PROVIDER</div><h2>{{ tr('stepsTitle') }}</h2><p>{{ tr('stepsText') }}</p></div>
      <div class="cards">
        <article><span class="num">01</span><h3>{{ tr('s1') }}</h3><p>{{ tr('s1p') }}</p><code>MCP endpoint<br />transport · auth<br />tools/list · JSON Schema</code></article>
        <article><span class="num">02</span><h3>{{ tr('s2') }}</h3><p>{{ tr('s2p') }}</p><code>id: blender<br />namespace: blender<br />url: http://127.0.0.1:xxxx/mcp</code></article>
        <article><span class="num">03</span><h3>{{ tr('s3') }}</h3><p>{{ tr('s3p') }}</p><code>get_scene<br />↓<br />godot_get_scene</code></article>
        <article><span class="num">04</span><h3>{{ tr('s4') }}</h3><p>{{ tr('s4p') }}</p><code>Core tools  ✓<br />Playwright   ✓<br />Provider     unavailable</code></article>
      </div>
    </section>

    <section class="section-shell godot">
      <div class="eyebrow">03 · EXAMPLE</div><h2>{{ tr('exampleTitle') }} <span>Godot MCP</span></h2>
      <p>{{ tr('exampleText') }}</p>
      <div class="code-card"><pre><code><span>new RemoteMcpProvider({</span>
  id: <b>"godot"</b>,
  namespace: <b>"godot"</b>,
  url: <b>"http://127.0.0.1:8000/mcp"</b>,
})</code></pre></div>
    </section>

    <section class="section-shell lifecycle">
      <div class="section-head"><div class="eyebrow">04 · RESILIENCE</div><h2>{{ tr('lifeTitle') }}</h2><p>{{ tr('lifeText') }}</p></div>
      <div class="scheduler"><div><b>ProviderScheduler</b><span>health check · reconnect · tools/list · notify</span></div><div><b>10s</b><span>{{ tr('connected') }}</span></div><div><b>5s</b><span>{{ tr('retry') }}</span></div></div>
    </section>

    <section class="section-shell ai-note"><div class="note-icon">✦</div><div><div class="eyebrow">AI-FIRST WORKFLOW</div><h2>{{ tr('aiTitle') }}</h2><p>{{ tr('aiText') }}</p></div></section>
  </q-page>
</template>
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
const locale=ref<'ko'|'en'>('ko')
const d={ko:{hero:'WSR은 특정 MCP나 하나의 transport에 종속되지 않습니다. 지원되는 Remote MCP를 Provider로 연결하고 namespace를 적용해 하나의 Gateway 안에서 확장할 수 있습니다.',howTitle:'MCP를 직접 구현하지 않고 Provider로 연결합니다.',howText:'RemoteMcpProvider가 외부 MCP의 연결과 tool 호출을 담당하고 ProviderRegistry가 이를 WSR의 MCP Server에 노출합니다. 새로운 MCP마다 별도의 Gateway를 만들 필요가 없습니다.',stepsTitle:'새 MCP를 연결하는 기본 흐름',stepsText:'실제 사용자는 연결 정보를 준비해 AI에게 작업을 요청하는 방식으로 확장할 수 있습니다. 개발자는 아래 구조만 이해하면 됩니다.',s1:'연결 정보를 확인',s1p:'MCP의 endpoint, transport, 인증 방식, tools/list 지원 여부와 실행 방법을 확인합니다.',s2:'Provider로 등록',s2p:'RemoteMcpProvider를 재사용해 id, namespace, URL을 등록합니다.',s3:'Namespace 적용',s3p:'원격 tool 이름 앞에 Provider namespace를 붙여 충돌을 방지합니다.',s4:'독립적으로 운영',s4p:'Provider가 꺼져도 WSR Core와 다른 기능은 계속 동작합니다.',exampleTitle:'이미 연결된',exampleText:'Godot MCP는 이 구조를 사용하는 실제 예입니다. 같은 패턴으로 Blender나 다른 Remote MCP도 연결할 수 있습니다.',lifeTitle:'Provider 하나가 꺼져도 Gateway는 계속됩니다.',lifeText:'ProviderScheduler가 상태를 확인하고 연결이 끊긴 Provider는 다시 연결을 시도합니다. Tool 목록이 바뀌면 Registry snapshot을 갱신하고, 지원하는 modern MCP 클라이언트에는 tools/list_changed 알림을 전달합니다.',connected:'연결된 Provider health check',retry:'연결되지 않은 Provider 재시도',aiCalloutTitle:'MCP 서버를 켜고 AI에게 연결을 부탁하세요.',aiCalloutText:'WSR의 MCP 확장 구조와 등록 방법은 skills 문서로 정의되어 있습니다. 새 Provider를 코드/설정에 추가한 최초 1회는 WSR을 재시작하고 Tool 목록을 새로고침하세요. 그 이후 Provider 서버의 실행·종료·재연결과 Tool 목록 변경은 Scheduler가 자동 추적하며, 지원하는 modern 클라이언트에는 변경 알림도 전달합니다.',aiTitle:'사람보다 AI가 연결 작업을 수행할 수 있도록.',aiText:'MCP 확장은 반복적인 설정 작업이 많은 영역입니다. WSR의 구조를 이해한 AI에게 원하는 MCP를 연결하도록 요청하는 방식도 자연스럽게 사용할 수 있습니다.'},en:{hero:'WSR is not tied to a single MCP or transport. Supported Remote MCP servers can be connected as Providers and extended through namespaces behind one gateway.',howTitle:'Connect MCPs through Providers, not custom gateways.',howText:'RemoteMcpProvider handles remote connections and tool calls, while ProviderRegistry exposes them through the WSR MCP server. You do not need a separate gateway implementation for every MCP.',stepsTitle:'The basic flow for adding an MCP',stepsText:'In practice, a user can provide the connection details and ask an AI to perform the integration. Developers only need to understand the structure below.',s1:'Inspect connection details',s1p:'Check the endpoint, transport, authentication, tools/list support and how the MCP server is started.',s2:'Register a Provider',s2p:'Reuse RemoteMcpProvider and register an id, namespace and URL.',s3:'Apply a namespace',s3p:'Prefix remote tool names with the Provider namespace to prevent collisions.',s4:'Keep it isolated',s4p:'The WSR Core and other capabilities continue working when one Provider is unavailable.',exampleTitle:'Already connected:',exampleText:'Godot MCP is a real example of this architecture. The same pattern can connect Blender or other Remote MCP servers.',lifeTitle:'The Gateway survives a Provider failure.',lifeText:'ProviderScheduler checks health and retries unavailable Providers. When tool definitions change it refreshes the Registry snapshot and notifies supported modern MCP clients with tools/list_changed.',connected:'Connected Provider health check',retry:'Unavailable Provider retry',aiCalloutTitle:'Start the MCP server and ask AI to connect it.',aiCalloutText:'The WSR MCP extension and registration process are defined in the skills documentation. After a new Provider is added to code/config, restart WSR once and refresh the tool list. From then on the Scheduler tracks Provider start/stop/reconnect and tool-list changes automatically, notifying supported modern clients when tools change.',aiTitle:'Let AI do more of the integration work.',aiText:'MCP extension often involves repetitive configuration. You can naturally ask an AI that understands the WSR structure to connect the MCP you need.'}}
const tr=(k:string)=>(d[locale.value] as Record<string,string>)[k]??k
const onLocale=(e:Event)=>locale.value=(e as CustomEvent<'ko'|'en'>).detail
onMounted(()=>window.addEventListener('wsr-locale-change',onLocale));onUnmounted(()=>window.removeEventListener('wsr-locale-change',onLocale))
</script>
<style scoped>
.extension-page{--line:var(--wsr-line);--muted:var(--wsr-muted);--accent:var(--wsr-accent);background:var(--wsr-bg);color:var(--wsr-text);min-height:100%;font-family:Inter,ui-sans-serif,system-ui,sans-serif}.section-shell{width:min(1120px,calc(100% - 48px));margin:auto}.hero{text-align:center;padding:105px 0 120px}.eyebrow{font-size:10px;letter-spacing:.17em;font-weight:800;color:var(--muted)}h1{font-size:clamp(48px,6vw,76px);line-height:1.04;letter-spacing:-.055em;margin:22px 0}h1 span,h2 span{background:var(--wsr-gradient);-webkit-background-clip:text;background-clip:text;color:transparent}.hero p{max-width:690px;margin:auto;color:var(--muted);line-height:1.8;font-size:16px}.ai-callout{max-width:900px;margin:40px auto 0;padding:24px;border:1px solid var(--line);border-radius:10px;background:var(--wsr-surface);text-align:left}.ai-callout strong{font-size:16px}.ai-callout p{margin:8px 0 18px!important;font-size:13px}.flow-line{display:flex;align-items:center;flex-wrap:wrap;gap:9px;font:11px ui-monospace,monospace;color:var(--muted)}.flow-line span{padding:8px 10px;border:1px solid var(--line);border-radius:6px}.flow-line b{color:var(--accent)}.intro-grid,.cards-section,.godot,.lifecycle,.ai-note{border-top:1px solid var(--line)}.intro-grid{display:grid;grid-template-columns:1fr 1.3fr;gap:90px;padding:90px 0}.intro-grid h2,.section-head h2,.godot h2,.ai-note h2{font-size:39px;line-height:1.12;letter-spacing:-.04em;margin:18px 0}.intro-grid p,.section-head p,.godot>p,.ai-note p{color:var(--muted);line-height:1.8}.flow{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-top:35px;font:11px ui-monospace,monospace}.flow span{padding:10px 13px;border:1px solid var(--line);border-radius:7px;background:var(--wsr-surface)}.flow b{color:var(--accent)}.cards-section{padding:100px 0}.section-head{max-width:700px}.cards{display:grid;grid-template-columns:repeat(2,1fr);gap:1px;background:var(--line);margin-top:55px}.cards article{background:var(--wsr-bg);padding:30px;min-height:245px}.num{font:11px ui-monospace,monospace;color:var(--accent)}.cards h3{font-size:18px;margin:45px 0 10px}.cards p{color:var(--muted);font-size:13px;line-height:1.7;max-width:430px}.cards code{display:block;background:var(--wsr-surface);border:1px solid var(--line);border-radius:7px;padding:12px;margin-top:20px;color:var(--muted);font:10px/1.7 ui-monospace,monospace}.godot{padding:100px 0}.code-card{max-width:650px;margin-top:35px;border:1px solid var(--line);border-radius:10px;background:var(--wsr-surface);overflow:hidden}.code-card pre{padding:22px;margin:0;color:var(--muted);font:12px/1.8 ui-monospace,monospace}.code-card b{color:var(--accent)}.lifecycle{padding:100px 0}.scheduler{display:grid;grid-template-columns:2fr 1fr 1fr;gap:1px;background:var(--line);margin-top:50px}.scheduler div{background:var(--wsr-bg);padding:25px}.scheduler b{display:block;font-size:22px;color:var(--accent);margin-bottom:8px}.scheduler span{font-size:11px;color:var(--muted)}.ai-note{display:flex;gap:25px;padding:75px 0 110px}.note-icon{color:var(--accent);font-size:28px}.ai-note h2{font-size:30px}@media(max-width:760px){.intro-grid{grid-template-columns:1fr;gap:20px}.cards,.scheduler{grid-template-columns:1fr}.flow{line-height:1.4}.hero{padding-top:70px}.section-shell{width:calc(100% - 32px)}}
</style>
