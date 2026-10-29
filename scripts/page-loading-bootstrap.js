// Inlined before the first stylesheet; this loader makes no extra network request.
(()=>{
 const root=document.documentElement;
 const pending=new Set(['document',...'__PAGE_TASKS__'.split(',').filter(Boolean)]);
 let revision=0,checking=false,deadline;
 root.dataset.pageState='loading';
 function error(message){
  if(root.dataset.pageState==='ready')return;
  clearTimeout(deadline);root.dataset.pageState='error';
  const update=()=>{
   const text=document.getElementById('page-loading-message');
   if(text)text.textContent=message||'التحميل يستغرق وقتًا أطول من المعتاد.';
   const retry=document.getElementById('page-loading-retry');
   if(retry){retry.hidden=false;retry.onclick=()=>location.reload();}
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',update,{once:true});else update();
 }
 async function finish(){
  if(pending.size||checking||root.dataset.pageState!=='loading')return;
  checking=true;const current=revision;
  try{
   await new Promise(requestAnimationFrame);
   // Newly rendered cards and snippets can need additional font subsets.
   void document.body.offsetWidth;
   const images=[...document.images].filter(image=>!image.closest('[hidden]'));
   await Promise.all(images.map(image=>image.decode?image.decode().catch(()=>{}):Promise.resolve()));
   if(document.fonts)await document.fonts.ready;
   await new Promise(requestAnimationFrame);
   if(current!==revision||pending.size){checking=false;finish();return;}
   if(root.dataset.pageState!=='loading')return;
   if(document.fonts&&[...document.fonts].some(face=>face.status==='error'))root.dataset.fontState='fallback';
   root.dataset.pageState='ready';clearTimeout(deadline);
  }catch{error('تعذّر إكمال تحميل الصفحة. جرّب مرة أخرى.');}
 }
 window.LibraryLoading={
  hold(name){if(root.dataset.pageState==='loading'){pending.add(name);revision++;}},
  done(name){pending.delete(name);revision++;finish();},
  fail:error
 };
 deadline=setTimeout(()=>error(),12000);
 const ready=()=>{
  const retry=document.getElementById('page-loading-retry');
  if(retry)retry.onclick=()=>location.reload();
  window.LibraryLoading.done('document');
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
})();
