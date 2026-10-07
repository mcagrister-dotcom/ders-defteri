'use strict';

import { db, lessonsOf, checkinsOf, byDateTime, balanceOf } from './state.js';
import { today } from './format.js';

/* Paylaşım bağlantısı: veri adresin # kısmında taşınır, hiçbir sunucuya gönderilmez. */
function b64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(str) {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, c => c.charCodeAt(0));
}
const pipeBytes = async (bytes, stream) =>
  new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());

export async function encodeShare(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  if ('CompressionStream' in window) {
    try { return 'z' + b64url(await pipeBytes(bytes, new CompressionStream('deflate-raw'))); } catch { /* düz kodlamaya düş */ }
  }
  return 'r' + b64url(bytes);
}
export async function decodeShare(code) {
  const bytes = unb64url(code.slice(1));
  const raw = code[0] === 'z' ? await pipeBytes(bytes, new DecompressionStream('deflate-raw')) : bytes;
  return JSON.parse(new TextDecoder().decode(raw));
}

export function sharePayload(s, includeBalance) {
  const t = today();
  const ls = lessonsOf(s.id).sort(byDateTime);
  const past = ls.filter(l => l.date <= t || l.status !== 'planned').slice(-12);
  const next = ls.filter(l => l.date >= t && l.status === 'planned').slice(0, 3);
  const pick = l => [l.date, l.time, l.status, l.topic || '', l.homework || '', l.duration];
  const uniq = [...new Map([...past, ...next].map(l => [l.id, l])).values()].sort(byDateTime);
  return {
    v: 1, id: s.id, g: t,
    t: { n: db.profile.name, p: db.profile.phone },
    s: { n: s.name, i: s.instrument, lv: s.level, d: s.weeklyDay, tm: s.weeklyTime, pr: s.parent },
    l: uniq.map(pick),
    c: { done: lessonsOf(s.id).filter(l => l.status === 'done').length, noshow: lessonsOf(s.id).filter(l => l.status === 'noshow').length },
    b: includeBalance ? balanceOf(s.id) : null,
    f: checkinsOf(s.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5).map(c => [c.date, c.kind, c.rating || '', c.note || '']),
  };
}
