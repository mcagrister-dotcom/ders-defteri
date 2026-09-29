'use strict';

import { view } from './dom.js';
import { db } from './state.js';
import { setStatus, lessonForm, paymentForm, studentForm } from './forms.js';
import { renderDashboard } from './views/dashboard.js';
import { renderCalendar, shiftWeek } from './views/calendar.js';
import { renderStudents } from './views/students.js';
import { renderStudent } from './views/student-detail.js';
import { renderPayments } from './views/payments.js';
import { renderSettings } from './views/settings.js';
import { renderPortal } from './portal/render.js';

/* ================= Yönlendirme ================= */

const routes = [
  [/^#?\/?$/, 'dashboard', renderDashboard],
  [/^#\/takvim$/, 'calendar', renderCalendar],
  [/^#\/ogrenciler$/, 'students', renderStudents],
  [/^#\/ogrenci\/(.+)$/, 'students', m => renderStudent(m[1])],
  [/^#\/odemeler$/, 'payments', renderPayments],
  [/^#\/ayarlar$/, 'settings', renderSettings],
];

export function render() {
  const hash = location.hash || '#/';
  const share = hash.match(/^#\/p\/(.+)$/);
  document.body.classList.toggle('portal', !!share);
  if (share) { renderPortal(share[1]); return; }
  for (const [re, name, fn] of routes) {
    const m = hash.match(re);
    if (!m) continue;
    document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('active', a.dataset.route === name));
    fn(m);
    return;
  }
  location.hash = '#/';
}

window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

/* Ortak tıklama işleyicisi: görünümler her render'da yeniden çizildiği için olay delegasyonu. */
view.addEventListener('click', e => {
  const t = e.target.closest('[data-set],[data-pay],[data-lesson],[data-student],[data-payment],[data-week],[data-add-on],[data-action]');
  if (!t) return;
  const d = t.dataset;
  if (d.set) { e.stopPropagation(); const [id, st] = d.set.split(':'); return setStatus(id, st); }
  if (d.pay) return paymentForm({}, { studentId: d.pay });
  if (d.lesson) return lessonForm(db.lessons.find(l => l.id === d.lesson));
  if (d.student) { location.hash = `#/ogrenci/${d.student}`; return; }
  if (d.payment) return paymentForm(db.payments.find(p => p.id === d.payment));
  if (d.week !== undefined) { return shiftWeek(d.week === '0' ? 0 : +d.week); }
  if (d.addOn) return lessonForm({}, { date: d.addOn });
  if (d.action === 'add-lesson') return lessonForm();
  if (d.action === 'add-student') return studentForm();
  if (d.action === 'add-payment') return paymentForm();
});

render();
