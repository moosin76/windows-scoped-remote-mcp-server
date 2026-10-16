import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import https from "node:https";
import { spawnSync } from "node:child_process";
const FILE = join(process.cwd(), ".godot-mcp-version.json");
export const validVersion = v => /^\d+\.\d+\.\d+(?:\.\d+)?$/.test(v);
export function readState() {
  try { const s=JSON.parse(readFileSync(FILE,"utf8")); return validVersion(s.version) ? s : null; } catch { return null; }
}
export function activeGodotVersion(setting="auto") {
  if(setting && setting!=="auto") return setting;
  return readState()?.version || "4.3.0";
}
const getJson = () => new Promise((resolve,reject) => {
  const req=https.get("https://pypi.org/pypi/godot-ai/json",{timeout:10000,headers:{"User-Agent":"wsr-godot-mcp-preflight"}},res=>{
    if(res.statusCode!==200){res.resume();return reject(new Error("PyPI HTTP "+res.statusCode));}
    let body="";res.on("data",d=>{body+=d;if(body.length>4e6)req.destroy(new Error("response too large"));});
    res.on("end",()=>{try{resolve(JSON.parse(body));}catch(e){reject(e);}});
  });req.on("error",reject);req.on("timeout",()=>req.destroy(new Error("PyPI timeout")));
});
export async function updateGodotVersion({uv,setting="auto",force=false,now=Date.now(),logger=console.log}){
  const state=readState(); const current=activeGodotVersion(setting);
  if(setting!=="auto" && !validVersion(setting)) throw new Error("Invalid pinned Godot version: "+setting);
  if(setting==="auto" && !force && state?.checkedAt && now-state.checkedAt<86400000) return current;
  let candidate=current;
  if(setting==="auto"){
    try {
      const data=await getJson(); const latest=data.info?.version;
      if(validVersion(latest) && !/a|b|rc|dev/i.test(latest)) candidate=latest;
      else logger("[preflight][WARN] Latest release is not stable; preserving "+current);
    } catch(e){logger("[preflight][WARN] Godot update check failed; preserving "+current+": "+e.message);}
  }
  if(candidate!==current || !state?.verified || setting!=="auto"){
    const result=spawnSync(uv,["tool","run","--python","3.12","--link-mode","copy","--from","godot-ai=="+candidate,"godot-ai","--version"],{encoding:"utf8",timeout:120000,windowsHide:true,env:{...process.env,PYTHONUTF8:"1"}});
    if(result.status!==0){logger("[preflight][WARN] Candidate "+candidate+" failed; preserving "+current+": "+String(result.stderr||result.error||"").slice(-350));candidate=current;}
    else logger("[preflight][OK] Godot MCP "+candidate+" verified");
  }
  if(setting==="auto"){
    const next={version:candidate,verified:true,checkedAt:now};
    const tmp=FILE+".tmp-"+process.pid;
    writeFileSync(tmp,JSON.stringify(next,null,2)+"\n");renameSync(tmp,FILE);
  }
  return candidate;
}
