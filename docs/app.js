const libraryRoot=new URL('.',document.currentScript.src);
const libraryHref=path=>new URL(path,libraryRoot).pathname;
const $=selector=>document.querySelector(selector);
const ar=new Intl.NumberFormat('ar-EG');
const articleQuantity=(count,accusative=false)=>count===1?'مقال واحد':count===2?(accusative?'مقالين':'مقالان'):ar.format(count)+(count%100>=3&&count%100<=10?' مقالات':' مقالًا');
const savedQuantity=count=>ar.format(count)+' مقال محفوظ';
 const readingTime=count=>count===1?'دقيقة واحدة':count===2?'دقيقتان':ar.format(count)+(count%100>=3&&count%100<=10?' دقائق':' دقيقة');
const dateFormat=new Intl.DateTimeFormat('ar-EG',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
const norm=value=>value.normalize('NFKD').replace(/[\u064B-\u065F\u0670\u0640\u0300-\u036f]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').toLowerCase();
const escapeHTML=value=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const progress=window.ReadingProgress;
const bookmarks=window.ArticleBookmarks;
const isReadingPage=document.body.dataset.view==='reading';
const isBookmarksPage=document.body.dataset.view==='bookmarks';
const isCollectionPage=isReadingPage||isBookmarksPage;
if(!isCollectionPage&&location.hash==='#reading-progress')location.replace(libraryHref('reading.html'));
function updateReadCount(count){const counter=$('#read-total');if(counter)counter.textContent=ar.format(count);}
updateReadCount(Object.keys(progress.entries()).length);
const params=new URLSearchParams(location.search);
const displayOptions=document.querySelector('.display-options');
if(displayOptions){
 const compactDisplay=window.matchMedia('(max-width:680px)');
 const syncDisplayMode=()=>{if(compactDisplay.matches){let saved;try{saved=sessionStorage.getItem('egyptian-industrial-library:display-options:v1');}catch{}displayOptions.open=saved==='open';}else displayOptions.open=true;};
 syncDisplayMode();if(compactDisplay.addEventListener)compactDisplay.addEventListener('change',syncDisplayMode);else compactDisplay.addListener(syncDisplayMode);
 displayOptions.addEventListener('toggle',()=>{if(compactDisplay.matches){try{sessionStorage.setItem('egyptian-industrial-library:display-options:v1',displayOptions.open?'open':'closed');}catch{}}});
}

// Cards use only the small catalog. Full-content search runs separately.
let contentIndexURL,excerptPrefix,enginePromise,contentSearch={key:null,ids:null,error:false};
const searchResults=new Map(),searchLookups=new Map(),excerptRequests=new Map(),articlesById=new Map();
function contentEngine(){
 if(enginePromise)return enginePromise;
 enginePromise=(async()=>{
  try{
   return await new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('search-worker.js?v=d98d89b42865855e',libraryRoot),{type:'module'});
    const pending=new Map();let nextId=0,ready=false;
    const fail=error=>{worker.terminate();pending.forEach(p=>p.reject(error));pending.clear();if(ready)enginePromise=null;reject(error);};
    worker.onerror=()=>fail(new Error('Search worker unavailable'));
    worker.onmessage=({data})=>{
     if(data.type==='ready'){
      ready=true;resolve({warm:()=>new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{resolve,reject});worker.postMessage({type:'warm',id});}),find:(text,scope)=>new Promise((resolve,reject)=>{
       const id=++nextId;pending.set(id,{resolve,reject});worker.postMessage({type:'search',id,query:text,scope});
      })});
     }else if(data.type==='result'||data.type==='warmed'){
      pending.get(data.id)?.resolve(data.ids);pending.delete(data.id);
     }else if(data.type==='error'){
      if(!ready)fail(new Error(data.message));
      else{pending.get(data.id)?.reject(new Error(data.message));pending.delete(data.id);}
     }
    };
    worker.postMessage({type:'init',url:new URL(contentIndexURL,libraryRoot).href,metadata:{ids:articles.map(a=>a.id),titles:articles.map(a=>a.searchTitle)}});
   });
  }catch{
   // If workers are unavailable, keep full-content search usable on the main thread.
   const engine=await import(new URL('search-engine.js?v=0d79e0bd4f014672',libraryRoot).href);
   return engine.createSearchClient(new URL(contentIndexURL,libraryRoot).href,{ids:articles.map(a=>a.id),titles:articles.map(a=>a.searchTitle)});
  }
 })().catch(error=>{enginePromise=null;throw error;});
 return enginePromise;
}
function findContentMatches(text,scope){
 const key=scope+':'+norm(text).trim().split(/\s+/).filter(Boolean).join('\0');
 if(searchResults.has(key))return Promise.resolve(searchResults.get(key));
 if(searchLookups.has(key))return searchLookups.get(key);
 const request=contentEngine().then(engine=>engine.find(text,scope)).then(ids=>{
  const matches=new Set(ids);searchResults.set(key,matches);
  if(searchResults.size>20)searchResults.delete(searchResults.keys().next().value);
  return matches;
 }).finally(()=>searchLookups.delete(key));
 searchLookups.set(key,request);return request;
}
function prepareContentSearch(terms){
 if(!terms.length||searchScope==='title'){contentSearch={key:null,ids:null,error:false};return;}
 const key=searchScope+':'+terms.join('\0');
 if(contentSearch.key===key)return;
 if(searchResults.has(key)){contentSearch={key,ids:searchResults.get(key),error:false};return;}
 contentSearch={key,ids:null,error:false};
 const scope=searchScope,text=query;
 findContentMatches(text,scope).then(matches=>{
  if(contentSearch.key!==key)return;
  contentSearch={key,ids:matches,error:false};draw({expandCategory:false});
 }).catch(()=>{
  if(contentSearch.key!==key)return;
  contentSearch={key,ids:null,error:true};draw({expandCategory:false});
 });
}
function warmContentSearch(){
 const input=$('#query');if(!input)return;
 // Only a small routing table is prefetched, and only when search is used.
 const start=()=>contentEngine().then(engine=>engine.warm?.()).catch(()=>{});
 input.addEventListener('focus',start,{once:true});
 if(document.activeElement===input)start();
}
function hydrateExcerpts(visible){
 if(!excerptPrefix)return Promise.resolve();
 const parts=new Set(visible.filter(a=>a.excerpt===undefined).map(a=>a.excerptPart));
 for(const part of parts){
  if(excerptRequests.has(part))continue;
  const request=fetch(new URL(excerptPrefix+part.toString(16).padStart(2,'0')+'.json',libraryRoot)).then(response=>{
   if(!response.ok)throw new Error('Excerpt unavailable');return response.json();
  }).then(data=>{
   for(const [id,excerpt] of Object.entries(data)){const article=articlesById.get(id);if(article)article.excerpt=excerpt;}
   document.querySelectorAll('#cards .card[data-article-id]').forEach(card=>{
    const article=articlesById.get(card.dataset.articleId),text=card.querySelector('.card-link>p');
    if(text&&article?.excerpt!==undefined){text.textContent=article.excerpt;text.classList.remove('excerpt-pending');text.removeAttribute('aria-hidden');}
   });
  }).catch(error=>{excerptRequests.delete(part);throw error;});
  excerptRequests.set(part,request);
 }
 return Promise.all([...parts].map(part=>excerptRequests.get(part)));
}
let folderNavigation,pendingSearchReveal=null,searchFeedbackTimer,clearLibrarySearch=()=>{};
function revealSearchResults(request){
 if(pendingSearchReveal!==request||query!==request.query)return;
 pendingSearchReveal=null;
 const summary=$('#count');
 summary.focus({preventScroll:true});
 summary.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 summary.classList.remove('search-updated');
 clearTimeout(searchFeedbackTimer);
 requestAnimationFrame(()=>{
  if(query!==request.query)return;
  summary.classList.add('search-updated');
  searchFeedbackTimer=setTimeout(()=>summary.classList.remove('search-updated'),1800);
 });
}
let articles=[],category=params.get('category')||'',page=1,query=isCollectionPage?'':params.get('q')||'';
if(query&&!isCollectionPage)category='';
let searchScope=!isCollectionPage&&params.get('scope')==='title'?'title':'all';
let readingFilter=isReadingPage?'read':isBookmarksPage?'all':params.get('reading')||'all';
if(!['all','read','unread'].includes(readingFilter))readingFilter='all';
let pageSize=Number(params.get('size'))||20;
if(![20,50,100].includes(pageSize))pageSize=20;
let sort=params.get('sort')||'newest';
if(!['title','title-desc','short','long','newest','oldest'].includes(sort))sort='newest';
$('#page-size').value=String(pageSize);$('#sort').value=sort;
if($('#query'))$('#query').value=query;
if($('#reading-filter'))$('#reading-filter').value=readingFilter;
function dateLabel(article){return article.publicationDate?dateFormat.format(new Date(article.publicationDate+'T00:00:00Z')):'تاريخ النشر غير متاح';}
function compareArticles(a,b){
 const title=a.title.localeCompare(b.title,'ar');
 if(sort==='title')return title;
 if(sort==='title-desc')return -title;
 if(sort==='short')return a.minutes-b.minutes||title;
 if(sort==='long')return b.minutes-a.minutes||title;
 if(!a.publicationDate||!b.publicationDate)return Number(Boolean(b.publicationDate))-Number(Boolean(a.publicationDate))||title;
 return (sort==='newest'?b.publicationDate.localeCompare(a.publicationDate):a.publicationDate.localeCompare(b.publicationDate))||(sort==='newest'?-title:title);
}
function syncReadButtons(){
 document.querySelectorAll('[data-read-toggle]').forEach(button=>{
  const read=progress.has(button.dataset.articleId);
  const title=articles.find(article=>article.id===button.dataset.articleId)?.title||'المقال';
  button.setAttribute('aria-pressed',String(read));
  button.setAttribute('aria-label',(read?'إلغاء علامة القراءة عن: ':'تعليم كمقروء: ')+title);
  button.title=read?'إلغاء علامة القراءة':'تعليم المقال كمقروء';
  button.textContent=read?'مقروء ✓':'علّم كمقروء';
  button.closest('.card')?.classList.toggle('is-read',read);
 });
}
function renderProgress(){
 const total=articles.length,read=articles.filter(article=>progress.has(article.id)).length;
 updateReadCount(read);
 if(isBookmarksPage){renderBookmarks();return;}
 if(!isReadingPage)return;
 $('#reading-summary-count').textContent=ar.format(read)+' من '+ar.format(total);
 $('#reading-overall').value=read;$('#reading-overall').max=Math.max(1,total);
 $('#reading-total-label').textContent='قرأت '+ar.format(read)+' من '+ar.format(total)+' مقالًا';
 $('#show-read').disabled=read===0;
 $('#reading-save-note').textContent=progress.persistent()?'سجلّك محفوظ في هذا المتصفح على هذا الجهاز، دون تسجيل دخول.':'الحفظ الدائم غير متاح في هذا المتصفح حاليًا؛ العلامات محفوظة لهذه الزيارة فقط.';
 const categories=[...new Set(articles.map(article=>article.category))].sort((a,b)=>a.localeCompare(b,'ar'));
 $('#reading-categories').innerHTML=categories.map(value=>{
  const members=articles.filter(article=>article.category===value),done=members.filter(article=>progress.has(article.id)).length;
  return `<button type="button" class="category-progress" data-reading-category="${escapeHTML(value)}" ${done===0?'disabled':''}><span>${escapeHTML(value)}</span><b>${ar.format(done)} <small>من ${ar.format(members.length)}</small></b><progress value="${done}" max="${members.length}" aria-label="المقروء من ${escapeHTML(value)}"></progress></button>`;
 }).join('');
 document.querySelectorAll('[data-reading-category]').forEach(button=>button.onclick=()=>showReadArticles(button.dataset.readingCategory));
}
function renderBookmarks(){
 const saved=articles.filter(article=>bookmarks.has(article.id));
 $('#bookmarks-count').textContent=savedQuantity(saved.length);
 const groups=[...new Set(articles.map(article=>article.category))].sort((a,b)=>a.localeCompare(b,'ar'));
 $('#bookmark-category').innerHTML='<option value="">كل الأقسام</option>'+groups.map(value=>{
  const count=saved.filter(article=>article.category===value).length;
  return `<option value="${escapeHTML(value)}">${escapeHTML(value)} (${ar.format(count)})</option>`;
 }).join('');
 $('#bookmark-category').value=category;
}
function draw({expandCategory=true}={}){
 if(!articles.length)return;
 const terms=norm(query).trim().split(/\s+/).filter(Boolean);
 prepareContentSearch(terms);
 const fullSearch=terms.length>0&&searchScope!=='title';
 const waiting=fullSearch&&!contentSearch.ids;
 const matches=articles.filter(article=>(!isBookmarksPage||bookmarks.has(article.id))&&(!category||article.category===category)&&(readingFilter==='all'||progress.has(article.id)===(readingFilter==='read'))&&(!terms.length||(searchScope==='title'?terms.every(term=>article.searchTitle.includes(term)):contentSearch.ids?.has(article.id))));
 matches.sort(compareArticles);
 const max=Math.max(1,Math.ceil(matches.length/pageSize));page=Math.min(page,max);
 if($('#query'))$('#query').placeholder='ابحث عن مقال…';
 if($('#clear'))$('#clear').hidden=!$('#query').value;
 const status=readingFilter==='read'?' مقروءًا':readingFilter==='unread'?' غير مقروء':'';
 const resultDescription=waiting?(contentSearch.error?'تعذّر تحميل البحث في المحتوى.':'جارٍ تجهيز البحث في المحتوى…'):((isBookmarksPage?savedQuantity(matches.length):ar.format(matches.length)+' مقالًا'+status)+(query?' تطابق بحثك':!isBookmarksPage&&readingFilter==='all'?(category?' في هذا القسم':' في المكتبة'):''));
 $('#count').innerHTML=(category?`<button type="button" id="clear-category" class="selected-category" aria-label="إلغاء تصفية قسم ${escapeHTML(category)} وعرض كل الأقسام" title="إلغاء تصفية القسم"><span class="selected-category-label">القسم: <strong>${escapeHTML(category)}</strong></span><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8"/></svg></button>`:'')+`<span class="results-description">${query?`<span class="search-results-heading">نتائج البحث عن <strong>«${escapeHTML(query)}»</strong></span><span class="search-results-detail">${searchScope==='title'?'في العناوين فقط':'في العنوان والمحتوى'} · ${escapeHTML(resultDescription)}</span>`:escapeHTML(resultDescription)}</span>`+(query?'<button type="button" id="clear-search-results" class="clear-search-results"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8"/></svg><span>إزالة البحث</span></button>':'');
 if($('#clear-search-results'))$('#clear-search-results').onclick=()=>clearLibrarySearch();
 $('#count').classList.toggle('has-search',Boolean(query));
 if(!query)$('#count').classList.remove('search-updated');
 if($('#clear-category'))$('#clear-category').onclick=()=>{
  category='';page=1;
  if($('#bookmark-category'))$('#bookmark-category').value='';
  draw({expandCategory:false});$('#count').focus({preventScroll:true});
 };
 $('#cards').setAttribute('aria-busy',String(waiting&&!contentSearch.error));
 $('#cards').innerHTML=waiting?`<div class="empty search-loading" role="status"><p>${contentSearch.error?'تعذّر تجهيز البحث. أعد المحاولة.':'جارٍ البحث في محتوى المقالات…'}</p>${contentSearch.error?'<button type="button" id="retry-content-search">إعادة المحاولة</button>':''}</div>`:matches.slice((page-1)*pageSize,page*pageSize).map(article=>`<article class="card${progress.has(article.id)?' is-read':''}" data-article-id="${article.id}" data-published="${article.publicationDate||''}"><a class="card-link" href="articles/${article.id}.html?nav-sort=${sort}"><div class="card-top"><span>${escapeHTML(article.category)}</span><span>↖</span></div><h3>${escapeHTML(article.title)}</h3><div class="card-date">${article.publicationDate?`<time datetime="${article.publicationDate}">${dateLabel(article)}</time>`:dateLabel(article)}</div><p${article.excerpt===undefined?' class="excerpt-pending" aria-hidden="true"':''}>${escapeHTML(article.excerpt||'')}</p><div class="card-bottom">مدة القراءة: ${readingTime(article.minutes)} <span>اقرأ المقال ←</span></div></a><div class="card-tools"><button type="button" class="read-toggle" data-read-toggle data-article-id="${article.id}" aria-pressed="${progress.has(article.id)}">علّم كمقروء</button>${bookmarks.control(article.id,article.title)}</div></article>`).join('')||`<div class="empty"><h3>${isBookmarksPage?(category?'لا توجد مقالات محفوظة في هذا القسم':'لم تحفظ أيّ مقال بعد'):readingFilter==='read'?'لا توجد مقالات مقروءة ضمن هذا الاختيار':'لا توجد نتائج مطابقة'}</h3><p>${isBookmarksPage?'اضغط علامة الحفظ بجوار أيّ مقال لتجده هنا.':readingFilter==='read'?'يمكنك تعليم المقالات التي قرأتها من بطاقاتها أو من داخل المقال.':'جرّب كلمات أقلّ أو اختر قسمًا آخر.'}</p>${isCollectionPage?'<a class="empty-library-link" href="'+libraryRoot.pathname+'#library">تصفّح المكتبة ←</a>':''}</div>`;
 if($('#retry-content-search'))$('#retry-content-search').onclick=()=>{contentSearch={key:null,ids:null,error:false};draw({expandCategory:false});};
 $('#pages').hidden=Boolean(waiting);
 $('#pages').innerHTML=`<button ${page===1?'disabled':''} id="prev">السابق</button><span>${ar.format(page)} / ${ar.format(max)}</span><button ${page===max?'disabled':''} id="next">التالي</button>`;
 $('#prev').onclick=()=>{page--;draw();$('#library').scrollIntoView();};$('#next').onclick=()=>{page++;draw();$('#library').scrollIntoView();};
 document.querySelectorAll('[data-cat]').forEach(button=>{button.classList.toggle('active',button.dataset.cat===category);button.setAttribute('aria-pressed',button.dataset.cat===category);});
 folderNavigation?.selectCategory(category,expandCategory);
 document.querySelectorAll('[data-reading-category]').forEach(button=>{const active=button.dataset.readingCategory===category;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
 const p=new URLSearchParams();if(category)p.set('category',category);if(query){p.set('q',query);if(searchScope==='title')p.set('scope','title');}if(pageSize!==20)p.set('size',pageSize);if(sort!=='newest')p.set('sort',sort);if(!isCollectionPage&&readingFilter!=='all')p.set('reading',readingFilter);
 history.replaceState(null,'',location.pathname+(p.size?'?'+p:'')+location.hash);
 syncReadButtons();
 document.documentElement.removeAttribute('data-library-pending');
 if(!waiting){
  const reveal=pendingSearchReveal;
  hydrateExcerpts(matches.slice((page-1)*pageSize,page*pageSize)).then(()=>{
   window.LibraryLoading?.done('library');
   if(reveal)revealSearchResults(reveal);
  }).catch(()=>window.LibraryLoading?.fail('تعذّر تحميل المقالات المعروضة. جرّب مرة أخرى.'));
 }
 else if(contentSearch.error)window.LibraryLoading?.fail('تعذّر تجهيز نتائج البحث. جرّب مرة أخرى.');
}
function showReadArticles(value=''){
 category=value;readingFilter='read';query='';page=1;if($('#query'))$('#query').value='';if($('#reading-filter'))$('#reading-filter').value='read';draw();
 location.hash='library';$('#library').scrollIntoView();
}
if($('#show-read'))$('#show-read').onclick=()=>showReadArticles();
window.addEventListener('hashchange',()=>{if(!isReadingPage&&location.hash==='#reading-progress')location.assign(libraryHref('reading.html'));});
$('#cards').addEventListener('click',event=>{const button=event.target.closest('[data-read-toggle]');if(button)progress.toggle(button.dataset.articleId);});
progress.subscribe(change=>{
 if(!articles.length)return;
 renderProgress();
 if(readingFilter==='all')syncReadButtons();else{
  const active=document.activeElement?.dataset?.articleId;draw();
  if(active){const next=document.querySelector(`[data-read-toggle][data-article-id="${active}"]`);if(next)next.focus({preventScroll:true});else $('#count').focus({preventScroll:true});}
 }
 if(change.type==='toggle'){
  const article=articles.find(article=>article.id===change.id);
  $('#reading-announcement').textContent=(change.read?'تم تعليم المقال كمقروء: ':'أُلغيت علامة القراءة عن: ')+(article?.title||'المقال');
 }
});
bookmarks.subscribe(()=>{
 if(!isBookmarksPage||!articles.length)return;
 const active=document.activeElement?.matches('[data-bookmark-toggle]')?document.activeElement.dataset.articleId:null;
 renderBookmarks();draw();
 if(active)(document.querySelector(`[data-bookmark-toggle][data-article-id="${active}"]`)||$('#count')).focus({preventScroll:true});
});
Promise.resolve().then(()=>{
 const embedded=$('#library-data');
 if(embedded)return JSON.parse(embedded.textContent);
 return fetch(new URL('library-data.json?v=0ae7c535bbbe3ac7',libraryRoot)).then(response=>{if(!response.ok)throw Error();return response.json();});
}).then(data=>{
 contentIndexURL=data.searchIndex;excerptPrefix=data.excerptPrefix;
 articles=data.articles.map((article,i)=>({...article,excerpt:data.initialExcerpts?.[article.id],excerptPart:Math.floor(i/64),searchTitle:norm(article.title)}));
 articles.forEach(article=>articlesById.set(article.id,article));
 const categories=[...new Set(articles.map(article=>article.category))].sort((a,b)=>a.localeCompare(b,'ar'));
 if(!categories.includes(category))category='';
 if($('#categories'))folderNavigation=window.ArticleNavigator.create($('#categories'),articles,{categoriesOnly:true,activeCategory:category,onCategory:value=>{category=value;page=1;if(query||$('#query')?.value)clearLibrarySearch();else draw({expandCategory:false});}});
 renderProgress();draw();warmContentSearch();
 if(!isCollectionPage)contentEngine().then(engine=>engine.warm()).then(()=>window.LibraryLoading?.done('search')).catch(()=>window.LibraryLoading?.fail('تعذّر تجهيز البحث. جرّب مرة أخرى.'));
 if(isBookmarksPage)$('#bookmark-category').disabled=false;
}).catch(()=>{$('#count').textContent='تعذّر تحميل الأرشيف. أعد تحميل الصفحة.';$('#cards').innerHTML='';document.documentElement.removeAttribute('data-library-pending');window.LibraryLoading?.fail('تعذّر تحميل المكتبة. جرّب مرة أخرى.');});
// Typing suggests titles locally; submitting searches both titles and content.
const queryInput=$('#query'),searchForm=$('#searchform');
if(queryInput&&searchForm){
 const field=queryInput.closest('.main-query-field');
 const panel=document.createElement('div');panel.id='search-suggestions';panel.className='search-suggestions';panel.hidden=true;
 panel.innerHTML='<p id="suggestions-heading" class="suggestions-heading">اقتراحات من العناوين</p><div id="search-suggestion-list" role="listbox" aria-labelledby="suggestions-heading"></div><div class="suggestion-actions"><button type="button" class="all-title-results"></button><button type="button" class="full-search-submit">بحث في العنوان والمحتوى</button></div>';
 field.append(panel);
 const list=panel.querySelector('[role=listbox]'),allTitles=panel.querySelector('.all-title-results');
 allTitles.onclick=()=>submit('title');
 panel.querySelector('.full-search-submit').onclick=()=>submit('all');
 const announcement=document.createElement('div');announcement.className='sr-only';announcement.setAttribute('role','status');announcement.setAttribute('aria-live','polite');field.append(announcement);
 queryInput.setAttribute('role','combobox');queryInput.setAttribute('aria-autocomplete','list');queryInput.setAttribute('aria-haspopup','listbox');queryInput.setAttribute('aria-controls',list.id);queryInput.setAttribute('aria-expanded','false');queryInput.setAttribute('enterkeyhint','search');
 let active=-1,options=[];
 function fit(){
  if(panel.hidden)return;
  const viewport=window.visualViewport,bottom=viewport?viewport.offsetTop+viewport.height:window.innerHeight;
  panel.style.maxHeight=Math.max(140,Math.min(480,bottom-panel.getBoundingClientRect().top-12))+'px';
 }
 function close(){panel.hidden=true;active=-1;queryInput.setAttribute('aria-expanded','false');queryInput.removeAttribute('aria-activedescendant');options.forEach(option=>option.setAttribute('aria-selected','false'));announcement.textContent='';}
 function suggest(){
  const draft=queryInput.value.trim(),normalized=norm(draft),terms=normalized.split(/\s+/).filter(Boolean);
  active=-1;queryInput.removeAttribute('aria-activedescendant');
  if(!normalized||!articles.length){close();return;}
  const included=article=>readingFilter==='all'||progress.has(article.id)===(readingFilter==='read');
  const rank=article=>article.searchTitle===normalized?0:article.searchTitle.startsWith(normalized)?1:article.searchTitle.includes(normalized)?2:3;
  const titleMatches=articles.filter(article=>included(article)&&terms.every(term=>article.searchTitle.includes(term))).sort((a,b)=>rank(a)-rank(b)||compareArticles(a,b));
  const matches=titleMatches.slice(0,6);
  allTitles.disabled=titleMatches.length===0;
  allTitles.textContent='عرض كل نتائج العناوين ('+ar.format(titleMatches.length)+')';
  panel.querySelector('.suggestions-heading').textContent='اقتراحات من العناوين: '+ar.format(matches.length)+' من '+ar.format(titleMatches.length);
  list.innerHTML=matches.map((article,i)=>`<a id="search-suggestion-${i}" class="search-suggestion" role="option" aria-selected="false" aria-label="${escapeHTML(article.title+'، '+article.category)}" tabindex="-1" href="articles/${article.id}.html?nav-sort=${sort}"><span class="suggestion-title">${escapeHTML(article.title)}</span><span class="suggestion-category">${escapeHTML(article.category)}</span></a>`).join('')||'<p class="suggestions-empty">لا توجد عناوين مطابقة. جرّب البحث في العنوان والمحتوى.</p>';
  options=[...list.querySelectorAll('[role=option]')];
  panel.hidden=false;fit();queryInput.setAttribute('aria-expanded','true');
  announcement.textContent=matches.length?ar.format(matches.length)+' اقتراحات من العناوين. استخدم الأسهم للاختيار، أو اضغط Enter للبحث في العنوان والمحتوى.':'لا توجد عناوين مطابقة. اضغط Enter للبحث في العنوان والمحتوى.';
 }
 function submit(scope='all'){close();searchScope=scope;query=queryInput.value.trim();if(query)category='';pendingSearchReveal=query?{query}:null;page=1;if(contentSearch.error)contentSearch={key:null,ids:null,error:false};draw();}
 queryInput.addEventListener('input',event=>{
  pendingSearchReveal=null;
  if(event.isComposing)return;
  $('#clear').hidden=!queryInput.value;
  if(!queryInput.value.trim()){close();if(query){query='';page=1;draw();}return;}
  suggest();
 });
 queryInput.addEventListener('compositionend',suggest);
 queryInput.addEventListener('focus',suggest);
 queryInput.addEventListener('keydown',event=>{
  if(event.isComposing)return;
  if(event.key==='Escape'&&!panel.hidden){event.preventDefault();event.stopPropagation();close();return;}
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){
   if(panel.hidden)suggest();
   if(!options.length||panel.hidden)return;
   event.preventDefault();active=event.key==='ArrowDown'?(active+1)%options.length:(active<=0?options.length-1:active-1);
   options.forEach((option,i)=>option.setAttribute('aria-selected',String(i===active)));
   queryInput.setAttribute('aria-activedescendant',options[active].id);options[active].scrollIntoView({block:'nearest'});
  }else if(event.key==='Enter'&&!panel.hidden&&active>=0){event.preventDefault();location.assign(options[active].href);}
 });
 document.addEventListener('click',event=>{if(!field.contains(event.target))close();});
 window.addEventListener('resize',fit);window.addEventListener('scroll',fit,{passive:true});window.visualViewport?.addEventListener('resize',fit);window.visualViewport?.addEventListener('scroll',fit,{passive:true});
 field.addEventListener('focusout',event=>{if(event.relatedTarget&&!field.contains(event.relatedTarget))close();});
 searchForm.onsubmit=event=>{event.preventDefault();submit();};
 function clearSearch(focusInput){pendingSearchReveal=null;clearTimeout(searchFeedbackTimer);queryInput.value='';query='';searchScope='all';page=1;close();draw();(focusInput?queryInput:$('#count')).focus({preventScroll:true});}
 clearLibrarySearch=()=>clearSearch(false);
 $('#clear').onclick=()=>clearSearch(true);
}
$('#sort').onchange=()=>{sort=$('#sort').value;page=1;draw();};
$('#page-size').onchange=()=>{pageSize=Number($('#page-size').value);page=1;draw();};
if($('#reading-filter'))$('#reading-filter').onchange=()=>{readingFilter=$('#reading-filter').value;page=1;draw();};

if(isBookmarksPage){
 $('#bookmark-category').onchange=()=>{category=$('#bookmark-category').value;page=1;draw();};
}
