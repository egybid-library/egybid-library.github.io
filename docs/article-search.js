(function(){
 'use strict';
 const ui=window.LibraryUI,sidebar=document.querySelector('.reader-sidebar');
 if(!ui||!sidebar)return;
 const ar=new Intl.NumberFormat('ar-EG');
 const normalize=value=>value.normalize('NFKD').replace(/[\u064B-\u065F\u0670\u0640\u0300-\u036f]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').toLowerCase();
 const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const open=document.createElement('button');open.type='button';open.className='article-search-open';open.setAttribute('aria-haspopup','dialog');open.setAttribute('aria-controls','article-library-search');
 open.setAttribute('aria-label','البحث في المكتبة');open.title='البحث في المكتبة';
 open.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><span>البحث في المكتبة</span>';
 const compact=window.matchMedia('(max-width:680px)');
 const dialog=document.createElement('dialog');dialog.id='article-library-search';dialog.className='article-search-dialog';dialog.setAttribute('aria-labelledby','article-search-title');
 dialog.innerHTML='<div class="library-dialog-heading"><h2 id="article-search-title">البحث في المكتبة</h2><button type="button" class="library-dialog-close" aria-label="إغلاق البحث">×</button></div><form class="search-panel" role="search"><label class="sr-only" for="article-search-query">البحث في جميع المقالات</label><div class="search"><span class="search-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg></span><input id="article-search-query" type="search" placeholder="ابحث عن مقال…" autocomplete="off" enterkeyhint="search"><button type="button" class="article-search-clear" aria-label="مسح البحث" hidden>×</button></div></form><div class="article-search-actions suggestion-actions" hidden><button type="button" class="article-title-results">عرض كل نتائج العناوين</button><button type="button" class="article-content-results">بحث في العنوان والمحتوى</button></div><p class="article-search-status" role="status" aria-live="polite" aria-atomic="true"></p><div class="article-search-results"></div><button type="button" class="article-search-more" hidden>عرض المزيد</button>';
 document.body.append(dialog);
 const content=document.createElement('div');content.className='article-search-content';
 [...dialog.children].filter(child=>!child.classList.contains('library-dialog-heading')).forEach(child=>content.append(child));
 dialog.append(content);
 function placeSearch(){
  if(compact.matches)open.remove();else sidebar.prepend(open);
 }
 compact.addEventListener('change',placeSearch);placeSearch();
 const input=content.querySelector('input'),clear=content.querySelector('.article-search-clear'),status=content.querySelector('[role=status]'),results=content.querySelector('.article-search-results'),actions=content.querySelector('.article-search-actions'),allTitles=content.querySelector('.article-title-results'),more=content.querySelector('.article-search-more');
 let articles=[],enginePromise,revision=0,matches=[],visible=0;
 const sort=()=>ui.getSort(document.getElementById('navigation-sort')?.value);
 function sorted(list){return list.sort((a,b)=>window.ArticleNavigator.compare(a,b,sort()));}
 function titleMatches(query){const terms=normalize(query).trim().split(/\s+/).filter(Boolean);return articles.filter(article=>terms.every(term=>article.searchTitle.includes(term)));}
 function render(limit){
  visible=Math.min(limit,matches.length);
  results.innerHTML=matches.slice(0,visible).map(article=>'<a class="article-search-result" href="'+window.ArticleNavigator.articleHref(article)+'"><span>'+escape(article.title)+'</span><small>'+escape(article.category)+'</small></a>').join('');
  more.hidden=visible>=matches.length;more.textContent='عرض المزيد ('+ar.format(visible)+' من '+ar.format(matches.length)+')';
 }
 function suggest(){
  revision++;const query=input.value.trim();clear.hidden=!input.value;more.hidden=true;results.removeAttribute('aria-busy');
  actions.hidden=!query;
  if(!query){matches=[];results.replaceChildren();status.textContent='';return;}
  const normalized=normalize(query),rank=article=>article.searchTitle===normalized?0:article.searchTitle.startsWith(normalized)?1:article.searchTitle.includes(normalized)?2:3;
  matches=titleMatches(query).sort((a,b)=>rank(a)-rank(b)||window.ArticleNavigator.compare(a,b,sort()));
  allTitles.disabled=!matches.length;allTitles.textContent='عرض كل نتائج العناوين ('+ar.format(matches.length)+')';
  status.textContent=matches.length?'اقتراحات من العناوين: '+ar.format(Math.min(6,matches.length))+' من '+ar.format(matches.length):'لا توجد عناوين مطابقة. يمكنك البحث في العنوان والمحتوى.';
  render(6);more.hidden=true;
 }
 async function engine(){
  if(!enginePromise)enginePromise=Promise.all([
   import(new URL('search-engine.js',ui.root)),
   fetch(new URL('library-data.json',ui.root)).then(response=>{if(!response.ok)throw new Error('Search data unavailable');return response.json();})
  ]).then(([module,data])=>module.createSearchClient(new URL(data.searchIndex,ui.root).href,{ids:data.articles.map(a=>a.id),titles:data.articles.map(a=>normalize(a.title))})).catch(error=>{enginePromise=null;throw error;});
  return enginePromise;
 }
 async function submit(scope){
  const query=input.value.trim();if(!query)return;
  const request=++revision;
  if(scope==='title')matches=sorted(titleMatches(query));
  else{
   status.textContent='جارٍ البحث في العنوان والمحتوى…';results.setAttribute('aria-busy','true');results.replaceChildren();more.hidden=true;
   try{
    const ids=new Set(await (await engine()).find(query));
    if(request!==revision)return;
    matches=sorted(articles.filter(article=>ids.has(article.id)));
   }catch{
    if(request===revision){status.textContent='تعذّر إكمال البحث. أعد المحاولة.';results.removeAttribute('aria-busy');}
    return;
   }
  }
  if(request!==revision)return;
  results.removeAttribute('aria-busy');status.textContent='نتائج البحث عن «'+query+'» '+(scope==='title'?'في العناوين':'في العنوان والمحتوى')+': '+ar.format(matches.length)+' مقالًا';
  render(20);status.tabIndex=-1;
  if(dialog.open){status.focus({preventScroll:true});status.scrollIntoView({block:'nearest'});}
 }
 async function prepareSearch(refresh=false){
  if(articles.length){if(refresh)suggest();return;}
  status.textContent='جارٍ تحميل فهرس البحث…';
  try{articles=(await ui.articles()).map(article=>({...article,searchTitle:normalize(article.title)}));if(dialog.open)suggest();}
  catch{status.textContent='تعذّر تحميل فهرس البحث. أغلق البحث وأعد المحاولة.';}
 }
 function openSearch(){dialog.showModal();ui.lockModal();input.focus();prepareSearch(true);}
 open.addEventListener('click',openSearch);
 document.addEventListener('library:search-open',openSearch);
 input.addEventListener('input',event=>{if(!event.isComposing)suggest();});input.addEventListener('compositionend',suggest);
 clear.addEventListener('click',()=>{input.value='';suggest();input.focus();});
 content.querySelector('form').addEventListener('submit',event=>{event.preventDefault();submit('all');});
 allTitles.addEventListener('click',()=>submit('title'));content.querySelector('.article-content-results').addEventListener('click',()=>submit('all'));
 more.addEventListener('click',()=>{const previous=visible;render(visible+20);results.querySelectorAll('a')[previous]?.focus({preventScroll:true});});
 dialog.querySelector('.library-dialog-close').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('close',()=>{revision++;if(results.hasAttribute('aria-busy'))suggest();ui.unlockModal();});
 dialog.addEventListener('click',event=>{if(event.target===dialog){const b=dialog.getBoundingClientRect();if(event.clientX<b.left||event.clientX> b.right||event.clientY<b.top||event.clientY>b.bottom)dialog.close();}});
 results.addEventListener('click',event=>{if(event.target.closest('a')){dialog.close();}});
 window.addEventListener('pageshow',event=>{if(event.persisted&&dialog.open)dialog.close();});
})();
