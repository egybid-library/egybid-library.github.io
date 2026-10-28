(function(){
 'use strict';
 const siteRoot=new URL('.',document.currentScript.src);
 const sitePath=path=>new URL(path.replace(/^\/+/,''),siteRoot).pathname;
 const modes=['title','title-desc','newest','oldest','short','long'];
 const labels=['أبجديًا تصاعدي','أبجديًا تنازلي','الأحدث نشرًا','الأقدم نشرًا','الأقصر قراءة','الأطول قراءة'];
 const ar=new Intl.NumberFormat('ar-EG');
 const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const folderIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 7V5h6l2 2h10v13H3Z"/></svg>';
 const chevron='<svg class="folder-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m10 4-4 4 4 4"/></svg>';
 const normalize=value=>value.normalize('NFKD').replace(/[\u064B-\u065F\u0670\u0640\u0300-\u036f]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/[٠-٩]/g,d=>String(d.charCodeAt(0)-1632)).replace(/[۰-۹]/g,d=>String(d.charCodeAt(0)-1776)).toLowerCase();
 function validReadingFilter(value){return ['all','read','unread','bookmarked'].includes(value)?value:'all';}
 function validMode(value){return modes.includes(value)?value:'title';}
 function compare(a,b,sort){
  const title=a.title.localeCompare(b.title,'ar');
  if(sort==='title')return title;
  if(sort==='title-desc')return -title;
  if(sort==='short')return a.minutes-b.minutes||title;
  if(sort==='long')return b.minutes-a.minutes||title;
  if(!a.publicationDate||!b.publicationDate)return Number(Boolean(b.publicationDate))-Number(Boolean(a.publicationDate))||title;
  return (sort==='newest'?b.publicationDate.localeCompare(a.publicationDate):a.publicationDate.localeCompare(b.publicationDate))||title;
 }
 function articleHref(article,sort,query='',readingFilter){return sitePath('articles/'+article.id+'.html')+'?nav-sort='+sort+(query?'&nav-q='+encodeURIComponent(query):'')+(readingFilter?'&nav-reading='+readingFilter:'');}
 const navigationStateKey='egyptian-industrial-library:navigation-state:v1';
 function readNavigationState(){
  try{
   const value=JSON.parse(sessionStorage.getItem(navigationStateKey));
   if(value?.version===1)return {version:1,readFilter:validReadingFilter(value.readFilter),expanded:Array.isArray(value.expanded)?value.expanded:null,views:value.views&&typeof value.views==='object'?value.views:{},panels:value.panels&&typeof value.panels==='object'?value.panels:{}};
  }catch{}
  return {version:1,readFilter:'all',expanded:null,views:{},panels:{}};
 }
 function panelStateKey(panel){return (panel.classList.contains('article-navigation')?'reader':'library')+':'+(window.matchMedia(panel.classList.contains('article-navigation')?'(max-width:1000px)':'(max-width:680px)').matches?'narrow':'wide');}
 function restoredPanelOpen(panel,state=readNavigationState()){
  const key=panelStateKey(panel);
  if(key==='reader:narrow')return false;
  const saved=state.panels[key];return typeof saved==='boolean'?saved:!key.endsWith(':narrow');
 }
 function preparePanel(panel){
  if(!panel||panel.dataset.navigationPrepared)return;
  panel.open=restoredPanelOpen(panel);panel.dataset.navigationPrepared='true';
 }
 preparePanel(document.querySelector('.article-navigation,.library-folders'));
 function create(root,articles,options={}){
  let sort=validMode(options.sort),activeCategory=options.activeCategory||'';
  const current=articles.find(a=>a.id===options.currentId);
  const groups=[...new Set(articles.map(a=>a.category))].sort((a,b)=>a.localeCompare(b,'ar'));
  let state=readNavigationState();
  let readingFilter=validReadingFilter(options.readingFilter||state.readFilter);
  function isFiltering(){return searchTerms.length>0||readingFilter!=='all';}
  const expanded=new Set((state.expanded|| (current?[current.category]:activeCategory?[activeCategory]:[])).filter(category=>groups.includes(category)));
  const panel=root.closest('details');preparePanel(panel);
  let ready=false,restoring=false,pendingPosition=null,saveTimer;

  const groupNodes=new Map();
  const membersByCategory=new Map(groups.map(category=>[category,articles.filter(a=>a.category===category)]));
  const titleIndex=new Map(articles.map(a=>[a.id,normalize(a.title)]));
  const articlesById=new Map(articles.map(a=>[a.id,a]));
  let searchQuery='',searchTerms=[];
  function matchingMembers(category){return membersByCategory.get(category).filter(a=>(readingFilter==='all'||(readingFilter==='bookmarked'?Boolean(window.ArticleBookmarks?.has(a.id)):Boolean(window.ReadingProgress?.has(a.id))===(readingFilter==='read')))&&searchTerms.every(term=>titleIndex.get(a.id).includes(term)));}
  const searchId=root.id+'-title-search';
  const searchBox=document.createElement('div');searchBox.className='folder-search-tools';
  searchBox.innerHTML='<label for="'+searchId+'">بحث سريع عن مقال</label><div class="folder-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input type="search" id="'+searchId+'" placeholder="ابحث في عناوين كل الأقسام…" autocomplete="off" aria-controls="'+root.id+'" aria-describedby="'+searchId+'-status"><button type="button" class="folder-search-clear" aria-label="مسح بحث القائمة" title="مسح البحث" hidden>×</button></div><label class="sidebar-reading-filter" for="'+searchId+'-reading">عرض<select id="'+searchId+'-reading" aria-controls="'+root.id+'"><option value="all">كل المقالات</option><option value="read">المقروءة فقط</option><option value="unread">غير المقروءة فقط</option><option value="bookmarked">المحفوظات فقط</option></select></label><p id="'+searchId+'-status" class="folder-search-status" role="status" aria-live="polite" aria-atomic="true"></p>';
  root.before(searchBox);
  const searchInput=searchBox.querySelector('input'),clearSearch=searchBox.querySelector('button'),searchStatus=searchBox.querySelector('[role="status"]');

  const sidebarFilter=searchBox.querySelector('select');sidebarFilter.value=readingFilter;

  root.classList.add('folder-tree');
  root.setAttribute('aria-label','الأقسام ومقالاتها');
  root.innerHTML='';
  if(options.onCategory){
   const all=document.createElement('button');all.type='button';all.className='all-articles';all.dataset.cat='';all.textContent='جميع المقالات '+ar.format(articles.length);all.addEventListener('click',()=>options.onCategory(''));root.append(all);
  }
  function bookmarkIndicator(id){return window.ArticleBookmarks?.has(id)?'<span class="sidebar-bookmark-indicator" role="img" aria-label="محفوظ" title="محفوظ">'+window.ArticleBookmarks.icon+'</span>':'';}
  function articleList(category){
   return matchingMembers(category).sort((a,b)=>compare(a,b,sort)).map(article=>{
    const read=Boolean(window.ReadingProgress?.has(article.id));
    return '<li class="folder-entry"><a class="folder-article'+(article.id===options.currentId?' current-article':'')+'" data-nav-article="'+article.id+'" href="'+articleHref(article,sort,searchQuery,readingFilter)+'"'+(article.id===options.currentId?' aria-current="page"':'')+'><span class="folder-article-title">'+escape(article.title)+'</span>'+bookmarkIndicator(article.id)+'</a><button type="button" class="sidebar-read-toggle" data-nav-read-toggle="'+article.id+'" aria-pressed="'+String(read)+'" aria-label="'+escape((read?'إلغاء تعليم المقال كمقروء: ':'تعليم المقال كمقروء: ')+article.title)+'" title="'+(read?'إلغاء علامة القراءة':'تعليم كمقروء')+'"><span class="nav-status-icon" aria-hidden="true">'+(read?'✓':'○')+'</span></button></li>';
   }).join('');
  }
  function fill(category){const node=groupNodes.get(category);node.list.innerHTML=articleList(category);node.filled=true;}
  function setExpanded(category,open){
   const node=groupNodes.get(category);if(open&&!node.filled)fill(category);
   node.list.hidden=!open;node.folder.classList.toggle('is-open',open);node.toggle.setAttribute('aria-expanded',String(open));
   if(!isFiltering()){if(open)expanded.add(category);else expanded.delete(category);}
  }
  groups.forEach((category,index)=>{
   const members=membersByCategory.get(category);
   const folder=document.createElement('div');folder.className='article-folder';folder.dataset.folder=category;
   const listId='folder-articles-'+index;
   folder.innerHTML='<button type="button" class="folder-row" aria-controls="'+listId+'" aria-expanded="false"'+(options.onCategory?' data-cat="'+escape(category)+'"':'')+'><span class="folder-toggle" aria-hidden="true">'+chevron+folderIcon+'</span><span class="folder-name"><span>'+escape(category)+'</span><small>'+ar.format(members.length)+'</small></span></button><ul id="'+listId+'" class="folder-articles" hidden></ul>';
   root.append(folder);
   const node={folder,toggle:folder.querySelector('.folder-row'),name:folder.querySelector('.folder-name'),list:folder.querySelector('ul'),filled:false};groupNodes.set(category,node);
   node.toggle.addEventListener('click',()=>{
    const open=node.toggle.getAttribute('aria-expanded')!=='true';
    setExpanded(category,open);
    if(open)options.onCategory?.(category);
    else if(activeCategory===category)options.onCategory?.('');
    saveView();
   });
   if(expanded.has(category))setExpanded(category,true);
  });
  function selectCategory(value,expand=true){const changed=activeCategory!==value;activeCategory=value;root.querySelectorAll('[data-cat]').forEach(button=>{const active=button.dataset.cat===value;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});if(expand&&changed&&value&&groupNodes.has(value)&&!isFiltering()){setExpanded(value,true);saveView();}}
  function viewKey(){return sort+':'+normalize(searchQuery).replace(/\s+/g,' ').trim()+(readingFilter==='all'?'':'|reading='+readingFilter);}
  function currentAnchor(){
   const bounds=root.getBoundingClientRect();
   const candidates=[...root.querySelectorAll('.folder-row,.folder-article')].filter(element=>element.getClientRects().length&&element.getBoundingClientRect().bottom>bounds.top+1);
   const element=candidates.find(element=>element.matches('.folder-article')&&element.getBoundingClientRect().top>=bounds.top+44)||candidates.find(element=>element.getBoundingClientRect().top>=bounds.top-1)||candidates[0];
   if(!element)return null;
   return {article:element.dataset.navArticle||null,category:element.closest('[data-folder]')?.dataset.folder||null,offset:element.getBoundingClientRect().top-bounds.top};
  }
  function saveView(){
   if(!ready||restoring)return;
   clearTimeout(saveTimer);
   const key=viewKey(),previous=state.views[key]||{};
   const open=groups.filter(category=>groupNodes.get(category).toggle.getAttribute('aria-expanded')==='true');
   const position=root.clientHeight>0?{scrollTop:root.scrollTop,anchor:currentAnchor()}:{};
   state.readFilter=readingFilter;state.expanded=[...expanded];state.views[key]={...previous,...position,open,visible:groups.filter(category=>!groupNodes.get(category).folder.hidden),updated:Date.now()};
   if(panel)state.panels[panelStateKey(panel)]=panel.open;
   const keys=Object.keys(state.views).sort((a,b)=>(state.views[b].updated||0)-(state.views[a].updated||0));keys.slice(18).forEach(key=>delete state.views[key]);
   try{sessionStorage.setItem(navigationStateKey,JSON.stringify(state));}catch{}
  }
  function restorePosition(snapshot){
   if(!root.clientHeight){pendingPosition=snapshot||null;return;}
   restoring=true;pendingPosition=null;
   if(snapshot&&Number.isFinite(snapshot.scrollTop)){
    root.scrollTop=Math.max(0,snapshot.scrollTop);
    const anchor=snapshot.anchor;
    let element;
    if(anchor?.article&&/^[a-f0-9]{16}$/.test(anchor.article))element=root.querySelector('[data-nav-article="'+anchor.article+'"]');
    else if(anchor?.category)element=groupNodes.get(anchor.category)?.toggle;
    if(element?.getClientRects().length&&Number.isFinite(anchor.offset))root.scrollTop+=element.getBoundingClientRect().top-root.getBoundingClientRect().top-anchor.offset;
   }else if(!isFiltering()){
    const link=root.querySelector('[aria-current="page"]');
    if(link?.getClientRects().length)root.scrollTop+=link.getBoundingClientRect().top-root.getBoundingClientRect().top-root.clientHeight/2+link.clientHeight/2;
   }else root.scrollTop=0;
   requestAnimationFrame(()=>{restoring=false;});
  }
  function restoreView(snapshot=state.views[viewKey()]){
   ready=false;root.setAttribute('aria-busy','true');
   if(!isFiltering()&&Array.isArray(state.expanded)){expanded.clear();state.expanded.filter(category=>groups.includes(category)).forEach(category=>expanded.add(category));}
   groups.forEach(category=>{
    const node=groupNodes.get(category);if(node.folder.hidden)return;
    const open=Array.isArray(snapshot?.open)?snapshot.open.includes(category):isFiltering()||expanded.has(category);
    setExpanded(category,open);
   });
   restorePosition(snapshot);requestAnimationFrame(()=>{ready=true;root.setAttribute('aria-busy','false');});
  }
  function nextLinks(){
   const target=document.getElementById('article-neighbours');if(!target||!current)return;
   const members=(readingFilter==='bookmarked'?matchingMembers(current.category):articles.filter(a=>a.category===current.category)).sort((a,b)=>compare(a,b,sort)),index=members.findIndex(a=>a.id===current.id);
   const link=(article,label)=>article?'<a href="'+articleHref(article,sort,readingFilter==='bookmarked'?searchQuery:'',readingFilter==='bookmarked'?readingFilter:undefined)+'"><small>'+label+'</small><span>'+escape(article.title)+'</span></a>':'<span class="neighbour-boundary">'+(label==='المقال السابق'?'أول مقال في القسم':'آخر مقال في القسم')+'</span>';
   target.innerHTML='<p>'+escape(current.category)+' · '+labels[modes.indexOf(sort)]+' · '+(index>=0?ar.format(index+1)+' من '+ar.format(members.length):ar.format(members.length)+' من المحفوظات')+'</p><div>'+link(members[index-1],'المقال السابق')+link(members[index+1],'المقال التالي')+'</div>';
  }
  const empty=document.createElement('p');empty.className='folder-search-empty';empty.hidden=true;empty.textContent='جرّب كلمة أخرى أو امسح البحث لعرض كل الأقسام.';root.append(empty);
  function renderMatches(snapshot=state.views[viewKey()]){
   if(snapshot&&Array.isArray(snapshot.open))snapshot={...snapshot,open:[...snapshot.open]};
   let total=0,sections=0;
   groups.forEach(category=>{
    const node=groupNodes.get(category),members=matchingMembers(category);
    node.folder.hidden=members.length===0;
    node.name.querySelector('small').textContent=ar.format(members.length);
    node.filled=false;
    if(members.length){if(isFiltering()&&Array.isArray(snapshot?.visible)&&!snapshot.visible.includes(category)&&!snapshot.open.includes(category))snapshot.open.push(category);total+=members.length;sections++;setExpanded(category,isFiltering()||expanded.has(category));}
   });
   const all=root.querySelector('.all-articles');if(all)all.hidden=isFiltering();
   empty.hidden=total>0;
   clearSearch.hidden=searchInput.value.length===0;
   searchStatus.textContent=isFiltering()?(total?ar.format(total)+' نتيجة في '+ar.format(sections)+(sections===1?' قسم':' أقسام'):searchTerms.length?'لا توجد عناوين مطابقة.':readingFilter==='bookmarked'?'لا توجد مقالات محفوظة بعد.':readingFilter==='read'?'لا توجد مقالات مقروءة بعد.':'كل المقالات مقروءة.'):'البحث في عناوين جميع الأقسام';
   empty.textContent=searchTerms.length?'جرّب كلمة أخرى أو غيّر اختيار عرض المقالات.':readingFilter==='bookmarked'?'احفظ المقال من داخله ليظهر هنا، أو اختر كل المقالات.':readingFilter==='read'?'علّم المقالات التي قرأتها لتظهر هنا، أو اختر كل المقالات.':'اختر كل المقالات لعرض المكتبة كاملة.';
   restoreView(snapshot);
  }
  function setSearch(value){
   saveView();ready=false;
   searchQuery=value.trim();searchTerms=normalize(searchQuery).split(/\s+/).filter(Boolean);
   renderMatches();nextLinks();options.onSearch?.(searchQuery);
  }
  function setReadingFilter(value){
   const next=validReadingFilter(value);if(next===readingFilter)return;
   saveView();ready=false;readingFilter=next;sidebarFilter.value=next;state.readFilter=readingFilter;
   try{sessionStorage.setItem(navigationStateKey,JSON.stringify(state));}catch{}
   renderMatches();nextLinks();options.onFilter?.(readingFilter);
  }
  sidebarFilter.addEventListener('change',()=>setReadingFilter(sidebarFilter.value));
  searchInput.addEventListener('input',()=>setSearch(searchInput.value));
  clearSearch.addEventListener('click',()=>{searchInput.value='';setSearch('');searchInput.focus();});
  searchInput.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();searchInput.value='';setSearch('');}});
  function setSort(value){saveView();ready=false;sort=validMode(value);groupNodes.forEach((node,category)=>{if(!node.list.hidden)fill(category);else node.filled=false;});nextLinks();restoreView();}

  function syncSidebarReading(){
   if(readingFilter!=='all'){
    const control='[data-nav-read-toggle]';
    const idOf=button=>button.dataset.navReadToggle;
    const active=document.activeElement?.matches(control)?idOf(document.activeElement):null;
    const previousIds=[...root.querySelectorAll(control)].filter(button=>button.getClientRects().length).map(idOf);
    const previousVisible=new Set(groups.filter(category=>!groupNodes.get(category).folder.hidden));
    saveView();const snapshot=state.views[viewKey()]?{...state.views[viewKey()],open:Array.isArray(state.views[viewKey()].open)?[...state.views[viewKey()].open]:[]}:undefined;
    if(snapshot)groups.forEach(category=>{if(!previousVisible.has(category)&&matchingMembers(category).length&&!snapshot.open.includes(category))snapshot.open.push(category);});
    renderMatches(snapshot);
    if(active){
     const index=previousIds.indexOf(active),candidates=[active,...previousIds.slice(index+1),...previousIds.slice(0,index).reverse()];
     const next=candidates.map(id=>[...root.querySelectorAll(control)].find(button=>idOf(button)===id)).find(button=>button?.getClientRects().length);
     (next||sidebarFilter).focus({preventScroll:true});
    }
    return;
   }
   root.querySelectorAll('[data-nav-read-toggle]').forEach(button=>{
    const article=articlesById.get(button.dataset.navReadToggle);if(!article)return;
    const read=window.ReadingProgress.has(article.id);
    button.setAttribute('aria-pressed',String(read));
    button.setAttribute('aria-label',(read?'إلغاء تعليم المقال كمقروء: ':'تعليم المقال كمقروء: ')+article.title);
    button.title=read?'إلغاء علامة القراءة':'تعليم كمقروء';
    button.querySelector('.nav-status-icon').textContent=read?'✓':'○';
   });
  }
  const unsubscribe=window.ReadingProgress?.subscribe(syncSidebarReading);
  const unsubscribeBookmarks=window.ArticleBookmarks?.subscribe(()=>{
   if(readingFilter==='bookmarked'){syncSidebarReading();nextLinks();return;}
   root.querySelectorAll('[data-nav-article]').forEach(link=>{
    const indicator=link.querySelector('.sidebar-bookmark-indicator'),saved=window.ArticleBookmarks.has(link.dataset.navArticle);
    if(saved&&!indicator)link.insertAdjacentHTML('beforeend',bookmarkIndicator(link.dataset.navArticle));
    else if(!saved&&indicator)indicator.remove();
   });
  });
  const onReadClick=event=>{
   const button=event.target.closest('[data-nav-read-toggle]');if(!button)return;
   event.preventDefault();window.ReadingProgress?.toggle(button.dataset.navReadToggle);saveView();
  };
  root.addEventListener('click',onReadClick);
  selectCategory(activeCategory);nextLinks();searchInput.value=options.query||'';setSearch(searchInput.value);
  const onScroll=()=>{if(ready&&!restoring){clearTimeout(saveTimer);saveTimer=setTimeout(saveView,80);}};
  const onToggle=()=>{if(panel.open){const snapshot=pendingPosition||state.views[viewKey()];requestAnimationFrame(()=>{restorePosition(snapshot);requestAnimationFrame(saveView);});}else saveView();};
  const onPageHide=()=>saveView();
  const onPageShow=event=>{if(event.persisted){state=readNavigationState();if(panel)panel.open=restoredPanelOpen(panel,state);restoreView();}};
  root.addEventListener('scroll',onScroll,{passive:true});
  root.addEventListener('click',event=>{if(event.target.closest('a'))saveView();},true);
  if(panel)panel.addEventListener('toggle',onToggle);
  window.addEventListener('pagehide',onPageHide);window.addEventListener('pageshow',onPageShow);
  return {setSort,selectCategory,setReadingFilter,destroy(){unsubscribe?.();unsubscribeBookmarks?.();root.removeEventListener('click',onReadClick);clearTimeout(saveTimer);root.removeEventListener('scroll',onScroll);if(panel)panel.removeEventListener('toggle',onToggle);window.removeEventListener('pagehide',onPageHide);window.removeEventListener('pageshow',onPageShow);searchBox.remove();}};

 }
 window.ArticleNavigator={create,compare,articleHref};
 const root=document.getElementById('article-folders');if(!root)return;
 const selector=document.getElementById('navigation-sort'),panel=document.querySelector('.article-navigation');
 const requested=new URLSearchParams(location.search).get('nav-sort');
 let saved;try{saved=localStorage.getItem('egyptian-industrial-library:navigation-sort:v1');}catch{}
 let sort=validMode(requested||saved);selector.value=sort;

 fetch(sitePath('navigation-index.json')).then(r=>{if(!r.ok)throw Error();return r.json();}).then(articles=>{
  const nav=create(root,articles,{sort,currentId:document.body.dataset.articleId,query:new URLSearchParams(location.search).get('nav-q')||'',readingFilter:new URLSearchParams(location.search).get('nav-reading'),onFilter:filter=>{
   const params=new URLSearchParams(location.search);if(filter==='all')params.delete('nav-reading');else params.set('nav-reading',filter);history.replaceState(null,'',location.pathname+(params.size?'?'+params:'')+location.hash);
  },onSearch:query=>{
   const params=new URLSearchParams(location.search);if(query)params.set('nav-q',query);else params.delete('nav-q');history.replaceState(null,'',location.pathname+(params.size?'?'+params:'')+location.hash);
  }});
  const current=articles.find(a=>a.id===document.body.dataset.articleId);
  if(current)document.getElementById('navigation-section').textContent='القسم الحالي: '+current.category;
  selector.addEventListener('change',()=>{
   sort=selector.value;nav.setSort(sort);
   const params=new URLSearchParams(location.search);params.set('nav-sort',sort);history.replaceState(null,'',location.pathname+'?'+params+location.hash);
   try{localStorage.setItem('egyptian-industrial-library:navigation-sort:v1',sort);}catch{}
  });
 }).catch(()=>{root.textContent='تعذّر تحميل قائمة المقالات. ';const link=document.createElement('a');link.href=siteRoot.pathname;link.textContent='فتح فهرس المكتبة';root.append(link);});
})();
