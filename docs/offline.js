(()=>{
 'use strict';
 const root=new URL('.',document.currentScript.src),ar=new Intl.NumberFormat('ar-EG'),mb=n=>new Intl.NumberFormat('ar-EG',{maximumFractionDigits:1}).format(n/1e6);
 const transferSize=n=>n<100000?ar.format(Math.ceil(n/1000))+' ك.ب':mb(n)+' م.ب';
 const navigation=document.querySelector('.site-header nav');if(!navigation)return;
 const open=document.createElement('button');open.type='button';open.className='offline-open';open.setAttribute('aria-label','تحميل المكتبة');open.title='تحميل المكتبة للقراءة بدون إنترنت';
 open.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/></svg><span>تحميل المكتبة</span>';
 navigation.insertBefore(open,navigation.querySelector('[data-theme-toggle]'));
 const savedDate=new Intl.DateTimeFormat('ar-EG',{day:'numeric',month:'long',year:'numeric',hour:'numeric',minute:'2-digit',timeZone:'Africa/Cairo'});
 const dialog=document.createElement('dialog');dialog.className='offline-dialog';dialog.setAttribute('aria-labelledby','offline-title');
 dialog.innerHTML='<button type="button" class="offline-close" aria-label="إغلاق">×</button><h2 id="offline-title">تحميل المكتبة</h2><p>احفظ المقالات على هذا الجهاز.</p><p class="offline-saved-at" hidden></p><p class="offline-size"></p><progress class="offline-progress" hidden max="100" value="0" aria-label="تقدّم تحميل المكتبة"></progress><p class="offline-status" role="status" aria-live="polite"></p><div class="offline-actions"><button type="button" class="offline-start" disabled>تحميل المكتبة</button><button type="button" class="offline-pause" hidden>إيقاف مؤقت</button><button type="button" class="offline-remove" hidden>إزالة النسخة المحفوظة</button></div><p class="offline-note">النسخة محفوظة في هذا المتصفح على هذا الجهاز. مسح بيانات الموقع يزيلها.</p>';
 document.body.append(dialog);
 const $=s=>dialog.querySelector(s),start=$('.offline-start'),pause=$('.offline-pause'),remove=$('.offline-remove'),status=$('.offline-status'),progress=$('progress');
 let registrationPromise,manifest,state,busy=false;
 function registration(){
  return registrationPromise??=navigator.serviceWorker.getRegistration(root.href).then(async existing=>{
   if(existing){try{await existing.update();}catch{}return existing;}
   return navigator.serviceWorker.register(new URL('service-worker.js',root),{scope:root.pathname,updateViaCache:'none'});
  }).then(async reg=>{
   const worker=reg.installing||reg.waiting||(reg.active?.state!=='activated'?reg.active:null);
   if(worker&&worker.state!=='activated')await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Worker timeout')),15000);
    worker.addEventListener('statechange',()=>{if(worker.state==='activated'){clearTimeout(timer);resolve();}else if(worker.state==='redundant'){clearTimeout(timer);reject(Error('Worker unavailable'));}});
   });if(!reg.active)throw Error('Worker unavailable');return reg;
  }).catch(error=>{registrationPromise=null;throw error;});
 }
 async function command(type){
  const reg=await registration();
  return new Promise((resolve,reject)=>{
   const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();reject(Error('Storage timeout'));},30000);
   channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();event.data.ok?resolve(event.data):reject(Error(event.data.error));};
   reg.active.postMessage({type,manifest},[channel.port2]);
  });
 }
 function render(next){
  state=next;busy=next.phase==='downloading';
  const savedAt=$('.offline-saved-at'),knownDate=next.completedAt&&Number.isFinite(Date.parse(next.completedAt));
  savedAt.hidden=!knownDate&&next.phase!=='ready'&&!next.previousReady;
  savedAt.replaceChildren();
  if(knownDate){
   savedAt.append('آخر تحميل أو تحديث مكتمل: ');
   const time=document.createElement('time');time.dateTime=next.completedAt;time.textContent=savedDate.format(new Date(next.completedAt));savedAt.append(time,' بتوقيت القاهرة.');
   open.title='تحميل المكتبة · آخر تحديث: '+time.textContent+' بتوقيت القاهرة';
  }else{
   savedAt.textContent='تاريخ حفظ هذه النسخة غير مسجّل؛ سيظهر بعد تحديثها.';open.title='تحميل المكتبة للقراءة بدون إنترنت';
  }
  const saved=next.done>0,ready=next.phase==='ready';
  progress.hidden=!busy&&!saved;progress.value=next.totalBytes?100*next.bytes/next.totalBytes:0;
  start.hidden=busy||ready;start.disabled=false;start.textContent=saved?'متابعة التحميل':next.previousReady?'تحديث النسخة المحفوظة':'تحميل المكتبة';
  pause.hidden=!busy;pause.disabled=false;remove.hidden=busy||(!saved&&!next.previousReady);
  const transfer=ready?'':(next.previousReady?'تحديث':'تحميل')+' تقريبي '+transferSize(next.downloadBytes??manifest.downloadBytes)+' · ';
  $('.offline-size').textContent=ar.format(manifest.articles)+' مقالًا · '+transfer+'مساحة النسخة نحو '+mb(manifest.bytes)+' م.ب على الجهاز.';
  status.textContent=ready?'المكتبة جاهزة دون إنترنت.':busy?(next.previousReady?'جارٍ تحديث النسخة: ':'جارٍ حفظ المكتبة: ')+ar.format(next.done)+' من '+ar.format(next.total)+' ملف · '+ar.format(Math.floor(progress.value))+'٪':next.error|| (saved?'الحفظ متوقف مؤقتًا؛ يمكنك استكماله.':next.previousReady?(next.downloadFiles?'تحديث '+ar.format(next.downloadFiles)+' ملف جديد أو متغيّر؛ بقية الملفات تُستخدم من النسخة المحفوظة.':'يمكن تحديث النسخة دون تنزيل ملفات إضافية.'):'اضغط تحميل المكتبة لبدء الحفظ.');
  if(ready)navigator.storage?.persist?.().catch(()=>{});
 }
 async function prepare(){
  if(!('serviceWorker' in navigator)||!window.isSecureContext||!('caches' in window)){status.textContent='الحفظ دون إنترنت غير متاح في هذا المتصفح.';return;}
  status.textContent='جارٍ التحقق من النسخة المحفوظة…';start.disabled=true;
  try{
   await registration();
   const response=await fetch(new URL('offline-manifest.json',root),{cache:'no-cache'});if(!response.ok)throw Error('Manifest unavailable');
   manifest=await response.json();
   render((await command('STATUS')).state);
  }catch{start.disabled=true;status.textContent='تعذّر تجهيز التنزيل. اتصل بالإنترنت ثم افتح النافذة مجددًا.';}
 }
 navigator.serviceWorker?.addEventListener('message',event=>{if(event.data?.type==='LIBRARY_OFFLINE_STATE'&&manifest?.version===event.data.state.version)render(event.data.state);});
 open.onclick=()=>{dialog.showModal();prepare();};
 $('.offline-close').onclick=()=>dialog.close();
 dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
 start.onclick=async()=>{
  start.disabled=true;
  try{
   const estimate=await navigator.storage?.estimate?.();
   if(estimate?.quota&&estimate.quota-estimate.usage<(manifest.bytes-(state?.bytes||0))*1.15){status.textContent='المساحة المتاحة غير كافية. حرّر مساحة من الجهاز ثم جرّب مجددًا.';start.disabled=false;return;}
   busy=true;render({...state,phase:'downloading',error:null});
   await command('START');
  }catch{busy=false;start.hidden=false;start.disabled=false;pause.hidden=true;status.textContent='تعذّر بدء التنزيل. جرّب مرة أخرى.';}
 };
 pause.onclick=async()=>{pause.disabled=true;try{await command('PAUSE');}catch{pause.disabled=false;}};
 remove.onclick=async()=>{
  remove.disabled=true;
  try{await command('REMOVE');const reg=await registration();await reg.unregister();registrationPromise=null;render({...state,phase:'idle',done:0,bytes:0,error:null,previousReady:false,completedAt:null});status.textContent='أُزيلت النسخة المحفوظة. علامات القراءة والحفظ لم تتغير.';}
  catch{status.textContent='تعذّرت إزالة النسخة. جرّب مرة أخرى.';}
  remove.disabled=false;
 };
})();
