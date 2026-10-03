'use strict';

import { view } from '../dom.js';
import { db, save, normalize, replaceDb } from '../state.js';
import { esc, today } from '../format.js';
import { seed } from '../seed-data.js';
import { toast } from '../toast.js';
import { render } from '../router.js';

export function renderSettings() {
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
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `mesk-${today()}.json` });
    a.click(); URL.revokeObjectURL(a.href);
  };
  document.getElementById('import').onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const data = normalize(JSON.parse(await f.text()));
      if (!confirm(`${data.students.length} öğrenci, ${data.lessons.length} ders yüklenecek. Mevcut veriler değiştirilsin mi?`)) return;
      replaceDb(data); save(); toast('Yedek yüklendi'); location.hash = '#/';
    } catch { toast('Dosya okunamadı'); }
  };
  view.querySelector('[data-action=seed]').onclick = () => {
    if (db.students.length && !confirm('Örnek veriler mevcut kayıtlara eklensin mi?')) return;
    seed(); save(); toast('Örnek veri yüklendi'); location.hash = '#/';
  };
  view.querySelector('[data-action=reset]').onclick = () => {
    if (!confirm('Tüm veriler silinsin mi? Bu işlem geri alınamaz.')) return;
    replaceDb(normalize({})); save(); toast('Veriler silindi'); render();
  };
}
