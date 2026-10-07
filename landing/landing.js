'use strict';

// Ses dalgası çubuklarının yüksekliği: her kayıt kartında aynı, deterministik desen.
document.querySelectorAll('.wave').forEach(wave => {
  wave.querySelectorAll('i').forEach((bar, i) => {
    const h = 22 + Math.abs(Math.sin(i * 0.9) * 48 + Math.sin(i * 2.3) * 22);
    bar.style.setProperty('--h', `${Math.min(100, h)}%`);
    bar.style.setProperty('--i', i);
  });
});
