'use strict';

import { view } from '../dom.js';
import { db, student, lessonsOf, paymentsOf, checkinsOf, balanceOf, byDateTime, save, DAYS, KINDS } from '../state.js';
import { esc, initials, fmtDate, fmtDateShort, money, badge } from '../format.js';
import { waLink } from '../whatsapp.js';
import { studentForm, lessonForm, checkinForm } from '../forms.js';
import { shareForm, messageForm, feedbackText, TEMPLATES } from '../messaging.js';
import { toast } from '../toast.js';
import { render } from '../router.js';

export function renderStudent(id) {
  const s = student(id);
  if (!s) { view.innerHTML = `<div class="empty">Öğrenci bulunamadı. <a href="#/ogrenciler">Listeye dön</a></div>`; return; }
  const ls = lessonsOf(id).sort(byDateTime).reverse();
  const ps = paymentsOf(id).sort((a, b) => b.date.localeCompare(a.date));
  const done = ls.filter(l => l.status === 'done');
  const b = balanceOf(id);
  const lastHw = done.find(l => l.homework);
  const paid = ps.reduce((a, p) => a + p.amount, 0);

  view.innerHTML = `
    <p><a href="#/ogrenciler" class="muted small" style="text-decoration:none">← Öğrenciler</a></p>
    <div class="page-head">
      <div class="profile">
        <div class="avatar">${esc(initials(s.name))}</div>
        <div><h1>${esc(s.name)}</h1><p class="muted">${esc(s.instrument)} · ${esc(s.level)}${s.active === false ? ' · Pasif' : ''}</p></div>
      </div>
      <div class="row">
        <button data-action="edit-student">Düzenle</button>
        <button data-action="toggle-active">${s.active === false ? 'Aktifleştir' : 'Pasife al'}</button>
        <button data-pay="${s.id}">₺ Ödeme al</button>
        <button class="primary" data-action="add-lesson-for">+ Ders</button>
      </div>
    </div>

    <div class="grid stats">
      <div class="card stat"><div class="label">Yapılan ders</div><div class="value num">${done.length}</div></div>
      <div class="card stat"><div class="label">Toplam ödeme</div><div class="value num">${money(paid)}</div></div>
      <div class="card stat"><div class="label">Bakiye</div><div class="value num ${b < 0 ? 'bad' : ''}">${b < 0 ? '−' : ''}${money(Math.abs(b))}</div></div>
      <div class="card stat"><div class="label">Gelmediği ders</div><div class="value num">${ls.filter(l => l.status === 'noshow').length}</div></div>
    </div>

    <div class="grid grid-2">
      <section class="card">
        <div class="card-head"><h2>Ders geçmişi</h2><span class="muted small">${ls.length} kayıt</span></div>
        <div class="timeline">
          ${ls.length ? ls.map(l => `
            <div class="entry clickable" data-lesson="${l.id}" style="padding-left:6px;padding-right:6px">
              <div class="entry-head">
                <strong>${fmtDate(l.date)} <span class="muted small">${l.time}</span></strong>
                ${badge(l.status)}
              </div>
              ${l.topic ? `<p><span class="lbl">Çalışılan</span><br>${esc(l.topic)}</p>` : ''}
              ${l.homework ? `<p><span class="lbl">Ödev</span><br>${esc(l.homework)}</p>` : ''}
            </div>`).join('') : `<div class="empty">Henüz ders kaydı yok.</div>`}
        </div>
      </section>

      <div class="grid" style="align-content:start">
        ${lastHw ? `<section class="card" style="border-color:var(--accent)">
          <div class="card-head"><h3>Güncel ödev</h3><span class="small muted">${fmtDateShort(lastHw.date)}</span></div>
          <p style="margin:0;white-space:pre-wrap">${esc(lastHw.homework)}</p>
        </section>` : ''}
        <section class="card">
          <div class="card-head"><h3>Hafta içi ödev kayıtları</h3><button class="sm" data-action="add-checkin">+ Kayıt geldi</button></div>
          ${lastHw && !checkinsOf(s.id).some(c => c.date >= lastHw.date)
            ? `<p class="small" style="margin:-4px 0 8px"><span class="badge b-cancelled">Bekleniyor</span> Son dersten (${fmtDateShort(lastHw.date)}) beri kayıt gelmedi.</p>` : ''}
          <div class="list">
            ${checkinsOf(s.id).length ? checkinsOf(s.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6).map(c => `
              <div class="list-item">
                <div class="grow clickable" data-checkin="${c.id}" style="padding:2px 4px">
                  <div class="title small">${fmtDate(c.date)} · ${KINDS[c.kind]}</div>
                  <div class="small muted">${esc(c.rating || '')}${c.note ? ' — ' + esc(c.note) : ''}</div>
                </div>
                ${s.phone || s.parentPhone ? `<a class="btn sm" target="_blank" rel="noopener" title="Geri bildirimi WhatsApp’tan gönder" href="${waLink(s.phone || s.parentPhone, feedbackText(s, c))}">↗</a>` : ''}
              </div>`).join('') : `<div class="empty small">Öğrenci ders sayfasından ses/video kaydı gönderdiğinde buraya işleyin.</div>`}
          </div>
        </section>
        <section class="card">
          <div class="card-head"><h3>Öğrenci & veli</h3></div>
          <p class="small muted" style="margin:-4px 0 12px">Ödevleri, sıradaki dersi ve çalışma günlüğünü gösteren kişisel sayfa.</p>
          <button class="primary" data-action="share" style="width:100%;justify-content:center">🔗 Öğrenci/veli bağlantısı gönder</button>
          <div class="row" style="margin-top:10px">
            ${Object.entries(TEMPLATES).map(([k, t]) => `<button class="sm" data-msg="${k}">${t.label}</button>`).join('')}
          </div>
        </section>
        <section class="card">
          <div class="card-head"><h3>Bilgiler</h3></div>
          <dl class="kv">
            <dt>Telefon</dt><dd>${s.phone ? `<a href="tel:${esc(s.phone)}">${esc(s.phone)}</a>` : '—'}</dd>
            <dt>Veli</dt><dd>${esc(s.parent) || '—'}${s.parentPhone ? ` · <a href="tel:${esc(s.parentPhone)}">${esc(s.parentPhone)}</a>` : ''}</dd>
            <dt>Ders ücreti</dt><dd>${money(s.fee)} / ${s.duration} dk</dd>
            <dt>Sabit ders</dt><dd>${s.weeklyDay != null && s.weeklyTime ? `${DAYS[s.weeklyDay]} ${s.weeklyTime}` : '—'}</dd>
            <dt>Kayıt</dt><dd>${s.createdAt ? fmtDate(s.createdAt) : '—'}</dd>
          </dl>
          ${s.notes ? `<p class="small" style="white-space:pre-wrap;margin:14px 0 0">${esc(s.notes)}</p>` : ''}
        </section>
        <section class="card">
          <div class="card-head"><h3>Ödemeler</h3></div>
          <div class="list">
            ${ps.length ? ps.map(p => `
              <div class="list-item clickable" data-payment="${p.id}">
                <div class="grow"><div class="title num">${money(p.amount)}</div>
                <div class="small muted">${fmtDate(p.date)} · ${esc(p.method)}${p.note ? ' · ' + esc(p.note) : ''}</div></div>
              </div>`).join('') : `<div class="empty">Ödeme kaydı yok.</div>`}
          </div>
        </section>
      </div>
    </div>`;

  view.querySelector('[data-action=edit-student]').onclick = () => studentForm(s);
  view.querySelector('[data-action=share]').onclick = () => shareForm(s);
  view.querySelector('[data-action=add-checkin]').onclick = () => checkinForm(s);
  view.querySelectorAll('[data-checkin]').forEach(el => { el.onclick = () => checkinForm(s, db.checkins.find(c => c.id === el.dataset.checkin)); });
  view.querySelectorAll('[data-msg]').forEach(b => { b.onclick = () => messageForm(s, b.dataset.msg); });
  view.querySelector('[data-action=add-lesson-for]').onclick = () => lessonForm({}, { studentId: s.id });
  view.querySelector('[data-action=toggle-active]').onclick = () => {
    s.active = s.active === false; save(); render();
    toast(s.active ? 'Öğrenci aktifleştirildi' : 'Öğrenci pasife alındı');
  };
}
