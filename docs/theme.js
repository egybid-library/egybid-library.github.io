(function(){
 'use strict';
 const key='egyptian-industrial-library:theme:v1';
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
   button.title=dark?'إيقاف الوضع الداكن':'تفعيل الوضع الداكن';
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
