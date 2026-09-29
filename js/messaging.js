'use strict';

import { db, lessonsOf, lastHomework, byDateTime, balanceOf } from './state.js';
import { today, parseYmd, fmtDateShort, esc, firstName, genitive, money } from './format.js';
import { waLink, copyText } from './whatsapp.js';
import { encodeShare, sharePayload } from './share-link.js';
import { openModal } from './modal.js';
import { toast } from './toast.js';
import { studentForm } from './forms.js';

/* ================= Öğrenci & veli iletişimi ================= */

export async function shareForm(s) {
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

export const TEMPLATES = {
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

export function messageForm(s, key) {
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

export const feedbackText = (s, c) =>
  `Merhaba ${firstName(s.name)}, ${fmtDateShort(c.date)} tarihli ${c.kind === 'audio' ? 'ses kaydını' : 'videonu'} dinledim: ${c.rating || ''}\n${c.note || ''}`.trim();
