'use strict';

import { uid } from '../state.js';
import { esc, firstName } from '../format.js';
import { waLink } from '../whatsapp.js';
import { openModal, setModalCleanup } from '../modal.js';
import { toast } from '../toast.js';
import { recStore, canRecord, pickMime, recFileName, fmtDur, fmtSize, shareRecording } from '../recordings.js';
import { renderPortal } from './render.js';

export async function saveRec(rec) {
  try { await recStore.put(rec); }
  catch { toast('Kayıt bu cihaza saklanamadı; yine de gönderebilirsin'); }
}

export function sendRec(rec, ctx) {
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

export function openRecorder(kind, ctx) {
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
  setModalCleanup(cleanup);

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

export function openReview(rec, ctx) {
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
  setModalCleanup(() => { URL.revokeObjectURL(url); renderPortal(ctx.code); });
  const again = document.getElementById('rv-again');
  if (again) again.onclick = async () => {
    await recStore.del(rec.id).catch(() => {});
    openRecorder(rec.kind, ctx);
  };
}
