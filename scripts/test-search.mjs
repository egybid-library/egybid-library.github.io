import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {gzipSync} from 'node:zlib';
import {search,normalize,createSearchClient} from '../docs/search-engine.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../docs');
const read=name=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
const archive=read('archive.json'),catalog=read('library-data.json'),legacy=read('search-index.json');
assert.equal(catalog.articles.length,archive.length);
assert.deepEqual(legacy.ids,archive.map(a=>a.id));
for(const [i,article] of archive.entries()){
 for(const field of ['id','title','category','minutes','publicationDate'])assert.deepEqual(catalog.articles[i][field],article[field]);
 const part=read(catalog.excerptPrefix+Math.floor(i/64).toString(16).padStart(2,'0')+'.json');
 assert.equal(part[article.id],article.excerpt);
 if(catalog.initialExcerpts[article.id]!==undefined)assert.equal(catalog.initialExcerpts[article.id],article.excerpt);
}
const old=archive.map(a=>({id:a.id,title:normalize(a.title),content:normalize(a.text),all:normalize(a.title+' '+a.text)}));
const metadata={ids:old.map(a=>a.id),titles:old.map(a=>a.title)},url=pathToFileURL(path.join(root,catalog.searchIndex)).href;
const reads=[];
const loader=async url=>{reads.push(url);return JSON.parse(await fsp.readFile(fileURLToPath(url),'utf8'));};
const client=createSearchClient(url,metadata,loader);
const queries=new Set(['','ا','ال','الا','الشراكة','شراكة','صناع','آداب','أجل الشراكة','١٠','10','2025','الله','...','%','وال','سوق عميل','كلمةغيرموجودة123xyz','\u064e\u0651','😀','__proto__','constructor']);
for(let i=0;i<archive.length;i+=33){
 const a=archive[i],words=a.text.split(/\s+/).filter(Boolean);
 if(words.length){const word=words[Math.floor(words.length/2)];queries.add(word);if(word.length>4)queries.add(word.slice(1,-1));}
 queries.add(a.title.split(/\s+/).slice(0,2).join(' '));
}
let cases=0;const started=performance.now();
for(const query of queries){
 const terms=normalize(query).trim().split(/\s+/).filter(Boolean);
 for(const scope of ['all','title','content']){
  const expected=old.filter(a=>terms.every(term=>a[scope==='all'?'all':scope].includes(term))).map(a=>a.id);
  assert.deepEqual(await client.find(query,scope),expected,`sharded ${scope}: ${query}`);
  assert.deepEqual(search(legacy,query,scope),expected,`compatibility ${scope}: ${query}`);cases++;
 }
}
const coldReads=[],cold=createSearchClient(url,metadata,async url=>{coldReads.push(url);return JSON.parse(await fsp.readFile(fileURLToPath(url),'utf8'));});
assert.equal((await cold.find('الشراكة','title')).length,13);assert.equal(coldReads.length,0,'Title search must make no data requests');
assert.equal((await cold.find('الشراكة')).length,67);assert.equal(coldReads.length,2,'A cold full-content query must fetch only routing + one relevant shard');
const oldCount=coldReads.length;await cold.find('الشراكة');assert.equal(coldReads.length,oldCount,'Repeated searches reuse fetched chunks');
const queryWire=coldReads.reduce((sum,u)=>sum+gzipSync(fs.readFileSync(fileURLToPath(u))).length,0);assert.ok(queryWire<200*1024,'Cold content search must stay below 200 KiB compressed');
let failOnce=true;const retry=createSearchClient(url,metadata,async u=>{if(failOnce){failOnce=false;throw Error('Injected network failure');}return JSON.parse(await fsp.readFile(fileURLToPath(u),'utf8'));});
await assert.rejects(retry.find('الشراكة'));assert.equal((await retry.find('الشراكة')).length,67);
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');const initial=html.split('<div id="cards" class="cards">')[1].split('<div id="pages"')[0];
assert.equal((initial.match(/<article class="card"/g)||[]).length,20,'The HTTP document must contain 20 readable cards before scripts load');
assert.ok(gzipSync(html).length<100*1024,'Complete initial HTML and metadata must stay below 100 KiB compressed');
assert.ok(!fs.readFileSync(path.join(root,'app.js'),'utf8').includes("fetch(new URL('catalog.json"),'Startup must not wait for the previous catalog');
console.log(`PASS: ${cases} differential search cases for both engines; all ${archive.length} metadata records and excerpts unchanged.`);
console.log(`Initial HTML: ${gzipSync(html).length} compressed bytes with 20 complete cards. Cold content query: ${queryWire} bytes, ${coldReads.length} requests. Checks: ${Math.round(performance.now()-started)} ms.`);
