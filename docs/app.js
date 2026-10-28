const libraryRoot=new URL('.',document.currentScript.src);
const libraryHref=path=>new URL(path,libraryRoot).pathname;
const $=selector=>document.querySelector(selector);
const ar=new Intl.NumberFormat('ar-EG');
const articleQuantity=(count,accusative=false)=>count===1?'مقال واحد':count===2?(accusative?'مقالين':'مقالان'):ar.format(count)+(count%100>=3&&count%100<=10?' مقالات':' مقالًا');
const savedQuantity=count=>ar.format(count)+' مقال محفوظ';
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
let contentIndexURL,enginePromise,contentSearch={key:null,ids:null,error:false};
const searchResults=new Map();
function contentEngine(){
 if(enginePromise)return enginePromise;
 enginePromise=(async()=>{
  try{
   return await new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('search-worker.js?v=7c2083c9637f1f28',libraryRoot),{type:'module'});
    const pending=new Map();let nextId=0,ready=false;
    const fail=error=>{worker.terminate();pending.forEach(p=>p.reject(error));pending.clear();if(ready)enginePromise=null;reject(error);};
    worker.onerror=()=>fail(new Error('Search worker unavailable'));
    worker.onmessage=({data})=>{
     if(data.type==='ready'){
      ready=true;resolve({find:(text,scope)=>new Promise((resolve,reject)=>{
       const id=++nextId;pending.set(id,{resolve,reject});worker.postMessage({type:'search',id,query:text,scope});
      })});
     }else if(data.type==='result'){
      pending.get(data.id)?.resolve(data.ids);pending.delete(data.id);
     }else if(data.type==='error'){
      if(!ready)fail(new Error(data.message));
      else{pending.get(data.id)?.reject(new Error(data.message));pending.delete(data.id);}
     }
    };
    worker.postMessage({type:'init',url:new URL(contentIndexURL,libraryRoot).href});
   });
  }catch{
   // If workers are unavailable, keep full-content search usable on the main thread.
   const [engine,response]=await Promise.all([import(new URL('search-engine.js?v=034b652ba316e53f',libraryRoot).href),fetch(new URL(contentIndexURL,libraryRoot))]);
   if(!response.ok)throw new Error('Search index unavailable');
   const index=await response.json();
   return {find:async(text,scope)=>engine.search(index,text,scope)};
  }
 })().catch(error=>{enginePromise=null;throw error;});
 return enginePromise;
}
function prepareContentSearch(terms){
 if(!terms.length||searchScope==='title'){contentSearch={key:null,ids:null,error:false};return;}
 const key=searchScope+':'+terms.join('\0');
 if(contentSearch.key===key)return;
 if(searchResults.has(key)){contentSearch={key,ids:searchResults.get(key),error:false};return;}
 contentSearch={key,ids:null,error:false};
 const scope=searchScope,text=query;
 contentEngine().then(engine=>engine.find(text,scope)).then(ids=>{
  const matches=new Set(ids);searchResults.set(key,matches);
  if(searchResults.size>20)searchResults.delete(searchResults.keys().next().value);
  if(contentSearch.key!==key)return;
  contentSearch={key,ids:matches,error:false};draw({expandCategory:false});
 }).catch(()=>{
  if(contentSearch.key!==key)return;
  contentSearch={key,ids:null,error:true};draw({expandCategory:false});
 });
}
function warmContentSearch(){
 if(isCollectionPage)return;
 const start=()=>contentEngine().catch(()=>{});
 // Give the catalog and first cards a paint before fetching the larger search index.
 requestAnimationFrame(()=>requestAnimationFrame(()=>{
  if('requestIdleCallback' in window)requestIdleCallback(start,{timeout:1500});else setTimeout(start,200);
 }));
}
let folderNavigation;
let articles=[],category=params.get('category')||'',page=1,query=isCollectionPage?'':params.get('q')||'';
let searchScope=isCollectionPage?'all':params.get('scope')||'all';
if(!['all','title','content'].includes(searchScope))searchScope='all';
let readingFilter=isReadingPage?'read':isBookmarksPage?'all':params.get('reading')||'all';
if(!['all','read','unread'].includes(readingFilter))readingFilter='all';
let pageSize=Number(params.get('size'))||20;
if(![20,50,100].includes(pageSize))pageSize=20;
let sort=params.get('sort')||'title';
if(!['title','title-desc','short','long','newest','oldest'].includes(sort))sort='title';
if($('#search-scope'))$('#search-scope').value=searchScope;
const searchOptions=$('#search-options');
function syncSearchScope(){
 const indicator=$('#active-search-scope');
 if(indicator){indicator.hidden=searchScope==='all';indicator.textContent=searchScope==='title'?'العنوان فقط':searchScope==='content'?'المحتوى فقط':'';}
}
syncSearchScope();
if(searchOptions){
 searchOptions.addEventListener('keydown',event=>{if(event.key==='Escape'&&searchOptions.open){event.preventDefault();searchOptions.open=false;searchOptions.querySelector('summary').focus();}});
 document.addEventListener('click',event=>{if(!searchOptions.contains(event.target))searchOptions.open=false;});
}

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
 return (sort==='newest'?b.publicationDate.localeCompare(a.publicationDate):a.publicationDate.localeCompare(b.publicationDate))||title;
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
 if($('#query'))$('#query').placeholder=searchScope==='title'?'ابحث في العنوان…':searchScope==='content'?'ابحث في المحتوى…':'ابحث عن مقال…';
 if($('#clear'))$('#clear').hidden=!query;
 const status=readingFilter==='read'?' مقروءًا':readingFilter==='unread'?' غير مقروء':'';
 const resultDescription=waiting?(contentSearch.error?'تعذّر تحميل البحث في المحتوى.':'جارٍ تجهيز البحث في المحتوى…'):((isBookmarksPage?savedQuantity(matches.length):ar.format(matches.length)+' مقالًا'+status)+(query?' تطابق بحثك':!isBookmarksPage&&readingFilter==='all'?(category?' في هذا القسم':' في المكتبة'):''));
 $('#count').innerHTML=(category?`<button type="button" id="clear-category" class="selected-category" aria-label="إلغاء تصفية قسم ${escapeHTML(category)} وعرض كل الأقسام" title="إلغاء تصفية القسم"><span class="selected-category-label">القسم: <strong>${escapeHTML(category)}</strong></span><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8"/></svg></button>`:'')+`<span class="results-description">${escapeHTML(resultDescription)}</span>`;
 if($('#clear-category'))$('#clear-category').onclick=()=>{
  category='';page=1;
  if($('#bookmark-category'))$('#bookmark-category').value='';
  draw({expandCategory:false});$('#count').focus({preventScroll:true});
 };
 $('#cards').setAttribute('aria-busy',String(waiting&&!contentSearch.error));
 $('#cards').innerHTML=waiting?`<div class="empty search-loading" role="status"><p>${contentSearch.error?'تعذّر تجهيز البحث. أعد المحاولة، أو اختر البحث في العنوان فقط.':'جارٍ البحث في محتوى المقالات…'}</p>${contentSearch.error?'<button type="button" id="retry-content-search">إعادة المحاولة</button>':''}</div>`:matches.slice((page-1)*pageSize,page*pageSize).map(article=>`<article class="card${progress.has(article.id)?' is-read':''}" data-published="${article.publicationDate||''}"><a class="card-link" href="articles/${article.id}.html?nav-sort=${sort}"><div class="card-top"><span>${escapeHTML(article.category)}</span><span>↖</span></div><h3>${escapeHTML(article.title)}</h3><div class="card-date">${article.publicationDate?`<time datetime="${article.publicationDate}">${dateLabel(article)}</time>`:dateLabel(article)}</div><p>${escapeHTML(article.excerpt)}</p><div class="card-bottom">${ar.format(article.minutes)} دقائق قراءة <span>اقرأ المقال ←</span></div></a><div class="card-tools"><button type="button" class="read-toggle" data-read-toggle data-article-id="${article.id}" aria-pressed="${progress.has(article.id)}">علّم كمقروء</button>${bookmarks.control(article.id,article.title)}</div></article>`).join('')||`<div class="empty"><h3>${isBookmarksPage?(category?'لا توجد مقالات محفوظة في هذا القسم':'لم تحفظ أيّ مقال بعد'):readingFilter==='read'?'لا توجد مقالات مقروءة ضمن هذا الاختيار':'لا توجد نتائج مطابقة'}</h3><p>${isBookmarksPage?'اضغط علامة الحفظ بجوار أيّ مقال لتجده هنا.':readingFilter==='read'?'يمكنك تعليم المقالات التي قرأتها من بطاقاتها أو من داخل المقال.':'جرّب كلمات أقلّ أو اختر قسمًا آخر.'}</p>${isCollectionPage?'<a class="empty-library-link" href="'+libraryRoot.pathname+'#library">تصفّح المكتبة ←</a>':''}</div>`;
 if($('#retry-content-search'))$('#retry-content-search').onclick=()=>{contentSearch={key:null,ids:null,error:false};draw({expandCategory:false});};
 $('#pages').hidden=Boolean(waiting);
 $('#pages').innerHTML=`<button ${page===1?'disabled':''} id="prev">السابق</button><span>${ar.format(page)} / ${ar.format(max)}</span><button ${page===max?'disabled':''} id="next">التالي</button>`;
 $('#prev').onclick=()=>{page--;draw();$('#library').scrollIntoView();};$('#next').onclick=()=>{page++;draw();$('#library').scrollIntoView();};
 document.querySelectorAll('[data-cat]').forEach(button=>{button.classList.toggle('active',button.dataset.cat===category);button.setAttribute('aria-pressed',button.dataset.cat===category);});
 folderNavigation?.selectCategory(category,expandCategory);
 document.querySelectorAll('[data-reading-category]').forEach(button=>{const active=button.dataset.readingCategory===category;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
 const p=new URLSearchParams();if(category)p.set('category',category);if(query)p.set('q',query);if(pageSize!==20)p.set('size',pageSize);if(searchScope!=='all')p.set('scope',searchScope);if(sort!=='title')p.set('sort',sort);if(!isCollectionPage&&readingFilter!=='all')p.set('reading',readingFilter);
 history.replaceState(null,'',location.pathname+(p.size?'?'+p:'')+location.hash);
 syncReadButtons();
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
fetch(new URL('catalog.json?v=e20086d0163e2c67',libraryRoot)).then(response=>{if(!response.ok)throw Error();return response.json();}).then(data=>{
 contentIndexURL=data.searchIndex;
 articles=data.articles.map(article=>({...article,searchTitle:norm(article.title)}));
 const categories=[...new Set(articles.map(article=>article.category))].sort((a,b)=>a.localeCompare(b,'ar'));
 if(!categories.includes(category))category='';
 if($('#categories'))folderNavigation=window.ArticleNavigator.create($('#categories'),articles,{categoriesOnly:true,activeCategory:category,onCategory:value=>{category=value;page=1;draw({expandCategory:false});}});
 renderProgress();draw();warmContentSearch();
 if(isBookmarksPage)$('#bookmark-category').disabled=false;
}).catch(()=>{$('#count').textContent='تعذّر تحميل الأرشيف. أعد تحميل الصفحة.';});
let timer;if($('#query'))$('#query').oninput=event=>{clearTimeout(timer);timer=setTimeout(()=>{query=event.target.value;page=1;draw();},120);};
if($('#searchform'))$('#searchform').onsubmit=event=>{event.preventDefault();clearTimeout(timer);query=$('#query').value;page=1;draw();};
if($('#clear'))$('#clear').onclick=()=>{$('#query').value='';query='';page=1;draw();$('#query').focus({preventScroll:true});};
$('#sort').onchange=()=>{sort=$('#sort').value;page=1;draw();};
$('#page-size').onchange=()=>{pageSize=Number($('#page-size').value);page=1;draw();};
if($('#search-scope'))$('#search-scope').onchange=()=>{searchScope=$('#search-scope').value;syncSearchScope();if(searchOptions){searchOptions.open=false;searchOptions.querySelector('summary').focus({preventScroll:true});}page=1;draw();};
if($('#reading-filter'))$('#reading-filter').onchange=()=>{readingFilter=$('#reading-filter').value;page=1;draw();};

if(isBookmarksPage){
 $('#bookmark-category').onchange=()=>{category=$('#bookmark-category').value;page=1;draw();};
}
