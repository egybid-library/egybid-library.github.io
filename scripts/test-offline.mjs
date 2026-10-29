import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto,createHash} from 'node:crypto';
const root=new URL('../docs/',import.meta.url),manifest=JSON.parse(fs.readFileSync(new URL('offline-manifest.json',root)));
const hash=data=>createHash('sha256').update(data).digest('hex');
for(const file of manifest.files){const data=fs.readFileSync(new URL(file.path,root));assert.equal(data.length,file.bytes);assert.equal(hash(data),file.sha256);}
assert.equal(manifest.articles,1950);
assert.equal(manifest.files.filter(f=>/^articles\/[a-f0-9]{16}\.html$/.test(f.path)).length,1950);
assert.ok(!manifest.files.some(f=>/^originals\/|^(archive|catalog|search-index)\.json$/.test(f.path)));
const archive=JSON.parse(fs.readFileSync(new URL('archive.json',root)));
const compare=(a,b)=>!a.publicationDate||!b.publicationDate?Number(Boolean(b.publicationDate))-Number(Boolean(a.publicationDate))||a.title.localeCompare(b.title,'ar'):b.publicationDate.localeCompare(a.publicationDate)||b.title.localeCompare(a.title,'ar');
const expected=[...archive].sort(compare).slice(0,20).map(a=>a.id);
const html=fs.readFileSync(new URL('index.html',root),'utf8'),cards=html.split('<div id="cards" class="cards">')[1].split('<div id="pages"')[0];
assert.deepEqual([...cards.matchAll(/<article class="card" data-article-id="([^"]+)"/g)].map(m=>m[1]),expected);
for(const [name,pattern] of [['app.js',/function compareArticles\(a,b\)\{([\s\S]*?)\n\}/],['article-navigation.js',/function compare\(a,b,sort\)\{([\s\S]*?)\n \}/]]){
 const body=fs.readFileSync(new URL(name,root),'utf8').match(pattern)[1];
 const cmp=new Function('a','b','sort',body),dated=archive.filter(a=>a.publicationDate);
 assert.deepEqual([...dated].sort((a,b)=>cmp(a,b,'newest')).map(a=>a.id),[...dated].sort(compare).map(a=>a.id));
 for(const date of new Set(dated.map(a=>a.publicationDate))){
  const group=dated.filter(a=>a.publicationDate===date),titles=[...group].sort((a,b)=>a.title.localeCompare(b.title,'ar'));
  assert.deepEqual([...group].sort((a,b)=>cmp(a,b,'oldest')).map(a=>a.id),titles.map(a=>a.id));
 }
}
const handlers={},stores=new Map(),messages=[],calls=[];let offline=false,failB=true,block=false;
const base='https://library.test/';
let testNow=Date.parse('2026-10-29T05:00:00Z');
class TestDate extends Date{constructor(...args){super(...(args.length?args:[testNow]));}static now(){return testNow;}}
class Cache{
 constructor(){this.data=new Map();}
 async match(request){return this.data.get(typeof request==='string'?request:request.url)?.clone();}
 async put(request,response){this.data.set(typeof request==='string'?request:request.url,response.clone());}
 async keys(){return [...this.data.keys()].map(url=>({url}));}
 async delete(url){return this.data.delete(url);}
}
const caches={async open(name){if(!stores.has(name))stores.set(name,new Cache());return stores.get(name);},async keys(){return [...stores.keys()];},async delete(name){return stores.delete(name);}};
const bodies={'index.html':'HOME','app.js':'APP','articles/0123456789abcdef.html':'ARTICLE'};
const fixture={version:'0000000000000001',articles:1,files:Object.entries(bodies).map(([path,data])=>({path,bytes:Buffer.byteLength(data),sha256:hash(data)}))};fixture.bytes=fixture.files.reduce((n,f)=>n+f.bytes,0);
const context={URL,Response,AbortController,Uint8Array,crypto:webcrypto,Date:TestDate,Promise,Set,Map,Error,caches,self:{registration:{scope:base},skipWaiting(){},clients:{claim:async()=>{},matchAll:async()=>[{postMessage:m=>messages.push(structuredClone(m))}]},addEventListener:(type,handler)=>handlers[type]=handler},fetch:async(input,options={})=>{
 const url=typeof input==='string'?input:input.url,name=new URL(url).pathname.slice(1);calls.push(name);
 if(offline)throw Error('No connection');
 if(block)return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('Abort')),{once:true}));
 if(name==='app.js'&&failB){failB=false;throw Error('Injected disconnect');}
 return new Response(bodies[name]||'LIVE',{status:200});
}};
vm.runInNewContext(fs.readFileSync(new URL('service-worker.js',root),'utf8'),context);
function send(type,data=fixture){let reply,work;handlers.message({data:{type,manifest:data},ports:[{postMessage:r=>reply=r}],waitUntil:p=>work=p});return {done:work,reply:()=>reply};}
let request=send('STATUS');await request.done;assert.equal(request.reply().state.phase,'idle');assert.equal(calls.length,0,'Status cannot download the archive');
await send('START').done;assert.equal(messages.at(-1).state.phase,'error');
assert.equal(await (await caches.open('egybid-library-offline-meta-v1')).match(base+'__offline_ready__'),undefined);
const before=calls.length;await send('START').done;assert.equal(messages.at(-1).state.phase,'ready');assert.equal(calls.length-before,1,'Resume only downloads the missing file');
const firstSavedAt=messages.at(-1).state.completedAt;assert.equal(firstSavedAt,new TestDate().toISOString());testNow+=60000;
request=send('STATUS');await request.done;assert.equal(request.reply().state.completedAt,firstSavedAt,'Opening status must not change the saved timestamp');
const meta=await caches.open('egybid-library-offline-meta-v1');
await meta.put(base+'__offline_ready__',new Response(JSON.stringify({version:fixture.version})));request=send('STATUS');await request.done;assert.equal(request.reply().state.completedAt,null,'Legacy snapshots must not get a fabricated save time');
await meta.put(base+'__offline_ready__',new Response(JSON.stringify({version:fixture.version,completedAt:firstSavedAt})));
async function get(path,mode='cors'){let result;handlers.fetch({request:{method:'GET',url:base+path,mode},respondWith:p=>result=p});return result;}
offline=true;assert.equal(await (await get('?q=test','navigate')).text(),'HOME');assert.equal(await (await get('app.js?v=abc')).text(),'APP');assert.equal((await get('articles/0123456789abcdef?nav-sort=newest','navigate')).headers.get('Location'),base+'articles/0123456789abcdef.html?nav-sort=newest');
// Updating a complete snapshot must fetch only changed/new contents.
offline=false;
const makeManifest=(version,paths)=>{const files=paths.map(path=>({path,bytes:Buffer.byteLength(bodies[path]),sha256:hash(bodies[path])}));return {version,articles:1,files,bytes:files.reduce((n,f)=>n+f.bytes,0)};};
bodies['app.js']='APP TWO';bodies['articles/fedcba9876543210.html']='NEW ARTICLE';
const update=makeManifest('0000000000000010',['index.html','app.js','articles/fedcba9876543210.html']);
request=send('STATUS',update);await request.done;assert.equal(request.reply().state.downloadFiles,2);assert.equal(request.reply().state.reuseFiles,1);
let offset=calls.length;await send('START',update).done;
assert.deepEqual(calls.slice(offset).sort(),['app.js','articles/fedcba9876543210.html']);
assert.equal(messages.at(-1).state.reusedFiles,1);assert.equal(messages.at(-1).state.downloadedFiles,2);
assert.equal(messages.at(-1).state.completedAt,new TestDate().toISOString());assert.notEqual(messages.at(-1).state.completedAt,firstSavedAt,'A successful update records its completion time');
assert.equal(stores.has('egybid-library-offline-'+fixture.version),false,'Old cache is retired only after successful update');
offline=true;assert.equal(await (await get('app.js?v=new')).text(),'APP TWO');assert.equal((await get('articles/0123456789abcdef.html')).type,'error','Deleted files are omitted from the new snapshot');offline=false;
const localOnly=structuredClone(update);localOnly.version='0000000000000011';offset=calls.length;await send('START',localOnly).done;assert.equal(calls.length,offset,'Metadata-only update does not download unchanged files');assert.equal(messages.at(-1).state.reusedFiles,3);
// An evicted or corrupted saved response must be fetched and verified again.
await (await caches.open('egybid-library-offline-'+localOnly.version)).put(base+'app.js',new Response('CORRUPTED'));
const repair=structuredClone(update);repair.version='0000000000000012';offset=calls.length;await send('START',repair).done;assert.deepEqual(calls.slice(offset),['app.js']);
await (await caches.open('egybid-library-offline-'+repair.version)).delete(base+'index.html');
const missing=structuredClone(update);missing.version='0000000000000013';offset=calls.length;await send('START',missing).done;assert.deepEqual(calls.slice(offset),['index.html']);
// Interrupted update keeps the previous offline site usable and resumes the delta.
bodies['app.js']='APP THREE';bodies['new-note.txt']='NOTE';failB=true;
const interrupted=makeManifest('0000000000000014',['index.html','app.js','articles/fedcba9876543210.html','new-note.txt']);
const beforeFailure=(await (await meta.match(base+'__offline_ready__')).json()).completedAt;testNow+=60000;
offset=calls.length;await send('START',interrupted).done;assert.equal(messages.at(-1).state.phase,'error');assert.equal(messages.at(-1).state.completedAt,beforeFailure,'Failed updates keep the previous completion time');assert.deepEqual(calls.slice(offset).sort(),['app.js','new-note.txt']);
offline=true;assert.equal(await (await get('app.js')).text(),'APP TWO','Failed update preserves the complete previous snapshot');offline=false;
offset=calls.length;await send('START',interrupted).done;assert.deepEqual(calls.slice(offset),['app.js'],'Resuming an update downloads only the remaining changed file');assert.equal(messages.at(-1).state.completedAt,new TestDate().toISOString());
const changed=structuredClone(interrupted);changed.version='0000000000000015';changed.files[0].sha256='0'.repeat(64);await send('START',changed).done;assert.equal(messages.at(-1).state.phase,'error');
offline=true;assert.equal(await (await get('index.html','navigate')).text(),'HOME','Checksum failure preserves previous snapshot');offline=false;
block=true;const paused=send('START',changed);await new Promise(resolve=>setTimeout(resolve,10));await send('PAUSE').done;await paused.done;assert.equal(messages.at(-1).state.phase,'paused');block=false;
await caches.open('unrelated-site-cache');await send('REMOVE').done;assert.deepEqual(await caches.keys(),['unrelated-site-cache']);
request=send('STATUS',interrupted);await request.done;assert.equal(request.reply().state.completedAt,null,'Removing the snapshot also removes its save time');
console.log(`PASS: ${manifest.files.length} offline checksums, 1950 articles, chronological title ties, opt-in download, interruption/resume, offline routes/search assets, incremental changed/new-only updates, zero-download updates, deleted/evicted/corrupted files, failed-update preservation, pause, durable completion timestamps, legacy/failure timestamps and isolated removal.`);
