'use strict';

import { db, student, save, uid, STATUS, DAYS, LEVELS, METHODS, INSTRUMENTS, KINDS, balanceOf } from './state.js';
import { today, esc, options, instrumentOptions, balanceHtml, firstName } from './format.js';
import { openModal, closeModal, modal } from './modal.js';
import { toast } from './toast.js';
import { render } from './router.js';

/* ================= Öğrenci formu ================= */

export function studentForm(s = {}) {
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

/* ================= Ders formu ================= */

export function lessonForm(l = {}, defaults = {}) {
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

export function setStatus(id, status) {
  const l = db.lessons.find(x => x.id === id);
  if (!l) return;
  l.status = status;
  save(); render();
  toast(`${student(l.studentId)?.name}: ${STATUS[status]}`);
}

/* ================= Ödeme formu ================= */

export function paymentForm(p = {}, defaults = {}) {
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

/* ================= Ödev kaydı geldiğinde işaretleme ================= */

export function checkinForm(s, c = {}) {
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
