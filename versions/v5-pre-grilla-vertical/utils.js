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

  // ---------- Importar casos (CSV/Excel con las mismas columnas que "Exportar caso") ----------
  IMPORT_CASE_COLUMNS: ['N° Caso', 'Fecha', 'Cliente', 'Matriz', 'Muestra', 'Peso (g)', 'Patología', 'Ct corte', 'Ct obtenido', 'Resultado', 'Observaciones'],

  /** @returns {string|null} mensaje de error si faltan columnas, o null si está OK. */
  validateCaseImportColumns(rows) {
    if (!rows || !rows.length) return 'El archivo está vacío.';
    const headers = Object.keys(rows[0]);
    const missing = Utils.IMPORT_CASE_COLUMNS.filter((c) => !headers.includes(c));
    if (missing.length) return `Faltan columnas requeridas: ${missing.join(', ')}. Usa como plantilla el archivo que se descarga al exportar un caso.`;
    return null;
  },

  /** Inverso de formatDate: "DD-MM-YYYY" (o ISO "YYYY-MM-DD") => "YYYY-MM-DD". */
  parseDisplayDate(str) {
    const s = String(str ?? '').trim();
    const dm = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s);
    if (dm) return `${dm[3]}-${dm[2]}-${dm[1]}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    return s;
  },

  /** "M3" => 2 (índice de muestra 0-based). */
  parseSampleLabelIndex(label) {
    const m = /^M(\d+)$/i.exec(String(label ?? '').trim());
    return m ? Number(m[1]) - 1 : 0;
  },

  /**
   * Reconstruye casos completos (con su grilla patología x muestra) a partir de filas
   * planas como las que produce la exportación de un solo caso (una fila por muestra x
   * patología). Agrupa por "N° Caso"; dentro de cada caso, por "Muestra" y "Patología".
   * El Resultado se recalcula con calculateResult (no se confía en la columna del
   * archivo), usando la incertidumbre del catálogo vigente si la patología coincide
   * por nombre.
   */
  buildCasesFromImportRows(rows, pathologyCatalog = []) {
    const groups = new Map();

    rows.forEach((row) => {
      const caseNumber = String(row['N° Caso'] ?? '').trim();
      if (!caseNumber) return;

      if (!groups.has(caseNumber)) {
        groups.set(caseNumber, {
          caseNumber,
          date: Utils.parseDisplayDate(row['Fecha']),
          client: String(row['Cliente'] ?? '').trim(),
          matrix: String(row['Matriz'] ?? '').trim(),
          weightsByIndex: {},
          maxSampleIndex: 0,
          pathologies: new Map(),
        });
      }

      const g = groups.get(caseNumber);
      const sampleIndex = Utils.parseSampleLabelIndex(row['Muestra']);
      g.maxSampleIndex = Math.max(g.maxSampleIndex, sampleIndex + 1);

      const weightRaw = row['Peso (g)'];
      if (weightRaw !== '' && weightRaw !== undefined && weightRaw !== null && !Number.isNaN(Number(weightRaw))) {
        g.weightsByIndex[sampleIndex] = Number(weightRaw);
      }

      const phName = String(row['Patología'] ?? '').trim();
      if (phName) {
        if (!g.pathologies.has(phName)) {
          g.pathologies.set(phName, { ctCutoff: Number(row['Ct corte']) || 0, samplesByIndex: {} });
        }
        const ctRaw = row['Ct obtenido'];
        const ctObtained = ctRaw === '' || ctRaw === undefined || ctRaw === null || Number.isNaN(Number(ctRaw)) ? null : Number(ctRaw);
        g.pathologies.get(phName).samplesByIndex[sampleIndex] = ctObtained;
      }
    });

    return Array.from(groups.values()).map((g) => {
      const sampleCount = g.maxSampleIndex || 1;
      const sampleWeights = Array.from({ length: sampleCount }, (_, i) => g.weightsByIndex[i] ?? null);

      const pathologies = Array.from(g.pathologies.entries()).map(([name, ph]) => {
        const match = pathologyCatalog.find((p) => p.name === name);
        const ctLower = match ? (match.ctUncertaintyLower || 0) : 0;
        const ctUpper = match ? (match.ctUncertaintyUpper || 0) : 0;
        const samples = Array.from({ length: sampleCount }, (_, i) => {
          const ctObtained = ph.samplesByIndex[i] ?? null;
          return { ctObtained, result: Utils.calculateResult(ctObtained, ph.ctCutoff, ctLower, ctUpper) };
        });
        return {
          pathologyId: match ? match.id : '',
          name,
          ctCutoff: ph.ctCutoff,
          ctUncertaintyLower: ctLower,
          ctUncertaintyUpper: ctUpper,
          observations: '',
          samples,
        };
      });

      const isComplete = pathologies.length > 0 && pathologies.every((p) => p.samples.every((s) => s.ctObtained !== null));
      return {
        caseNumber: g.caseNumber,
        date: g.date,
        client: g.client,
        matrix: g.matrix,
        sampleCount,
        sampleWeights,
        status: isComplete ? 'Finalizado' : 'Pendiente',
        observations: '',
        pathologies,
      };
    });
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
