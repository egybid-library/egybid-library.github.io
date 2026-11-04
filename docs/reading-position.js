(function(){
 'use strict';
 const key='egyptian-industrial-library:last-reading:v1',listeners=new Set();
 function valid(value){return value?.version===1&&typeof value.id==='string'&&/^[a-f0-9]{16}$/.test(value.id)&&Number.isInteger(value.anchor)&&value.anchor>=-1&&value.anchor<=100000&&Number.isFinite(value.offset)&&value.offset>=0&&value.offset<=1&&Number.isFinite(value.progress)&&value.progress>=0&&value.progress<=1;}
 function clean(value){return {version:1,id:value.id,anchor:value.anchor,offset:value.offset,progress:value.progress};}
 function get(){try{const value=JSON.parse(localStorage.getItem(key));return valid(value)?clean(value):null;}catch{return null;}}
 function write(value,type){
  if(!valid(value))throw Error('position');
  const next=clean(value);if(JSON.stringify(get())===JSON.stringify(next))return;
  localStorage.setItem(key,JSON.stringify(next));listeners.forEach(listener=>listener({type,position:next}));
 }
 window.ReadingPosition={get,remember:value=>write(value,'local'),applySync:value=>write(value,'sync'),subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener);}};
 window.addEventListener('storage',event=>{if(event.key===key||event.key===null)listeners.forEach(listener=>listener({type:'refresh',position:get()}));});
})();
