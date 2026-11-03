import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../docs');
const name='مكتبة المكتب المصري للتطوير الصناعي';
const ids=JSON.parse(fs.readFileSync(path.join(root,'archive.json'),'utf8')).map(article=>article.id);
const pages=['index.html','reading.html','bookmarks.html','profile.html','reading/index.html','bookmarks/index.html',...ids.flatMap(id=>['articles/'+id+'.html','articles/'+id+'/index.html'])];
let imageURL;
for(const page of pages){
 const html=fs.readFileSync(path.join(root,page),'utf8');
 const head=html.match(/<head>([\s\S]*?)<\/head>/)?.[1];
 assert.ok(head,'Explicit metadata head: '+page);
 assert.ok(html.indexOf('</head>')<html.indexOf('<body'),'Metadata must be available before body: '+page);
 const metas=new Map();
 for(const tag of head.matchAll(/<meta\b[^>]*>/g)){
  const attrs=Object.fromEntries([...tag[0].matchAll(/([\w:-]+)="([^"]*)"/g)].map(match=>[match[1],match[2]]));
  const key=attrs.property||attrs.name;
  if(key){assert.ok(!metas.has(key),'Duplicate metadata '+key+': '+page);metas.set(key,attrs.content);}
 }
 for(const key of ['og:title','og:type','og:url','og:image'])assert.ok(metas.get(key),'Missing '+key+': '+page);
 for(const key of ['og:title','og:site_name','og:description','description','twitter:title','twitter:description'])assert.equal(metas.get(key),name,'Chosen name must remain unchanged: '+page);
 assert.equal(head.match(/<title>([^<]*)<\/title>/)?.[1],name);
 const canonical=page==='index.html'?'https://egybid-library.github.io/':'https://egybid-library.github.io/'+page.replace(/\/index\.html$/,'.html');
 assert.equal(metas.get('og:url'),canonical,'Each article and redirect must identify the same canonical article: '+page);
 assert.equal(head.match(/<link rel="canonical" href="([^"]+)">/)?.[1],canonical);
 assert.equal(metas.get('og:type'),page.startsWith('articles/')?'article':'website');
 const early=head.slice(0,head.indexOf('<script'));
 assert.ok(early.includes('property="og:image"'),'Crawlers must not need JavaScript: '+page);
 imageURL??=metas.get('og:image');assert.equal(metas.get('og:image'),imageURL);
 assert.equal(metas.get('twitter:image'),imageURL);
 assert.equal(metas.get('twitter:card'),'summary_large_image');
 assert.equal(metas.get('og:image:type'),'image/jpeg');
 assert.equal(metas.get('og:image:width'),'1200');assert.equal(metas.get('og:image:height'),'630');
}
const image=new URL(imageURL);
assert.equal(image.origin,'https://egybid-library.github.io');
const bytes=fs.readFileSync(path.join(root,image.pathname));
assert.equal(bytes.readUInt16BE(0),0xffd8,'The sharing URL must point to a real JPEG');
let offset=2,dimensions;
while(offset<bytes.length){
 assert.equal(bytes[offset],0xff);
 const marker=bytes[offset+1];offset+=2;
 if(marker===0xd8||marker===0xd9)continue;
 const length=bytes.readUInt16BE(offset);
 if([0xc0,0xc1,0xc2].includes(marker)){dimensions=[bytes.readUInt16BE(offset+5),bytes.readUInt16BE(offset+3)];break;}
 offset+=length;
}
assert.deepEqual(dimensions,[1200,630]);assert.ok(bytes.length<100*1024,'Sharing image must remain small');
console.log(`PASS: ${pages.length} pages, including ${ids.length} legacy article URLs; unique canonical URLs, complete preview metadata before JavaScript, unchanged names, and a ${bytes.length}-byte 1200×630 JPEG.`);
