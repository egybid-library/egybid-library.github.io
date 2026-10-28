import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {search,normalize} from '../docs/search-engine.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../docs');
const archive=JSON.parse(fs.readFileSync(path.join(root,'archive.json'),'utf8'));
const catalog=JSON.parse(fs.readFileSync(path.join(root,'catalog.json'),'utf8'));
const index=JSON.parse(fs.readFileSync(path.join(root,'search-index.json'),'utf8'));
assert.equal(catalog.articles.length,archive.length);
assert.deepEqual(index.ids,archive.map(a=>a.id));
for(const [i,article] of archive.entries()){
 for(const field of ['id','title','category','excerpt','minutes','publicationDate'])assert.deepEqual(catalog.articles[i][field],article[field]);
}
const old=archive.map(a=>({id:a.id,title:normalize(a.title),content:normalize(a.text),all:normalize(a.title+' '+a.text)}));
// Compare the optimized engine against the original full-text behavior, including
// inside-word matches, punctuation, diacritics and terms spanning title/content.
const queries=new Set(['','الشراكة','شراكة','صناع','آداب','أجل الشراكة','١٠','10','2025','الله','...','%','وال','سوق عميل','كلمةغيرموجودة123xyz','\u064e\u0651']);
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
  assert.deepEqual(search(index,query,scope),expected,`${scope}: ${query}`);cases++;
 }
}
const catalogBytes=fs.statSync(path.join(root,'catalog.json')).size;
const archiveBytes=fs.statSync(path.join(root,'archive.json')).size;
assert.ok(catalogBytes<archiveBytes*.1,'Initial catalog must be less than 10% of the previous payload');
console.log(`PASS: ${cases} differential search cases; all ${archive.length} summaries, dates and article IDs unchanged.`);
console.log(`Initial data: ${catalogBytes} vs ${archiveBytes} bytes (${(100*(1-catalogBytes/archiveBytes)).toFixed(1)}% smaller). Search checks: ${Math.round(performance.now()-started)} ms.`);
