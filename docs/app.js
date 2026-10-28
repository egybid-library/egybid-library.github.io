const libraryRoot=new URL('.',document.currentScript.src);
const libraryHref=path=>new URL(path,libraryRoot).pathname;
const $=selector=>document.querySelector(selector);
const ar=new Intl.NumberFormat('ar-EG');
const articleQuantity=(count,accusative=false)=>count===1?'مقال واحد':count===2?(accusative?'مقالين':'مقالان'):ar.format(count)+(count%100>=3&&count%100<=10?' مقالات':' مقالًا');
const savedQuantity=count=>articleQuantity(count)+(count===1?' محفوظ':count===2?' محفوظان':count%100>=3&&count%100<=10?' محفوظة':' محفوظًا');
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
 $('#bookmarks-note').textContent=bookmarks.persistent()?'محفوظاتك على هذا المتصفح والجهاز. صدّر نسخة لنقلها إلى جهاز آخر.':'الحفظ الدائم غير متاح حاليًا. صدّر نسخة من محفوظاتك قبل إغلاق الصفحة.';
 $('#export-bookmarks').disabled=saved.length===0;
 const groups=[...new Set(articles.map(article=>article.category))].sort((a,b)=>a.localeCompare(b,'ar'));
 $('#bookmark-category').innerHTML='<option value="">كل الأقسام</option>'+groups.map(value=>{
  const count=saved.filter(article=>article.category===value).length;
  return `<option value="${escapeHTML(value)}">${escapeHTML(value)} (${ar.format(count)})</option>`;
 }).join('');
 $('#bookmark-category').value=category;
}
function draw({expandCategory=true}={}){
 const terms=norm(query).trim().split(/\s+/).filter(Boolean);
 const matches=articles.filter(article=>(!isBookmarksPage||bookmarks.has(article.id))&&(!category||article.category===category)&&(readingFilter==='all'||progress.has(article.id)===(readingFilter==='read'))&&terms.every(term=>(searchScope==='title'?article.searchTitle:searchScope==='content'?article.searchContent:article.search).includes(term)));
 matches.sort(compareArticles);
 const max=Math.max(1,Math.ceil(matches.length/pageSize));page=Math.min(page,max);
 if($('#query'))$('#query').placeholder=searchScope==='title'?'ابحث في العنوان…':searchScope==='content'?'ابحث في المحتوى…':'ابحث عن مقال…';
 if($('#clear'))$('#clear').hidden=!query;
 const status=readingFilter==='read'?' مقروءًا':readingFilter==='unread'?' غير مقروء':'';
 $('#count').textContent=(isBookmarksPage?savedQuantity(matches.length):ar.format(matches.length)+' مقالًا'+status)+(query?' تطابق بحثك':!isBookmarksPage&&readingFilter==='all'?' في المكتبة':'')+(isCollectionPage&&category?' في '+category:'');
 $('#cards').innerHTML=matches.slice((page-1)*pageSize,page*pageSize).map(article=>`<article class="card${progress.has(article.id)?' is-read':''}" data-published="${article.publicationDate||''}"><a class="card-link" href="articles/${article.id}.html?nav-sort=${sort}"><div class="card-top"><span>${escapeHTML(article.category)}</span><span>↖</span></div><h3>${escapeHTML(article.title)}</h3><div class="card-date">${article.publicationDate?`<time datetime="${article.publicationDate}">${dateLabel(article)}</time>`:dateLabel(article)}</div><p>${escapeHTML(article.excerpt)}</p><div class="card-bottom">${ar.format(article.minutes)} دقائق قراءة <span>اقرأ المقال ←</span></div></a><div class="card-tools"><button type="button" class="read-toggle" data-read-toggle data-article-id="${article.id}" aria-pressed="${progress.has(article.id)}">علّم كمقروء</button>${bookmarks.control(article.id,article.title)}</div></article>`).join('')||`<div class="empty"><h3>${isBookmarksPage?(category?'لا توجد مقالات محفوظة في هذا القسم':'لم تحفظ أيّ مقال بعد'):readingFilter==='read'?'لا توجد مقالات مقروءة ضمن هذا الاختيار':'لا توجد نتائج مطابقة'}</h3><p>${isBookmarksPage?'اضغط علامة الحفظ بجوار أيّ مقال لتجده هنا.':readingFilter==='read'?'يمكنك تعليم المقالات التي قرأتها من بطاقاتها أو من داخل المقال.':'جرّب كلمات أقلّ أو اختر قسمًا آخر.'}</p>${isCollectionPage?'<a class="empty-library-link" href="${libraryRoot.pathname}#library">تصفّح المكتبة ←</a>':''}</div>`;
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
fetch('archive.json?v=flow-review-v2').then(response=>{if(!response.ok)throw Error();return response.json();}).then(data=>{
 articles=data.map(article=>({...article,search:norm(article.title+' '+article.text),searchTitle:norm(article.title),searchContent:norm(article.text)}));
 const categories=[...new Set(articles.map(article=>article.category))].sort((a,b)=>a.localeCompare(b,'ar'));
 if(!categories.includes(category))category='';
 if($('#categories'))folderNavigation=window.ArticleNavigator.create($('#categories'),articles,{sort,activeCategory:category,readingFilter:'all',onCategory:value=>{category=value;page=1;draw({expandCategory:false});}});
 renderProgress();draw();
 if(isBookmarksPage){$('#import-bookmarks').disabled=false;$('#bookmark-category').disabled=false;}
}).catch(()=>{$('#count').textContent='تعذّر تحميل الأرشيف. أعد تحميل الصفحة.';});
let timer;if($('#query'))$('#query').oninput=event=>{clearTimeout(timer);timer=setTimeout(()=>{query=event.target.value;page=1;draw();},120);};
if($('#searchform'))$('#searchform').onsubmit=event=>{event.preventDefault();clearTimeout(timer);query=$('#query').value;page=1;draw();};
if($('#clear'))$('#clear').onclick=()=>{$('#query').value='';query='';page=1;draw();$('#query').focus({preventScroll:true});};
$('#sort').onchange=()=>{sort=$('#sort').value;folderNavigation?.setSort(sort);page=1;draw();};
$('#page-size').onchange=()=>{pageSize=Number($('#page-size').value);page=1;draw();};
if($('#search-scope'))$('#search-scope').onchange=()=>{searchScope=$('#search-scope').value;page=1;draw();};
if($('#reading-filter'))$('#reading-filter').onchange=()=>{readingFilter=$('#reading-filter').value;page=1;draw();};

if(isBookmarksPage){
 $('#bookmark-category').onchange=()=>{category=$('#bookmark-category').value;page=1;draw();};
 $('#export-bookmarks').onclick=()=>{
  const blob=new Blob([JSON.stringify(bookmarks.backup(),null,2)],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='محفوظات-المكتبة-'+new Date().toISOString().slice(0,10)+'.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  $('#bookmark-transfer-status').textContent='تم تصدير محفوظاتك. احتفظ بالملف لاستعادتها أو نقلها إلى جهاز آخر.';
 };
 $('#import-bookmarks').onclick=()=>$('#bookmark-file').click();
 $('#bookmark-file').onchange=async event=>{
  const input=event.target,file=input.files?.[0];if(!file)return;
  const status=$('#bookmark-transfer-status');
  try{
   if(file.size>2*1024*1024)throw new Error('الملف أكبر من الحد المسموح (٢ ميجابايت).');
   const result=bookmarks.importBackup(JSON.parse(await file.text()),new Set(articles.map(article=>article.id)));
   status.textContent='تمت إضافة '+articleQuantity(result.added,true)+' إلى المحفوظات'+(result.existing?'؛ '+ar.format(result.existing)+' محفوظة بالفعل':'')+(result.skipped?'؛ تم تجاوز '+ar.format(result.skipped)+' علامة غير صالحة أو لمقالات غير موجودة':'')+'.';
  }catch(error){status.textContent=error instanceof SyntaxError?'تعذّرت قراءة الملف. اختر ملف محفوظات صالحًا صدّرته من المكتبة.':error.message||'تعذّر استيراد المحفوظات.';}
  input.value='';
 };
}

if(!isReadingPage)[...document.querySelectorAll('.site-header a')].find(link=>link.pathname===libraryHref('reading.html'))?.addEventListener('click',()=>folderNavigation?.setReadingFilter('all'));
