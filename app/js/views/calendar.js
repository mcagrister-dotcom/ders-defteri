'use strict';

import { view } from '../dom.js';
import { db, student, uid, save, byDateTime, DAYS_SHORT } from '../state.js';
import { mondayOf, addDays, ymd, today, fmtDate, fmtDateShort, esc } from '../format.js';
import { toast } from '../toast.js';

let weekOffset = 0;

/* Takvim üstündeki ok tuşları ve "Bu hafta" ile çağrılır: delta=0 bu haftaya döner. */
export function shiftWeek(delta) {
  weekOffset = delta === 0 ? 0 : weekOffset + delta;
  renderCalendar();
}

/* Öğrencilerin sabit gün/saatinden haftalık dersleri oluşturur (var olanları atlar). */
function applyWeeklySchedule(monday) {
  let added = 0;
  for (const s of db.students) {
    if (s.active === false || s.weeklyDay == null || !s.weeklyTime) continue;
    const date = ymd(addDays(monday, s.weeklyDay));
    if (date < (s.createdAt || '')) continue;
    const exists = db.lessons.some(l => l.studentId === s.id && l.date === date);
    if (exists) continue;
    db.lessons.push({ id: uid(), studentId: s.id, date, time: s.weeklyTime, duration: s.duration,
      fee: s.fee, status: 'planned', topic: '', homework: '' });
    added++;
  }
  save(); renderCalendar();
  toast(added ? `${added} ders programa eklendi` : 'Eklenecek yeni ders yok');
}

export function renderCalendar() {
  const mon = addDays(mondayOf(new Date()), weekOffset * 7);
  const days = [...Array(7)].map((_, i) => ymd(addDays(mon, i)));
  const t = today();
  const range = `${fmtDateShort(days[0])} – ${fmtDate(days[6])}`;
  const planned = db.students.filter(s => s.active !== false && s.weeklyDay != null && s.weeklyTime).length;

  view.innerHTML = `
    <div class="page-head">
      <div><h1>Takvim</h1><p class="muted">${range}</p></div>
      <div class="row">
        <button data-week="-1" aria-label="Önceki hafta">←</button>
        <button data-week="0">Bu hafta</button>
        <button data-week="1" aria-label="Sonraki hafta">→</button>
        <button data-action="apply-week" title="${planned} öğrencinin sabit ders saati">↻ Haftalık programı uygula</button>
        <button class="primary" data-action="add-lesson">+ Ders</button>
      </div>
    </div>
    <div class="week">
      ${days.map((d, i) => {
        const ls = db.lessons.filter(l => l.date === d).sort(byDateTime);
        return `
          <div class="day ${d === t ? 'today' : ''}">
            <div class="day-head"><span class="dn">${DAYS_SHORT[i]}</span><span class="dd">${fmtDateShort(d)}</span></div>
            <div class="day-body">
              ${ls.map(l => {
                const s = student(l.studentId);
                return s ? `<button class="slot s-${l.status}" data-lesson="${l.id}">
                  <div class="t">${l.time} · ${l.duration}dk</div>
                  <div class="n">${esc(s.name)}</div>
                  <div class="t">${esc(s.instrument)}</div>
                </button>` : '';
              }).join('')}
              <button class="add-slot" data-add-on="${d}">+ ekle</button>
            </div>
          </div>`;
      }).join('')}
    </div>
    <p class="small muted" style="margin-top:14px">
      İpucu: Öğrencilere sabit gün/saat tanımlarsanız “Haftalık programı uygula” o haftanın derslerini tek tıkla oluşturur.
    </p>`;
  view.querySelector('[data-action=apply-week]').onclick = () => applyWeeklySchedule(mon);
}
