'use strict';

import { view } from '../dom.js';
import { db, lessonsOf, balanceOf, byDateTime, DAYS } from '../state.js';
import { esc, initials, money, fmtDateShort, balanceHtml } from '../format.js';

let studentQuery = '';

export function renderStudents() {
  const q = studentQuery.toLocaleLowerCase('tr');
  const list = db.students
    .filter(s => !q || (s.name + ' ' + s.instrument).toLocaleLowerCase('tr').includes(q))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'));

  view.innerHTML = `
    <div class="page-head">
      <div><h1>Öğrenciler</h1><p class="muted">${db.students.length} kayıtlı öğrenci</p></div>
      <div class="row">
        <input class="search" id="q" type="search" placeholder="Ara…" value="${esc(studentQuery)}" />
        <button class="primary" data-action="add-student">+ Öğrenci</button>
      </div>
    </div>
    <section class="card">
      ${list.length ? `
      <div class="table-wrap"><table>
        <thead><tr><th>Öğrenci</th><th class="hide-sm">Sabit ders</th><th class="hide-sm">Ücret</th><th class="hide-sm">Son ders</th><th class="right">Bakiye</th></tr></thead>
        <tbody>
          ${list.map(s => {
            const last = lessonsOf(s.id).filter(l => l.status === 'done').sort(byDateTime).pop();
            return `<tr class="clickable" data-student="${s.id}">
              <td><div class="row" style="flex-wrap:nowrap">
                <div class="avatar">${esc(initials(s.name))}</div>
                <div><div class="title">${esc(s.name)}${s.active === false ? ' <span class="badge b-planned">Pasif</span>' : ''}</div>
                <div class="small muted">${esc(s.instrument)} · ${esc(s.level)}</div></div></div></td>
              <td class="hide-sm">${s.weeklyDay != null && s.weeklyTime ? `${DAYS[s.weeklyDay]} ${s.weeklyTime}` : '<span class="muted">—</span>'}</td>
              <td class="hide-sm num">${money(s.fee)}</td>
              <td class="hide-sm">${last ? fmtDateShort(last.date) : '<span class="muted">—</span>'}</td>
              <td class="right">${balanceHtml(balanceOf(s.id))}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table></div>` : `<div class="empty">${db.students.length ? 'Eşleşen öğrenci yok.' : 'Henüz öğrenci yok. İlk öğrencinizi ekleyin ya da Ayarlar’dan örnek veri yükleyin.'}</div>`}
    </section>`;
  const input = document.getElementById('q');
  input.oninput = e => {
    studentQuery = e.target.value;
    const pos = e.target.selectionStart;
    renderStudents();
    const el = document.getElementById('q');
    el.focus(); el.setSelectionRange(pos, pos);
  };
}
