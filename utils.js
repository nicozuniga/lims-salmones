/**
 * utils.js — helpers compartidos: ids, fechas, toasts, modales, validación.
 */

const Utils = {
  generateId() {
    return crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  },

  formatDate(isoDate) {
    if (!isoDate) return '—';
    const [y, m, d] = isoDate.split('-');
    return `${d}-${m}-${y}`;
  },

  todayISO() {
    return new Date().toISOString().slice(0, 10);
  },

  debounce(fn, delay = 250) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  },

  /**
   * Ct obtenido <= (corte - incertidumbre inferior) => POSITIVO
   * Ct obtenido >  (corte + incertidumbre superior) => NEGATIVO
   * En el medio => OBSERVAR (zona gris). Con incertidumbre 0/0 se
   * comporta igual que la regla original (POSITIVO/NEGATIVO).
   */
  calculateResult(ctObtained, ctCutoff, lowerUncertainty = 0, upperUncertainty = 0) {
    if (ctObtained === '' || ctObtained === null || ctObtained === undefined || Number.isNaN(Number(ctObtained))) {
      return null;
    }
    const ct = Number(ctObtained);
    const cutoff = Number(ctCutoff);
    const lower = Number(lowerUncertainty) || 0;
    const upper = Number(upperUncertainty) || 0;
    if (ct <= cutoff - lower) return 'POSITIVO';
    if (ct > cutoff + upper) return 'NEGATIVO';
    return 'OBSERVAR';
  },

  /** Aplana caso.pathologies[].samples[] a una lista de resultados individuales (una fila por muestra analizada). */
  flattenCaseResults(caseObj) {
    const out = [];
    (caseObj.pathologies || []).forEach((p) => {
      (p.samples || []).forEach((s, idx) => {
        if (s && s.result) out.push({ pathologyName: p.name, sampleIndex: idx, ctObtained: s.ctObtained, result: s.result });
      });
    });
    return out;
  },

  /** Recorta `list` a la página `page` (1-indexada) de tamaño `pageSize`. Clampa page a un rango válido. */
  paginate(list, page, pageSize) {
    const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const start = (safePage - 1) * pageSize;
    return { items: list.slice(start, start + pageSize), page: safePage, totalPages, total: list.length };
  },

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  },

  // ---------- Toasts ----------
  toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.textContent = message;
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add('toast--visible'));
    setTimeout(() => {
      el.classList.remove('toast--visible');
      setTimeout(() => el.remove(), 300);
    }, 3200);
  },

  // ---------- Modales ----------
  openModal(id) {
    document.getElementById(id).classList.add('modal-overlay--open');
  },
  closeModal(id) {
    document.getElementById(id).classList.remove('modal-overlay--open');
  },

  /** Modal de confirmación genérico. Devuelve una Promise<boolean>. */
  confirmDialog(message) {
    return new Promise((resolve) => {
      const overlay = document.getElementById('modal-confirm');
      overlay.querySelector('.modal__body').textContent = message;
      const btnYes = document.getElementById('confirm-yes');
      const btnNo = document.getElementById('confirm-no');
      const cleanup = (result) => {
        overlay.classList.remove('modal-overlay--open');
        btnYes.removeEventListener('click', onYes);
        btnNo.removeEventListener('click', onNo);
        resolve(result);
      };
      const onYes = () => cleanup(true);
      const onNo = () => cleanup(false);
      btnYes.addEventListener('click', onYes);
      btnNo.addEventListener('click', onNo);
      overlay.classList.add('modal-overlay--open');
    });
  },

  /** Marca un input inválido con mensaje. */
  setFieldError(input, message) {
    input.classList.add('input--error');
    const small = input.parentElement.querySelector('.field-error');
    if (small) small.textContent = message || '';
  },
  clearFieldError(input) {
    input.classList.remove('input--error');
    const small = input.parentElement.querySelector('.field-error');
    if (small) small.textContent = '';
  },
};
