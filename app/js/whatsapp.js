'use strict';

import { toast } from './toast.js';

/* WhatsApp: Türkiye numaralarını uluslararası biçime çevirir (0532… → 90532…). */
export function waNumber(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = '90' + d.slice(1);
  else if (d.length === 10 && d.startsWith('5')) d = '90' + d;
  return d;
}
export const waLink = (phone, text) => `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(text)}`;

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Kopyalandı'); }
  catch { toast('Kopyalanamadı, metni elle seçin'); }
}
