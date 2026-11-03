(function(){
 'use strict';
 const key='egyptian-industrial-library:theme:v1';
 const sun='<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>';
 const moon='<path d="M20.7 14.1A8.8 8.8 0 0 1 9.9 3.3a8.8 8.8 0 1 0 10.8 10.8Z"/>';
 let choice=null,storageAvailable=true;
 function load(){
  if(!storageAvailable)return choice;
  try{const saved=localStorage.getItem(key);return saved==='dark'||saved==='light'?saved:null;}
  catch{storageAvailable=false;return choice;}
 }
 function apply(){
  const dark=(choice||'dark')==='dark';
  document.documentElement.dataset.theme=dark?'dark':'light';
  document.documentElement.style.colorScheme=dark?'dark':'light';
  document.querySelectorAll('[data-theme-toggle]').forEach(button=>{
   button.setAttribute('aria-pressed',String(dark));
   button.title=dark?'تفعيل الوضع الفاتح':'تفعيل الوضع الداكن';
   button.setAttribute('aria-label',button.title);
   const icon=button.querySelector('svg');
   if(icon){icon.innerHTML=dark?sun:moon;icon.dataset.themeIcon=dark?'sun':'moon';}
   const label=button.querySelector('span');if(label)label.textContent=dark?'الوضع الفاتح':'الوضع الداكن';
  });
 }
 function refresh(){choice=load();apply();}
 function toggle(){
  choice=document.documentElement.dataset.theme==='dark'?'light':'dark';
  if(storageAvailable){try{localStorage.setItem(key,choice);}catch{storageAvailable=false;}}
  apply();
 }
 function ready(){document.querySelectorAll('[data-theme-toggle]').forEach(button=>button.addEventListener('click',toggle));apply();}
 choice=load();apply();
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
 window.addEventListener('storage',event=>{if(event.key===key||event.key===null)refresh();});
 window.addEventListener('pageshow',refresh);
})();
