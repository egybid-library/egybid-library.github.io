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
 const headerNavigation=document.querySelector('.site-header nav');
 if(headerNavigation){
  const pages=document.createElement('div');pages.className='header-page-links';
  const tools=document.createElement('div');tools.className='header-tools';tools.setAttribute('role','group');tools.setAttribute('aria-label','أدوات المكتبة');
  [...headerNavigation.children].forEach(child=>{if(child.tagName==='A')pages.append(child);else tools.append(child);});
  headerNavigation.append(pages,tools);
  const number=new Intl.NumberFormat('ar-EG');
  const counters=new Map();
  const destinations=new Map([['','articles'],['index.html','articles'],['reading.html','read'],['bookmarks.html','bookmark']].map(([path,kind])=>[new URL(path,root).pathname,kind]));
  let knownIds;
  for(const link of pages.children){
   const url=new URL(link.href),kind=url.origin===root.origin&&destinations.get(url.pathname);
   if(!kind)continue;
   const label=document.createElement('span');label.textContent=link.textContent;
   const count=document.createElement('span');count.className='header-link-count';count.dataset.headerCount=kind;count.setAttribute('aria-hidden','true');
   link.replaceChildren(label,count);counters.set(kind,{link,label,count});
  }
  function updateCounts(){
   const countMarks=store=>Object.keys(store?.entries()||{}).filter(id=>!knownIds||knownIds.has(id)).length;
   const values={articles:knownIds?.size,read:countMarks(window.ReadingProgress),bookmark:countMarks(window.ArticleBookmarks)};
   for(const [kind,{link,label,count}] of counters){
    const value=values[kind],text=value===undefined?'…':number.format(value);
    count.textContent=text;
    link.setAttribute('aria-label',label.textContent+(value===undefined?'':': '+text));
   }
  }
  updateCounts();
  window.ReadingProgress?.subscribe(updateCounts);
  window.ArticleBookmarks?.subscribe(updateCounts);
  const embedded=document.getElementById('library-data');
  let metadata;
  try{metadata=embedded&&JSON.parse(embedded.textContent).articles;}catch{}
  if(Array.isArray(metadata)){
   knownIds=new Set(metadata.map(article=>article.id));updateCounts();
  }else{
   // Reuse the same request as article navigation; no additional data download.
   articles().then(metadata=>{knownIds=new Set(metadata.map(article=>article.id));updateCounts();}).catch(()=>{});
  }
 }
 const panel=document.querySelector('.library-folders,.article-navigation');
 let drawer,trigger,currentLabel,closeSections=()=>{};
 if(panel){
  panel.querySelector('summary').textContent='أقسام المكتبة';
  const compact=window.matchMedia('(max-width:680px)');
  const placeholder=document.createComment('Library sections position');panel.before(placeholder);
  const control=document.createElement('div');control.className='mobile-sections-control';
  control.innerHTML='<button type="button" class="sections-open" aria-label="أقسام المكتبة" title="أقسام المكتبة" aria-describedby="mobile-section-current" aria-haspopup="dialog" aria-controls="sections-drawer" aria-expanded="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg><small id="mobile-section-current" class="mobile-section-current sr-only">جميع المقالات</small></button>';
  const header=document.querySelector('.site-header');
  header.classList.add('has-mobile-sections');header.append(control);
  const searchControl=document.createElement('button');searchControl.type='button';searchControl.className='mobile-library-search';
  searchControl.setAttribute('aria-label','البحث في المكتبة');searchControl.title='البحث في المكتبة';searchControl.setAttribute('aria-haspopup','dialog');
  searchControl.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>';
  header.append(searchControl);
  searchControl.addEventListener('click',()=>{closeSections();document.dispatchEvent(new Event('library:search-open'));});
  trigger=control.querySelector('button');currentLabel=control.querySelector('small');
  const content=document.createElement('div');content.className='section-panel-content';
  [...panel.children].filter(child=>child.tagName!=='SUMMARY').forEach(child=>content.append(child));panel.append(content);
  drawer=document.createElement('dialog');drawer.id='sections-drawer';drawer.className='sections-drawer';drawer.setAttribute('aria-labelledby','sections-drawer-title');
  drawer.innerHTML='<div class="library-dialog-heading"><h2 id="sections-drawer-title">أقسام المكتبة</h2><button type="button" class="library-dialog-close" aria-label="إغلاق أقسام المكتبة">×</button></div><div class="sections-drawer-body"></div>';
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
  let mobileSearch;
  if(searchForm){
   searchForm.before(searchPosition);
   mobileSearch=document.createElement('dialog');mobileSearch.className='article-search-dialog mobile-search-dialog';mobileSearch.setAttribute('aria-labelledby','mobile-search-title');
   mobileSearch.innerHTML='<div class="library-dialog-heading"><h2 id="mobile-search-title">البحث في المكتبة</h2><button type="button" class="library-dialog-close" aria-label="إغلاق البحث">×</button></div><div class="mobile-search-body"></div>';
   document.body.append(mobileSearch);
   const closeSearch=()=>mobileSearch.close();
   mobileSearch.querySelector('button').addEventListener('click',closeSearch);
   mobileSearch.addEventListener('close',unlockModal);
   mobileSearch.addEventListener('click',event=>{if(event.target===mobileSearch){const b=mobileSearch.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)closeSearch();}});
   document.addEventListener('library:search-open',()=>{mobileSearch.showModal();lockModal();searchForm.querySelector('input').focus();});
   searchForm.addEventListener('submit',closeSearch,true);
   searchForm.addEventListener('click',event=>{if(event.target.closest('.suggestion-actions button,a'))closeSearch();},true);
   searchForm.addEventListener('submit',close,true);
   searchForm.addEventListener('click',event=>{if(event.target.closest('.suggestion-actions button,a'))close();},true);
  }
  function syncLayout(){
   if(compact.matches){
    drawer.querySelector('.sections-drawer-body').append(panel);panel.open=false;
    if(searchForm)mobileSearch.querySelector('.mobile-search-body').append(searchForm);
   }else{
    close();placeholder.after(panel);panel.open=!panel.classList.contains('article-navigation')||window.matchMedia('(min-width:1001px)').matches;
    if(searchForm){mobileSearch.close();searchPosition.after(searchForm);}
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

 // Shared store also receives positions from the optional device sync.
 const positionKey='egyptian-industrial-library:last-reading:v1';
 function lastReading(){
  return window.ReadingPosition?.get()||null;
 }
 if(isArticle){
  const id=document.body.dataset.articleId,section=document.getElementById('organized');
  const previous=lastReading();
  const requestedResume=location.hash==='#continue-reading';
  const resume=requestedResume&&previous?.id===id;
  let restoring=resume,timer,lastWritten;
  const readingLine=()=>Math.min(120,window.innerHeight*.2);
  function readingBlocks(){
   const blocks=[...section.querySelectorAll('p,h2,h3,li')].filter(block=>block.tagName!=='LI'||!block.querySelector('p'));
   return blocks.length?blocks:[...section.children];
  }
  function remember(force=false){
   if(restoring||!section||(!force&&document.visibilityState==='hidden'))return;
   // Closing an older background tab must not replace a newer article's position.
   if(force&&JSON.stringify(lastReading())!==lastWritten)return;
   const line=readingLine(),bounds=section.getBoundingClientRect(),blocks=readingBlocks();
   let anchor=-1,offset=0,progress=0;
   if(bounds.top<line&&blocks.length){
    anchor=blocks.findIndex(block=>block.getBoundingClientRect().bottom>line);
    if(anchor<0)anchor=blocks.length-1;
    const block=blocks[anchor].getBoundingClientRect();
    offset=Math.max(0,Math.min(1,(line-block.top)/Math.max(1,block.height)));
    progress=Math.max(0,Math.min(1,(line-bounds.top)/Math.max(1,bounds.height)));
   }else{
    // Returning to the header to leave the article should retain its last text position.
    const saved=lastReading();
    if(saved?.id===id&&saved.anchor>=0){anchor=saved.anchor;offset=saved.offset;progress=saved.progress;}
   }
   try{
    const value={version:1,id,anchor,offset,progress};
    window.ReadingPosition?.remember(value);lastWritten=JSON.stringify(value);
   }catch{}
  }
  function flush(){clearTimeout(timer);remember(true);}
  window.addEventListener('scroll',()=>{clearTimeout(timer);timer=setTimeout(()=>remember(),200);},{passive:true});
  window.addEventListener('pagehide',flush);
  window.addEventListener('pageshow',event=>{if(event.persisted)remember();});
  document.addEventListener('visibilitychange',()=>document.visibilityState==='hidden'?flush():remember());
  const documentReady=document.readyState==='loading'?new Promise(resolve=>document.addEventListener('DOMContentLoaded',resolve,{once:true})):Promise.resolve();
  if(resume)window.LibraryLoading?.hold('reading-position');
  documentReady.then(async()=>{
   // Wait for the real article layout, including fonts, before positioning its paragraphs.
   void document.body.offsetWidth;
   if(document.fonts)await document.fonts.ready;
   await new Promise(requestAnimationFrame);
   if(resume&&section){
    let top=0;
    if(previous.anchor>=0){
     const block=readingBlocks()[previous.anchor];
     const bounds=(block||section).getBoundingClientRect();
     top=window.scrollY+bounds.top+bounds.height*(block?previous.offset:previous.progress)-readingLine();
    }
    window.scrollTo({top:Math.max(0,top),behavior:'instant'});
   }
   if(requestedResume)history.replaceState(null,'',location.pathname+location.search);
  }).catch(()=>{}).finally(()=>{
   restoring=false;remember();
   if(resume)window.LibraryLoading?.done('reading-position');
  });
 }else if(document.getElementById('searchform')&&!document.body.dataset.view){
  let resumeLink;
  let metadata;
  try{metadata=JSON.parse(document.getElementById('library-data')?.textContent).articles;}catch{}
  function showContinue(){
   const entry=lastReading(),article=entry&&metadata?.find(article=>article.id===entry.id);
   if(!article){resumeLink?.remove();resumeLink=null;return;}
   if(!resumeLink){
    resumeLink=document.createElement('a');resumeLink.className='continue-reading';
    resumeLink.innerHTML='<span class="continue-reading-copy"><span class="continue-reading-label">متابعة القراءة</span><strong class="continue-reading-title"></strong></span><span class="continue-reading-arrow" aria-hidden="true">←</span>';
    document.getElementById('library').before(resumeLink);
   }
   resumeLink.href=new URL('articles/'+entry.id+'.html',root).pathname+'#continue-reading';
   resumeLink.querySelector('.continue-reading-title').textContent=article.title;
   resumeLink.setAttribute('aria-label','متابعة قراءة: '+article.title);
   resumeLink.title=article.title;
  }
  if(Array.isArray(metadata))showContinue();
  else articles().then(data=>{metadata=data;showContinue();}).catch(()=>{});
  window.addEventListener('pageshow',showContinue);
  window.ReadingPosition?.subscribe(showContinue);
  window.addEventListener('storage',event=>{if(event.key===positionKey||event.key===null)showContinue();});
 }
})();
