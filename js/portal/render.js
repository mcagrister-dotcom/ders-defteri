'use strict';

import { view } from '../dom.js';
import { uid, KINDS, DAYS, DAYS_SHORT } from '../state.js';
import { today, mondayOf, addDays, ymd, parseYmd, fmtDate, fmtDateShort, money, esc, firstName, genitive, badge } from '../format.js';
import { waLink } from '../whatsapp.js';
import { decodeShare } from '../share-link.js';
import { recStore, canRecord, fmtDur, fmtSize } from '../recordings.js';
import { toast } from '../toast.js';
import { openRecorder, openReview, saveRec, sendRec } from './recorder.js';

export const portal = { code: null, data: null, tab: 'student', urls: [] };
try { portal.tab = localStorage.getItem('ders-defteri-portal-tab') || 'student'; } catch { /* yok say */ }

const practiceKey = id => `ders-defteri-pratik-${id}`;
function loadPractice(id) {
  try { return { goal: 150, entries: [], hwDone: {}, ...JSON.parse(localStorage.getItem(practiceKey(id)) || '{}') }; }
  catch { return { goal: 150, entries: [], hwDone: {} }; }
}
function savePractice(id, p) {
  try { localStorage.setItem(practiceKey(id), JSON.stringify(p)); }
  catch { toast('Bu tarayıcıda kayıt yapılamıyor'); }
}

export async function renderPortal(code) {
  if (portal.code !== code) {
    try { portal.data = await decodeShare(code); portal.code = code; }
    catch {
      view.innerHTML = `<div class="card empty" style="margin-top:40px">Bu bağlantı açılamadı. Öğretmeninden yeni bir bağlantı iste.</div>`;
      return;
    }
  }
  const P = portal.data;
  const s = P.s, teacher = P.t || {};
  const lessons = P.l.map(([date, time, status, topic, homework, duration]) => ({ date, time, status, topic, homework, duration }));
  const t = today();
  const next = lessons.find(l => l.date >= t && l.status === 'planned');
  const hwLesson = [...lessons].reverse().find(l => l.status === 'done' && l.homework);
  const history = lessons.filter(l => l.status !== 'planned').reverse();
  const pr = loadPractice(P.id);
  let recs = [];
  try { recs = (await recStore.all()).filter(r => r.sid === P.id).sort((a, b) => b.created.localeCompare(a.created)); }
  catch { /* IndexedDB kullanılamıyor (ör. gizli sekme) */ }
  const oldUrls = portal.urls || []; // eski oynatıcılar DOM'dan kalkınca bırakılır
  portal.urls = [];
  const recUrl = r => { const u = URL.createObjectURL(r.blob); portal.urls.push(u); return u; };
  const feedback = (P.f || []).map(([date, kind, rating, note]) => ({ date, kind, rating, note }));

  const mon = mondayOf(new Date());
  const week = [...Array(7)].map((_, i) => ymd(addDays(mon, i)));
  const minsOn = d => pr.entries.filter(e => e.d === d).reduce((a, e) => a + e.m, 0);
  const weekMins = week.map(minsOn);
  const weekTotal = weekMins.reduce((a, b) => a + b, 0);
  const maxBar = Math.max(30, ...weekMins);
  // Seri: bugün henüz çalışılmadıysa dünden geriye sayılır.
  let streak = 0;
  let day = minsOn(t) > 0 ? new Date() : addDays(new Date(), -1);
  while (minsOn(ymd(day)) > 0 && streak < 1000) { streak++; day = addDays(day, -1); }
  const goalPct = Math.min(100, Math.round(weekTotal / (pr.goal || 1) * 100));
  const daysUntil = l => {
    const n = Math.round((parseYmd(l.date) - parseYmd(t)) / 864e5);
    return n === 0 ? 'Bugün' : n === 1 ? 'Yarın' : `${n} gün sonra`;
  };
  const longDate = d => parseYmd(d).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
  const teacherName = teacher.n || 'öğretmenin';
  const teacherShort = teacher.n ? `${firstName(teacher.n)} Hoca` : 'öğretmenin';
  const weekRecs = recs.filter(r => r.sent && r.created.slice(0, 10) >= week[0]);
  const recordCard = `
    <section class="card rec-card" id="rec-card">
      <div class="card-head"><h2>Ödevini kaydet, hocana gönder</h2>${weekRecs.length ? `<span class="badge b-done">Bu hafta ${weekRecs.length} kayıt</span>` : ''}</div>
      <p class="small muted" style="margin:-4px 0 14px">Ödevini çalarken kendini kaydet; ${esc(teacherShort)} hafta içinde dinleyip geri bildirim versin. Kısa tut: 1–3 dakika yeterli.</p>
      ${canRecord() ? `<div class="rec-actions">
        <button class="rec-big" data-rec="audio"><span>🎙</span>Ses kaydı</button>
        <button class="rec-big" data-rec="video"><span>🎥</span>Görüntülü kayıt</button>
      </div>` : ''}
      <label class="small file-pick">${canRecord() ? 'ya da telefonundaki bir kaydı seç' : '🎥 Kayıt çek ya da telefonundan seç'}
        <input type="file" id="rec-file" accept="audio/*,video/*" hidden /></label>
      ${recs.length ? `<div class="rec-list">
        <div class="small muted" style="margin:16px 0 6px">Kayıtların (bu cihazda saklanır)</div>
        ${recs.slice(0, 8).map(r => `
          <div class="rec-item">
            <div class="row" style="justify-content:space-between;flex-wrap:nowrap">
              <div class="small"><strong>${r.kind === 'audio' ? '🎙' : '🎥'} ${fmtDateShort(r.created.slice(0, 10))}</strong>
                <span class="muted">· ${r.dur ? fmtDur(r.dur) + ' · ' : ''}${fmtSize(r.blob.size)}</span>
                ${r.sent ? '<span class="badge b-done">Gönderildi</span>' : '<span class="badge b-planned">Gönderilmedi</span>'}</div>
              <div class="row" style="flex-wrap:nowrap">
                <button class="sm" data-rec-send="${r.id}">${r.sent ? 'Tekrar gönder' : 'Gönder'}</button>
                <button class="icon-btn" data-rec-del="${r.id}" aria-label="Kaydı sil">✕</button>
              </div>
            </div>
            ${r.note ? `<div class="small muted">${esc(r.note)}</div>` : ''}
            ${r.kind === 'audio' ? `<audio controls preload="metadata" src="${recUrl(r)}"></audio>`
              : `<video controls playsinline preload="metadata" src="${recUrl(r)}"></video>`}
          </div>`).join('')}
      </div>` : ''}
    </section>`;
  const feedbackCard = feedback.length ? `
    <section class="card">
      <div class="card-head"><h2>Hocanın geri bildirimleri</h2></div>
      <div class="timeline">${feedback.map(f => `
        <div class="entry">
          <div class="entry-head"><strong>${fmtDate(f.date)}</strong><span class="small">${esc(f.rating)}</span></div>
          <div class="small muted">${KINDS[f.kind] || ''} için</div>
          ${f.note ? `<p>${esc(f.note)}</p>` : ''}
        </div>`).join('')}</div>
    </section>` : '';
  const weekReport = `Merhaba ${teacher.n ? firstName(teacher.n) + ' Hocam' : 'Hocam'}, ben ${s.n}. Bu hafta ${weekTotal} dakika ${s.i.toLocaleLowerCase('tr')} çalıştım` +
    `${pr.entries.filter(e => week.includes(e.d) && e.n).length ? ':\n' + pr.entries.filter(e => week.includes(e.d) && e.n).map(e => `• ${fmtDateShort(e.d)}: ${e.m} dk – ${e.n}`).join('\n') : '.'}` +
    `${hwLesson ? `\nÖdev: ${pr.hwDone[hwLesson.date] ? 'tamamladım ✅' : 'devam ediyorum'}` : ''}` +
    `${weekRecs.length ? `\nBu hafta ${weekRecs.length} ödev kaydı gönderdim 🎬` : ''}`;
  const hwCard = hwLesson ? `
    <section class="card hw-card">
      <div class="card-head"><h2>Bu haftanın ödevi</h2><span class="small muted">${fmtDateShort(hwLesson.date)} dersi</span></div>
      <p class="hw-text">${esc(hwLesson.homework)}</p>
      ${hwLesson.topic ? `<p class="small muted" style="margin:8px 0 0">Derste çalışılan: ${esc(hwLesson.topic)}</p>` : ''}
      <label class="row check-row"><input type="checkbox" id="hw-done" ${pr.hwDone[hwLesson.date] ? 'checked' : ''} /> Ödevi tamamladım</label>
    </section>` : '';
  const nextCard = `
    <section class="card next-card">
      <div class="small muted">Sıradaki ders</div>
      ${next ? `<div class="next-when">${daysUntil(next)} · ${next.time}</div><div class="muted">${longDate(next.date)} · ${next.duration || 45} dk</div>`
        : s.d != null && s.tm ? `<div class="next-when">Her ${DAYS[s.d]} ${s.tm}</div>` : `<div class="muted">Planlanmış ders görünmüyor.</div>`}
    </section>`;

  const studentTab = `
    <div class="grid">
      ${nextCard}
      ${hwCard}
      ${recordCard}
      ${feedbackCard}
      <section class="card">
        <div class="card-head"><h2>Çalışma günlüğüm</h2>${streak ? `<span class="badge b-done">🔥 ${streak} gün seri</span>` : ''}</div>
        <div class="bars">
          ${week.map((d, i) => `<div class="bar-col ${d === t ? 'is-today' : ''}">
            <div class="bar-val">${weekMins[i] || ''}</div>
            <div class="bar"><span style="height:${Math.round(weekMins[i] / maxBar * 100)}%"></span></div>
            <div class="bar-lbl">${DAYS_SHORT[i]}</div></div>`).join('')}
        </div>
        <div class="goal">
          <div class="row" style="justify-content:space-between"><span class="small"><strong>${weekTotal}</strong> / <input id="goal" type="number" min="10" step="10" value="${pr.goal}" class="goal-input" aria-label="Haftalık hedef" /> dk haftalık hedef</span><span class="small muted">%${goalPct}</span></div>
          <div class="progress"><span style="width:${goalPct}%"></span></div>
        </div>
        <div class="practice-add">
          <div class="small muted" style="margin-bottom:6px">Bugün kaç dakika çalıştın?</div>
          <div class="row">${[10, 15, 20, 30, 45, 60].map(m => `<button class="sm chip-btn" data-min="${m}">${m} dk</button>`).join('')}</div>
          <div class="row" style="margin-top:8px;flex-wrap:nowrap">
            <input id="pr-note" placeholder="Ne çalıştın? (opsiyonel)" />
            <input id="pr-min" type="number" min="1" placeholder="dk" style="width:80px" />
            <button class="primary" data-action="pr-add">Ekle</button>
          </div>
        </div>
        ${pr.entries.length ? `<div class="list" style="margin-top:10px">${[...pr.entries].reverse().slice(0, 6).map(e => `
          <div class="list-item"><div class="time">${e.m}<span class="small muted"> dk</span></div>
          <div class="grow small">${fmtDateShort(e.d)}${e.n ? ' · ' + esc(e.n) : ''}</div>
          <button class="icon-btn" data-del-entry="${e.id}" aria-label="Sil">✕</button></div>`).join('')}</div>` : ''}
        ${teacher.p ? `<a class="btn wa-btn" target="_blank" rel="noopener" href="${waLink(teacher.p, weekReport)}">Bu haftaki çalışmamı ${esc(teacher.n ? firstName(teacher.n) + ' Hoca' : 'öğretmenime')}’ya gönder ↗</a>` : ''}
      </section>
      <section class="card">
        <div class="card-head"><h2>Son derslerim</h2></div>
        <div class="timeline">
          ${history.length ? history.slice(0, 8).map(l => `
            <div class="entry">
              <div class="entry-head"><strong>${fmtDate(l.date)}</strong>${badge(l.status)}</div>
              ${l.topic ? `<p><span class="lbl">Çalışılan</span><br>${esc(l.topic)}</p>` : ''}
              ${l.homework ? `<p><span class="lbl">Ödev</span><br>${esc(l.homework)}</p>` : ''}
            </div>`).join('') : `<div class="empty">Henüz ders kaydı yok.</div>`}
        </div>
      </section>
    </div>`;

  const parentTab = `
    <div class="grid">
      <div class="grid stats portal-stats">
        <div class="card stat"><div class="label">Yapılan ders</div><div class="value num">${P.c.done}</div></div>
        <div class="card stat"><div class="label">Gelinmeyen ders</div><div class="value num">${P.c.noshow}</div></div>
        <div class="card stat"><div class="label">Bu hafta çalışma</div><div class="value num">${weekTotal} <span class="small muted">dk</span></div></div>
        <div class="card stat"><div class="label">Bu hafta gönderilen kayıt</div><div class="value num">${weekRecs.length}</div></div>
        ${P.b != null ? `<div class="card stat"><div class="label">Bakiye</div><div class="value num ${P.b < 0 ? 'bad' : ''}">${P.b < 0 ? '−' : ''}${money(Math.abs(P.b))}</div>
          <div class="small muted">${P.b < 0 ? 'Ödenmesi gereken' : P.b > 0 ? 'Peşin ödenmiş' : 'Hesap kapalı'}</div></div>` : ''}
      </div>
      ${nextCard}
      ${feedbackCard}
      ${hwLesson ? `<section class="card">
        <div class="card-head"><h3>Evde çalışılacak ödev</h3>${pr.hwDone[hwLesson.date] ? '<span class="badge b-done">Tamamlandı</span>' : '<span class="badge b-planned">Devam ediyor</span>'}</div>
        <p style="margin:0;white-space:pre-wrap">${esc(hwLesson.homework)}</p>
        <p class="small muted" style="margin:10px 0 0">Düzenli ve kısa çalışmalar (günde 15–20 dk) haftada bir uzun çalışmadan çok daha etkilidir.</p>
      </section>` : ''}
      <section class="card">
        <div class="card-head"><h3>Devam durumu</h3></div>
        <div class="list">
          ${history.length ? history.slice(0, 10).map(l => `
            <div class="list-item"><div class="grow">${longDate(l.date)} <span class="muted small">${l.time}</span></div>${badge(l.status)}</div>`).join('')
            : `<div class="empty">Henüz ders kaydı yok.</div>`}
        </div>
      </section>
      <section class="card">
        <div class="card-head"><h3>Öğretmenle iletişim</h3></div>
        <p style="margin:0 0 12px"><strong>${esc(teacher.n || 'Öğretmen')}</strong>${s.d != null && s.tm ? ` · Sabit ders: ${DAYS[s.d]} ${s.tm}` : ''}</p>
        ${teacher.p ? `<div class="row">
          <a class="btn wa-btn" style="margin:0" target="_blank" rel="noopener" href="${waLink(teacher.p, `Merhaba ${teacher.n ? firstName(teacher.n) + ' Hocam' : 'Hocam'}, ben ${s.pr || genitive(firstName(s.n)) + ' velisi'}. `)}">WhatsApp’tan yaz ↗</a>
          <a class="btn" href="tel:${esc(teacher.p)}">📞 Ara</a></div>` : `<p class="small muted">Öğretmen iletişim bilgisi eklenmemiş.</p>`}
      </section>
    </div>`;

  view.innerHTML = `
    <header class="portal-head">
      <div class="brand"><span class="brand-mark">𝄞</span><span class="brand-name">Ders Defteri</span></div>
      <div class="seg" role="tablist">
        <button role="tab" aria-selected="${portal.tab === 'student'}" data-tab="student">Öğrenci</button>
        <button role="tab" aria-selected="${portal.tab === 'parent'}" data-tab="parent">Veli</button>
      </div>
    </header>
    <div class="portal-hero">
      <h1>${portal.tab === 'parent' ? `${esc(genitive(firstName(s.n)))} ders özeti` : `Merhaba ${esc(firstName(s.n))}! 🎵`}</h1>
      <p class="muted">${esc(s.i)} · ${esc(s.lv)} · Öğretmen: ${esc(teacherName)}</p>
    </div>
    ${portal.tab === 'parent' ? parentTab : studentTab}
    <p class="small muted" style="text-align:center;margin-top:24px">Bilgiler ${fmtDate(P.g)} tarihli. Çalışma günlüğü ve kayıtlar yalnızca bu cihazda saklanır.</p>`;
  oldUrls.forEach(u => URL.revokeObjectURL(u));

  view.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => {
    portal.tab = b.dataset.tab;
    try { localStorage.setItem('ders-defteri-portal-tab', portal.tab); } catch { /* yok say */ }
    renderPortal(code); window.scrollTo(0, 0);
  });
  const addEntry = m => {
    if (!(m > 0)) { toast('Dakika girin'); return; }
    pr.entries.push({ id: uid(), d: t, m, n: (document.getElementById('pr-note')?.value || '').trim() });
    savePractice(P.id, pr); toast(`${m} dk eklendi 👏`); renderPortal(code);
  };
  view.querySelectorAll('[data-min]').forEach(b => b.onclick = () => addEntry(+b.dataset.min));
  const addBtn = view.querySelector('[data-action=pr-add]');
  if (addBtn) addBtn.onclick = () => addEntry(+document.getElementById('pr-min').value);
  view.querySelectorAll('[data-del-entry]').forEach(b => b.onclick = () => {
    pr.entries = pr.entries.filter(e => e.id !== b.dataset.delEntry); savePractice(P.id, pr); renderPortal(code);
  });
  const goal = document.getElementById('goal');
  if (goal) goal.onchange = () => { pr.goal = Math.max(10, +goal.value || 150); savePractice(P.id, pr); renderPortal(code); };
  const hw = document.getElementById('hw-done');
  if (hw) hw.onchange = () => { pr.hwDone[hwLesson.date] = hw.checked; savePractice(P.id, pr); if (hw.checked) toast('Harika! 🎉'); renderPortal(code); };

  const ctx = { P, code, hwLesson, teacher };
  view.querySelectorAll('[data-rec]').forEach(b => { b.onclick = () => openRecorder(b.dataset.rec, ctx); });
  const fileIn = document.getElementById('rec-file');
  if (fileIn) fileIn.onchange = async () => {
    const f = fileIn.files[0];
    if (!f) return;
    const rec = { id: uid(), sid: P.id, kind: f.type.startsWith('audio') ? 'audio' : 'video', blob: f,
      type: f.type || 'video/mp4', created: new Date().toISOString(), dur: 0, note: '', sent: false };
    await saveRec(rec);
    openReview(rec, ctx);
  };
  view.querySelectorAll('[data-rec-send]').forEach(b => {
    b.onclick = () => sendRec(recs.find(r => r.id === b.dataset.recSend), ctx);
  });
  view.querySelectorAll('[data-rec-del]').forEach(b => {
    b.onclick = async () => {
      if (!confirm('Bu kayıt bu cihazdan silinsin mi?')) return;
      await recStore.del(b.dataset.recDel).catch(() => {});
      renderPortal(code);
    };
  });
}
