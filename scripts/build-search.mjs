// Derived assets only: preserve every article, source file and publication date.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {normalize,shardBucket} from '../docs/search-engine.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../docs');
const archive=JSON.parse(fs.readFileSync(path.join(root,'archive.json'),'utf8'));
const articleById=new Map(archive.map(article=>[article.id,article]));
const hash=value=>createHash('sha256').update(value).digest('hex').slice(0,16);
const write=(name,value)=>{const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,typeof value==='string'?value:JSON.stringify(value));};
const postings=new Map();
archive.forEach((article,index)=>{
 for(const word of new Set(normalize(article.text).split(/\s+/).filter(Boolean))){
  if(!postings.has(word))postings.set(word,[]);
  postings.get(word).push(index);
 }
});
const ids=archive.map(a=>a.id),titles=archive.map(a=>normalize(a.title));
const legacyIndex=JSON.stringify({ids,titles,words:[...postings]});
const legacyVersion=hash(legacyIndex);
// Keep compatibility assets for readers who still have the previous application cached.
write('search-index.json',legacyIndex);
write('catalog.json',{searchIndex:'search-index.json?v='+legacyVersion,articles:archive.map(a=>Object.fromEntries(['id','title','category','excerpt','minutes','publicationDate'].map(k=>[k,a[k]])))});
const version=hash('query-shards-v1\n'+legacyIndex);
const prefix='search/v-'+version+'/';
const longBuckets=Array.from({length:512},()=>Object.create(null));
const shortPostings=new Map();
for(const [word,articles] of postings){
 for(let length=1;length<=Math.min(3,word.length);length++){
  for(const gram of new Set(Array.from({length:word.length-length+1},(_,i)=>word.slice(i,i+length)))){
   if(!shortPostings.has(gram))shortPostings.set(gram,new Set());
   const found=shortPostings.get(gram);for(const i of articles)found.add(i);
   if(length===3){const bucket=longBuckets[shardBucket(gram,512)];(bucket[gram]??=[]).push([word,articles]);}
  }
 }
}
const shortBuckets=Array.from({length:256},()=>Object.create(null));
for(const [gram,found] of shortPostings){
 const list=[...found].sort((a,b)=>a-b),bytes=Buffer.alloc(Math.ceil(archive.length/8));
 for(const i of list)bytes[i>>3]|=1<<(i&7);
 const packed=bytes.toString('base64');
 shortBuckets[shardBucket(gram,256)][gram]=JSON.stringify(list).length<packed.length+2?list:packed;
}
const counts=Object.create(null);let shardBytes=0,wireBytes=0,maxWire=0;
longBuckets.forEach((data,i)=>{
 for(const [gram,words] of Object.entries(data))counts[gram]=words.length;
 const json=JSON.stringify(data);write(prefix+'long/'+i.toString(16).padStart(3,'0')+'.json',json);
 shardBytes+=Buffer.byteLength(json);const wire=gzipSync(json).length;wireBytes+=wire;maxWire=Math.max(maxWire,wire);
});
shortBuckets.forEach((data,i)=>write(prefix+'short/'+i.toString(16).padStart(2,'0')+'.json',data));
const sortedCounts=Object.fromEntries(Object.entries(counts).sort(([a],[b])=>a<b?-1:a>b?1:0));
write(prefix+'routes.json',sortedCounts);
const collator=new Intl.Collator('ar'),number=new Intl.NumberFormat('ar-EG');
const readingTime=count=>count===1?'دقيقة واحدة':count===2?'دقيقتان':number.format(count)+(count%100>=3&&count%100<=10?' دقائق':' دقيقة');
const initial=[...archive].sort((a,b)=>{
 if(!a.publicationDate||!b.publicationDate)return Number(Boolean(b.publicationDate))-Number(Boolean(a.publicationDate))||collator.compare(a.title,b.title);
 return b.publicationDate.localeCompare(a.publicationDate)||collator.compare(b.title,a.title);
}).slice(0,20);
const initialExcerpts=Object.fromEntries(initial.map(a=>[a.id,a.excerpt]));
const excerptVersion=hash(JSON.stringify(archive.map(a=>[a.id,a.excerpt])));
const excerptPrefix='excerpts/v-'+excerptVersion+'/';
for(let i=0;i<archive.length;i+=64)write(excerptPrefix+Math.floor(i/64).toString(16).padStart(2,'0')+'.json',Object.fromEntries(archive.slice(i,i+64).map(a=>[a.id,a.excerpt])));
const data={searchIndex:prefix+'routes.json',excerptPrefix,articles:archive.map(a=>Object.fromEntries(['id','title','category','minutes','publicationDate'].map(k=>[k,a[k]]))),initialExcerpts};
const dataJSON=JSON.stringify(data);write('library-data.json',dataJSON);
const escaped=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateFormat=new Intl.DateTimeFormat('ar-EG',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
const bookmarkIcon=fs.readFileSync(path.join(root,'bookmarks.js'),'utf8').match(/ const icon='([^\n]+)';/)[1];
const firstCards=initial.map(a=>`<article class="card" data-article-id="${a.id}" data-published="${a.publicationDate||''}"><a class="card-link" href="articles/${a.id}.html?nav-sort=newest"><div class="card-top"><span>${escaped(a.category)}</span><span>↖</span></div><h3>${escaped(a.title)}</h3><div class="card-date">${a.publicationDate?'<time datetime="'+a.publicationDate+'">'+dateFormat.format(new Date(a.publicationDate+'T00:00:00Z'))+'</time>':'تاريخ النشر غير متاح'}</div><p>${escaped(a.excerpt)}</p><div class="card-bottom">مدة القراءة: ${readingTime(a.minutes)} <span>اقرأ المقال ←</span></div></a><div class="card-tools"><button type="button" class="read-toggle" data-read-toggle data-article-id="${a.id}" aria-pressed="false">علّم كمقروء</button><button type="button" class="bookmark-toggle" data-bookmark-toggle data-article-id="${a.id}" data-bookmark-title="${escaped(a.title)}" aria-pressed="false" aria-label="${escaped('إضافة إلى المحفوظات: '+a.title)}" title="إضافة إلى المحفوظات">${bookmarkIcon}</button></div></article>`).join('');
for(const name of ['index.html','reading.html','bookmarks.html']){
 const file=path.join(root,name);let html=fs.readFileSync(file,'utf8');
 html=html.replace(/<script id="library-data" type="application\/json">[\s\S]*?<\/script>/,'');
 const embedded='<script id="library-data" type="application/json">'+dataJSON.replace(/</g,'\\u003c')+'</script>';
 html=html.replace(/<script (?:defer )?src="reading-state\.js/,embedded+'<script defer src="reading-state.js');
 if(name==='index.html'){
  html=html.replace(/<form id="searchform"[\s\S]*?<\/form>/,'<form id="searchform" class="search-panel" role="search"><div class="main-query-field"><label class="sr-only" for="query">البحث في المكتبة</label><div class="search"><span class="search-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg></span><input id="query" type="search" placeholder="ابحث عن مقال…" autocomplete="off"><button type="button" id="clear" aria-label="مسح البحث" title="مسح البحث" hidden><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg></button></div></div></form>');
  const start=html.indexOf('<div id="cards" class="cards">'),end=html.indexOf('<div id="pages"',start);
  html=html.slice(0,start)+'<div id="cards" class="cards">'+firstCards+'</div>'+html.slice(end);
  html=html.replace(/(<p id="count"[^>]*>)[\s\S]*?<\/p>/,'$1'+number.format(archive.length)+' مقالًا في المكتبة</p>');
  html=html.replace(/(<div id="pages"[^>]*>)[\s\S]*?<\/div>/,'$1<button id="prev" disabled>السابق</button><span>١ / '+number.format(Math.ceil(archive.length/20))+'</span><button id="next" disabled>\u0627\u0644\u062a\u0627\u0644\u064a</button></div>');
 }
 // The small local data is already in the HTML; no data download gates rendering.
 html=html.replace(/<script src="((?:reading-state|bookmarks|article-navigation|app|control-focus)\.js[^\"]*)"><\/script>/g,'<script defer src="$1"></script>');
 fs.writeFileSync(file,html);
}
const loaderCSS=fs.readFileSync(new URL('./page-loading.css',import.meta.url),'utf8').replace(/\s+/g,' ').trim();
const loaderBootstrap=fs.readFileSync(new URL('./page-loading-bootstrap.js',import.meta.url),'utf8');
const bootstrap="try{const r=document.documentElement;r.dataset.theme=localStorage.getItem('egyptian-industrial-library:theme:v1')==='light'?'light':'dark';r.style.colorScheme=r.dataset.theme;const p=new URLSearchParams(location.search);if(['q','category','sort','size','reading','scope'].some(k=>p.has(k)))r.dataset.libraryPending='true';}catch{};";
const loaderHTML='<div id="page-loader" role="status" aria-live="polite" aria-label="تحميل المكتبة"><div class="page-loader-content"><svg class="page-loader-book" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 8c-4-3-8-3-13-2v20c5-1 9-1 13 2 4-3 8-3 13-2V6c-5-1-9-1-13 2Z"/><path d="M16 8v20M7 11c2-.2 4 .2 6 1M7 16c2-.2 4 .2 6 1M20 12c2-.8 4-1.2 6-1M20 17c2-.8 4-1.2 6-1"/></svg><p class="page-loader-title">مكتبة المكتب المصري<br>للتطوير الصناعي</p><p id="page-loading-message">جارٍ تحميل المكتبة…</p><div class="page-loader-track" aria-hidden="true"><span></span></div><button type="button" id="page-loading-retry" hidden>إعادة المحاولة</button></div></div>';
const styleVersion=hash(fs.readFileSync(path.join(root,'style.css')));
for(const file of [path.join(root,'index.html'),path.join(root,'reading.html'),path.join(root,'bookmarks.html'),path.join(root,'profile.html'),...fs.readdirSync(path.join(root,'articles')).filter(name=>name.endsWith('.html')).map(name=>path.join(root,'articles',name))]){
 let html=fs.readFileSync(file,'utf8');
 const article=articleById.get(path.basename(file,'.html'));
 if(article)html=html.replace(/<div class="meta">[\s\S]*?<\/div>/,meta=>meta.replace(/\s[0-9٠-٩]+ دقائق قراءة/,' مدة القراءة: '+readingTime(article.minutes)));
 html=html.replace(/<style data-(?:font-gate|page-loader)>[\s\S]*?<\/style>/g,'');
 html=html.replace(/<div id="page-loader"[\s\S]*?<\/button><\/div><\/div>/,'');
 const tasks=['index.html','reading.html','bookmarks.html'].includes(path.basename(file))?'library'+(path.basename(file)==='index.html'?',search':''):file.includes(path.sep+'articles'+path.sep)?'navigation':'';
 html=html.replace(/<script data-theme-bootstrap>[\s\S]*?<\/script>/,'');
 html=html.replace(/<script (?:defer )?src="((?:\.\.\/)?theme\.js[^" ]*)"><\/script>/,(match,src)=>'<style data-page-loader>'+loaderCSS+'</style><script data-theme-bootstrap>'+bootstrap+loaderBootstrap.replace('__PAGE_TASKS__',tasks)+'</script><script defer src="'+src+'"></script>');
 html=html.replace(/(<body[^>]*>)/,'$1'+loaderHTML);
 // Fetch the two critical Arabic UI weights early; reveal after page and fonts settle.
 html=html.replace(/<link data-critical-font[^>]*>/g,'');
 const assetPrefix=path.relative(path.dirname(file),root).split(path.sep).filter(Boolean).join('/');
 const criticalFonts=['Qw3CZRtWPQCuHme67tEYUIx3Kh0PHR9N6Ys43PW5fslBEg0.woff2','Qw3NZRtWPQCuHme67tEYUIx3Kh0PHR9N6YPi-OCRXMRrKATtYV0.woff2'];
 const preloads=criticalFonts.map(name=>'<link data-critical-font rel="preload" as="font" type="font/woff2" crossorigin href="'+(assetPrefix?assetPrefix+'/':'')+'assets/fonts/'+name+'">').join('');
 html=html.replace(/(<link rel="stylesheet"[^>]*>)/,preloads+'$1');
 html=html.replace(/style\.css\?v=[^" ]+/g,'style.css?v='+styleVersion);
 fs.writeFileSync(file,html);
}
const navigationVersion=hash(fs.readFileSync(path.join(root,'article-navigation.js')));
for(const file of [path.join(root,'index.html'),path.join(root,'reading.html'),path.join(root,'bookmarks.html'),...fs.readdirSync(path.join(root,'articles')).filter(n=>n.endsWith('.html')).map(n=>path.join(root,'articles',n))]){
 fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace(/article-navigation\.js\?v=[^" ]+/g,'article-navigation.js?v='+navigationVersion));
}
const appPath=path.join(root,'app.js');
fs.writeFileSync(appPath,fs.readFileSync(appPath,'utf8').replace(/library-data\.json\?v=[\w-]+/g,'library-data.json?v='+hash(dataJSON)));
const engineVersion=hash(fs.readFileSync(path.join(root,'search-engine.js')));
for(const name of ['app.js','search-worker.js']){
 const file=path.join(root,name);fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace(/search-engine\.js\?v=[\w-]+/g,'search-engine.js?v='+engineVersion));
}
const workerVersion=hash(fs.readFileSync(path.join(root,'search-worker.js')));
fs.writeFileSync(appPath,fs.readFileSync(appPath,'utf8').replace(/search-worker\.js\?v=[\w-]+/g,'search-worker.js?v='+workerVersion));
const appVersion=hash(Buffer.concat(['app.js','search-worker.js','search-engine.js'].map(name=>fs.readFileSync(path.join(root,name)))));
for(const name of ['index.html','reading.html','bookmarks.html']){
 const file=path.join(root,name);fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace(/app\.js\?v=[^" ]+/g,'app.js?v='+appVersion));
}
console.log(JSON.stringify({articles:archive.length,embeddedDataBytes:Buffer.byteLength(dataJSON),embeddedDataGzip:gzipSync(dataJSON).length,routesGzip:gzipSync(JSON.stringify(sortedCounts)).length,longShardAverageGzip:Math.round(wireBytes/512),longShardMaxGzip:maxWire,initialCards:initial.length,version},null,2));

await import('./build-offline.mjs');
