'use strict';

import { view } from '../dom.js';
import { db, student, balanceOf, weeklyTracking, byDateTime } from '../state.js';
import { today, mondayOf, addDays, ymd, esc, initials, money, fmtDateShort, badge, balanceHtml } from '../format.js';
import { setStatus } from '../forms.js';
import { messageForm } from '../messaging.js';

function lessonRow(l, { showDate = false, quick = false } = {}) {
  const s = student(l.studentId);
  if (!s) return '';
  return `
    <div class="list-item clickable" data-lesson="${l.id}">
      <div class="time">${showDate ? `<div class="small muted">${fmtDateShort(l.date)}</div>` : ''}${l.time}</div>
      <div class="avatar">${esc(initials(s.name))}</div>
      <div class="grow">
        <div class="title">${esc(s.name)}</div>
        <div class="small muted">${esc(s.instrument)} · ${l.duration} dk${l.homework ? ' · ödev var' : ''}</div>
      </div>
      ${quick && l.status === 'planned' ? `
        <div class="row">
          <button class="sm" data-set="${l.id}:done">✓ Yapıldı</button>
          <button class="sm ghost hide-sm" data-set="${l.id}:noshow">Gelmedi</button>
          <button class="sm ghost hide-sm" data-set="${l.id}:cancelled">İptal</button>
        </div>` : badge(l.status)}
    </div>`;
}

export function renderDashboard() {
  const t = today();
  const mon = mondayOf(new Date());
  const weekEnd = ymd(addDays(mon, 6));
  const month = t.slice(0, 7);
  const active = db.students.filter(s => s.active !== false);
  const todays = db.lessons.filter(l => l.date === t).sort(byDateTime);
  const weekCount = db.lessons.filter(l => l.date >= ymd(mon) && l.date <= weekEnd && l.status !== 'cancelled').length;
  const monthIncome = db.payments.filter(p => p.date.startsWith(month)).reduce((a, p) => a + p.amount, 0);
  const debtors = active.map(s => ({ s, b: balanceOf(s.id) })).filter(x => x.b < 0).sort((a, b) => a.b - b.b);
  const totalDebt = debtors.reduce((a, x) => a - x.b, 0);
  const pastPlanned = db.lessons.filter(l => l.date < t && l.status === 'planned').sort(byDateTime).reverse();
  const tracking = weeklyTracking();
  const upcoming = db.lessons.filter(l => l.date > t && l.status === 'planned').sort(byDateTime).slice(0, 5);
  const dateLabel = new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });

  view.innerHTML = `
    <div class="page-head">
      <div><h1>Merhaba 👋</h1><p class="muted">${dateLabel}</p></div>
      <div class="row">
        <button data-action="add-payment">₺ Ödeme al</button>
        <button class="primary" data-action="add-lesson">+ Ders ekle</button>
      </div>
    </div>

    <div class="grid stats">
      <div class="card stat"><div class="label">Aktif öğrenci</div><div class="value num">${active.length}</div></div>
      <div class="card stat"><div class="label">Bu haftaki ders</div><div class="value num">${weekCount}</div></div>
      <div class="card stat"><div class="label">Bu ay tahsilat</div><div class="value num">${money(monthIncome)}</div></div>
      <div class="card stat"><div class="label">Bekleyen alacak</div><div class="value num ${totalDebt ? 'bad' : ''}">${money(totalDebt)}</div></div>
    </div>

    <div class="grid grid-2">
      <div class="grid" style="align-content:start">
        <section class="card">
          <div class="card-head"><h2>Bugünün dersleri</h2><span class="muted small">${todays.length} ders</span></div>
          <div class="list">
            ${todays.length ? todays.map(l => lessonRow(l, { quick: true })).join('')
              : `<div class="empty">Bugün ders yok. <a href="#/takvim">Takvime git →</a></div>`}
          </div>
        </section>
        ${pastPlanned.length ? `
        <section class="card">
          <div class="card-head"><h2>Durumu girilmemiş dersler</h2><span class="badge b-cancelled">${pastPlanned.length}</span></div>
          <p class="small muted" style="margin:-4px 0 8px">Geçmiş tarihli ama hâlâ “planlandı” görünen dersler. Bakiyeye yansıması için durumlarını işaretleyin.</p>
          <div class="list">${pastPlanned.slice(0, 6).map(l => lessonRow(l, { showDate: true, quick: true })).join('')}</div>
        </section>` : ''}
        <section class="card">
          <div class="card-head"><h2>Yaklaşan dersler</h2></div>
          <div class="list">
            ${upcoming.length ? upcoming.map(l => lessonRow(l, { showDate: true })).join('')
              : `<div class="empty">Planlanmış ders yok.</div>`}
          </div>
        </section>
      </div>

      <div class="grid" style="align-content:start">
      <section class="card">
        <div class="card-head"><h2>Hafta içi ödev takibi</h2><span class="small muted">${tracking.filter(x => x.got.length).length}/${tracking.length} kayıt geldi</span></div>
        <div class="list">
          ${tracking.length ? tracking.sort((a, b) => a.got.length - b.got.length).map(({ s, hw, got }) => `
            <div class="list-item">
              <div class="avatar">${esc(initials(s.name))}</div>
              <a class="grow" href="#/ogrenci/${s.id}" style="text-decoration:none">
                <div class="title">${esc(s.name)}</div>
                <div class="small muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(hw.homework.split('\n')[0])}</div>
              </a>
              ${got.length ? `<span class="badge b-done">${got[0].kind === 'audio' ? '🎙' : '🎥'} Geldi</span>`
                : `<button class="sm" data-nudge="${s.id}">Kayıt iste</button>`}
            </div>`).join('') : `<div class="empty">Ödev verilen ders olunca burada görünür.</div>`}
        </div>
      </section>
      <section class="card">
        <div class="card-head"><h2>Ödeme bekleyenler</h2></div>
        <div class="list">
          ${debtors.length ? debtors.map(({ s, b }) => `
            <div class="list-item">
              <div class="avatar">${esc(initials(s.name))}</div>
              <a class="grow title" href="#/ogrenci/${s.id}" style="text-decoration:none">${esc(s.name)}</a>
              ${balanceHtml(b)}
              <button class="sm" data-pay="${s.id}">Tahsil et</button>
            </div>`).join('')
            : `<div class="empty">Herkesin hesabı temiz ✨</div>`}
        </div>
      </section>
      </div>
    </div>`;
  view.querySelectorAll('[data-nudge]').forEach(b => { b.onclick = () => messageForm(student(b.dataset.nudge), 'nudge'); });
}
