(function(){
 'use strict';
 const readKey='egyptian-industrial-library:reading:v1',savedKey='egyptian-industrial-library:bookmarks:v1';
 const status=document.getElementById('profile-status'),fileInput=document.getElementById('profile-file');
 const number=new Intl.NumberFormat('ar-EG');
 let known;
 const validMap=value=>value&&typeof value==='object'&&!Array.isArray(value);
 function clean(value){
  if(!validMap(value)||Object.keys(value).length>10000)throw Error('صيغة ملف البيانات غير صالحة.');
  return Object.fromEntries(Object.entries(value).filter(([id,date])=>/^[a-f0-9]{16}$/.test(id)&&known.has(id)&&typeof date==='string'&&Number.isFinite(Date.parse(date))).map(([id,date])=>[id,new Date(date).toISOString()]));
 }
 function stored(key){const raw=localStorage.getItem(key);if(!raw)return {};const data=JSON.parse(raw);if(data.version!==1)throw Error('تعذّرت قراءة العلامات الموجودة.');return clean(data.items);}
 function counts(){document.getElementById('profile-count').textContent='علامات القراءة: '+number.format(Object.keys(window.ReadingProgress.entries()).length)+' · المحفوظات: '+number.format(Object.keys(window.ArticleBookmarks.entries()).length);}
 fetch('navigation-index.json').then(response=>{if(!response.ok)throw Error();return response.json();}).then(rows=>{
  known=new Set(rows.map(row=>row.id));counts();document.getElementById('profile-export').disabled=false;document.getElementById('profile-import').disabled=false;
 }).catch(()=>{status.textContent='تعذّر تحميل فهرس المكتبة. أعد تحميل الصفحة.';});
 window.ReadingProgress.subscribe(counts);window.ArticleBookmarks.subscribe(counts);
 document.getElementById('profile-export').onclick=()=>{
  const data={app:'egyptian-industrial-library',kind:'reader-profile',version:1,exportedAt:new Date().toISOString(),reading:clean(window.ReadingProgress.entries()),bookmarks:clean(window.ArticleBookmarks.entries())};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='library-profile-'+new Date().toISOString().slice(0,10)+'.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  status.textContent='تم تصدير سجل القراءة والمحفوظات. افتح هذه الصفحة على عنوان المكتبة الجديد واستورد الملف.';
 };
 document.getElementById('profile-import').onclick=()=>fileInput.click();
 fileInput.onchange=async()=>{
  const file=fileInput.files?.[0];if(!file)return;
  try{
   if(file.size>2*1024*1024)throw Error('حجم الملف أكبر من الحد المسموح: ٢ ميجابايت.');
   const data=JSON.parse(await file.text());
   if(data?.app!=='egyptian-industrial-library'||data.kind!=='reader-profile'||data.version!==1)throw Error('اختر ملف سجل القراءة والمحفوظات الذي صدّرته من هذه الصفحة.');
   const incomingRead=clean(data.reading),incomingSaved=clean(data.bookmarks),currentRead=stored(readKey),currentSaved=stored(savedKey);
   const reading={...incomingRead,...currentRead},bookmarks={...incomingSaved,...currentSaved};
   const oldRead=localStorage.getItem(readKey),oldSaved=localStorage.getItem(savedKey);
   try{localStorage.setItem(readKey,JSON.stringify({version:1,items:reading}));localStorage.setItem(savedKey,JSON.stringify({version:1,items:bookmarks}));}
   catch(error){try{oldRead===null?localStorage.removeItem(readKey):localStorage.setItem(readKey,oldRead);oldSaved===null?localStorage.removeItem(savedKey):localStorage.setItem(savedKey,oldSaved);}catch{}throw error;}
   document.getElementById('profile-count').textContent='علامات القراءة: '+number.format(Object.keys(reading).length)+' · المحفوظات: '+number.format(Object.keys(bookmarks).length);
   status.textContent='تم استيراد بياناتك ودمجها مع العلامات الموجودة. افتح «قراءاتي» أو «المحفوظات» لعرضها.';
  }catch(error){status.textContent=error instanceof SyntaxError?'الملف ليس ملف بيانات صالحًا.':error.message||'تعذّر حفظ العلامات في هذا المتصفح.';}
  fileInput.value='';
 };
})();
