// Build an opt-in reading snapshot; article/source data is never edited.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
await import('./build-sharing.mjs');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../docs');
const sha=data=>createHash('sha256').update(data).digest('hex');
const syncPath=path.join(root,'sync.js');
let syncSource=fs.readFileSync(syncPath,'utf8');
for(const name of ['sync-core.js','sync-config.js'])syncSource=syncSource.replace(new RegExp("\\./"+name.replaceAll('.','\\.')+"(?:\\?v=[a-f0-9]+)?",'g'),'./'+name+'?v='+sha(fs.readFileSync(path.join(root,name))).slice(0,16));
fs.writeFileSync(syncPath,syncSource);
const syncVersion=sha(Buffer.concat(['sync.js','sync-core.js','sync-config.js','reading-state.js','bookmarks.js'].map(name=>fs.readFileSync(path.join(root,name))))).slice(0,16);
const version=sha(fs.readFileSync(path.join(root,'offline.js'))).slice(0,16);
const pages=['index.html','reading.html','bookmarks.html','profile.html',...fs.readdirSync(path.join(root,'articles')).filter(p=>p.endsWith('.html')).map(p=>'articles/'+p)];
const sharedVersions=Object.fromEntries(['style.css','theme.js','reading-position.js','library-ui.js','article-search.js','article-navigation.js'].map(name=>[name,sha(fs.readFileSync(path.join(root,name))).slice(0,16)]));
sharedVersions['app.js']=sha(Buffer.concat(['app.js','search-worker.js','search-engine.js'].map(name=>fs.readFileSync(path.join(root,name))))).slice(0,16);
for(const page of pages){
 const p=path.join(root,page),prefix=page.startsWith('articles/')?'../':'';
 let html=fs.readFileSync(p,'utf8').replace(/<script defer src="(?:\.\.\/)?offline\.js[^\"]*"><\/script>/g,'');
 html=html.replace(/<script type="module" src="(?:\.\.\/)?sync\.js[^\"]*"><\/script>/g,'');
 html=html.replace(/<script (?:defer )?src="(?:\.\.\/)?(?:reading-position|library-ui|article-search)\.js[^\"]*"><\/script>/g,'');
 const defer=prefix?'':'defer ';
 html=html.replace(/<script (?:defer )?src="(?:\.\.\/)?(?:article-navigation|app)\.js[^\"]*"><\/script>/,match=>'<script '+defer+'src="'+prefix+'reading-position.js"></script><script '+defer+'src="'+prefix+'library-ui.js"></script>'+match);
 if(prefix)html=html.replace(/<script src="\.\.\/article-navigation\.js[^\"]*"><\/script>/,match=>match+'<script src="../article-search.js"></script>');
 for(const [name,version] of Object.entries(sharedVersions))html=html.replace(new RegExp('((?:src|href)="(?:\\.\\./)?)'+name.replaceAll('.','\\.')+'(?:\\?v=[^" ]+)?','g'),(match,start)=>start+name+'?v='+version);
 for(const name of ['reading-state.js','bookmarks.js'])html=html.replace(new RegExp(name.replaceAll('.','\\.')+'\\?v=[^" ]+','g'),name+'?v='+sha(fs.readFileSync(path.join(root,name))).slice(0,16));
 html=html.replace('</body>','<script type="module" src="'+prefix+'sync.js?v='+syncVersion+'"></script></body>');
 html=html.replace('</body>','<script defer src="'+prefix+'offline.js?v='+version+'"></script></body>');
 fs.writeFileSync(p,html);
}
const data=JSON.parse(fs.readFileSync(path.join(root,'library-data.json'))),files=[];
function add(relative){const bytes=fs.readFileSync(path.join(root,relative));files.push({path:relative,bytes:bytes.length,sha256:sha(bytes),downloadBytes:Math.min(bytes.length,gzipSync(bytes).length)});}
function directory(relative){
 // Sharing art is fetched by messengers, never by the reader or offline download.
 if(relative==='assets/article-previews')return;
 for(const entry of fs.readdirSync(path.join(root,relative),{withFileTypes:true})){
  const file=relative+'/'+entry.name;
  if(/^assets\/library-share(?:-[a-f0-9]{12})?\.(?:jpg|svg)$/.test(file))continue;
  entry.isDirectory()?directory(file):add(file);
 }
}
// Current reading pages and every dependency needed for browsing and searching.
for(const page of pages)add(page);
for(const name of fs.readdirSync(root))if(name.endsWith('.js')||name==='style.css'||name==='library-data.json'||name==='navigation-index.json')add(name);
directory('assets');directory(path.dirname(data.searchIndex));directory(data.excerptPrefix.replace(/\/$/,''));
files.sort((a,b)=>a.path.localeCompare(b.path));
const manifest={version:sha(JSON.stringify(files)).slice(0,16),articles:data.articles.length,bytes:files.reduce((n,f)=>n+f.bytes,0),downloadBytes:files.reduce((n,f)=>n+f.downloadBytes,0),files};
fs.writeFileSync(path.join(root,'offline-manifest.json'),JSON.stringify(manifest));
console.log(JSON.stringify({offlineArticles:manifest.articles,offlineFiles:files.length,storageMB:(manifest.bytes/1e6).toFixed(1),estimatedDownloadMB:(manifest.downloadBytes/1e6).toFixed(1),offlineVersion:manifest.version},null,2));
