'use strict';

import { render } from './router.js';

/* ================= Modal ================= */

export const modal = document.getElementById('modal');
const modalForm = document.getElementById('modal-form');
let modalSubmit = null;
let modalCleanup = null; // kamera/mikrofon gibi kaynakları modal kapanınca bırakmak için

/* Başka modüllerin modalCleanup'ı kaydetmesi için: import edilen bir binding'e
   dışarıdan doğrudan atama yapılamaz, bu yüzden setter kullanılır. */
export function setModalCleanup(fn) { modalCleanup = fn; }

function runModalCleanup() { const fn = modalCleanup; modalCleanup = null; fn?.(); }
modal.addEventListener('cancel', runModalCleanup); // Esc ile kapatma

export function openModal({ title, body, submitLabel = 'Kaydet', onSubmit, extraButtons = '' }) {
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
export function closeModal() { runModalCleanup(); modal.close(); modalSubmit = null; }

modalForm.addEventListener('submit', e => {
  e.preventDefault();
  if (!modalSubmit) return closeModal();
  const data = Object.fromEntries(new FormData(modalForm));
  if (modalSubmit(data) !== false) { closeModal(); render(); }
});
modal.addEventListener('click', e => {
  if (e.target.closest('[data-close]') || e.target === modal) closeModal();
});
