'use strict';

import { pad, firstName } from './format.js';

/* ---------- Ödev kayıtları (öğrenci cihazında, IndexedDB) ---------- */

export const recStore = (() => {
  let conn;
  const open = () => conn ||= new Promise((res, rej) => {
    const r = indexedDB.open('ders-defteri-kayitlar', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('rec', { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const run = async (mode, fn) => {
    const d = await open();
    return new Promise((res, rej) => {
      const t = d.transaction('rec', mode);
      const req = fn(t.objectStore('rec'));
      t.oncomplete = () => res(req.result);
      t.onerror = () => rej(t.error);
    });
  };
  return {
    put: r => run('readwrite', s => s.put(r)),
    del: id => run('readwrite', s => s.delete(id)),
    all: () => run('readonly', s => s.getAll()),
  };
})();

export const canRecord = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
export function pickMime(kind) {
  const list = kind === 'video'
    ? ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    : ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];
  return list.find(t => MediaRecorder.isTypeSupported?.(t)) || '';
}
export function recFileName(r, studentName) {
  const base = r.type.split(';')[0];
  const ext = base.includes('mp4') ? (r.kind === 'audio' ? 'm4a' : 'mp4')
    : base.includes('ogg') ? 'ogg' : base.includes('quicktime') ? 'mov'
    : base.includes('mpeg') ? 'mp3' : base.includes('wav') ? 'wav' : 'webm';
  const slug = firstName(studentName).toLocaleLowerCase('tr').normalize('NFD').replace(/[^\w]/g, '') || 'ogrenci';
  return `${slug}-odev-${r.created.slice(0, 10)}.${ext}`;
}
export const fmtDur = s => `${Math.floor(s / 60)}:${pad(Math.floor(s % 60))}`;
export const fmtSize = b => b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

/* Paylaşım menüsü (telefonda WhatsApp dahil) açılır; desteklenmezse dosya indirilir.
   Safari kullanıcı dokunuşuna bağlı kalabilmek için bu fonksiyonun başında await olmamalı. */
export function shareRecording(r, studentName, text) {
  const file = new File([r.blob], recFileName(r, studentName), { type: r.type.split(';')[0] || r.blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    return navigator.share({ files: [file], text })
      .then(() => 'shared')
      .catch(e => e.name === 'AbortError' ? 'cancel' : downloadFile(file));
  }
  return Promise.resolve(downloadFile(file));
}
export function downloadFile(file) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: file.name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  return 'downloaded';
}
