import {search,createSearchClient} from './search-engine.js?v=0d79e0bd4f014672';
let client,index;
self.onmessage=async ({data})=>{
 try{
  if(data.type==='init'){
   if(data.metadata)client=createSearchClient(data.url,data.metadata);
   else{
    // Compatibility with an older cached application during a static-site update.
    const response=await fetch(data.url);if(!response.ok)throw new Error('Search index unavailable');index=await response.json();
   }
   self.postMessage({type:'ready'});
  }else if(data.type==='warm'){
   await client?.warm();self.postMessage({type:'warmed',id:data.id});
  }
  else if(data.type==='search')self.postMessage({type:'result',id:data.id,ids:client?await client.find(data.query,data.scope):search(index,data.query,data.scope)});
 }catch(error){self.postMessage({type:'error',id:data.id,message:error.message});}
};
