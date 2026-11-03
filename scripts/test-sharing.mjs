import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../docs');
const name='مكتبة المكتب المصري للتطوير الصناعي';
const archive=JSON.parse(fs.readFileSync(path.join(root,'archive.json'),'utf8'));
const ids=archive.map(article=>article.id);
const articles=new Map(archive.map(article=>[article.id,article]));
const escape=value=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const articlePreviews=new Map();
const pages=['index.html','reading.html','bookmarks.html','profile.html','reading/index.html','bookmarks/index.html',...ids.flatMap(id=>['articles/'+id+'.html','articles/'+id+'/index.html'])];
let imageURL;
const shareImages=JSON.parse(fs.readFileSync(path.join(root,'assets/article-previews/manifest.json'),'utf8'));
const imageIds=new Set();
const sample=fs.readFileSync(path.join(root,'articles/000e44292e63576b.html'),'utf8');
assert.ok(sample.includes('<meta property="og:description" content="في معظم البزانس بتاعتنا، بنسأل سؤال: «بعت بكام السنة اللي فاتت،'),'Use the article opening, including its current punctuation');
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
 const id=page.match(/^articles\/([a-f0-9]{16})/)?.[1];
 const article=articles.get(id),title=article?article.title:name;
 assert.equal(metas.get('og:site_name'),name,'Library identity stays unchanged: '+page);
 for(const key of ['og:title','twitter:title'])assert.equal(metas.get(key),escape(title),'Article-specific title: '+page);
 assert.equal(head.match(/<title>([^<]*)<\/title>/)?.[1],escape(article?title+' | '+name:name));
 const description=metas.get('description');
 for(const key of ['og:description','twitter:description'])assert.equal(metas.get(key),description,'Consistent excerpt: '+page);
 if(article){
  assert.ok(description&&description!==name,'Article needs its own excerpt: '+page);
  const pair={title:metas.get('og:title'),description};
  if(articlePreviews.has(id))assert.deepEqual(pair,articlePreviews.get(id),'Legacy route must share the article preview');
  else articlePreviews.set(id,pair);
 }else assert.equal(description,name);
 const canonical=page==='index.html'?'https://egybid-library.github.io/':'https://egybid-library.github.io/'+page.replace(/\/index\.html$/,'.html');
 assert.equal(metas.get('og:url'),canonical,'Each article and redirect must identify the same canonical article: '+page);
 assert.equal(head.match(/<link rel="canonical" href="([^"]+)">/)?.[1],canonical);
 assert.equal(metas.get('og:type'),page.startsWith('articles/')?'article':'website');
 const early=head.slice(0,head.indexOf('<script'));
 assert.ok(early.includes('property="og:image"'),'Crawlers must not need JavaScript: '+page);
 let expectedImage;
 if(article){
  const entry=shareImages.articles[id];assert.ok(entry,'Missing article title image: '+id);
  assert.equal(entry.title,article.title);assert.equal(entry.lines.join(' '),article.title.replace(/\s+/g,' ').trim(),'Image must preserve every title word and number');
  assert.ok(entry.widths.every(width=>width<=1008.01),'Image title must fit');
  expectedImage='https://egybid-library.github.io/assets/article-previews/'+entry.file;imageIds.add(id);
  assert.equal(metas.get('og:image:alt'),escape(article.title));assert.equal(metas.get('twitter:image:alt'),escape(article.title));
 }else{imageURL??=metas.get('og:image');expectedImage=imageURL;}
 assert.equal(metas.get('og:image'),expectedImage);assert.equal(metas.get('twitter:image'),expectedImage);
 assert.equal(metas.get('og:image:secure_url'),expectedImage);
 assert.equal(metas.get('twitter:card'),'summary_large_image');
 assert.equal(metas.get('og:image:type'),article?'image/png':'image/jpeg');
 assert.equal(metas.get('og:image:width'),'1200');assert.equal(metas.get('og:image:height'),'630');
}
assert.equal(imageIds.size,ids.length);assert.equal(Object.keys(shareImages.articles).length,ids.length);
let imageBytes=0;
for(const id of ids){
 const entry=shareImages.articles[id];assert.match(entry.file,new RegExp('^'+id+'-[a-f0-9]{16}\\.png$'));
 const data=fs.readFileSync(path.join(root,'assets/article-previews',entry.file));
 assert.deepEqual([...data.subarray(0,8)],[137,80,78,71,13,10,26,10]);assert.equal(data.readUInt32BE(16),1200);assert.equal(data.readUInt32BE(20),630);
 assert.equal(data.length,entry.bytes);assert.ok(data.length<150*1024,'Title image must remain small');
 assert.equal(createHash('sha256').update(data).digest('hex'),entry.sha256);imageBytes+=data.length;
}
assert.equal(fs.readdirSync(path.join(root,'assets/article-previews')).filter(name=>name.endsWith('.png')).length,ids.length);
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
console.log(`PASS: ${pages.length} pages, including ${ids.length} legacy article URLs; unique canonical URLs, complete preview metadata before JavaScript, article titles and opening excerpts, preserved library identity, and ${ids.length} unique 1200×630 title images (${imageBytes} bytes total).`);
