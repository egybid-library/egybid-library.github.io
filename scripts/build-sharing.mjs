// Put complete preview data in the initial HTML, including legacy redirect URLs.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../docs');
const site=new URL('https://egybid-library.github.io/');
const name='مكتبة المكتب المصري للتطوير الصناعي';
const escape=value=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const images=fs.readdirSync(path.join(root,'assets')).filter(name=>/^library-share-[a-f0-9]{12}\.jpg$/.test(name));
if(images.length!==1)throw new Error('Exactly one versioned sharing image is required');
const image=new URL('assets/'+images[0],site).href;
const imageBytes=fs.readFileSync(path.join(root,'assets',images[0]));
if(imageBytes.readUInt16BE(0)!==0xffd8)throw new Error('Invalid JPEG sharing image');
const archive=JSON.parse(fs.readFileSync(path.join(root,'archive.json'),'utf8'));
const articles=fs.readdirSync(path.join(root,'articles')).filter(name=>/^[a-f0-9]{16}\.html$/.test(name));
const decode=value=>value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(_,entity)=>{
 if(entity[0]==='#')return String.fromCodePoint(entity[1].toLowerCase()==='x'?parseInt(entity.slice(2),16):Number(entity.slice(1)));
 return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[entity.toLowerCase()];
});
const plain=value=>decode(value.replace(/<br\s*\/?\s*>/gi,' ').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
const normalized=value=>value.normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const previewById=new Map();
for(const article of archive){
 const html=fs.readFileSync(path.join(root,'articles',article.id+'.html'),'utf8');
 const section=html.match(/<section id="organized"[^>]*>([\s\S]*?)<\/section>/)?.[1]||'';
 const paragraphs=[...section.matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/g)].map(match=>plain(match[1])).filter(Boolean);
 while(paragraphs.length>1&&(normalized(paragraphs[0])===normalized(article.title)||!paragraphs[0].replace(/#[^\s#]+/gu,'').trim()))paragraphs.shift();
 const opening=paragraphs.join(' ')||plain(section)||article.text.replace(/\s+/g,' ').trim();
 const description=opening.length<=240?opening:opening.slice(0,241).replace(/\s+\S*$/u,'').trimEnd()+'…';
 previewById.set(article.id,{title:article.title,description});
}
const pages=['index.html','reading.html','bookmarks.html','profile.html',...articles.map(name=>'articles/'+name),...articles.map(name=>'articles/'+name.slice(0,-5)+'/index.html'),'reading/index.html','bookmarks/index.html'];
for(const page of pages){
 const file=path.join(root,page);
 const isArticle=page.startsWith('articles/');
 const canonical=page==='index.html'?site.href:new URL(page.replace(/\/index\.html$/,'.html'),site).href;
 const type=isArticle?'article':'website';
 const id=isArticle?page.match(/^articles\/([a-f0-9]{16})/)[1]:null;
 const preview=isArticle?previewById.get(id):{title:name,description:name};
 if(!preview?.title||!preview.description)throw new Error('Missing preview text: '+page);
 const pageTitle=isArticle?preview.title+' | '+name:name;
 let html=fs.readFileSync(file,'utf8');
 if(!/<head(?:\s|>)/i.test(html))html=html.replace(/(<html\b[^>]*>)/i,'$1<head>');
 if(!/<body(?:\s|>)/i.test(html))html=html.replace(/<p>/,'</head><body><p>').replace('</html>','</body></html>');
 else if(!html.includes('</head>'))html=html.replace(/(<body\b)/i,'</head>$1');
 const boundary=html.indexOf('</head>');
 if(boundary<0)throw new Error('Missing head boundary: '+page);
 let head=html.slice(0,boundary),body=html.slice(boundary);
 head=head.replace(/<title>[^<]*<\/title>/g,'')
  .replace(/<meta\b[^>]*(?:name="(?:description|twitter:[^"]+)"|property="og:[^"]+")[^>]*>/g,'')
  .replace(/<link\b[^>]*rel="canonical"[^>]*>/g,'');
 const tags='<title>'+escape(pageTitle)+'</title>'+
  '<meta name="description" content="'+escape(preview.description)+'">'+
  '<link rel="canonical" href="'+canonical+'">'+
  Object.entries({'og:site_name':name,'og:title':preview.title,'og:description':preview.description,'og:type':type,'og:url':canonical,'og:locale':'ar_EG','og:image':image,'og:image:secure_url':image,'og:image:type':'image/jpeg','og:image:width':'1200','og:image:height':'630','og:image:alt':name})
   .map(([property,value])=>'<meta property="'+property+'" content="'+escape(value)+'">').join('')+
  Object.entries({'twitter:card':'summary_large_image','twitter:title':preview.title,'twitter:description':preview.description,'twitter:image':image,'twitter:image:alt':name})
   .map(([key,value])=>'<meta name="'+key+'" content="'+escape(value)+'">').join('');
 // Keep metadata before the loader and scripts so crawlers need no JavaScript.
 head=head.replace(/(<meta name="viewport"[^>]*>)/,'$1'+tags);
 fs.writeFileSync(file,head+body);
}
console.log(JSON.stringify({sharingPages:pages.length,sharingImage:images[0],sharingImageBytes:imageBytes.length}));
