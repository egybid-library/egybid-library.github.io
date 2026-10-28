// Run after archive.json changes; no article text, source file or date is modified.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../docs');
const archive=JSON.parse(fs.readFileSync(path.join(root,'archive.json'),'utf8'));
const normalize=value=>value.normalize('NFKD').replace(/[\u064B-\u065F\u0670\u0640\u0300-\u036f]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').toLowerCase();
const postings=new Map();
archive.forEach((article,index)=>{
 for(const word of new Set(normalize(article.text).split(/\s+/).filter(Boolean))){
  if(!postings.has(word))postings.set(word,[]);
  postings.get(word).push(index);
 }
});
const index=JSON.stringify({ids:archive.map(a=>a.id),titles:archive.map(a=>normalize(a.title)),words:[...postings]});
const version=createHash('sha256').update(index).digest('hex').slice(0,16);
const fields=['id','title','category','excerpt','minutes','publicationDate'];
const catalog=JSON.stringify({searchIndex:'search-index.json?v='+version,articles:archive.map(a=>Object.fromEntries(fields.map(k=>[k,a[k]])))});
fs.writeFileSync(path.join(root,'search-index.json'),index);
fs.writeFileSync(path.join(root,'catalog.json'),catalog);
const catalogVersion=createHash('sha256').update(catalog).digest('hex').slice(0,16);
const appPath=path.join(root,'app.js');
fs.writeFileSync(appPath,fs.readFileSync(appPath,'utf8').replace(/catalog\.json\?v=[\w-]+/g,'catalog.json?v='+catalogVersion));
const engineVersion=createHash('sha256').update(fs.readFileSync(path.join(root,'search-engine.js'))).digest('hex').slice(0,16);
for(const name of ['app.js','search-worker.js']){
 const file=path.join(root,name);
 fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace(/search-engine\.js\?v=[\w-]+/g,'search-engine.js?v='+engineVersion));
}
const workerVersion=createHash('sha256').update(fs.readFileSync(path.join(root,'search-worker.js'))).digest('hex').slice(0,16);
fs.writeFileSync(appPath,fs.readFileSync(appPath,'utf8').replace(/search-worker\.js\?v=[\w-]+/g,'search-worker.js?v='+workerVersion));
const assets=['app.js','search-worker.js','search-engine.js'].map(name=>fs.readFileSync(path.join(root,name)));
const appVersion=createHash('sha256').update(Buffer.concat(assets)).digest('hex').slice(0,16);
for(const name of ['index.html','reading.html','bookmarks.html']){
 const page=path.join(root,name);
 fs.writeFileSync(page,fs.readFileSync(page,'utf8').replace(/app\.js\?v=[^" ]+/g,'app.js?v='+appVersion));
}
console.log(JSON.stringify({articles:archive.length,catalogBytes:Buffer.byteLength(catalog),searchIndexBytes:Buffer.byteLength(index),uniqueContentWords:postings.size,version},null,2));
