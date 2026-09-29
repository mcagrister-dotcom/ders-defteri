'use strict';

import { db, uid, byDateTime, TRADITIONAL, METHODS } from './state.js';
import { mondayOf, ymd, addDays, today, parseYmd } from './format.js';

/* Uygulamayı denemek için örnek öğrenci, ders, ödeme ve ödev kaydı üretir. */
export function seed() {
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
