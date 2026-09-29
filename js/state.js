'use strict';

import { toast } from './toast.js';

/* ================= Veri modeli ve kalıcılık ================= */

const STORE_KEY = 'ders-defteri-v1';

export const DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
export const DAYS_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
export const STATUS = {
  planned: 'Planlandı',
  done: 'Yapıldı',
  cancelled: 'İptal',
  noshow: 'Gelmedi',
};
// Ücrete yansıyan durumlar: yapılan ders ve haber vermeden gelinmeyen ders.
export const CHARGED = new Set(['done', 'noshow']);
export const INSTRUMENT_GROUPS = {
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
export const INSTRUMENTS = Object.values(INSTRUMENT_GROUPS).flat();
export const TRADITIONAL = new Set(INSTRUMENT_GROUPS['Geleneksel Türk çalgıları']);
export const LEVELS = ['Başlangıç', 'Orta', 'İleri'];
export const METHODS = ['Nakit', 'Havale/EFT', 'Kart'];
export const KINDS = { audio: '🎙 Ses kaydı', video: '🎥 Video' };

export function normalize(d) {
  return {
    profile: d.profile || { name: '', phone: '' },
    students: d.students || [], lessons: d.lessons || [], payments: d.payments || [],
    checkins: d.checkins || [], // hafta içi gelen ödev kayıtları + öğretmen geri bildirimi
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) { /* bozuk ya da erişilemeyen depolama: boş başla */ }
  return normalize({});
}

export let db = load();
/* Diğer modüllerin `db`'yi tamamen değiştirmesi için (yedek yükleme, sıfırlama):
   import edilen bir binding'e dışarıdan doğrudan atama yapılamaz, bu yüzden setter kullanılır. */
export function replaceDb(newDb) { db = newDb; }

export function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); }
  catch (e) { toast('Kaydedilemedi: tarayıcı depolaması kullanılamıyor'); }
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const student = id => db.students.find(s => s.id === id);
export const lessonsOf = id => db.lessons.filter(l => l.studentId === id);
export const paymentsOf = id => db.payments.filter(p => p.studentId === id);
export const checkinsOf = id => db.checkins.filter(c => c.studentId === id);
export const byDateTime = (a, b) => (a.date + a.time).localeCompare(b.date + b.time);
export const lastHomework = id => lessonsOf(id).filter(l => l.status === 'done' && l.homework).sort(byDateTime).pop();

export function balanceOf(id) {
  const owed = lessonsOf(id).filter(l => CHARGED.has(l.status)).reduce((a, l) => a + (+l.fee || 0), 0);
  const paid = paymentsOf(id).reduce((a, p) => a + (+p.amount || 0), 0);
  return paid - owed; // negatif = öğrencinin borcu
}

/* Son dersten bu yana kayıt gönderilmiş mi? (hafta içi takip, panoda kullanılır) */
export function weeklyTracking() {
  return db.students.filter(s => s.active !== false).map(s => {
    const hw = lastHomework(s.id);
    if (!hw) return null;
    const got = checkinsOf(s.id).filter(c => c.date >= hw.date).sort((a, b) => b.date.localeCompare(a.date));
    return { s, hw, got };
  }).filter(Boolean);
}
