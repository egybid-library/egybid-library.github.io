import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {recipe,hash,renderTitleImage} from './share-image-renderer.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../docs');
export async function generateShareImages(articles,{output=path.join(root,'assets/article-previews'),progress=()=>{}}={}){
 fs.mkdirSync(output,{recursive:true});
 const manifestFile=path.join(output,'manifest.json');
 const previous=fs.existsSync(manifestFile)?JSON.parse(fs.readFileSync(manifestFile,'utf8')):{articles:{}};
 const entries={};let generated=0,reused=0;
 for(const [index,article] of articles.entries()){
  const key=hash(recipe+'\n'+article.title).slice(0,16),file=article.id+'-'+key+'.png',target=path.join(output,file),old=previous.articles[article.id];
  if(old?.file===file&&fs.existsSync(target)&&hash(fs.readFileSync(target))===old.sha256){entries[article.id]=old;reused++;}
  else{
   const {bytes,layout}=renderTitleImage(article.title);fs.writeFileSync(target,bytes);
   entries[article.id]={title:article.title,file,sha256:hash(bytes),bytes:bytes.length,fontSize:layout.fontSize,lines:layout.lines,widths:layout.widths};generated++;
  }
  if((index+1)%50===0||index===articles.length-1){progress({done:index+1,total:articles.length,generated,reused});await new Promise(resolve=>setImmediate(resolve));}
 }
 const live=new Set(Object.values(entries).map(entry=>entry.file));
 for(const entry of Object.values(previous.articles))if(!live.has(entry.file)&&/^[a-f0-9]{16}-[a-f0-9]{16}\.(?:jpg|png)$/.test(entry.file))fs.rmSync(path.join(output,entry.file),{force:true});
 const manifest={version:1,recipe,width:1200,height:630,articles:entries};
 fs.writeFileSync(manifestFile,JSON.stringify(manifest));
 return {generated,reused,articles:articles.length,bytes:Object.values(entries).reduce((sum,entry)=>sum+entry.bytes,0)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let articles=JSON.parse(fs.readFileSync(path.join(root,'archive.json'),'utf8'));
 const ids=process.argv.find(value=>value.startsWith('--ids='))?.slice(6).split(',');if(ids)articles=articles.filter(article=>ids.includes(article.id));
 const output=process.argv.find(value=>value.startsWith('--output='))?.slice(9);
 if(ids&&!output)throw new Error('Sample builds require --output to preserve the complete library image set');
 const result=await generateShareImages(articles,{...(output?{output:path.resolve(output)}:{}),progress:value=>console.log(JSON.stringify(value))});
 console.log(JSON.stringify(result));
}
