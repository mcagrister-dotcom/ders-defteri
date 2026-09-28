'use strict';

/* ================= Veri katmanı ================= */

const STORE_KEY = 'ders-defteri-v1';
const DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
const DAYS_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const STATUS = {
  planned: 'Planlandı',
  done: 'Yapıldı',
  cancelled: 'İptal',
  noshow: 'Gelmedi',
};
// Ücrete yansıyan durumlar: yapılan ders ve haber vermeden gelinmeyen ders.
const CHARGED = new Set(['done', 'noshow']);
const INSTRUMENT_GROUPS = {
  'Geleneksel Türk çalgıları': [
    'Bağlama (Saz)', 'Cura', 'Divan sazı', 'Ud', 'Kanun', 'Ney', 'Tanbur', 'Klasik kemençe',
    'Karadeniz kemençesi', 'Kabak kemane', 'Cümbüş', 'Kaval', 'Zurna', 'Mey', 'Tulum',
    'Darbuka', 'Bendir', 'Def', 'Kudüm', 'Rebap',
  ],
  'Klasik / Batı çalgıları': [
    'Piyano', 'Klasik gitar', 'Akustik gitar', 'Elektro gitar', 'Bas gitar', 'Keman', 'Viyola',
    'Çello', 'Kontrbas', 'Flüt', 'Klarnet', 'Obua', 'Saksafon', 'Trompet', 'Mandolin', 'Bateri', 'Arp',
  ],
  'Ses eğitimi': ['Şan (Klasik)', 'Türk müziği ses eğitimi', 'Pop / caz vokal'],
};
const INSTRUMENTS = Object.values(INSTRUMENT_GROUPS).flat();
const TRADITIONAL = new Set(INSTRUMENT_GROUPS['Geleneksel Türk çalgıları']);
const LEVELS = ['Başlangıç', 'Orta', 'İleri'];
const METHODS = ['Nakit', 'Havale/EFT', 'Kart'];

let db = load();

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) { /* bozuk ya da erişilemeyen depolama: boş başla */ }
  return normalize({});
}
function normalize(d) {
  return {
    profile: d.profile || { name: '', phone: '' },
    students: d.students || [], lessons: d.lessons || [], payments: d.payments || [],
    checkins: d.checkins || [], // hafta içi gelen ödev kayıtları + öğretmen geri bildirimi
  };
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); }
  catch (e) { toast('Kaydedilemedi: tarayıcı depolaması kullanılamıyor'); }
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const student = id => db.students.find(s => s.id === id);
const lessonsOf = id => db.lessons.filter(l => l.studentId === id);
const paymentsOf = id => db.payments.filter(p => p.studentId === id);
const checkinsOf = id => db.checkins.filter(c => c.studentId === id);
const lastHomework = id => lessonsOf(id).filter(l => l.status === 'done' && l.homework).sort(byDateTime).pop();
const KINDS = { audio: '🎙 Ses kaydı', video: '🎥 Video' };

function balanceOf(id) {
  const owed = lessonsOf(id).filter(l => CHARGED.has(l.status)).reduce((a, l) => a + (+l.fee || 0), 0);
  const paid = paymentsOf(id).reduce((a, p) => a + (+p.amount || 0), 0);
  return paid - owed; // negatif = öğrencinin borcu
}

/* ================= Yardımcılar ================= */

const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => ymd(new Date());
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mondayOf = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return addDays(x, -((x.getDay() + 6) % 7)); };
const dayIndex = s => (parseYmd(s).getDay() + 6) % 7; // 0 = Pazartesi
const fmtDate = s => parseYmd(s).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtDateShort = s => parseYmd(s).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
const money = n => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n || 0);
const initials = name => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toLocaleUpperCase('tr')).join('');
const byDateTime = (a, b) => (a.date + a.time).localeCompare(b.date + b.time);

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const options = (list, sel) => list.map(v => `<option ${v === sel ? 'selected' : ''}>${esc(v)}</option>`).join('');
function instrumentOptions(sel) {
  const custom = sel && !INSTRUMENTS.includes(sel);
  return Object.entries(INSTRUMENT_GROUPS)
    .map(([g, list]) => `<optgroup label="${esc(g)}">${options(list, sel)}</optgroup>`).join('') +
    `<option value="__other" ${custom ? 'selected' : ''}>Diğer…</option>`;
}
const firstName = name => (name || '').trim().split(/\s+/)[0] || '';
/* Tamlayan eki, ünlü uyumuna göre: Deniz’in, Ali’nin, Nur’un, Elif’in, Zeynep’in, Can’ın. */
function genitive(name) {
  const w = name.toLocaleLowerCase('tr');
  const vowels = w.match(/[aeıioöuü]/g);
  const v = vowels ? vowels[vowels.length - 1] : 'e';
  const suf = { a: 'ın', ı: 'ın', e: 'in', i: 'in', o: 'un', u: 'un', ö: 'ün', ü: 'ün' }[v];
  return `${name}’${/[aeıioöuü]$/.test(w) ? 'n' : ''}${suf}`;
}

/* WhatsApp: Türkiye numaralarını uluslararası biçime çevirir (0532… → 90532…). */
function waNumber(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = '90' + d.slice(1);
  else if (d.length === 10 && d.startsWith('5')) d = '90' + d;
  return d;
}
const waLink = (phone, text) => `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(text)}`;

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Kopyalandı'); }
  catch { toast('Kopyalanamadı, metni elle seçin'); }
}

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

async function encodeShare(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  if ('CompressionStream' in window) {
    try { return 'z' + b64url(await pipeBytes(bytes, new CompressionStream('deflate-raw'))); } catch { /* düz kodlamaya düş */ }
  }
  return 'r' + b64url(bytes);
}
/* ---------- Ödev kayıtları (öğrenci cihazında, IndexedDB) ---------- */

const recStore = (() => {
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

const canRecord = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
function pickMime(kind) {
  const list = kind === 'video'
    ? ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    : ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];
  return list.find(t => MediaRecorder.isTypeSupported?.(t)) || '';
}
function recFileName(r, studentName) {
  const base = r.type.split(';')[0];
  const ext = base.includes('mp4') ? (r.kind === 'audio' ? 'm4a' : 'mp4')
    : base.includes('ogg') ? 'ogg' : base.includes('quicktime') ? 'mov'
    : base.includes('mpeg') ? 'mp3' : base.includes('wav') ? 'wav' : 'webm';
  const slug = firstName(studentName).toLocaleLowerCase('tr').normalize('NFD').replace(/[^\w]/g, '') || 'ogrenci';
  return `${slug}-odev-${r.created.slice(0, 10)}.${ext}`;
}
const fmtDur = s => `${Math.floor(s / 60)}:${pad(Math.floor(s % 60))}`;
const fmtSize = b => b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

/* Paylaşım menüsü (telefonda WhatsApp dahil) açılır; desteklenmezse dosya indirilir.
   Safari kullanıcı dokunuşuna bağlı kalabilmek için bu fonksiyonun başında await olmamalı. */
function shareRecording(r, studentName, text) {
  const file = new File([r.blob], recFileName(r, studentName), { type: r.type.split(';')[0] || r.blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    return navigator.share({ files: [file], text })
      .then(() => 'shared')
      .catch(e => e.name === 'AbortError' ? 'cancel' : downloadFile(file));
  }
  return Promise.resolve(downloadFile(file));
}
function downloadFile(file) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: file.name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  return 'downloaded';
}

async function decodeShare(code) {
  const bytes = unb64url(code.slice(1));
  const raw = code[0] === 'z' ? await pipeBytes(bytes, new DecompressionStream('deflate-raw')) : bytes;
  return JSON.parse(new TextDecoder().decode(raw));
}
const badge = st => `<span class="badge b-${st}">${STATUS[st]}</span>`;
const balanceHtml = b => b === 0 ? `<span class="muted">${money(0)}</span>`
  : `<span class="${b < 0 ? 'neg' : 'pos'} num">${b < 0 ? '−' : '+'}${money(Math.abs(b))}</span>`;

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ================= Modal ================= */

const modal = document.getElementById('modal');
const modalForm = document.getElementById('modal-form');
let modalSubmit = null;
let modalCleanup = null; // kamera/mikrofon gibi kaynakları modal kapanınca bırakmak için
function runModalCleanup() { const fn = modalCleanup; modalCleanup = null; fn?.(); }
modal.addEventListener('cancel', runModalCleanup); // Esc ile kapatma

function openModal({ title, body, submitLabel = 'Kaydet', onSubmit, extraButtons = '' }) {
  runModalCleanup();
  if (modal.open) modal.close();
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = body;
  document.getElementById('modal-foot').innerHTML =
    `${extraButtons}<span class="spacer"></span><button type="button" data-close>Vazgeç</button>` +
    (onSubmit ? `<button type="submit" class="primary">${submitLabel}</button>` : '');
  modalSubmit = onSubmit;
  modal.showModal();
  const first = modal.querySelector('.modal-body input, .modal-body select, .modal-body textarea');
  if (first) first.focus();
}
function closeModal() { runModalCleanup(); modal.close(); modalSubmit = null; }

modalForm.addEventListener('submit', e => {
  e.preventDefault();
  if (!modalSubmit) return closeModal();
  const data = Object.fromEntries(new FormData(modalForm));
  if (modalSubmit(data) !== false) { closeModal(); render(); }
});
modal.addEventListener('click', e => {
  if (e.target.closest('[data-close]') || e.target === modal) closeModal();
});

/* ================= Formlar ================= */

function studentForm(s = {}) {
  const isNew = !s.id;
  openModal({
    title: isNew ? 'Yeni öğrenci' : 'Öğrenciyi düzenle',
    submitLabel: isNew ? 'Ekle' : 'Kaydet',
    extraButtons: isNew ? '' : `<button type="button" class="danger" id="del-student">Sil</button>`,
    body: `
      <div class="form-grid">
        <label class="field full">Ad soyad<input name="name" required value="${esc(s.name)}" /></label>
        <label class="field">Çalgı<select name="instrument" id="f-instr">${instrumentOptions(s.instrument || 'Piyano')}</select></label>
        <label class="field">Seviye<select name="level">${options(LEVELS, s.level || 'Başlangıç')}</select></label>
        <label class="field full" id="f-other-wrap" ${s.instrument && !INSTRUMENTS.includes(s.instrument) ? '' : 'hidden'}>Çalgı adı
          <input name="instrumentOther" id="f-other" value="${esc(s.instrument && !INSTRUMENTS.includes(s.instrument) ? s.instrument : '')}" placeholder="Örn. Santur, Çeng, Yaylı tambur" /></label>
        <label class="field">Öğrenci telefonu<input name="phone" type="tel" value="${esc(s.phone)}" placeholder="0532 000 00 00" /></label>
        <span class="hide-sm"></span>
        <label class="field">Veli adı (opsiyonel)<input name="parent" value="${esc(s.parent)}" /></label>
        <label class="field">Veli telefonu<input name="parentPhone" type="tel" value="${esc(s.parentPhone)}" /></label>
        <label class="field">Ders ücreti (₺)<input name="fee" type="number" min="0" step="10" required value="${esc(s.fee ?? '')}" /></label>
        <label class="field">Ders süresi (dk)<input name="duration" type="number" min="15" step="5" value="${esc(s.duration ?? 45)}" /></label>
        <label class="field">Sabit ders günü
          <select name="weeklyDay"><option value="">— Yok —</option>
            ${DAYS.map((d, i) => `<option value="${i}" ${String(s.weeklyDay) === String(i) ? 'selected' : ''}>${d}</option>`).join('')}
          </select></label>
        <label class="field">Sabit ders saati<input name="weeklyTime" type="time" value="${esc(s.weeklyTime || '')}" /></label>
        <label class="field full">Notlar<textarea name="notes" placeholder="Hedefler, kullandığı metot kitabı, dikkat edilecekler…">${esc(s.notes)}</textarea></label>
      </div>`,
    onSubmit: d => {
      const instrument = d.instrument === '__other' ? d.instrumentOther.trim() : d.instrument;
      if (!instrument) { toast('Çalgı adını yazın'); return false; }
      const rec = {
        ...s,
        name: d.name.trim(), instrument, level: d.level, phone: d.phone.trim(),
        parent: d.parent.trim(), parentPhone: d.parentPhone.trim(), fee: +d.fee || 0, duration: +d.duration || 45,
        weeklyDay: d.weeklyDay === '' ? null : +d.weeklyDay, weeklyTime: d.weeklyTime, notes: d.notes,
      };
      if (!rec.name) return false;
      if (isNew) { rec.id = uid(); rec.active = true; rec.createdAt = today(); db.students.push(rec); }
      else Object.assign(student(s.id), rec);
      save();
      toast(isNew ? 'Öğrenci eklendi' : 'Öğrenci güncellendi');
    },
  });
  document.getElementById('f-instr').onchange = e => {
    const other = e.target.value === '__other';
    document.getElementById('f-other-wrap').hidden = !other;
    if (other) document.getElementById('f-other').focus();
  };
  const del = document.getElementById('del-student');
  if (del) del.onclick = () => {
    if (!confirm(`${s.name} ve tüm ders/ödeme kayıtları silinsin mi?`)) return;
    db.students = db.students.filter(x => x.id !== s.id);
    db.lessons = db.lessons.filter(x => x.studentId !== s.id);
    db.payments = db.payments.filter(x => x.studentId !== s.id);
    db.checkins = db.checkins.filter(x => x.studentId !== s.id);
    save(); closeModal(); location.hash = '#/ogrenciler'; toast('Öğrenci silindi');
  };
}

function lessonForm(l = {}, defaults = {}) {
  const isNew = !l.id;
  const active = db.students.filter(s => s.active !== false);
  if (!active.length) { toast('Önce bir öğrenci ekleyin'); return studentForm(); }
  const v = { date: today(), time: '15:00', status: 'planned', ...defaults, ...l };
  const st = student(v.studentId) || active[0];
  openModal({
    title: isNew ? 'Ders ekle' : `Ders · ${st.name}`,
    submitLabel: isNew ? 'Ekle' : 'Kaydet',
    extraButtons: isNew ? '' : `<button type="button" class="danger" id="del-lesson">Sil</button>`,
    body: `
      <div class="form-grid">
        <label class="field full">Öğrenci<select name="studentId" id="f-student">
          ${active.map(s => `<option value="${s.id}" ${s.id === st.id ? 'selected' : ''}>${esc(s.name)} · ${esc(s.instrument)}</option>`).join('')}
        </select></label>
        <label class="field">Tarih<input name="date" type="date" required value="${v.date}" /></label>
        <label class="field">Saat<input name="time" type="time" required value="${v.time}" /></label>
        <label class="field">Süre (dk)<input name="duration" type="number" min="15" step="5" value="${v.duration ?? st.duration ?? 45}" /></label>
        <label class="field">Ücret (₺)<input name="fee" id="f-fee" type="number" min="0" step="10" value="${v.fee ?? st.fee ?? 0}" /></label>
        <div class="field full">Durum
          <div class="status-pick">
            ${Object.entries(STATUS).map(([k, t]) => `<label><input type="radio" name="status" value="${k}" ${k === v.status ? 'checked' : ''}/><span>${t}</span></label>`).join('')}
          </div>
        </div>
        <label class="field full">Bu derste çalışılanlar<textarea name="topic" placeholder="Örn. Do majör gam, Czerny op.599 no.12…">${esc(v.topic)}</textarea></label>
        <label class="field full">Ödev / haftaya çalışılacak<textarea name="homework" placeholder="Örn. Günde 20 dk, sol el yavaş tempo…">${esc(v.homework)}</textarea></label>
      </div>`,
    onSubmit: d => {
      const rec = { ...l, studentId: d.studentId, date: d.date, time: d.time, duration: +d.duration || 45,
        fee: +d.fee || 0, status: d.status, topic: d.topic, homework: d.homework };
      if (isNew) { rec.id = uid(); db.lessons.push(rec); }
      else Object.assign(db.lessons.find(x => x.id === l.id), rec);
      save();
      toast(isNew ? 'Ders eklendi' : 'Ders güncellendi');
    },
  });
  if (isNew) document.getElementById('f-student').onchange = e => {
    const s = student(e.target.value);
    document.getElementById('f-fee').value = s.fee;
    modal.querySelector('[name=duration]').value = s.duration;
  };
  const del = document.getElementById('del-lesson');
  if (del) del.onclick = () => {
    if (!confirm('Bu ders silinsin mi?')) return;
    db.lessons = db.lessons.filter(x => x.id !== l.id);
    save(); closeModal(); render(); toast('Ders silindi');
  };
}

function paymentForm(p = {}, defaults = {}) {
  const isNew = !p.id;
  if (!db.students.length) { toast('Önce bir öğrenci ekleyin'); return studentForm(); }
  const v = { date: today(), method: 'Nakit', ...defaults, ...p };
  const sid = v.studentId || db.students[0].id;
  const suggested = v.amount ?? (Math.max(0, -balanceOf(sid)) || '');
  openModal({
    title: isNew ? 'Ödeme al' : 'Ödemeyi düzenle',
    submitLabel: isNew ? 'Kaydet' : 'Güncelle',
    extraButtons: isNew ? '' : `<button type="button" class="danger" id="del-pay">Sil</button>`,
    body: `
      <div class="form-grid">
        <label class="field full">Öğrenci<select name="studentId" id="p-student">
          ${db.students.map(s => `<option value="${s.id}" ${s.id === sid ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
        </select></label>
        <label class="field">Tutar (₺)<input name="amount" id="p-amount" type="number" min="1" step="10" required value="${suggested}" /></label>
        <label class="field">Tarih<input name="date" type="date" required value="${v.date}" /></label>
        <label class="field">Yöntem<select name="method">${options(METHODS, v.method)}</select></label>
        <label class="field">Not<input name="note" value="${esc(v.note)}" placeholder="Örn. 4 derslik paket" /></label>
        <p class="full small muted" id="p-hint"></p>
      </div>`,
    onSubmit: d => {
      const rec = { ...p, studentId: d.studentId, amount: +d.amount, date: d.date, method: d.method, note: d.note };
      if (!(rec.amount > 0)) return false;
      if (isNew) { rec.id = uid(); db.payments.push(rec); }
      else Object.assign(db.payments.find(x => x.id === p.id), rec);
      save(); toast('Ödeme kaydedildi');
    },
  });
  const hint = () => {
    const b = balanceOf(document.getElementById('p-student').value);
    document.getElementById('p-hint').innerHTML = `Güncel bakiye: ${balanceHtml(b)}`;
  };
  hint();
  document.getElementById('p-student').onchange = e => {
    hint();
    if (isNew) document.getElementById('p-amount').value = Math.max(0, -balanceOf(e.target.value)) || '';
  };
  const del = document.getElementById('del-pay');
  if (del) del.onclick = () => {
    if (!confirm('Bu ödeme silinsin mi?')) return;
    db.payments = db.payments.filter(x => x.id !== p.id);
    save(); closeModal(); render(); toast('Ödeme silindi');
  };
}

function setStatus(id, status) {
  const l = db.lessons.find(x => x.id === id);
  if (!l) return;
  l.status = status;
  save(); render();
  toast(`${student(l.studentId)?.name}: ${STATUS[status]}`);
}

/* ---------- Öğrenci & veli iletişimi ---------- */

function sharePayload(s, includeBalance) {
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

async function shareForm(s) {
  if (!db.profile.name) toast('İpucu: Ayarlar’dan adınızı ve telefonunuzu girin, bağlantıda görünsün');
  openModal({
    title: `${s.name} · Öğrenci & veli sayfası`,
    body: `
      <p class="small muted" style="margin-top:0">
        Öğrenci ve veli bu bağlantıyla sıradaki dersi, ödevleri ve ders geçmişini görür; günlük çalışmasını kaydedip size WhatsApp’tan gönderebilir.
        Bağlantı oluşturulduğu anın özetini taşır — ödev verdikten sonra yeni bağlantı gönderin.
      </p>
      <label class="row small" style="margin:10px 0"><input type="checkbox" id="sh-bal" style="width:auto" checked /> Ödeme / bakiye bilgisini ekle (veli için)</label>
      <label class="field">Bağlantı<input id="sh-link" readonly /></label>
      <div class="row" style="margin-top:12px">
        <button type="button" id="sh-copy">Kopyala</button>
        <a class="btn" id="sh-open" target="_blank" rel="noopener">Önizle ↗</a>
        ${s.phone ? `<a class="btn" id="sh-wa-s" target="_blank" rel="noopener">WhatsApp · Öğrenci</a>` : ''}
        ${s.parentPhone ? `<a class="btn" id="sh-wa-p" target="_blank" rel="noopener">WhatsApp · Veli</a>` : ''}
      </div>
      <p class="small muted">Bağlantıdaki bilgiler herhangi bir sunucuya kaydedilmez; ancak bağlantıya sahip olan herkes görebilir.</p>`,
  });
  const update = async () => {
    const code = await encodeShare(sharePayload(s, document.getElementById('sh-bal').checked));
    const url = `${location.origin}${location.pathname}#/p/${code}`;
    document.getElementById('sh-link').value = url;
    document.getElementById('sh-open').href = url;
    const teacher = db.profile.name ? `${db.profile.name} ` : '';
    const msg = n => `Merhaba ${n}, ${firstName(s.name)} için ders sayfası: ödevler, sıradaki ders ve çalışma günlüğü burada 🎵\n${url}\n${teacher}`.trim();
    const ws = document.getElementById('sh-wa-s'); if (ws) ws.href = waLink(s.phone, msg(firstName(s.name)));
    const wp = document.getElementById('sh-wa-p'); if (wp) wp.href = waLink(s.parentPhone, msg(s.parent ? firstName(s.parent) : ''));
  };
  document.getElementById('sh-bal').onchange = update;
  document.getElementById('sh-copy').onclick = () => copyText(document.getElementById('sh-link').value);
  await update();
}

const TEMPLATES = {
  reminder: {
    label: 'Ders hatırlatma',
    text: (s, to) => {
      const next = lessonsOf(s.id).filter(l => l.date >= today() && l.status === 'planned').sort(byDateTime)[0];
      const when = next ? `${parseYmd(next.date).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })} saat ${next.time}` : '…';
      return to === 'parent'
        ? `Merhaba ${firstName(s.parent)}, ${genitive(firstName(s.name))} ${s.instrument.toLocaleLowerCase('tr')} dersi: ${when}. Görüşmek üzere 🎵`
        : `Merhaba ${firstName(s.name)}, ${s.instrument.toLocaleLowerCase('tr')} dersimiz: ${when}. Çalgını ve notalarını unutma 🎵`;
    },
  },
  homework: {
    label: 'Ödev bildirimi',
    text: (s, to) => {
      const l = lessonsOf(s.id).filter(x => x.status === 'done').sort(byDateTime).pop();
      const topic = l?.topic ? `Bugün çalıştıklarımız: ${l.topic}\n` : '';
      const hw = l?.homework || '…';
      return to === 'parent'
        ? `Merhaba ${firstName(s.parent)}, ${firstName(s.name)} bugün güzel çalıştı.\n${topic}Haftaya kadar ödevi: ${hw}\nEvde düzenli çalışması için desteğiniz çok değerli 🙏`
        : `Merhaba ${firstName(s.name)}, eline sağlık!\n${topic}Haftaya ödevin: ${hw}\nHer gün az da olsa çalışmayı unutma 🎶`;
    },
  },
  nudge: {
    label: 'Kayıt iste',
    text: (s, to) => {
      const hw = lastHomework(s.id)?.homework;
      const what = hw ? `bu haftaki ödevini (${hw.split('\n')[0]})` : 'bu haftaki ödevini';
      return to === 'parent'
        ? `Merhaba ${firstName(s.parent)}, ${genitive(firstName(s.name))} ${what} çalışırken kısa bir ses ya da video kaydı alıp bana göndermesini rica ediyorum. Ders sayfasındaki “Ödevini kaydet” bölümünden kolayca gönderebilir 🎵`
        : `Merhaba ${firstName(s.name)}, ${what} çalışırken kısa bir ses ya da video kaydı alıp bana gönderir misin? Ders sayfandaki “Ödevini kaydet” bölümünden tek dokunuşla gönderebilirsin 🎵`;
    },
  },
  payment: {
    label: 'Ödeme hatırlatma',
    text: (s, to) => {
      const b = balanceOf(s.id);
      const n = to === 'parent' ? firstName(s.parent) : firstName(s.name);
      return `Merhaba ${n}, ${genitive(firstName(s.name))} ders ücretlerinden ${money(Math.max(0, -b))} tutarında bakiye bulunuyor. Uygun olduğunuzda ödeme yapabilirseniz sevinirim. Teşekkürler 🙏`;
    },
  },
};

function messageForm(s, key) {
  const tpl = TEMPLATES[key];
  if (key === 'payment' && balanceOf(s.id) >= 0) { toast('Bu öğrencinin ödenmemiş bakiyesi yok'); return; }
  const targets = [s.parentPhone && ['parent', `Veli${s.parent ? ' · ' + s.parent : ''}`], s.phone && ['student', `Öğrenci · ${s.name}`]].filter(Boolean);
  if (!targets.length) { toast('Önce öğrenci veya veli telefonu ekleyin'); return studentForm(s); }
  openModal({
    title: tpl.label,
    body: `
      <div class="form-grid">
        <label class="field full">Kime<select id="m-to">${targets.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join('')}</select></label>
        <label class="field full">Mesaj<textarea id="m-text" style="min-height:130px"></textarea></label>
      </div>
      <div class="row" style="margin-top:12px">
        <a class="btn primary-link" id="m-wa" target="_blank" rel="noopener">WhatsApp’ta aç ↗</a>
        <button type="button" id="m-copy">Kopyala</button>
      </div>
      <p class="small muted">Mesaj WhatsApp’ta açılır; göndermeden önce düzenleyebilirsiniz.</p>`,
  });
  const to = document.getElementById('m-to'), text = document.getElementById('m-text'), wa = document.getElementById('m-wa');
  const phone = () => to.value === 'parent' ? s.parentPhone : s.phone;
  const sync = () => { wa.href = waLink(phone(), text.value); };
  const fill = () => { text.value = tpl.text(s, to.value); sync(); };
  to.onchange = fill; text.oninput = sync;
  document.getElementById('m-copy').onclick = () => copyText(text.value);
  fill();
}

/* Öğrenciden hafta içi ödev kaydı geldiğinde öğretmen işaretler ve geri bildirim yazar. */
function checkinForm(s, c = {}) {
  const isNew = !c.id;
  openModal({
    title: isNew ? `${firstName(s.name)} · ödev kaydı geldi` : 'Ödev kaydı',
    submitLabel: isNew ? 'Kaydet' : 'Güncelle',
    extraButtons: isNew ? '' : `<button type="button" class="danger" id="del-checkin">Sil</button>`,
    body: `
      <div class="form-grid">
        <label class="field">Tarih<input name="date" type="date" required value="${c.date || today()}" /></label>
        <label class="field">Tür<select name="kind">${Object.entries(KINDS).map(([k, t]) => `<option value="${k}" ${k === (c.kind || 'video') ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <div class="field full">Değerlendirme
          <div class="status-pick">
            ${['👏 Çok iyi', '👍 İyi', '🔁 Tekrar çalışmalı'].map(v => `<label><input type="radio" name="rating" value="${v}" ${v === (c.rating || '👍 İyi') ? 'checked' : ''}/><span>${v}</span></label>`).join('')}
          </div>
        </div>
        <label class="field full">Geri bildirim<textarea name="note" placeholder="Örn. Tempo çok daha oturmuş. 2. satırdaki geçişte sol eli biraz daha yavaş çalış.">${esc(c.note)}</textarea></label>
      </div>
      <p class="small muted">Kaydettikten sonra geri bildirimi WhatsApp’tan gönderebilirsiniz. Yeni öğrenci bağlantısında da görünür.</p>`,
    onSubmit: d => {
      const rec = { ...c, studentId: s.id, date: d.date, kind: d.kind, rating: d.rating, note: d.note.trim() };
      if (isNew) { rec.id = uid(); db.checkins.push(rec); }
      else Object.assign(db.checkins.find(x => x.id === c.id), rec);
      save(); toast('Ödev kaydı işlendi');
    },
  });
  const del = document.getElementById('del-checkin');
  if (del) del.onclick = () => {
    db.checkins = db.checkins.filter(x => x.id !== c.id);
    save(); closeModal(); render(); toast('Silindi');
  };
}
const feedbackText = (s, c) =>
  `Merhaba ${firstName(s.name)}, ${fmtDateShort(c.date)} tarihli ${c.kind === 'audio' ? 'ses kaydını' : 'videonu'} dinledim: ${c.rating || ''}\n${c.note || ''}`.trim();

/* Son dersten bu yana kayıt gönderilmiş mi? (hafta içi takip) */
function weeklyTracking() {
  return db.students.filter(s => s.active !== false).map(s => {
    const hw = lastHomework(s.id);
    if (!hw) return null;
    const got = checkinsOf(s.id).filter(c => c.date >= hw.date).sort((a, b) => b.date.localeCompare(a.date));
    return { s, hw, got };
  }).filter(Boolean);
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
  save(); render();
  toast(added ? `${added} ders programa eklendi` : 'Eklenecek yeni ders yok');
}

/* ================= Görünümler ================= */

const view = document.getElementById('view');

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

function renderDashboard() {
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

let weekOffset = 0;

function renderCalendar() {
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

let studentQuery = '';

function renderStudents() {
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

function renderStudent(id) {
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

let paymentMonth = today().slice(0, 7);

function renderPayments() {
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

function renderSettings() {
  view.innerHTML = `
    <div class="page-head"><div><h1>Ayarlar</h1><p class="muted">Veriler yalnızca bu tarayıcıda saklanır.</p></div></div>
    <div class="grid" style="max-width:640px">
      <section class="card">
        <h3>Öğretmen profili</h3>
        <p class="small muted">Öğrenci/veli sayfasında ve mesajlarda görünür; öğrenciler çalışmalarını bu numaraya gönderir.</p>
        <div class="form-grid">
          <label class="field">Adınız<input id="pr-name" value="${esc(db.profile.name)}" placeholder="Örn. Ayşe Hoca" /></label>
          <label class="field">WhatsApp numaranız<input id="pr-phone" type="tel" value="${esc(db.profile.phone)}" placeholder="0532 000 00 00" /></label>
        </div>
        <button style="margin-top:12px" data-action="save-profile">Kaydet</button>
      </section>
      <section class="card">
        <h3>Yedekleme</h3>
        <p class="small muted">Verilerinizi JSON dosyası olarak indirip başka bir cihazda geri yükleyebilirsiniz.</p>
        <div class="row">
          <button data-action="export">⬇ Yedeği indir</button>
          <label class="btn" style="cursor:pointer">⬆ Yedekten yükle<input type="file" id="import" accept="application/json" hidden /></label>
        </div>
      </section>
      <section class="card">
        <h3>Örnek veri</h3>
        <p class="small muted">Uygulamayı denemek için birkaç örnek öğrenci, ders ve ödeme ekler.</p>
        <button data-action="seed">Örnek veri yükle</button>
      </section>
      <section class="card">
        <h3>Sıfırla</h3>
        <p class="small muted">Tüm öğrenci, ders ve ödeme kayıtlarını siler. Geri alınamaz.</p>
        <button class="danger" data-action="reset">Tüm verileri sil</button>
      </section>
    </div>`;
  view.querySelector('[data-action=save-profile]').onclick = () => {
    db.profile = { name: document.getElementById('pr-name').value.trim(), phone: document.getElementById('pr-phone').value.trim() };
    save(); toast('Profil kaydedildi');
  };
  view.querySelector('[data-action=export]').onclick = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `ders-defteri-${today()}.json` });
    a.click(); URL.revokeObjectURL(a.href);
  };
  document.getElementById('import').onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const data = normalize(JSON.parse(await f.text()));
      if (!confirm(`${data.students.length} öğrenci, ${data.lessons.length} ders yüklenecek. Mevcut veriler değiştirilsin mi?`)) return;
      db = data; save(); toast('Yedek yüklendi'); location.hash = '#/';
    } catch { toast('Dosya okunamadı'); }
  };
  view.querySelector('[data-action=seed]').onclick = () => {
    if (db.students.length && !confirm('Örnek veriler mevcut kayıtlara eklensin mi?')) return;
    seed(); save(); toast('Örnek veri yüklendi'); location.hash = '#/';
  };
  view.querySelector('[data-action=reset]').onclick = () => {
    if (!confirm('Tüm veriler silinsin mi? Bu işlem geri alınamaz.')) return;
    db = normalize({}); save(); toast('Veriler silindi'); render();
  };
}

function seed() {
  const mon = mondayOf(new Date());
  const created = ymd(addDays(mon, -28));
  if (!db.profile.name) db.profile = { name: 'Ayşe Hoca', phone: '0532 000 00 00' };
  const people = [
    ['Elif Yıldız', 'Piyano', 'Orta', 1200, 0, '16:00', 'Ayşe Yıldız'],
    ['Can Demir', 'Klasik gitar', 'Başlangıç', 1000, 1, '18:30', ''],
    ['Zeynep Kaya', 'Keman', 'Başlangıç', 1100, 2, '17:00', 'Murat Kaya'],
    ['Mert Aksoy', 'Bağlama (Saz)', 'İleri', 1000, 3, '19:00', ''],
    ['Deniz Şahin', 'Ud', 'Başlangıç', 1200, 5, '11:00', 'Selin Şahin'],
    ['Ali Arslan', 'Ney', 'Orta', 1100, 5, '14:00', 'Fatma Arslan'],
    ['Nur Öztürk', 'Kanun', 'Başlangıç', 1300, 4, '17:30', 'Hakan Öztürk'],
  ];
  const topics = {
    Piyano: ['Do majör gam, iki el', 'Burgmüller op.100 no.2', 'Pedal kullanımı', 'Deşifre çalışması'],
    'Klasik gitar': ['Temel akorlar: Em, Am, C, G', 'Ritim kalıbı: aşağı-aşağı-yukarı', 'Barre akora giriş', 'Carcassi etüt no.1'],
    Keman: ['Yay tutuşu ve boş teller', 'Re majör gam', 'Suzuki kitap 1: Twinkle', 'Entonasyon egzersizi'],
    'Bağlama (Saz)': ['Hicaz makamı dizisi', 'Şelpe tekniği', 'Türkü: Uzun İnce Bir Yoldayım', 'Tavır çalışması'],
    Ud: ['Mızrap tutuşu, tek-çift mızrap', 'Rast makamı dizisi', 'Sofyan usulü ile saz semaisi girişi', 'Nihavend longa, ilk hane'],
    Ney: ['Nefes ve dudak pozisyonu', 'Uşşak dizisi, uzun sesler', 'Taksim cümleleri: Hüseyni', 'Peşrev, teslim bölümü'],
    Kanun: ['Mandal kullanımı', 'Rast dizisi, iki el', 'Tremolo tekniği', 'Hicaz saz semaisi, 1. hane'],
  };
  const hws = ['Günde 20 dk, yavaş tempoda metronomla', 'Geçen haftaki parçayı ezberle', 'Gamları 3 kez temiz çal', 'Kayıt alıp dinle'];
  people.forEach(([name, instrument, level, fee, day, time, parent], i) => {
    const id = uid();
    db.students.push({ id, name, instrument, level, fee, duration: 45, weeklyDay: day, weeklyTime: time,
      phone: `0532 ${100 + i * 37} ${10 + i * 11} ${20 + i * 7}`, parent,
      parentPhone: parent ? `0533 ${200 + i * 29} ${30 + i * 9} ${40 + i * 5}` : '',
      notes: TRADITIONAL.has(instrument) ? 'Nota yanında kulaktan meşk ile ilerliyoruz.' : '', active: true, createdAt: created });
    for (let w = -4; w <= 1; w++) {
      const date = ymd(addDays(mon, w * 7 + day));
      const past = date < today();
      let status = past ? 'done' : 'planned';
      if (past && (i + w) % 7 === 0) status = 'noshow';
      if (past && (i * 3 + w) % 9 === 0) status = 'cancelled';
      const k = (w + 4 + i) % 4;
      db.lessons.push({ id: uid(), studentId: id, date, time, duration: 45, fee, status,
        topic: status === 'done' ? topics[instrument][k] : '', homework: status === 'done' ? hws[k] : '' });
    }
    // Hafta içi ödev kayıtları: bazı öğrenciler göndermiş, bazıları bekleniyor.
    const lastDone = db.lessons.filter(l => l.studentId === id && l.status === 'done').sort(byDateTime).pop();
    if (lastDone && i % 2 === 0) {
      db.checkins.push({ id: uid(), studentId: id, date: ymd(addDays(parseYmd(lastDone.date), 2)) > today() ? today() : ymd(addDays(parseYmd(lastDone.date), 2)),
        kind: i % 4 === 0 ? 'video' : 'audio', rating: i === 4 ? '👏 Çok iyi' : '👍 İyi',
        note: i === 4 ? 'Mızrap çok daha düzenli olmuş, tebrikler! Şimdi tempoyu biraz artır.' : 'Güzel ilerleme. İkinci bölümde tempo hızlanıyor, metronomla çalış.' });
    }
    const pays = i === 1 ? 1 : i === 3 ? 2 : 4;
    for (let p = 0; p < pays; p++) {
      db.payments.push({ id: uid(), studentId: id, amount: fee, date: ymd(addDays(mon, -26 + p * 7 + i)),
        method: METHODS[(i + p) % 3], note: '' });
    }
  });
}

/* ================= Öğrenci & veli sayfası ================= */

const portal = { code: null, data: null, tab: 'student' };
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

async function renderPortal(code) {
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

async function saveRec(rec) {
  try { await recStore.put(rec); }
  catch { toast('Kayıt bu cihaza saklanamadı; yine de gönderebilirsin'); }
}

function sendRec(rec, ctx) {
  const { P, hwLesson, teacher } = ctx;
  const hocam = teacher.n ? `${firstName(teacher.n)} Hocam` : 'Hocam';
  const text = `Merhaba ${hocam}, ${hwLesson ? `ödevimin kaydı (${hwLesson.homework.split('\n')[0]})` : 'ödev kaydım'} 🎵` +
    `${rec.note ? `\nNot: ${rec.note}` : ''}\n— ${P.s.n}`;
  // Paylaşım menüsü kullanıcı dokunuşuyla açılmalı: öncesinde await yok.
  shareRecording(rec, P.s.n, text).then(async res => {
    if (res === 'cancel') return;
    rec.sent = true; rec.sentAt = new Date().toISOString();
    await saveRec(rec);
    renderPortal(ctx.code);
    if (res === 'shared') { toast('Gönderildi 🎉'); return; }
    openModal({
      title: 'Kayıt indirildi',
      body: `
        <p style="margin-top:0">Bu tarayıcı doğrudan paylaşımı desteklemiyor, bu yüzden kayıt cihazına indirildi.</p>
        <ol class="small" style="padding-left:18px">
          <li>WhatsApp’ta ${teacher.n ? esc(teacher.n) + ' ile' : 'öğretmeninle'} sohbeti aç.</li>
          <li>📎 simgesine dokunup indirilen <strong>${esc(recFileName(rec, P.s.n))}</strong> dosyasını ekle.</li>
        </ol>
        ${teacher.p ? `<a class="btn wa-btn" target="_blank" rel="noopener" href="${waLink(teacher.p, text)}">WhatsApp sohbetini aç ↗</a>` : ''}`,
    });
  });
}

function openRecorder(kind, ctx) {
  const isVideo = kind === 'video';
  openModal({
    title: isVideo ? '🎥 Görüntülü kayıt' : '🎙 Ses kaydı',
    body: `
      <div class="recorder">
        ${isVideo ? '<video id="rc-live" autoplay muted playsinline></video>'
          : '<div class="rc-mic"><div class="rc-level" id="rc-level"></div><span>🎙</span></div>'}
        <div class="rc-timer num" id="rc-timer">0:00</div>
        <p class="small muted" id="rc-msg">${isVideo ? 'Kamera ve mikrofon' : 'Mikrofon'} izni isteniyor…</p>
        <div class="row" style="justify-content:center">
          ${isVideo ? '<button type="button" id="rc-flip">↺ Kamerayı çevir</button>' : ''}
          <button type="button" class="primary rc-btn" id="rc-toggle" disabled>● Kayda başla</button>
        </div>
        <p class="small muted">İpucu: Çalgının sesi net duyulsun diye telefonu 1–2 metre uzağa koy.</p>
      </div>`,
  });
  const $ = id => document.getElementById(id);
  const MAX_SEC = 10 * 60;
  let stream = null, recorder = null, chunks = [], t0 = 0, tick = null, raf = null, actx = null;
  let cancelled = false, facing = 'user';

  const stopStream = () => { stream?.getTracks().forEach(t => t.stop()); stream = null; };
  const cleanup = () => {
    cancelled = true;
    clearInterval(tick); cancelAnimationFrame(raf);
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    stopStream(); actx?.close().catch(() => {});
  };
  modalCleanup = cleanup;

  async function startStream() {
    stopStream();
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        // Müzik kaydı için tarayıcının konuşma filtrelerini kapat: yoksa çalgı sesi bastırılır.
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        video: isVideo ? { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      });
    } catch (e) {
      $('rc-msg').textContent = e.name === 'NotAllowedError'
        ? 'İzin verilmedi. Tarayıcı ayarlarından mikrofon/kamera iznini aç ya da kaydı telefonunla çekip “kayıt seç” ile ekle.'
        : 'Kamera/mikrofon açılamadı. Kaydı telefonunla çekip “kayıt seç” ile ekleyebilirsin.';
      return;
    }
    if (cancelled) return stopStream();
    if (isVideo) {
      $('rc-live').srcObject = stream;
      $('rc-live').style.transform = facing === 'user' ? 'scaleX(-1)' : 'none'; // ön kamera ayna gibi
    }
    else meter();
    $('rc-msg').textContent = 'Hazır olduğunda kayda başla.';
    $('rc-toggle').disabled = false;
  }

  function meter() {
    try {
      actx = new AudioContext();
      const an = actx.createAnalyser(); an.fftSize = 512;
      actx.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.fftSize);
      const loop = () => {
        an.getByteTimeDomainData(buf);
        let peak = 0; for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        const el = $('rc-level'); if (!el) return;
        el.style.transform = `scale(${1 + Math.min(1, peak / 64) * 0.6})`;
        raf = requestAnimationFrame(loop);
      };
      loop();
    } catch { /* seviye göstergesi opsiyonel */ }
  }

  function begin() {
    const mimeType = pickMime(kind);
    try {
      recorder = new MediaRecorder(stream, { ...(mimeType && { mimeType }), audioBitsPerSecond: 128000, videoBitsPerSecond: 2_000_000 });
    } catch { recorder = new MediaRecorder(stream); }
    chunks = [];
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = async () => {
      if (cancelled) return;
      const dur = (Date.now() - t0) / 1000;
      const type = recorder.mimeType || mimeType || (isVideo ? 'video/webm' : 'audio/webm');
      const rec = { id: uid(), sid: ctx.P.id, kind, blob: new Blob(chunks, { type }), type,
        created: new Date().toISOString(), dur, note: '', sent: false };
      await saveRec(rec);
      openReview(rec, ctx);
    };
    recorder.start(1000);
    t0 = Date.now();
    $('rc-toggle').textContent = '■ Bitir';
    $('rc-toggle').classList.add('is-rec');
    $('rc-msg').textContent = 'Kaydediliyor…';
    const flip = $('rc-flip'); if (flip) flip.disabled = true;
    tick = setInterval(() => {
      const s = (Date.now() - t0) / 1000;
      $('rc-timer').textContent = fmtDur(s);
      if (s >= MAX_SEC) finish();
    }, 250);
  }
  function finish() {
    clearInterval(tick);
    $('rc-toggle').disabled = true;
    $('rc-msg').textContent = 'Kayıt hazırlanıyor…';
    recorder.stop();
  }

  $('rc-toggle').onclick = () => (recorder?.state === 'recording' ? finish() : begin());
  const flip = $('rc-flip');
  if (flip) flip.onclick = () => { facing = facing === 'user' ? 'environment' : 'user'; startStream(); };
  startStream();
}

function openReview(rec, ctx) {
  const url = URL.createObjectURL(rec.blob);
  openModal({
    title: 'Kaydını dinle',
    submitLabel: 'Hocama gönder ↗',
    extraButtons: canRecord() ? `<button type="button" id="rv-again">↺ Yeniden çek</button>` : '',
    body: `
      ${rec.kind === 'audio' ? `<audio controls src="${url}" style="width:100%"></audio>`
        : `<video controls playsinline src="${url}" class="rv-video"></video>`}
      <p class="small muted" style="margin:6px 0 12px">${rec.dur ? fmtDur(rec.dur) + ' · ' : ''}${fmtSize(rec.blob.size)}${rec.blob.size > 60 * 1048576 ? ' — dosya büyük, göndermek uzun sürebilir' : ''}</p>
      <label class="field">Hocana not (opsiyonel)<input name="note" value="${esc(rec.note)}" placeholder="Örn. 2. satırdaki geçişte zorlandım" /></label>
      <p class="small muted">Kayıt bu cihazda saklandı. “Vazgeç” dersen daha sonra listeden gönderebilirsin.</p>`,
    onSubmit: d => {
      rec.note = (d.note || '').trim();
      sendRec(rec, ctx);
    },
  });
  modalCleanup = () => { URL.revokeObjectURL(url); renderPortal(ctx.code); };
  const again = document.getElementById('rv-again');
  if (again) again.onclick = async () => {
    await recStore.del(rec.id).catch(() => {});
    openRecorder(rec.kind, ctx);
  };
}

/* ================= Yönlendirme ================= */

const routes = [
  [/^#?\/?$/, 'dashboard', renderDashboard],
  [/^#\/takvim$/, 'calendar', renderCalendar],
  [/^#\/ogrenciler$/, 'students', renderStudents],
  [/^#\/ogrenci\/(.+)$/, 'students', m => renderStudent(m[1])],
  [/^#\/odemeler$/, 'payments', renderPayments],
  [/^#\/ayarlar$/, 'settings', renderSettings],
];

function render() {
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
  if (d.week !== undefined) { weekOffset = d.week === '0' ? 0 : weekOffset + +d.week; return renderCalendar(); }
  if (d.addOn) return lessonForm({}, { date: d.addOn });
  if (d.action === 'add-lesson') return lessonForm();
  if (d.action === 'add-student') return studentForm();
  if (d.action === 'add-payment') return paymentForm();
});

render();
