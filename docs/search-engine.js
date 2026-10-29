// Substring matching is intentional: it preserves the previous Arabic search behavior.
export function normalize(value){return value.normalize('NFKD').replace(/[\u064B-\u065F\u0670\u0640\u0300-\u036f]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').toLowerCase();}
export function search(index,query,scope='all'){
 const terms=[...new Set(normalize(query).trim().split(/\s+/).filter(Boolean))];
 const matches=new Uint8Array(index.ids.length).fill(1);
 for(const term of terms){
  const found=new Uint8Array(index.ids.length);
  if(scope!=='content')index.titles.forEach((title,i)=>{if(matches[i]&&title.includes(term))found[i]=1;});
  if(scope!=='title')for(const [word,articles] of index.words){
   if(word.includes(term))for(const i of articles)if(matches[i])found[i]=1;
  }
  let any=false;
  for(let i=0;i<matches.length;i++){matches[i]&=found[i];if(matches[i])any=true;}
  if(!any)return [];
 }
 return index.ids.filter((_,i)=>matches[i]);
}

export function shardBucket(value,count){
 let hash=2166136261;
 for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619);}
 return (hash>>>0)%count;
}
export function createSearchClient(routesURL,metadata,loadJSON){
 const base=new URL('.',routesURL),ids=metadata.ids,titles=metadata.titles;
 const load=loadJSON||async function(url){const response=await fetch(url);if(!response.ok)throw new Error('Search data unavailable');return response.json();};
 let routesPromise;
 const cached=new Map();
 function routes(){
  if(!routesPromise)routesPromise=load(new URL('routes.json',base).href).catch(error=>{routesPromise=null;throw error;});
  return routesPromise;
 }
 function part(path){
  if(cached.has(path)){const value=cached.get(path);cached.delete(path);cached.set(path,value);return value;}
  const promise=load(new URL(path,base).href).catch(error=>{cached.delete(path);throw error;});
  cached.set(path,promise);
  if(cached.size>64)cached.delete(cached.keys().next().value);
  return promise;
 }
 function decode(value){
  if(Array.isArray(value))return value;
  if(!value)return [];
  const bytes=atob(value),found=[];
  for(let i=0;i<ids.length;i++)if(bytes.charCodeAt(i>>3)&(1<<(i&7)))found.push(i);
  return found;
 }
 async function contentMatches(term){
  if(term.length<=3){
   const bucket=shardBucket(term,256).toString(16).padStart(2,'0');
   const data=await part('short/'+bucket+'.json');return decode(data[term]);
  }
  const counts=await routes();
  let gram,best=Infinity;
  for(let i=0;i<=term.length-3;i++){
   const candidate=term.slice(i,i+3),size=counts[candidate];
   if(!size)return [];
   if(size<best){gram=candidate;best=size;}
  }
  const bucket=shardBucket(gram,512).toString(16).padStart(3,'0');
  const data=await part('long/'+bucket+'.json');
  const found=new Set();
  for(const [word,articles] of data[gram]||[])if(word.includes(term))for(const i of articles)found.add(i);
  return [...found];
 }
 return {
  warm:()=>routes(),
  async find(query,scope='all'){
   const terms=[...new Set(normalize(query).trim().split(/\s+/).filter(Boolean))];
   const lists=scope==='title'?terms.map(()=>[]):await Promise.all(terms.map(contentMatches));
   const matches=new Uint8Array(ids.length).fill(1);
   terms.forEach((term,t)=>{
    const found=new Uint8Array(ids.length);
    for(const i of lists[t])found[i]=1;
    if(scope!=='content')titles.forEach((title,i)=>{if(title.includes(term))found[i]=1;});
    for(let i=0;i<matches.length;i++)matches[i]&=found[i];
   });
   return ids.filter((_,i)=>matches[i]);
  }
 };
}
