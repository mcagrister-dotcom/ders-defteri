'use strict';

import { view } from '../dom.js';
import { db, student, CHARGED } from '../state.js';
import { today, parseYmd, fmtDateShort, money, esc } from '../format.js';

let paymentMonth = today().slice(0, 7);

export function renderPayments() {
  const months = [...new Set([today().slice(0, 7), ...db.payments.map(p => p.date.slice(0, 7))])].sort().reverse();
  const list = db.payments.filter(p => p.date.startsWith(paymentMonth)).sort((a, b) => b.date.localeCompare(a.date));
  const total = list.reduce((a, p) => a + p.amount, 0);
  const expected = db.lessons.filter(l => l.date.startsWith(paymentMonth) && CHARGED.has(l.status)).reduce((a, l) => a + l.fee, 0);
  const monthName = m => parseYmd(m + '-01').toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });

  view.innerHTML = `
    <div class="page-head">
      <div><h1>Ödemeler</h1><p class="muted">${monthName(paymentMonth)}</p></div>
      <div class="row">
        <select id="month" style="width:auto">${months.map(m => `<option value="${m}" ${m === paymentMonth ? 'selected' : ''}>${monthName(m)}</option>`).join('')}</select>
        <button class="primary" data-action="add-payment">+ Ödeme al</button>
      </div>
    </div>
    <div class="grid stats" style="grid-template-columns:repeat(3,1fr)">
      <div class="card stat"><div class="label">Tahsil edilen</div><div class="value num">${money(total)}</div></div>
      <div class="card stat"><div class="label">Bu ay verilen derslerin tutarı</div><div class="value num">${money(expected)}</div></div>
      <div class="card stat"><div class="label">Ödeme sayısı</div><div class="value num">${list.length}</div></div>
    </div>
    <section class="card">
      ${list.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Tarih</th><th>Öğrenci</th><th class="hide-sm">Yöntem</th><th class="hide-sm">Not</th><th class="right">Tutar</th></tr></thead>
        <tbody>${list.map(p => `
          <tr class="clickable" data-payment="${p.id}">
            <td>${fmtDateShort(p.date)}</td>
            <td>${esc(student(p.studentId)?.name || 'Silinmiş')}</td>
            <td class="hide-sm">${esc(p.method)}</td>
            <td class="hide-sm muted">${esc(p.note)}</td>
            <td class="right num">${money(p.amount)}</td>
          </tr>`).join('')}</tbody>
      </table></div>` : `<div class="empty">Bu ay ödeme kaydı yok.</div>`}
    </section>`;
  document.getElementById('month').onchange = e => { paymentMonth = e.target.value; renderPayments(); };
}
