const readingProgress=window.ReadingProgress;
const readingArticleId=document.body.dataset.articleId;
const readControls=[...document.querySelectorAll('[data-read-toggle]')];
const bookmarkArticleTitle=document.querySelector('.reader h1')?.textContent||document.title.split(' | ')[0];
readControls.forEach(button=>button.insertAdjacentHTML('afterend',window.ArticleBookmarks.control(readingArticleId,bookmarkArticleTitle,true)));
function updateArticleReading(){
 const read=readingProgress.has(readingArticleId);
 readControls.forEach(button=>{
  button.setAttribute('aria-pressed',String(read));
  button.textContent=read?'مقروء ✓':'علّم كمقروء';
  button.title=read?'إلغاء علامة القراءة':'حفظ المقال في قراءاتي';
 });
}
readControls.forEach(button=>button.onclick=()=>readingProgress.toggle(readingArticleId));
readingProgress.subscribe(change=>{updateArticleReading();if(change.type==='toggle'&&change.id===readingArticleId){const status=document.getElementById('article-reading-status');if(status)status.textContent=change.read?'حُفظ المقال في قراءاتك.':'أُلغيت علامة القراءة عن المقال.';}});
updateArticleReading();
