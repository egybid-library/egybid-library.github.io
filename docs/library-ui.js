(function(){
 'use strict';
 const root=new URL('.',document.currentScript.src);
 const modes=['title','title-desc','newest','oldest','short','long'];
 const sortKey='egyptian-industrial-library:navigation-sort:v1';
 let currentSort='newest';
 function getSort(requested){
  if(modes.includes(requested))return requested;
  try{const saved=localStorage.getItem(sortKey);if(modes.includes(saved))return saved;}catch{}
  return currentSort;
 }
 function updateLinks(sort){
  const targets=new Set(['','index.html','reading.html','bookmarks.html'].map(path=>new URL(path,root).pathname));
  document.querySelectorAll('.site-header a,.crumb a').forEach(link=>{
   const url=new URL(link.href);
   if(url.origin!==root.origin||!targets.has(url.pathname))return;
   url.searchParams.set('sort',sort);link.href=url.pathname+url.search+url.hash;
  });
 }
 function setSort(value){
  const sort=modes.includes(value)?value:'newest';
  currentSort=sort;
  try{localStorage.setItem(sortKey,sort);}catch{}
  updateLinks(sort);return sort;
 }
 let articleRequest;
 function articles(){
  if(!articleRequest)articleRequest=fetch(new URL('navigation-index.json',root)).then(response=>{
   if(!response.ok)throw new Error('Navigation unavailable');return response.json();
  }).catch(error=>{articleRequest=null;throw error;});
  return articleRequest;
 }
 function lockModal(){document.documentElement.classList.add('library-modal-open');}
 function unlockModal(){if(!document.querySelector('dialog[open]'))document.documentElement.classList.remove('library-modal-open');}
 const panel=document.querySelector('.library-folders,.article-navigation');
 let drawer,trigger,currentLabel,closeSections=()=>{};
 if(panel){
  const compact=window.matchMedia('(max-width:680px)');
  const placeholder=document.createComment('Library sections position');panel.before(placeholder);
  const control=document.createElement('div');control.className='mobile-sections-control';
  control.innerHTML='<button type="button" class="sections-open" aria-label="أقسام المكتبة" title="أقسام المكتبة" aria-describedby="mobile-section-current" aria-haspopup="dialog" aria-controls="sections-drawer" aria-expanded="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg><small id="mobile-section-current" class="mobile-section-current sr-only">جميع المقالات</small></button>';
  const header=document.querySelector('.site-header');
  header.classList.add('has-mobile-sections');header.append(control);
  trigger=control.querySelector('button');currentLabel=control.querySelector('small');
  const content=document.createElement('div');content.className='section-panel-content';
  [...panel.children].filter(child=>child.tagName!=='SUMMARY').forEach(child=>content.append(child));panel.append(content);
  drawer=document.createElement('dialog');drawer.id='sections-drawer';drawer.className='sections-drawer';drawer.setAttribute('aria-labelledby','sections-drawer-title');
  drawer.innerHTML='<div class="library-dialog-heading"><h2 id="sections-drawer-title">أقسام المكتبة</h2><button type="button" class="library-dialog-close" aria-label="إغلاق أقسام المكتبة">×</button></div><div class="sections-drawer-body"><div class="drawer-library-search"><p class="drawer-search-label">البحث في المكتبة</p></div></div>';
  document.body.append(drawer);
  function close(){if(drawer.open){drawer.dispatchEvent(new Event('library:sections-closing'));drawer.close();}}
  closeSections=close;
  trigger.addEventListener('click',()=>{
   if(!compact.matches)return;
   drawer.showModal();lockModal();panel.open=true;trigger.setAttribute('aria-expanded','true');
   drawer.dispatchEvent(new Event('library:sections-open'));
  });
  drawer.querySelector('.library-dialog-close').addEventListener('click',close);
  drawer.addEventListener('click',event=>{
   if(event.target!==drawer)return;
   const bounds=drawer.getBoundingClientRect();
   if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)close();
  });
  drawer.addEventListener('close',()=>{if(compact.matches)panel.open=false;trigger.setAttribute('aria-expanded','false');unlockModal();});
  drawer.addEventListener('cancel',()=>drawer.dispatchEvent(new Event('library:sections-closing')));
  // Keep the next article's sections closed, including a back/forward cache restore.
  panel.addEventListener('click',event=>{if(event.target.closest('a[data-nav-article]'))close();});
  window.addEventListener('pageshow',event=>{if(event.persisted)close();});
  const searchForm=document.getElementById('searchform');
  const searchPosition=searchForm?document.createComment('Library search position'):null;
  if(searchForm){
   searchForm.before(searchPosition);
   searchForm.addEventListener('submit',close,true);
   searchForm.addEventListener('click',event=>{if(event.target.closest('.suggestion-actions button,a'))close();},true);
  }
  function syncLayout(){
   if(compact.matches){
    drawer.querySelector('.sections-drawer-body').append(panel);panel.open=false;
    if(searchForm)drawer.querySelector('.drawer-library-search').append(searchForm);
   }else{
    close();placeholder.after(panel);panel.open=!panel.classList.contains('article-navigation')||window.matchMedia('(min-width:1001px)').matches;
    if(searchForm)searchPosition.after(searchForm);
   }
  }
  compact.addEventListener('change',syncLayout);syncLayout();
 }
 function setCategory(category){if(currentLabel){currentLabel.textContent=category||'جميع المقالات';currentLabel.title=category||'جميع المقالات';}}
 function revealCategory(){
  if(!window.matchMedia('(max-width:680px)').matches)return;
  closeSections();
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
   const count=document.getElementById('count');
   if(!count)return;
   count.focus({preventScroll:true});
   count.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});
  }));
 }
 window.LibraryUI={root,getSort,setSort,articles,setCategory,revealCategory,closeSections,lockModal,unlockModal};
 const params=new URLSearchParams(location.search),isArticle=Boolean(document.body.dataset.articleId);
 setSort(getSort(params.get(isArticle?'nav-sort':'sort')));
 // Older shared URLs still select their requested order, then become clean URLs.
 if(isArticle&&params.has('nav-sort')){
  params.delete('nav-sort');
  history.replaceState(null,'',location.pathname+(params.size?'?'+params:'')+location.hash);
 }
})();
