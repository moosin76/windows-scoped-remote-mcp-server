import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
const FILE=".mcp-python-selection.json";
export function selected(name){try{return JSON.parse(readFileSync(FILE,"utf8"))[name]||""}catch{return ""}}
const call=(uv,args,timeout=90000)=>spawnSync(uv,args,{encoding:"utf8",timeout,windowsHide:true,env:{...process.env,PYTHONUTF8:"1"}});
const versions=output=>[...new Set([...String(output||"").matchAll(/cpython-(\d+\.\d+)(?:\.\d+)?-windows-/g)].map(x=>x[1]))].sort((a,b)=>Number(b.split(".")[0])-Number(a.split(".")[0])||Number(b.split(".")[1])-Number(a.split(".")[1]));
export function candidates(uv){return versions(call(uv,["python","list","--only-installed"],12000).stdout)}
export function verify(uv,name,from,bin,{allowInstall=false}={}){
 const installed=candidates(uv);
 const preferred=selected(name);
 const tries=[...new Set([preferred,...installed].filter(Boolean))];
 if(allowInstall){
   // Query uv's supported CPython releases. No fixed Python minor version.
   const available=versions(call(uv,["python","list"],15000).stdout);
   tries.push(...available.filter(v=>!tries.includes(v)).slice(0,4));
 }
 let last="",attempts=0;
 for(const python of tries){
  if(!installed.includes(python)){
   if(!allowInstall) continue;
   const install=call(uv,["python","install",python],120000);
   if(install.status!==0){last=String(install.stderr||install.error||"").slice(-350);continue;}
  }
  attempts++;
  const buildFlags=name==="blender"?["--no-build-package","pyyaml"]:["--no-build"];
  const args=["tool","run",...buildFlags,"--python",python,"--link-mode","copy","--from",from,bin,name==="blender"?"--help":"--version"];
  const r=call(uv,args);
  if(r.status===0){
    let all={};try{all=JSON.parse(readFileSync(FILE,"utf8"))}catch{}
    all[name]=python;const tmp=FILE+".tmp-"+process.pid;writeFileSync(tmp,JSON.stringify(all,null,2)+"\n");renameSync(tmp,FILE);
    return {ok:true,python,attempts};
  }
  last=String(r.stderr||r.error||"").slice(-350);
 }
 return {ok:false,error:last||"No compatible Python was found.",attempts};
}
