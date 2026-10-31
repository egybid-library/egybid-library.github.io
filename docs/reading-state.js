(function(){
 'use strict';
 const key='egyptian-industrial-library:reading:v1';
 const listeners=new Set();
 let items={},persistent=true;
 function load(){
  if(!persistent)return {...items};
  try{
   const raw=localStorage.getItem(key);
   if(!raw)return {};
   const data=JSON.parse(raw);
   if(data.version!==1||!data.items||typeof data.items!=='object'||Array.isArray(data.items))return {};
   return Object.fromEntries(Object.entries(data.items).filter(([id,date])=>/^[a-f0-9]{16}$/.test(id)&&typeof date==='string'&&Number.isFinite(Date.parse(date))));
  }catch{persistent=false;return {...items};}
 }
 items=load();
 function notify(change){listeners.forEach(listener=>listener(change));}
 function refresh(){items=load();notify({type:'refresh'});}
 window.ReadingProgress={
  has:id=>Object.prototype.hasOwnProperty.call(items,id),
  entries:()=>({...items}),
  persistent:()=>persistent,
  applySync(next){
   const clean=Object.fromEntries(Object.entries(next).filter(([id,date])=>/^[a-f0-9]{16}$/.test(id)&&typeof date==='string'&&Number.isFinite(Date.parse(date))));
   const current=load();
   if(JSON.stringify(Object.entries(current).sort())===JSON.stringify(Object.entries(clean).sort()))return;
   if(!persistent)throw Error('Reading storage unavailable');
   localStorage.setItem(key,JSON.stringify({version:1,items:clean}));items=clean;notify({type:'sync'});
  },
  subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener);},
  toggle(id){
   if(!/^[a-f0-9]{16}$/.test(id))return false;
   const next=load();
   const read=!Object.prototype.hasOwnProperty.call(next,id);
   if(read)next[id]=new Date().toISOString();else delete next[id];
   items=next;
   if(persistent){try{localStorage.setItem(key,JSON.stringify({version:1,items}));}catch{persistent=false;}}
   notify({type:'toggle',id,read});
   return read;
  }
 };
 window.addEventListener('storage',event=>{if(event.key===key||event.key===null)refresh();});
 window.addEventListener('pageshow',refresh);
})();
