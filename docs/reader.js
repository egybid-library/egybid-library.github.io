const tabs=[...document.querySelectorAll('.reading-tabs [role="tab"]')];
function selectTab(index,focus=false){tabs.forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===index));tab.tabIndex=i===index?0:-1;document.getElementById(tab.getAttribute('aria-controls')).hidden=i!==index});if(focus)tabs[index].focus()}
tabs.forEach((tab,index)=>{tab.onclick=()=>selectTab(index);tab.onkeydown=e=>{if(['ArrowRight','ArrowLeft','Home','End'].includes(e.key)){e.preventDefault();selectTab(e.key==='Home'?0:e.key==='End'?1:1-index,true)}}});

const readingProgress=window.ReadingProgress;
const readingArticleId=document.body.dataset.articleId;
const readControls=[...document.querySelectorAll('[data-read-toggle]')];
const bookmarkArticleTitle=document.querySelector('.reader h1')?.textContent||document.title.split(' | ')[0];
readControls.forEach(button=>button.insertAdjacentHTML('afterend',window.ArticleBookmarks.control(readingArticleId,bookmarkArticleTitle,true)));
function updateArticleReading(){
 const read=readingProgress.has(readingArticleId);
 readControls.forEach(button=>{
  button.setAttribute('aria-pressed',String(read));
  button.textContent=read?'تمت قراءة المقال ✓':'علّم هذا المقال كمقروء';
  button.title=read?'إلغاء علامة القراءة':'حفظ المقال في قراءاتي';
 });
 document.querySelectorAll('[data-reading-save-note]').forEach(note=>note.textContent=readingProgress.persistent()?'سجلّك محفوظ في هذا المتصفح على هذا الجهاز.':'الحفظ الدائم غير متاح حاليًا؛ العلامات محفوظة لهذه الزيارة فقط.');
}
readControls.forEach(button=>button.onclick=()=>readingProgress.toggle(readingArticleId));
readingProgress.subscribe(change=>{updateArticleReading();if(change.type==='toggle'&&change.id===readingArticleId){const status=document.getElementById('article-reading-status');if(status)status.textContent=change.read?'حُفظ المقال في قراءاتك.':'أُلغيت علامة القراءة عن المقال.';}});
updateArticleReading();
