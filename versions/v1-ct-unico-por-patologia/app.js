/**
 * app.js — Controlador principal: vistas, tabla de casos, formularios,
 * administración de patologías, filtros, exportación.
 */

// ---------- Referencias DOM ----------
const el = (id) => document.getElementById(id);

const searchInput = el('search-input');
const filterClient = el('filter-client');
const filterDate = el('filter-date');
const filterPathology = el('filter-pathology');
const filterPositives = el('filter-positives');
const filterNegatives = el('filter-negatives');

const casesTbody = el('cases-tbody');
const casesEmpty = el('cases-empty');
const pathologiesTbody = el('pathologies-tbody');
const pathologiesEmpty = el('pathologies-empty');
const pathologyRowsContainer = el('pathology-rows');
const pathologyRowsEmpty = el('pathology-rows-empty');

// ============================================================
// Navegación
// ============================================================
function switchView(view) {
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('nav-btn--active', b.dataset.view === view));
  ['cases', 'dashboard', 'pathologies'].forEach((v) => {
    el(`view-${v}`).hidden = v !== view;
  });
  if (view === 'dashboard') Charts.renderAll(DB.cases.getAll());
}

document.querySelectorAll('.nav-btn').forEach((btn) => btn.addEventListener('click', () => switchView(btn.dataset.view)));

// ============================================================
// Casos: filtrado y tabla
// ============================================================
function getFilteredCases() {
  const search = searchInput.value.trim().toLowerCase();
  const client = filterClient.value;
  const date = filterDate.value;
  const pathologyId = filterPathology.value;
  const posFilter = filterPositives.value;
  const negFilter = filterNegatives.value;

  return DB.cases.getAll()
    .filter((c) => {
      if (search && !(`${c.caseNumber}`.toLowerCase().includes(search) || `${c.client}`.toLowerCase().includes(search))) return false;
      if (client && c.client !== client) return false;
      if (date && c.date !== date) return false;
      if (pathologyId && !(c.pathologies || []).some((p) => p.pathologyId === pathologyId)) return false;

      const posCount = (c.pathologies || []).filter((p) => p.result === 'POSITIVO').length;
      const negCount = (c.pathologies || []).filter((p) => p.result === 'NEGATIVO').length;
      if (posFilter === 'with' && posCount === 0) return false;
      if (posFilter === 'without' && posCount > 0) return false;
      if (negFilter === 'with' && negCount === 0) return false;
      if (negFilter === 'without' && negCount > 0) return false;
      return true;
    })
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

function statusBadgeClass(status) {
  return `badge--status-${(status || 'Pendiente').toLowerCase().replace(/\s+/g, '-')}`;
}

function resultBadgeClass(result) {
  if (result === 'POSITIVO') return ' result-badge--positivo';
  if (result === 'NEGATIVO') return ' result-badge--negativo';
  if (result === 'OBSERVAR') return ' result-badge--observar';
  return '';
}

function renderCasesTable() {
  const cases = getFilteredCases();
  casesTbody.innerHTML = '';
  casesEmpty.hidden = cases.length > 0;

  cases.forEach((c) => {
    const posCount = (c.pathologies || []).filter((p) => p.result === 'POSITIVO').length;
    const negCount = (c.pathologies || []).filter((p) => p.result === 'NEGATIVO').length;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${Utils.escapeHtml(c.caseNumber)}</td>
      <td>${Utils.formatDate(c.date)}</td>
      <td>${Utils.escapeHtml(c.client)}</td>
      <td>${c.sampleCount ?? 0}</td>
      <td>${(c.pathologies || []).length}</td>
      <td class="count-positive">${posCount}</td>
      <td class="count-negative">${negCount}</td>
      <td><span class="badge ${statusBadgeClass(c.status)}">${Utils.escapeHtml(c.status || 'Pendiente')}</span></td>
      <td class="row-actions">
        <button class="icon-btn" data-action="view" data-id="${c.id}" title="Ver">👁</button>
        <button class="icon-btn" data-action="edit" data-id="${c.id}" title="Editar">✏️</button>
        <button class="icon-btn icon-btn--danger" data-action="delete" data-id="${c.id}" title="Eliminar">🗑</button>
      </td>`;
    casesTbody.appendChild(tr);
  });
}

casesTbody.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const { action, id } = btn.dataset;
  if (action === 'view') openViewCaseModal(id);
  if (action === 'edit') openCaseModal(id);
  if (action === 'delete') deleteCase(id);
});

// ============================================================
// Panel resumen
// ============================================================
function renderSummaryCards() {
  const cases = DB.cases.getAll();
  const totalSamples = cases.reduce((sum, c) => sum + (Number(c.sampleCount) || 0), 0);
  let totalPositive = 0;
  let totalNegative = 0;
  const pathologyCounts = {};

  cases.forEach((c) => (c.pathologies || []).forEach((p) => {
    if (p.result === 'POSITIVO') totalPositive += 1;
    if (p.result === 'NEGATIVO') totalNegative += 1;
    pathologyCounts[p.name] = (pathologyCounts[p.name] || 0) + 1;
  }));

  const top = Object.entries(pathologyCounts).sort((a, b) => b[1] - a[1])[0];

  el('stat-total-cases').textContent = cases.length;
  el('stat-total-samples').textContent = totalSamples;
  el('stat-total-positive').textContent = totalPositive;
  el('stat-total-negative').textContent = totalNegative;
  el('stat-top-pathology').textContent = top ? `${top[0]} (${top[1]})` : '—';
}

// ============================================================
// Filtros: poblar selects dependientes de los datos
// ============================================================
function populateFilterOptions() {
  const cases = DB.cases.getAll();
  const clients = [...new Set(cases.map((c) => c.client).filter(Boolean))].sort();
  const currentClient = filterClient.value;
  filterClient.innerHTML = '<option value="">Cliente: todos</option>' +
    clients.map((c) => `<option value="${Utils.escapeHtml(c)}">${Utils.escapeHtml(c)}</option>`).join('');
  if (clients.includes(currentClient)) filterClient.value = currentClient;

  const pathologies = DB.pathologies.getAll();
  const currentPathology = filterPathology.value;
  filterPathology.innerHTML = '<option value="">Patología: todas</option>' +
    pathologies.map((p) => `<option value="${p.id}">${Utils.escapeHtml(p.name)}</option>`).join('');
  if (pathologies.some((p) => p.id === currentPathology)) filterPathology.value = currentPathology;
}

[searchInput].forEach((input) => input.addEventListener('input', Utils.debounce(renderCasesTable, 200)));
[filterClient, filterDate, filterPathology, filterPositives, filterNegatives].forEach((input) =>
  input.addEventListener('change', renderCasesTable));

el('btn-clear-filters').addEventListener('click', () => {
  searchInput.value = '';
  filterClient.value = '';
  filterDate.value = '';
  filterPathology.value = '';
  filterPositives.value = '';
  filterNegatives.value = '';
  renderCasesTable();
});

function refreshCasesView() {
  populateFilterOptions();
  renderCasesTable();
  renderSummaryCards();
}

// ============================================================
// Modal: Nuevo / Editar Caso
// ============================================================
const caseForm = el('case-form');

function populatePathologySelect(select, selectedId) {
  const list = DB.pathologies.getAll().filter((p) => p.status === 'Activo' || p.id === selectedId);
  select.innerHTML = list.map((p) => `<option value="${p.id}">${Utils.escapeHtml(p.name)}</option>`).join('');
  if (selectedId) select.value = selectedId;
}

function toggleEmptyRowsMessage() {
  pathologyRowsEmpty.hidden = pathologyRowsContainer.children.length > 0;
}

function addPathologyRow(existingData = null) {
  const tpl = el('pathology-row-template');
  const node = tpl.content.firstElementChild.cloneNode(true);
  const select = node.querySelector('.ph-select');
  const cutoffInput = node.querySelector('.ph-cutoff');
  const ctInput = node.querySelector('.ph-ct');
  const resultBadge = node.querySelector('.ph-result');
  const obsInput = node.querySelector('.ph-obs');
  const removeBtn = node.querySelector('.row-remove');

  populatePathologySelect(select, existingData?.pathologyId);

  function syncResult() {
    const result = Utils.calculateResult(ctInput.value, cutoffInput.value, node.dataset.ctLower, node.dataset.ctUpper);
    resultBadge.textContent = result || '—';
    resultBadge.className = 'result-badge ph-result' + resultBadgeClass(result);
  }

  function syncCutoff() {
    const ph = DB.pathologies.getById(select.value);
    cutoffInput.value = ph ? ph.ctCutoff : '';
    node.dataset.ctLower = ph ? (ph.ctUncertaintyLower || 0) : 0;
    node.dataset.ctUpper = ph ? (ph.ctUncertaintyUpper || 0) : 0;
    syncResult();
  }

  select.addEventListener('change', syncCutoff);
  ctInput.addEventListener('input', syncResult);
  removeBtn.addEventListener('click', () => {
    node.remove();
    toggleEmptyRowsMessage();
  });

  if (existingData) {
    select.value = existingData.pathologyId;
    cutoffInput.value = existingData.ctCutoff;
    node.dataset.ctLower = existingData.ctUncertaintyLower ?? 0;
    node.dataset.ctUpper = existingData.ctUncertaintyUpper ?? 0;
    ctInput.value = existingData.ctObtained ?? '';
    obsInput.value = existingData.observations || '';
    syncResult();
  } else {
    syncCutoff();
  }

  pathologyRowsContainer.appendChild(node);
  toggleEmptyRowsMessage();
}

function resetCaseForm() {
  caseForm.reset();
  el('case-id').value = '';
  el('case-date').value = Utils.todayISO();
  pathologyRowsContainer.innerHTML = '';
  toggleEmptyRowsMessage();
  caseForm.querySelectorAll('.input--error').forEach((i) => Utils.clearFieldError(i));
}

function openCaseModal(id = null) {
  resetCaseForm();
  if (id) {
    const c = DB.cases.getById(id);
    if (!c) return;
    el('case-modal-title').textContent = 'Editar Caso';
    el('case-id').value = c.id;
    el('case-number').value = c.caseNumber;
    el('case-date').value = c.date;
    el('case-client').value = c.client;
    el('case-samples').value = c.sampleCount;
    el('case-matrix').value = c.matrix || '';
    el('case-weight').value = c.weight ?? '';
    el('case-status').value = c.status || 'Pendiente';
    el('case-observations').value = c.observations || '';
    (c.pathologies || []).forEach((p) => addPathologyRow(p));
  } else {
    el('case-modal-title').textContent = 'Nuevo Caso';
    addPathologyRow();
  }
  Utils.openModal('modal-case');
}

el('btn-new-case').addEventListener('click', () => openCaseModal());
el('btn-add-pathology-row').addEventListener('click', () => addPathologyRow());

function collectPathologyRows() {
  return Array.from(pathologyRowsContainer.querySelectorAll('.pathology-row')).map((row) => {
    const select = row.querySelector('.ph-select');
    const ph = DB.pathologies.getById(select.value);
    const ctObtained = row.querySelector('.ph-ct').value;
    const ctCutoff = row.querySelector('.ph-cutoff').value;
    const ctLower = row.dataset.ctLower || 0;
    const ctUpper = row.dataset.ctUpper || 0;
    return {
      pathologyId: select.value,
      name: ph ? ph.name : '',
      ctCutoff: Number(ctCutoff),
      ctUncertaintyLower: Number(ctLower) || 0,
      ctUncertaintyUpper: Number(ctUpper) || 0,
      ctObtained: ctObtained === '' ? null : Number(ctObtained),
      result: Utils.calculateResult(ctObtained, ctCutoff, ctLower, ctUpper),
      observations: row.querySelector('.ph-obs').value.trim(),
    };
  });
}

function validateCaseForm(pathologyRows) {
  let valid = true;
  const required = [
    ['case-number', 'N° de caso requerido'],
    ['case-date', 'Fecha requerida'],
    ['case-client', 'Cliente requerido'],
    ['case-samples', 'N° de muestras requerido'],
  ];
  required.forEach(([id, msg]) => {
    const input = el(id);
    if (!input.value.trim()) {
      Utils.setFieldError(input, msg);
      valid = false;
    } else {
      Utils.clearFieldError(input);
    }
  });

  if (pathologyRows.length === 0) {
    Utils.toast('Agrega al menos una patología analizada.', 'error');
    valid = false;
  } else if (pathologyRows.some((p) => !p.pathologyId || p.ctObtained === null)) {
    Utils.toast('Completa el Ct obtenido de todas las patologías agregadas.', 'error');
    valid = false;
  }
  return valid;
}

caseForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const pathologyRows = collectPathologyRows();
  if (!validateCaseForm(pathologyRows)) return;

  const payload = {
    caseNumber: el('case-number').value.trim(),
    date: el('case-date').value,
    client: el('case-client').value.trim(),
    sampleCount: Number(el('case-samples').value),
    matrix: el('case-matrix').value,
    weight: el('case-weight').value === '' ? null : Number(el('case-weight').value),
    status: el('case-status').value,
    observations: el('case-observations').value.trim(),
    pathologies: pathologyRows,
  };

  const id = el('case-id').value;
  if (id) {
    DB.cases.update(id, payload);
    Utils.toast('Caso actualizado correctamente.', 'success');
  } else {
    DB.cases.create(payload);
    Utils.toast('Caso registrado correctamente.', 'success');
  }

  Utils.closeModal('modal-case');
  refreshCasesView();
});

async function deleteCase(id) {
  const c = DB.cases.getById(id);
  if (!c) return;
  const ok = await Utils.confirmDialog(`¿Eliminar el caso "${c.caseNumber}"? Esta acción no se puede deshacer.`);
  if (!ok) return;
  DB.cases.remove(id);
  Utils.toast('Caso eliminado.', 'success');
  refreshCasesView();
}

// ============================================================
// Modal: Ver Caso
// ============================================================
function openViewCaseModal(id) {
  const c = DB.cases.getById(id);
  if (!c) return;

  const rows = (c.pathologies || []).map((p) => `
    <tr>
      <td>${Utils.escapeHtml(p.name)}</td>
      <td>${p.ctCutoff}</td>
      <td>${p.ctObtained ?? '—'}</td>
      <td><span class="result-badge${resultBadgeClass(p.result)}">${p.result || '—'}</span></td>
      <td>${Utils.escapeHtml(p.observations || '—')}</td>
    </tr>`).join('');

  el('view-case-body').innerHTML = `
    <div class="detail-grid">
      <div><span class="detail-label">N° Caso</span><span class="detail-value">${Utils.escapeHtml(c.caseNumber)}</span></div>
      <div><span class="detail-label">Fecha</span><span class="detail-value">${Utils.formatDate(c.date)}</span></div>
      <div><span class="detail-label">Cliente</span><span class="detail-value">${Utils.escapeHtml(c.client)}</span></div>
      <div><span class="detail-label">N° Muestras</span><span class="detail-value">${c.sampleCount}</span></div>
      <div><span class="detail-label">Matriz</span><span class="detail-value">${Utils.escapeHtml(c.matrix || '—')}</span></div>
      <div><span class="detail-label">Peso (g)</span><span class="detail-value">${c.weight ?? '—'}</span></div>
      <div><span class="detail-label">Estado</span><span class="badge ${statusBadgeClass(c.status)}">${Utils.escapeHtml(c.status || 'Pendiente')}</span></div>
    </div>
    ${c.observations ? `<p><strong>Observaciones:</strong> ${Utils.escapeHtml(c.observations)}</p>` : ''}
    <table class="data-table">
      <thead><tr><th>Patología</th><th>Ct corte</th><th>Ct obtenido</th><th>Resultado</th><th>Observaciones</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5">Sin patologías registradas.</td></tr>'}</tbody>
    </table>`;

  Utils.openModal('modal-view-case');
}

// ============================================================
// Administración de Patologías
// ============================================================
const pathologyForm = el('pathology-form');
const pathologySearch = el('pathology-search');
const pathologySort = el('pathology-sort');

function getSortedPathologies() {
  const search = pathologySearch.value.trim().toLowerCase();
  const [field, dir] = pathologySort.value.split('-');
  let list = DB.pathologies.getAll().filter((p) => p.name.toLowerCase().includes(search));
  list.sort((a, b) => {
    const va = field === 'ct' ? a.ctCutoff : a.name.toLowerCase();
    const vb = field === 'ct' ? b.ctCutoff : b.name.toLowerCase();
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return dir === 'desc' ? -cmp : cmp;
  });
  return list;
}

function renderPathologiesTable() {
  const list = getSortedPathologies();
  pathologiesTbody.innerHTML = '';
  pathologiesEmpty.hidden = list.length > 0;

  list.forEach((p) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${Utils.escapeHtml(p.name)}</td>
      <td>${p.ctCutoff}</td>
      <td>${(p.ctUncertaintyLower || p.ctUncertaintyUpper) ? `-${p.ctUncertaintyLower || 0} / +${p.ctUncertaintyUpper || 0}` : '—'}</td>
      <td>${Utils.escapeHtml(p.description || '—')}</td>
      <td><span class="badge ${p.status === 'Activo' ? 'badge--status-finalizado' : 'badge--status-pendiente'}">${p.status}</span></td>
      <td class="row-actions">
        <button class="icon-btn" data-action="edit" data-id="${p.id}" title="Editar">✏️</button>
        <button class="icon-btn icon-btn--danger" data-action="delete" data-id="${p.id}" title="Eliminar">🗑</button>
      </td>`;
    pathologiesTbody.appendChild(tr);
  });
}

pathologiesTbody.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const { action, id } = btn.dataset;
  if (action === 'edit') openPathologyModal(id);
  if (action === 'delete') deletePathology(id);
});

pathologySearch.addEventListener('input', Utils.debounce(renderPathologiesTable, 200));
pathologySort.addEventListener('change', renderPathologiesTable);

function resetPathologyForm() {
  pathologyForm.reset();
  el('pathology-id').value = '';
  pathologyForm.querySelectorAll('.input--error').forEach((i) => Utils.clearFieldError(i));
}

function openPathologyModal(id = null) {
  resetPathologyForm();
  if (id) {
    const p = DB.pathologies.getById(id);
    if (!p) return;
    el('pathology-modal-title').textContent = 'Editar Patología';
    el('pathology-id').value = p.id;
    el('pathology-name').value = p.name;
    el('pathology-cutoff').value = p.ctCutoff;
    el('pathology-ct-lower').value = p.ctUncertaintyLower || 0;
    el('pathology-ct-upper').value = p.ctUncertaintyUpper || 0;
    el('pathology-description').value = p.description || '';
    el('pathology-status').value = p.status;
  } else {
    el('pathology-modal-title').textContent = 'Nueva Patología';
  }
  Utils.openModal('modal-pathology');
}

el('btn-new-pathology').addEventListener('click', () => openPathologyModal());

pathologyForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const nameInput = el('pathology-name');
  const cutoffInput = el('pathology-cutoff');
  let valid = true;

  if (!nameInput.value.trim()) { Utils.setFieldError(nameInput, 'Nombre requerido'); valid = false; }
  else Utils.clearFieldError(nameInput);

  if (cutoffInput.value === '' || Number.isNaN(Number(cutoffInput.value))) { Utils.setFieldError(cutoffInput, 'Ct de corte requerido'); valid = false; }
  else Utils.clearFieldError(cutoffInput);

  if (!valid) return;

  const payload = {
    name: nameInput.value.trim(),
    ctCutoff: Number(cutoffInput.value),
    ctUncertaintyLower: Number(el('pathology-ct-lower').value) || 0,
    ctUncertaintyUpper: Number(el('pathology-ct-upper').value) || 0,
    description: el('pathology-description').value.trim(),
    status: el('pathology-status').value,
  };

  const id = el('pathology-id').value;
  if (id) {
    DB.pathologies.update(id, payload);
    Utils.toast('Patología actualizada.', 'success');
  } else {
    DB.pathologies.create(payload);
    Utils.toast('Patología creada.', 'success');
  }

  Utils.closeModal('modal-pathology');
  renderPathologiesTable();
  populateFilterOptions();
});

async function deletePathology(id) {
  const p = DB.pathologies.getById(id);
  if (!p) return;
  const ok = await Utils.confirmDialog(`¿Eliminar la patología "${p.name}" del catálogo? Los casos ya registrados conservan sus datos.`);
  if (!ok) return;
  DB.pathologies.remove(id);
  Utils.toast('Patología eliminada.', 'success');
  renderPathologiesTable();
  populateFilterOptions();
}

// ============================================================
// Modales: cierre genérico (botón, click fuera, Escape)
// ============================================================
document.querySelectorAll('[data-close]').forEach((btn) =>
  btn.addEventListener('click', () => Utils.closeModal(btn.dataset.close)));

document.querySelectorAll('.modal-overlay').forEach((overlay) =>
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('modal-overlay--open');
  }));

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay--open').forEach((o) => o.classList.remove('modal-overlay--open'));
  }
});

// ============================================================
// Exportación: Excel / CSV / PDF
// ============================================================
function buildExportRows() {
  return getFilteredCases().map((c) => ({
    'N° Caso': c.caseNumber,
    Fecha: Utils.formatDate(c.date),
    Cliente: c.client,
    'N° Muestras': c.sampleCount,
    Patologías: (c.pathologies || []).length,
    Positivos: (c.pathologies || []).filter((p) => p.result === 'POSITIVO').length,
    Negativos: (c.pathologies || []).filter((p) => p.result === 'NEGATIVO').length,
    Estado: c.status || 'Pendiente',
  }));
}

el('export-xlsx').addEventListener('click', () => {
  const rows = buildExportRows();
  if (!rows.length) return Utils.toast('No hay casos para exportar.', 'error');
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Casos');
  XLSX.writeFile(wb, `casos_lims_${Utils.todayISO()}.xlsx`);
});

el('export-csv').addEventListener('click', () => {
  const rows = buildExportRows();
  if (!rows.length) return Utils.toast('No hay casos para exportar.', 'error');
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => `"${String(r[h]).replace(/"/g, '""')}"`).join(',')),
  ].join('\n');
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `casos_lims_${Utils.todayISO()}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
});

el('export-pdf').addEventListener('click', () => {
  const rows = buildExportRows();
  if (!rows.length) return Utils.toast('No hay casos para exportar.', 'error');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFontSize(14);
  doc.setTextColor(11, 79, 138);
  doc.text('LIMS Salmones — Reporte de Casos', 14, 16);
  doc.autoTable({
    startY: 22,
    head: [Object.keys(rows[0])],
    body: rows.map((r) => Object.values(r)),
    headStyles: { fillColor: [11, 79, 138] },
    styles: { fontSize: 9 },
  });
  doc.save(`casos_lims_${Utils.todayISO()}.pdf`);
});

// ============================================================
// Inicialización
// ============================================================
DB.init();
refreshCasesView();
renderPathologiesTable();
