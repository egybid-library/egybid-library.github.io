import {ReaderSync, newSyncToken, parseSyncToken, syncPrefix} from './sync-core.js?v=22d47a8c5cc0cc03';
import {syncConfig} from './sync-config.js?v=ec235e6cc0ef1bc9';

const root = new URL('.', import.meta.url), nav = document.querySelector('.site-header nav');
const progress = window.ReadingProgress, bookmarks = window.ArticleBookmarks;
if (nav && progress && bookmarks) {
  const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-2l2 3M4 16l2 3a7 7 0 0 0 12-2"/></svg>';
  const open = document.createElement('button'); open.type = 'button'; open.className = 'sync-open'; open.title = 'مزامنة المقروءات والمحفوظات'; open.setAttribute('aria-label', open.title);
  open.innerHTML = icon + '<span>مزامنة</span>'; nav.insertBefore(open, nav.querySelector('[data-theme-toggle]'));
  const dialog = document.createElement('dialog'); dialog.className = 'sync-dialog'; dialog.setAttribute('aria-labelledby', 'sync-title');
  dialog.innerHTML = '<button type="button" class="sync-close" aria-label="إغلاق">×</button><h2 id="sync-title">مزامنة أجهزتك</h2><p>مزامنة المقالات المقروءة والمحفوظة بين الهاتف والحاسوب، دون إنشاء حساب.</p><p class="sync-status" role="status" aria-live="polite"></p><div class="sync-unlinked"><button type="button" class="sync-create sync-primary">تفعيل المزامنة</button><details class="sync-join"><summary>لديّ رابط ربط من جهاز آخر</summary><form><label for="sync-link">رابط الربط أو الرمز الخاص</label><input id="sync-link" type="text" dir="ltr" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="الصق رابط الربط هنا"><p class="sync-note">عند الربط، ندمج المقروءات والمحفوظات الموجودة على الجهازين.</p><button type="submit" class="sync-primary">ربط هذا الجهاز</button></form></details></div><div class="sync-linked" hidden><div class="sync-actions"><button type="button" class="sync-copy">نسخ رابط الربط</button><button type="button" class="sync-qr-toggle" aria-expanded="false">عرض رمز الربط</button><button type="button" class="sync-now">مزامنة الآن</button></div><div class="sync-qr" hidden></div><p class="sync-note">رابط الربط خاص بك؛ يمكن لأي شخص يمتلكه الاطلاع على سجلّك وتعديله. احتفظ به لاستعادة سجلّك بعد مسح بيانات المتصفح.</p><button type="button" class="sync-disconnect">فصل هذا الجهاز</button><p class="sync-note">يؤدي الفصل إلى إيقاف المزامنة على هذا الجهاز مع الاحتفاظ بمقالاته المقروءة والمحفوظة.</p></div><p class="sync-feedback" role="status" aria-live="polite"></p>';
  document.body.append(dialog);
  const $ = selector => dialog.querySelector(selector), input = $('#sync-link'), feedback = $('.sync-feedback');
  let engine, state = {phase: 'idle'}, busy = false, timer, rerun = false, storageFailed = false;
  const dateFormat = new Intl.DateTimeFormat('ar-EG', {dateStyle: 'medium', timeStyle: 'short'});
  function errorText(error) {
    if (error?.code === 'PGRST202') return 'لم يكتمل إعداد خدمة المزامنة بعد.';
    if (error?.code === '42501') return 'رابط الربط غير صحيح أو لم يعد متاحًا.';
    if (error?.code === '54000') return 'بلغت خدمة المزامنة الحدّ المتاح حاليًا. بياناتك محفوظة على هذا الجهاز.';
    if (error?.message === 'already-linked') return 'هذا الجهاز مرتبط بالفعل. افصل ارتباطه أولًا لتغيير السجل.';
    if (storageFailed || error?.name === 'QuotaExceededError' || error?.name === 'SecurityError' || error?.message === 'storage') return 'تعذّر حفظ بيانات الربط في المتصفح. اسمح بتخزين بيانات الموقع ثم جرّب مجددًا.';
    if (navigator.onLine === false) return 'لا يوجد اتصال بالإنترنت؛ تغييراتك محفوظة وستُزامَن عند عودة الاتصال.';
    return 'تعذّرت المزامنة حاليًا. علاماتك محفوظة على هذا الجهاز، وستُعاد المحاولة تلقائيًا.';
  }
  function linkedToken() {try {return engine?.token();} catch {storageFailed = true; return null;}}
  function render(next = state) {
    state = next;
    const token = linkedToken(), linked = !!token;
    $('.sync-linked').hidden = !linked; $('.sync-unlinked').hidden = linked;
    let message = !linked ? 'فعّل المزامنة على أحد أجهزتك، ثم افتح رابط الربط على الجهاز الآخر.' : 'المزامنة مفعّلة؛ تُزامَن التغييرات تلقائيًا أثناء استخدام المكتبة.';
    if (next.phase === 'syncing') message = 'تجري مزامنة المقالات المقروءة والمحفوظة…';
    if (next.phase === 'pending') message = navigator.onLine === false ? 'لا يوجد اتصال بالإنترنت؛ تغييراتك محفوظة وستُزامَن عند عودة الاتصال.' : 'تغييراتك محفوظة؛ في انتظار المزامنة…';
    if (next.phase === 'ready') message = 'آخر مزامنة: ' + dateFormat.format(new Date(next.date));
    if (next.phase === 'error') message = errorText(next.error);
    if (next.phase === 'disconnected') message = 'تم فصل هذا الجهاز مع الاحتفاظ بمقالاته المقروءة والمحفوظة.';
    if (storageFailed) message = errorText(Error('storage'));
    $('.sync-status').textContent = message; open.dataset.syncState = next.phase;
    open.title = 'مزامنة المقروءات والمحفوظات · ' + message;
    for (const button of dialog.querySelectorAll('button:not(.sync-close)')) button.disabled = busy || storageFailed;
    input.disabled = busy || storageFailed;
  }
  async function transport(name, body) {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(syncConfig.url + '/rest/v1/rpc/' + name, {method: 'POST', headers: {'apikey': syncConfig.key, 'Content-Type': 'application/json'}, body: JSON.stringify(body), credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', signal: controller.signal});
      const result = await response.json();
      if (!response.ok) {const error = Error('remote'); error.code = result?.code; throw error;}
      return result;
    } finally {clearTimeout(timeout);}
  }
  try {
    const storage = window.localStorage, probe = syncPrefix + 'probe'; storage.setItem(probe, '1'); storage.removeItem(probe);
    if (!progress.persistent() || !bookmarks.persistent()) throw Error('storage');
    engine = new ReaderSync({storage, transport,
      snapshot: () => ({read: progress.entries(), bookmark: bookmarks.entries()}),
      apply: marks => {progress.applySync(marks.read); bookmarks.applySync(marks.bookmark);},
      onStatus: render,
      // Locks serialize requests across tabs. Without them, each request asks
      // for a full snapshot so overlapping replies cannot skip a checkpoint.
      lock: task => navigator.locks ? navigator.locks.request('egybid-reader-sync', task) : task()
    });
    if (!navigator.locks) {
      const wrapped = transport;
      engine.transport = (name, body) => wrapped(name, name === 'library_sync_exchange' ? {...body, p_since: 0} : body).then(result => result);
      // The fallback accepts a complete response against an empty checkpoint.
      const response = engine.response.bind(engine);
      engine.response = (result, previous) => {
        if (result?.revision < previous.revision) throw Error('response');
        return response(result, {...previous, revision: 0, items: {read: {}, bookmark: {}}});
      };
    }
  } catch {storageFailed = true;}
  async function sync() {
    if (!linkedToken() || storageFailed) return;
    if (navigator.onLine === false) {render({phase: 'pending'}); return;}
    try {await engine.sync();} catch (error) {render({phase: 'error', error});}
    if (rerun) {rerun = false; schedule();}
  }
  function schedule() {clearTimeout(timer); if (engine?.running) rerun = true; timer = setTimeout(sync, 650);}
  function capture(kind, api, change) {
    if (!linkedToken() || change.type === 'sync') return;
    try {
      if (change.type === 'toggle') engine.capture(kind, change.id, api.has(change.id), api.entries()[change.id]);
      else if (change.type === 'import') for (const [id, date] of Object.entries(api.entries())) engine.capture(kind, id, true, date);
      else return;
      schedule();
    } catch (error) {storageFailed = true; render({phase: 'error', error});}
  }
  progress.subscribe(change => capture('read', progress, change)); bookmarks.subscribe(change => capture('bookmark', bookmarks, change));
  function close() {dialog.close(); $('.sync-qr').replaceChildren(); $('.sync-qr').hidden = true; $('.sync-qr-toggle').setAttribute('aria-expanded', 'false');}
  function show() {feedback.textContent = ''; render(); dialog.showModal(); if (linkedToken()) sync();}
  open.onclick = show; $('.sync-close').onclick = close;
  dialog.addEventListener('close', () => {$('.sync-qr').replaceChildren(); $('.sync-qr').hidden = true; $('.sync-qr-toggle').setAttribute('aria-expanded', 'false');});
  dialog.addEventListener('click', event => {if (event.target !== dialog) return; const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close();});
  async function connect(token, create) {
    if (!engine || busy) return;
    if (!token) {feedback.textContent = 'الصق رابط الربط أو الرمز الخاص الصحيح.'; input.focus(); return;}
    busy = true; feedback.textContent = ''; render({phase: 'syncing'});
    try {await engine.connect(token, create); input.value = ''; feedback.textContent = create ? 'تم تفعيل المزامنة. انسخ رابط الربط أو امسح رمز الربط باستخدام الجهاز الآخر.' : 'تم ربط الجهاز ودمج المقروءات والمحفوظات.';}
    catch (error) {render({phase: 'error', error});}
    finally {busy = false; render();}
  }
  $('.sync-create').onclick = () => connect(newSyncToken(), true);
  $('.sync-join form').onsubmit = event => {event.preventDefault(); connect(parseSyncToken(input.value), false);};
  $('.sync-now').onclick = sync;
  function shareLink() {const url = new URL(root); url.hash = 'sync=' + linkedToken(); return url.href;}
  $('.sync-copy').onclick = async () => {
    try {await navigator.clipboard.writeText(shareLink()); feedback.textContent = 'تم نسخ رابط الربط. افتحه على الجهاز الآخر.';}
    catch {feedback.textContent = 'تعذّر النسخ التلقائي. استخدم «عرض رمز الربط» لنسخ الرابط يدويًا.'; $('.sync-qr-toggle').click();}
  };
  let qrPromise;
  async function loadQR() {
    return qrPromise ??= new Promise((resolve, reject) => {const script = document.createElement('script'); script.src = new URL('assets/vendor/qrcode.js', root); script.onload = resolve; script.onerror = () => {qrPromise = null; script.remove(); reject(Error('qr'));}; document.head.append(script);});
  }
  $('.sync-qr-toggle').onclick = async () => {
    const panel = $('.sync-qr'), button = $('.sync-qr-toggle');
    if (!panel.hidden) {panel.hidden = true; button.setAttribute('aria-expanded', 'false'); return;}
    try {
      const token = linkedToken(); await loadQR(); if (!token || token !== linkedToken() || !dialog.open) return;
      const qr = window.qrcode(0, 'M'); qr.addData(shareLink()); qr.make();
      panel.innerHTML = qr.createSvgTag({cellSize: 4, margin: 4, scalable: true});
      panel.querySelector('svg').setAttribute('role', 'img'); panel.querySelector('svg').setAttribute('aria-label', 'رمز الاستجابة السريعة لربط جهاز آخر');
      const link = document.createElement('input'); link.readOnly = true; link.dir = 'ltr'; link.value = shareLink(); link.setAttribute('aria-label', 'رابط الربط الخاص'); link.onclick = () => link.select(); panel.append(link);
      panel.hidden = false; button.setAttribute('aria-expanded', 'true');
    } catch {feedback.textContent = 'تعذّر عرض رمز الربط. يمكنك استخدام زر «نسخ رابط الربط».';}
  };
  $('.sync-disconnect').onclick = () => {clearTimeout(timer); engine.disconnect(); feedback.textContent = ''; $('.sync-qr').replaceChildren(); $('.sync-qr').hidden = true;};
  window.addEventListener('online', sync);
  window.addEventListener('pageshow', () => {if (linkedToken()) sync();});
  document.addEventListener('visibilitychange', () => {if (document.visibilityState === 'visible') sync();});
  setInterval(() => {if (document.visibilityState === 'visible') sync();}, 60000);
  window.addEventListener('storage', event => {
    if (event.key === null || event.key?.startsWith(syncPrefix)) {
      try {const token = linkedToken(); if (token) engine.materialize(token); render();} catch (error) {storageFailed = true; render({phase: 'error', error});}
    }
  });
  const fragment = new URLSearchParams(location.hash.slice(1)), incoming = fragment.get('sync');
  if (incoming !== null) {
    fragment.delete('sync'); history.replaceState(history.state, '', location.pathname + location.search + (fragment.size ? '#' + fragment.toString() : ''));
    input.value = parseSyncToken(incoming) || ''; $('.sync-join').open = true; show();
    if (linkedToken()) feedback.textContent = incoming === linkedToken() ? 'هذا الجهاز مرتبط بهذا السجل بالفعل.' : 'هذا الجهاز مرتبط بسجل آخر. افصل ارتباطه أولًا لتغيير السجل.';
    else if (!input.value) feedback.textContent = 'رابط الربط غير صحيح.';
  } else {render(); if (linkedToken()) sync();}
}
