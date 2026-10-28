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
