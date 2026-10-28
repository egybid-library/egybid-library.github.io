(function(){
 'use strict';
 const key='egyptian-industrial-library:bookmarks:v1';
 const listeners=new Set();
 const validId=id=>/^[a-f0-9]{16}$/.test(id);
 const validDate=date=>typeof date==='string'&&Number.isFinite(Date.parse(date));
 const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const icon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z"/></svg>';
 let items={},persistent=true;
 function load(){
  if(!persistent)return {...items};
  try{
   const raw=localStorage.getItem(key);if(!raw)return {};
   const data=JSON.parse(raw);
   if(data.version!==1||!data.items||typeof data.items!=='object'||Array.isArray(data.items))return {};
   return Object.fromEntries(Object.entries(data.items).filter(([id,date])=>validId(id)&&validDate(date)));
  }catch{persistent=false;return {...items};}
 }
 function persist(next){
  items=next;
  if(persistent){try{localStorage.setItem(key,JSON.stringify({version:1,items}));}catch{persistent=false;}}
 }
 function syncControls(){
  document.querySelectorAll('[data-bookmark-toggle]').forEach(button=>{
   const saved=Object.prototype.hasOwnProperty.call(items,button.dataset.articleId);
   const label=saved?'إزالة من المحفوظات':'إضافة إلى المحفوظات';
   button.setAttribute('aria-pressed',String(saved));
   button.setAttribute('aria-label',label+': '+(button.dataset.bookmarkTitle||'المقال'));
   button.title=label;
   const text=button.querySelector('[data-bookmark-label]');if(text)text.textContent=saved?'محفوظ':'حفظ المقال';
  });
 }
 function notify(change){syncControls();listeners.forEach(listener=>listener(change));}
 function refresh(){items=load();notify({type:'refresh'});}
 items=load();
 window.ArticleBookmarks={
  icon,
  has:id=>Object.prototype.hasOwnProperty.call(items,id),
  entries:()=>({...items}),
  persistent:()=>persistent,
  subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener);},
  control(id,title,withLabel=false){
   const saved=this.has(id),label=saved?'إزالة من المحفوظات':'إضافة إلى المحفوظات';
   return '<button type="button" class="bookmark-toggle'+(withLabel?' bookmark-with-label':'')+'" data-bookmark-toggle data-article-id="'+escape(id)+'" data-bookmark-title="'+escape(title)+'" aria-pressed="'+saved+'" aria-label="'+escape(label+': '+title)+'" title="'+label+'">'+icon+(withLabel?'<span data-bookmark-label>'+(saved?'محفوظ':'حفظ المقال')+'</span>':'')+'</button>';
  },
  toggle(id){
   if(!validId(id))return false;
   const next=load(),saved=!Object.prototype.hasOwnProperty.call(next,id);
   if(saved)next[id]=new Date().toISOString();else delete next[id];
   persist(next);notify({type:'toggle',id,saved});return saved;
  },
  backup(){return {app:'egyptian-industrial-library',kind:'bookmarks',version:1,exportedAt:new Date().toISOString(),items:{...items}};},
  importBackup(data,knownIds){
   if(!data||data.app!=='egyptian-industrial-library'||data.kind!=='bookmarks'||data.version!==1||!data.items||typeof data.items!=='object'||Array.isArray(data.items))throw new Error('ملف غير صالح. اختر ملف محفوظات صدّرته من المكتبة.');
   const entries=Object.entries(data.items);if(entries.length>10000)throw new Error('الملف أكبر من الحد المسموح.');
   const next=load();let added=0,existing=0,skipped=0;
   for(const [id,date] of entries){
    if(!validId(id)||!validDate(date)||!knownIds.has(id)){skipped++;continue;}
    if(Object.prototype.hasOwnProperty.call(next,id)){existing++;continue;}
    next[id]=new Date(date).toISOString();added++;
   }
   persist(next);notify({type:'import',added,existing,skipped});return {added,existing,skipped};
  }
 };
 const announcement=document.createElement('div');announcement.className='sr-only';announcement.id='bookmark-announcement';announcement.setAttribute('role','status');announcement.setAttribute('aria-live','polite');document.body.append(announcement);
 document.addEventListener('click',event=>{
  const button=event.target.closest('[data-bookmark-toggle]');if(!button)return;
  event.preventDefault();const title=button.dataset.bookmarkTitle||'المقال';
  const saved=window.ArticleBookmarks.toggle(button.dataset.articleId);
  announcement.textContent=(saved?'أُضيف إلى المحفوظات: ':'أُزيل من المحفوظات: ')+title+(!persistent?'؛ الحفظ الدائم غير متاح حاليًا.':'');
 });
 window.addEventListener('storage',event=>{if(event.key===key||event.key===null)refresh();});
 window.addEventListener('pageshow',refresh);
})();
