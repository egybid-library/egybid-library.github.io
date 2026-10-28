import {search} from './search-engine.js?v=034b652ba316e53f';
let index;
self.onmessage=async ({data})=>{
 try{
  if(data.type==='init'){
   const response=await fetch(data.url);
   if(!response.ok)throw new Error('Search index unavailable');
   index=await response.json();
   self.postMessage({type:'ready'});
  }else if(data.type==='search'){
   self.postMessage({type:'result',id:data.id,ids:search(index,data.query,data.scope)});
  }
 }catch(error){self.postMessage({type:'error',id:data.id,message:error.message});}
};
