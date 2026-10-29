/* Optional offline snapshots. Nothing is downloaded until START is requested. */
'use strict';
const base=new URL(self.registration.scope),prefix='egybid-library-offline-',metaName=prefix+'meta-v1';
const manifestURL=new URL('offline-manifest.json',base).href,readyURL=new URL('__offline_ready__',base).href;
let job=null;
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
const cacheName=version=>prefix+version;
async function readySnapshot(){const meta=await caches.open(metaName),response=await meta.match(readyURL);return response?response.json():null;}
async function tell(state){for(const client of await self.clients.matchAll({type:'window',includeUncontrolled:true}))client.postMessage({type:'LIBRARY_OFFLINE_STATE',state});}
function validate(manifest){
 if(!/^[a-f0-9]{16}$/.test(manifest.version)||!Array.isArray(manifest.files)||manifest.files.length>10000)throw Error('Invalid offline manifest');
 const paths=new Set();
 for(const file of manifest.files){
  const url=new URL(file.path,base);
  if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname)||url.search||url.hash||file.path.includes('..')||paths.has(file.path)||!Number.isSafeInteger(file.bytes)||file.bytes<0||!/^[a-f0-9]{64}$/.test(file.sha256))throw Error('Invalid offline asset');
  paths.add(file.path);
 }
 return manifest;
}
async function manifestFor(version){const cache=await caches.open(cacheName(version)),response=await cache.match(manifestURL);return response?validate(await response.json()):null;}
const downloadSize=file=>file.downloadBytes??file.bytes;
async function matchesFile(response,file){
 if(!response)return false;
 const data=await response.clone().arrayBuffer();
 if(data.byteLength!==file.bytes)return false;
 const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(n=>n.toString(16).padStart(2,'0')).join('');
 return digest===file.sha256;
}
async function snapshotPlan(manifest){
 const cache=await caches.open(cacheName(manifest.version)),keys=new Set((await cache.keys()).map(r=>r.url));
 const saved=manifest.files.filter(f=>keys.has(new URL(f.path,base).href));
 const remaining=manifest.files.filter(f=>!keys.has(new URL(f.path,base).href));
 const ready=await readySnapshot();
 let source=null,previous=null;
 if(ready&&ready.version!==manifest.version){
  try{previous=await manifestFor(ready.version);if(previous)source=await caches.open(cacheName(ready.version));}catch{}
 }
 const oldFiles=new Map((previous?.files||[]).map(f=>[f.path,f]));
 const oldKeys=new Set(source?(await source.keys()).map(r=>r.url):[]);
 const reusable=new Set(remaining.filter(file=>{
  const old=oldFiles.get(file.path);
  return old?.sha256===file.sha256&&old.bytes===file.bytes&&oldKeys.has(new URL(file.path,base).href);
 }).map(f=>f.path));
 const network=remaining.filter(f=>!reusable.has(f.path));
 const state={version:manifest.version,total:manifest.files.length,done:saved.length,bytes:saved.reduce((n,f)=>n+f.bytes,0),totalBytes:manifest.bytes,phase:ready?.version===manifest.version&&saved.length===manifest.files.length?'ready':saved.length?'paused':'idle',previousReady:!!ready&&ready.version!==manifest.version,downloadFiles:network.length,downloadBytes:network.reduce((n,f)=>n+downloadSize(f),0),reuseFiles:reusable.size,incremental:true,completedAt:ready?.completedAt||null};
 return {cache,remaining,source,reusable,state};
}
async function status(manifest){return (await snapshotPlan(manifest)).state;}
function download(manifest){
 if(job)return job.promise;
 const current={version:manifest.version,cancelled:false,controller:new AbortController(),state:{version:manifest.version,total:manifest.files.length,done:0,bytes:0,totalBytes:manifest.bytes,phase:'downloading'}};job=current;
 current.promise=(async()=>{
  try{
   const plan=await snapshotPlan(manifest),{cache,remaining,source,reusable}=plan;
   current.state={...plan.state,phase:'downloading',downloadedFiles:0,reusedFiles:0};await tell(current.state);
   await cache.put(manifestURL,new Response(JSON.stringify(manifest),{headers:{'Content-Type':'application/json'}}));
   let cursor=0,last=0;
   async function worker(){
    while(!current.cancelled&&cursor<remaining.length){
     const file=remaining[cursor++],url=new URL(file.path,base).href;
     // Copy a matching saved response locally, validating it before reuse.
     let response=reusable.has(file.path)?await source.match(url):null;
     const reused=response&&await matchesFile(response,file);
     if(!reused){
      if(current.cancelled)return;
      if(reusable.has(file.path)){current.state.downloadFiles++;current.state.downloadBytes+=downloadSize(file);}
      response=await fetch(url,{cache:'no-cache',signal:current.controller.signal});
      if(!response.ok)throw Error('Download failed');
      if(!await matchesFile(response,file))throw Error('Snapshot changed');
     }
     if(current.cancelled)return;
     await cache.put(url,response);current.state.done++;current.state.bytes+=file.bytes;
     if(reused)current.state.reusedFiles++;
     else{current.state.downloadedFiles++;current.state.downloadFiles--;current.state.downloadBytes-=downloadSize(file);}
     if(Date.now()-last>150){last=Date.now();await tell(current.state);}
    }
   }
   const results=await Promise.allSettled(Array.from({length:6},worker));
   const failed=results.find(r=>r.status==='rejected');
   if(current.cancelled){current.state.phase='paused';}
   else if(failed)throw failed.reason;
   else{
    const saved=await status(manifest);
    if(saved.done!==manifest.files.length)throw Error('Incomplete snapshot');
    const meta=await caches.open(metaName);
    const completedAt=new Date().toISOString();
    await meta.put(readyURL,new Response(JSON.stringify({version:manifest.version,completedAt}),{headers:{'Content-Type':'application/json'}}));
    current.state.completedAt=completedAt;current.state.phase='ready';
    for(const key of await caches.keys())if(key.startsWith(prefix)&&key!==metaName&&key!==cacheName(manifest.version))await caches.delete(key).catch(()=>{});
   }
  }catch(error){
   current.controller.abort();current.state.phase=current.cancelled?'paused':'error';
   if(!current.cancelled)current.state.error=error.name==='QuotaExceededError'?'مساحة الجهاز غير كافية. حرّر مساحة ثم تابع التنزيل.':error.message==='Snapshot changed'?'تغيّرت نسخة الموقع أثناء التنزيل. افتح النافذة مجددًا لتحديثها.':'توقّف التنزيل. تحقق من الاتصال ثم اضغط متابعة التحميل.';
  }finally{
   if(current.state.phase!=='ready'){
    try{const pending=await status(manifest);for(const key of ['downloadFiles','downloadBytes','reuseFiles'])current.state[key]=pending[key];}catch{}
   }
   job=null;await tell(current.state);
  }
 })();return current.promise;
}
self.addEventListener('message',event=>{
 const {type,manifest}=event.data||{},reply=value=>event.ports[0]?.postMessage(value);
 event.waitUntil((async()=>{
  try{
   if(type==='STATUS'){validate(manifest);reply({ok:true,state:job?.state||await status(manifest)});}
   else if(type==='START'){
    validate(manifest);reply({ok:true});await download(manifest);
   }else if(type==='PAUSE'){if(job){job.cancelled=true;job.controller.abort();await job.promise;}reply({ok:true});}
   else if(type==='REMOVE'){
    if(job){job.cancelled=true;job.controller.abort();await job.promise;}
    for(const key of await caches.keys())if(key.startsWith(prefix))await caches.delete(key);
    reply({ok:true});
   }
  }catch{reply({ok:false,error:'تعذّر الوصول إلى التخزين المحلي. جرّب مرة أخرى.'});}
 })());
});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const url=new URL(event.request.url);
 if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname))return;
 event.respondWith((async()=>{
  // Always use the current public site online. The saved snapshot is a fallback.
  let response;try{response=await fetch(event.request);if(response.ok)return response;}catch{}
  const ready=await readySnapshot();if(!ready)return response||Response.error();
  const cache=await caches.open(cacheName(ready.version));
  let relative=url.pathname.slice(base.pathname.length);
  if(!relative)relative='index.html';
  if(event.request.mode==='navigate'){
   const article=relative.match(/^articles\/([a-f0-9]{16})(?:\/|\/index\.html)?$/);
   const collection=relative.match(/^(reading|bookmarks)(?:\/|\/index\.html)?$/);
   if(article||collection)return Response.redirect(new URL((article?'articles/'+article[1]:collection[1])+'.html'+url.search,base).href,302);
  }
  const saved=await cache.match(new URL(relative,base).href);
  return saved||response||Response.error();
 })());
});
