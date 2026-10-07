'use strict';

import { STATUS, INSTRUMENT_GROUPS, INSTRUMENTS } from './state.js';

/* ================= Tarih yardımcıları ================= */

export const pad = n => String(n).padStart(2, '0');
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const today = () => ymd(new Date());
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const mondayOf = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return addDays(x, -((x.getDay() + 6) % 7)); };
export const fmtDate = s => parseYmd(s).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
export const fmtDateShort = s => parseYmd(s).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });

/* ================= Metin / para biçimlendirme ================= */

export const money = n => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n || 0);
export const initials = name => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toLocaleUpperCase('tr')).join('');

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export const options = (list, sel) => list.map(v => `<option ${v === sel ? 'selected' : ''}>${esc(v)}</option>`).join('');
export function instrumentOptions(sel) {
  const custom = sel && !INSTRUMENTS.includes(sel);
  return Object.entries(INSTRUMENT_GROUPS)
    .map(([g, list]) => `<optgroup label="${esc(g)}">${options(list, sel)}</optgroup>`).join('') +
    `<option value="__other" ${custom ? 'selected' : ''}>Diğer…</option>`;
}
export const firstName = name => (name || '').trim().split(/\s+/)[0] || '';
/* Tamlayan eki, ünlü uyumuna göre: Deniz’in, Ali’nin, Nur’un, Elif’in, Zeynep’in, Can’ın. */
export function genitive(name) {
  const w = name.toLocaleLowerCase('tr');
  const vowels = w.match(/[aeıioöuü]/g);
  const v = vowels ? vowels[vowels.length - 1] : 'e';
  const suf = { a: 'ın', ı: 'ın', e: 'in', i: 'in', o: 'un', u: 'un', ö: 'ün', ü: 'ün' }[v];
  return `${name}’${/[aeıioöuü]$/.test(w) ? 'n' : ''}${suf}`;
}

export const badge = st => `<span class="badge b-${st}">${STATUS[st]}</span>`;
export const balanceHtml = b => b === 0 ? `<span class="muted">${money(0)}</span>`
  : `<span class="${b < 0 ? 'neg' : 'pos'} num">${b < 0 ? '−' : '+'}${money(Math.abs(b))}</span>`;
