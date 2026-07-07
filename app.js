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

// ponytail: paginar la tabla en vez de pintar miles de <tr> de una — el catálogo de
// casos está pensado para crecer a varios miles de registros.
const PAGE_SIZE = 50;
let casesPage = 1;
let explorerPage = 1;

/** Pinta el texto "Página X de Y" y habilita/deshabilita los botones ‹›. */
function renderPagerInfo(prefix, page, totalPages, total) {
  el(`${prefix}-pager`).hidden = total === 0;
  el(`${prefix}-page-info`).textContent = `Página ${page} de ${totalPages} (${total} casos)`;
  el(`${prefix}-prev`).disabled = page <= 1;
  el(`${prefix}-next`).disabled = page >= totalPages;
}

// ============================================================
// Navegación
// ============================================================
function switchView(view) {
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('nav-btn--active', b.dataset.view === view));
  ['cases', 'dashboard', 'pathologies', 'explorer'].forEach((v) => {
    el(`view-${v}`).hidden = v !== view;
  });
  if (view === 'dashboard') Charts.renderAll(DB.cases.getAll());
  if (view === 'explorer') { populateExplorerOptions(); runExplorer(); }
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

      const flat = Utils.flattenCaseResults(c);
      const posCount = flat.filter((r) => r.result === 'POSITIVO').length;
      const negCount = flat.filter((r) => r.result === 'NEGATIVO').length;
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

/** Fila <tr> de un caso (columnas comunes a la tabla de Casos y a Explorar). */
function buildCaseRowHtml(c) {
  const flat = Utils.flattenCaseResults(c);
  const posCount = flat.filter((r) => r.result === 'POSITIVO').length;
  const negCount = flat.filter((r) => r.result === 'NEGATIVO').length;
  return `
    <tr>
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
      </td>
    </tr>`;
}

function renderCasesTable() {
  const filtered = getFilteredCases();
  casesEmpty.hidden = filtered.length > 0;
  const { items, page, totalPages, total } = Utils.paginate(filtered, casesPage, PAGE_SIZE);
  casesPage = page;
  casesTbody.innerHTML = items.map(buildCaseRowHtml).join('');
  renderPagerInfo('cases', page, totalPages, total);
}

el('cases-prev').addEventListener('click', () => { casesPage -= 1; renderCasesTable(); });
el('cases-next').addEventListener('click', () => { casesPage += 1; renderCasesTable(); });

function handleCaseRowAction(e) {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const { action, id } = btn.dataset;
  if (action === 'view') openViewCaseModal(id);
  if (action === 'edit') openCaseModal(id);
  if (action === 'delete') deleteCase(id);
}

casesTbody.addEventListener('click', handleCaseRowAction);

// ============================================================
// Panel resumen
// ============================================================
function renderSummaryCards() {
  const cases = DB.cases.getAll();
  const totalSamples = cases.reduce((sum, c) => sum + (Number(c.sampleCount) || 0), 0);
  let totalPositive = 0;
  let totalNegative = 0;
  const pathologyCounts = {};

  cases.forEach((c) => {
    (c.pathologies || []).forEach((p) => {
      pathologyCounts[p.name] = (pathologyCounts[p.name] || 0) + 1;
    });
    Utils.flattenCaseResults(c).forEach((r) => {
      if (r.result === 'POSITIVO') totalPositive += 1;
      if (r.result === 'NEGATIVO') totalNegative += 1;
    });
  });

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

function applyCasesFilterChange() {
  casesPage = 1;
  renderCasesTable();
}

[searchInput].forEach((input) => input.addEventListener('input', Utils.debounce(applyCasesFilterChange, 200)));
[filterClient, filterDate, filterPathology, filterPositives, filterNegatives].forEach((input) =>
  input.addEventListener('change', applyCasesFilterChange));

el('btn-clear-filters').addEventListener('click', () => {
  searchInput.value = '';
  filterClient.value = '';
  filterDate.value = '';
  filterPathology.value = '';
  filterPositives.value = '';
  filterNegatives.value = '';
  applyCasesFilterChange();
});

function refreshCasesView() {
  populateFilterOptions();
  renderCasesTable();
  renderSummaryCards();
  populateExplorerOptions();
  runExplorer();
}

// ============================================================
// Explorar: buscar casos por patología o cliente
// ============================================================
const explorerTbody = el('explorer-tbody');
const explorerPathology = el('explorer-pathology');
const explorerClient = el('explorer-client');
const explorerEmpty = el('explorer-empty');

function populateExplorerOptions() {
  const pathologies = DB.pathologies.getAll();
  const currentPathology = explorerPathology.value;
  explorerPathology.innerHTML = '<option value="">Patología: seleccionar</option>' +
    pathologies.map((p) => `<option value="${p.id}">${Utils.escapeHtml(p.name)}</option>`).join('');
  if (pathologies.some((p) => p.id === currentPathology)) explorerPathology.value = currentPathology;

  const clients = [...new Set(DB.cases.getAll().map((c) => c.client).filter(Boolean))].sort();
  const currentClient = explorerClient.value;
  explorerClient.innerHTML = '<option value="">Cliente: seleccionar</option>' +
    clients.map((c) => `<option value="${Utils.escapeHtml(c)}">${Utils.escapeHtml(c)}</option>`).join('');
  if (clients.includes(currentClient)) explorerClient.value = currentClient;
}

function runExplorer() {
  const pathologyId = explorerPathology.value;
  const client = explorerClient.value;

  if (!pathologyId && !client) {
    explorerTbody.innerHTML = '';
    explorerEmpty.hidden = false;
    explorerEmpty.textContent = 'Selecciona una patología o un cliente para ver los casos.';
    renderPagerInfo('explorer', 1, 1, 0);
    return;
  }

  const results = DB.cases.getAll()
    .filter((c) => {
      if (pathologyId && !(c.pathologies || []).some((p) => p.pathologyId === pathologyId)) return false;
      if (client && c.client !== client) return false;
      return true;
    })
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const { items, page, totalPages, total } = Utils.paginate(results, explorerPage, PAGE_SIZE);
  explorerPage = page;
  explorerTbody.innerHTML = items.map(buildCaseRowHtml).join('');
  explorerEmpty.hidden = results.length > 0;
  explorerEmpty.textContent = 'No hay casos que coincidan con la búsqueda.';
  renderPagerInfo('explorer', page, totalPages, total);
}

el('explorer-prev').addEventListener('click', () => { explorerPage -= 1; runExplorer(); });
el('explorer-next').addEventListener('click', () => { explorerPage += 1; runExplorer(); });

function applyExplorerFilterChange() {
  explorerPage = 1;
  runExplorer();
}

explorerPathology.addEventListener('change', applyExplorerFilterChange);
explorerClient.addEventListener('change', applyExplorerFilterChange);
el('btn-explorer-clear').addEventListener('click', () => {
  explorerPathology.value = '';
  explorerClient.value = '';
  applyExplorerFilterChange();
});
explorerTbody.addEventListener('click', handleCaseRowAction);

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

/** N° de muestras vigente en el formulario = cantidad de celdas de Ct por patología. */
function getSampleCount() {
  return Math.max(0, parseInt(el('case-samples').value, 10) || 0);
}

function updateAddPathologyAvailability() {
  const count = getSampleCount();
  el('btn-add-pathology-row').disabled = count < 1;
  el('matrix-hint').hidden = count >= 1;
}

/** Regenera las columnas M1..MN del encabezado de la grilla según el N° de muestras. */
function renderSampleColumnsHeader() {
  const headRow = el('ct-matrix-head-row');
  const obsHeader = headRow.querySelector('.ct-col-obs');
  headRow.querySelectorAll('.ct-col-sample').forEach((th) => th.remove());
  for (let i = 0; i < getSampleCount(); i += 1) {
    const th = document.createElement('th');
    th.className = 'ct-col-sample';
    th.textContent = `M${i + 1}`;
    th.title = `Muestra ${i + 1}`;
    headRow.insertBefore(th, obsHeader);
  }
}

/** Ajusta las celdas de Ct de una fila (agrega o quita) para igualar el N° de muestras vigente. */
function resizeRowSampleCells(row) {
  const obsCell = row.querySelector('.ct-col-obs');
  const existingCells = Array.from(row.querySelectorAll('.ct-cell'));
  const count = getSampleCount();

  existingCells.slice(count).forEach((cell) => cell.remove());

  for (let i = existingCells.length; i < count; i += 1) {
    const td = document.createElement('td');
    td.className = 'ct-cell';
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.01';
    input.className = 'input ph-ct-cell';
    input.dataset.sampleIndex = String(i);
    input.addEventListener('input', () => syncCellResult(row, input));
    td.appendChild(input);
    row.insertBefore(td, obsCell);
  }
}

function syncCellResult(row, input) {
  const cutoff = row.querySelector('.ph-cutoff').value;
  const result = Utils.calculateResult(input.value, cutoff, row.dataset.ctLower, row.dataset.ctUpper);
  input.classList.remove('input--positive', 'input--negative', 'input--observe');
  input.title = result || '';
  if (result) input.classList.add(`input--${result === 'POSITIVO' ? 'positive' : result === 'NEGATIVO' ? 'negative' : 'observe'}`);
}

function syncAllCellsInRow(row) {
  row.querySelectorAll('.ph-ct-cell').forEach((input) => syncCellResult(row, input));
}

/** Ajusta las celdas de Peso (g), una por muestra, igual que resizeRowSampleCells pero sin cálculo de resultado. */
function resizeWeightRowCells() {
  const row = el('ct-matrix-weight-row');
  const obsCell = row.querySelector('.ct-col-obs');
  const existingCells = Array.from(row.querySelectorAll('.weight-cell'));
  const count = getSampleCount();

  existingCells.slice(count).forEach((cell) => cell.remove());

  for (let i = existingCells.length; i < count; i += 1) {
    const td = document.createElement('td');
    td.className = 'ct-cell weight-cell';
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.1';
    input.min = '0';
    input.className = 'input ph-weight-cell';
    input.placeholder = 'g';
    input.dataset.sampleIndex = String(i);
    td.appendChild(input);
    row.insertBefore(td, obsCell);
  }
}

function collectSampleWeights() {
  return Array.from(document.querySelectorAll('#ct-matrix-weight-row .ph-weight-cell'))
    .map((input) => (input.value === '' ? null : Number(input.value)));
}

function addPathologyRow(existingData = null) {
  const row = document.createElement('tr');
  row.className = 'pathology-row';

  const selectTd = document.createElement('td');
  const select = document.createElement('select');
  select.className = 'ph-select input';
  select.required = true;
  selectTd.appendChild(select);

  const cutoffTd = document.createElement('td');
  const cutoffInput = document.createElement('input');
  cutoffInput.type = 'text';
  cutoffInput.className = 'ph-cutoff input';
  cutoffInput.readOnly = true;
  cutoffInput.tabIndex = -1;
  cutoffTd.appendChild(cutoffInput);

  const obsTd = document.createElement('td');
  obsTd.className = 'ct-col-obs';
  const obsInput = document.createElement('input');
  obsInput.type = 'text';
  obsInput.className = 'ph-obs input';
  obsTd.appendChild(obsInput);

  const removeTd = document.createElement('td');
  removeTd.className = 'ct-col-remove';
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'row-remove';
  removeBtn.title = 'Quitar patología';
  removeBtn.textContent = '✕';
  removeTd.appendChild(removeBtn);

  row.append(selectTd, cutoffTd, obsTd, removeTd);
  populatePathologySelect(select, existingData?.pathologyId);

  function syncCutoff() {
    const ph = DB.pathologies.getById(select.value);
    cutoffInput.value = ph ? ph.ctCutoff : '';
    row.dataset.ctLower = ph ? (ph.ctUncertaintyLower || 0) : 0;
    row.dataset.ctUpper = ph ? (ph.ctUncertaintyUpper || 0) : 0;
    syncAllCellsInRow(row);
  }

  select.addEventListener('change', syncCutoff);
  removeBtn.addEventListener('click', () => {
    row.remove();
    toggleEmptyRowsMessage();
  });

  pathologyRowsContainer.appendChild(row);
  resizeRowSampleCells(row);

  if (existingData) {
    select.value = existingData.pathologyId;
    cutoffInput.value = existingData.ctCutoff;
    row.dataset.ctLower = existingData.ctUncertaintyLower ?? 0;
    row.dataset.ctUpper = existingData.ctUncertaintyUpper ?? 0;
    obsInput.value = existingData.observations || '';
    const cells = row.querySelectorAll('.ph-ct-cell');
    (existingData.samples || []).forEach((s, idx) => {
      if (cells[idx] && s && s.ctObtained !== null && s.ctObtained !== undefined) cells[idx].value = s.ctObtained;
    });
    syncAllCellsInRow(row);
  } else {
    syncCutoff();
  }

  toggleEmptyRowsMessage();
}

function resetCaseForm() {
  caseForm.reset();
  el('case-id').value = '';
  el('case-date').value = Utils.todayISO();
  pathologyRowsContainer.innerHTML = '';
  renderSampleColumnsHeader();
  resizeWeightRowCells();
  updateAddPathologyAvailability();
  toggleEmptyRowsMessage();
  caseForm.querySelectorAll('.input--error').forEach((i) => Utils.clearFieldError(i));
}

el('case-samples').addEventListener('input', () => {
  renderSampleColumnsHeader();
  resizeWeightRowCells();
  Array.from(pathologyRowsContainer.querySelectorAll('.pathology-row')).forEach((row) => {
    resizeRowSampleCells(row);
    syncAllCellsInRow(row);
  });
  updateAddPathologyAvailability();
});

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
    el('case-status').value = c.status || 'Pendiente';
    el('case-observations').value = c.observations || '';
    renderSampleColumnsHeader();
    resizeWeightRowCells();
    const weightCells = document.querySelectorAll('#ct-matrix-weight-row .ph-weight-cell');
    (c.sampleWeights || []).forEach((w, i) => {
      if (weightCells[i] && w !== null && w !== undefined) weightCells[i].value = w;
    });
    updateAddPathologyAvailability();
    (c.pathologies || []).forEach((p) => addPathologyRow(p));
  } else {
    el('case-modal-title').textContent = 'Nuevo Caso';
  }
  Utils.openModal('modal-case');
}

el('btn-new-case').addEventListener('click', () => openCaseModal());
el('btn-add-pathology-row').addEventListener('click', () => addPathologyRow());

function collectPathologyRows() {
  return Array.from(pathologyRowsContainer.querySelectorAll('.pathology-row')).map((row) => {
    const select = row.querySelector('.ph-select');
    const ph = DB.pathologies.getById(select.value);
    const ctCutoff = row.querySelector('.ph-cutoff').value;
    const ctLower = row.dataset.ctLower || 0;
    const ctUpper = row.dataset.ctUpper || 0;
    const samples = Array.from(row.querySelectorAll('.ph-ct-cell')).map((input) => {
      const ctObtained = input.value;
      return {
        ctObtained: ctObtained === '' ? null : Number(ctObtained),
        result: Utils.calculateResult(ctObtained, ctCutoff, ctLower, ctUpper),
      };
    });
    return {
      pathologyId: select.value,
      name: ph ? ph.name : '',
      ctCutoff: Number(ctCutoff),
      ctUncertaintyLower: Number(ctLower) || 0,
      ctUncertaintyUpper: Number(ctUpper) || 0,
      observations: row.querySelector('.ph-obs').value.trim(),
      samples,
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
  } else if (pathologyRows.some((p) => !p.pathologyId)) {
    Utils.toast('Selecciona una patología válida en cada fila.', 'error');
    valid = false;
  } else if (pathologyRows.some((p) => p.samples.some((s) => s.ctObtained === null))) {
    Utils.toast('Completa el Ct de todas las muestras en cada patología agregada.', 'error');
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
    sampleWeights: collectSampleWeights(),
    status: el('case-status').value,
    observations: el('case-observations').value.trim(),
    pathologies: pathologyRows,
  };

  const id = el('case-id').value;
  const saved = id ? DB.cases.update(id, payload) : DB.cases.create(payload);
  if (!saved) return; // writeStore ya mostró el toast de error; se deja el modal abierto para no perder lo tipeado

  Utils.toast(id ? 'Caso actualizado correctamente.' : 'Caso registrado correctamente.', 'success');
  Utils.closeModal('modal-case');
  refreshCasesView();
});

async function deleteCase(id) {
  const c = DB.cases.getById(id);
  if (!c) return;
  const ok = await Utils.confirmDialog(`¿Eliminar el caso "${c.caseNumber}"? Esta acción no se puede deshacer.`);
  if (!ok) return;
  if (!DB.cases.remove(id)) return;
  Utils.toast('Caso eliminado.', 'success');
  refreshCasesView();
}

// ============================================================
// Modal: Ver Caso
// ============================================================
let currentViewCaseId = null;

function openViewCaseModal(id) {
  const c = DB.cases.getById(id);
  if (!c) return;
  currentViewCaseId = id;

  const sampleCount = c.sampleCount || 0;
  const sampleHeaders = Array.from({ length: sampleCount }, (_, i) => `<th>M${i + 1}</th>`).join('');

  const weightCells = Array.from({ length: sampleCount }, (_, i) => {
    const w = (c.sampleWeights || [])[i];
    return `<td>${w !== null && w !== undefined ? w : '—'}</td>`;
  }).join('');
  const weightRow = sampleCount
    ? `<tr><td colspan="2" class="weight-row-label">Peso (g) por muestra</td>${weightCells}<td></td></tr>`
    : '';

  const rows = (c.pathologies || []).map((p) => {
    const cells = Array.from({ length: sampleCount }, (_, i) => {
      const s = (p.samples || [])[i];
      const ctVal = s && s.ctObtained !== null && s.ctObtained !== undefined ? s.ctObtained : '—';
      return `<td><span class="result-badge${resultBadgeClass(s?.result)}">${ctVal}</span></td>`;
    }).join('');
    return `<tr><td>${Utils.escapeHtml(p.name)}</td><td>${p.ctCutoff}</td>${cells}<td>${Utils.escapeHtml(p.observations || '—')}</td></tr>`;
  }).join('');

  el('view-case-body').innerHTML = `
    <div class="detail-grid">
      <div><span class="detail-label">N° Caso</span><span class="detail-value">${Utils.escapeHtml(c.caseNumber)}</span></div>
      <div><span class="detail-label">Fecha</span><span class="detail-value">${Utils.formatDate(c.date)}</span></div>
      <div><span class="detail-label">Cliente</span><span class="detail-value">${Utils.escapeHtml(c.client)}</span></div>
      <div><span class="detail-label">N° Muestras</span><span class="detail-value">${c.sampleCount}</span></div>
      <div><span class="detail-label">Matriz</span><span class="detail-value">${Utils.escapeHtml(c.matrix || '—')}</span></div>
      <div><span class="detail-label">Estado</span><span class="badge ${statusBadgeClass(c.status)}">${Utils.escapeHtml(c.status || 'Pendiente')}</span></div>
    </div>
    ${c.observations ? `<p><strong>Observaciones:</strong> ${Utils.escapeHtml(c.observations)}</p>` : ''}
    <div class="table-wrapper">
      <table class="data-table ct-matrix">
        <thead><tr><th>Patología</th><th>Ct corte</th>${sampleHeaders}<th>Observaciones</th></tr></thead>
        <tbody>${weightRow}${rows || `<tr><td colspan="${sampleCount + 3}">Sin patologías registradas.</td></tr>`}</tbody>
      </table>
    </div>`;

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
  const saved = id ? DB.pathologies.update(id, payload) : DB.pathologies.create(payload);
  if (!saved) return; // writeStore ya mostró el toast de error; se deja el modal abierto para no perder lo tipeado

  Utils.toast(id ? 'Patología actualizada.' : 'Patología creada.', 'success');
  Utils.closeModal('modal-pathology');
  renderPathologiesTable();
  populateFilterOptions();
  populateExplorerOptions();
});

async function deletePathology(id) {
  const p = DB.pathologies.getById(id);
  if (!p) return;
  const ok = await Utils.confirmDialog(`¿Eliminar la patología "${p.name}" del catálogo? Los casos ya registrados conservan sus datos.`);
  if (!ok) return;
  if (!DB.pathologies.remove(id)) return;
  Utils.toast('Patología eliminada.', 'success');
  renderPathologiesTable();
  populateFilterOptions();
  populateExplorerOptions();
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
  return getFilteredCases().map((c) => {
    const flat = Utils.flattenCaseResults(c);
    return {
      'N° Caso': c.caseNumber,
      Fecha: Utils.formatDate(c.date),
      Cliente: c.client,
      'N° Muestras': c.sampleCount,
      Patologías: (c.pathologies || []).length,
      Positivos: flat.filter((r) => r.result === 'POSITIVO').length,
      Negativos: flat.filter((r) => r.result === 'NEGATIVO').length,
      Estado: c.status || 'Pendiente',
    };
  });
}

/** Un renglón por combinación muestra x patología: el detalle completo de un solo caso. */
function buildSingleCaseExportRows(c) {
  const rows = [];
  (c.pathologies || []).forEach((p) => {
    (p.samples || []).forEach((s, i) => {
      rows.push({
        'N° Caso': c.caseNumber,
        Fecha: Utils.formatDate(c.date),
        Cliente: c.client,
        Matriz: c.matrix || '',
        Muestra: `M${i + 1}`,
        'Peso (g)': (c.sampleWeights || [])[i] ?? '',
        Patología: p.name,
        'Ct corte': p.ctCutoff,
        'Ct obtenido': s && s.ctObtained !== null && s.ctObtained !== undefined ? s.ctObtained : '',
        Resultado: (s && s.result) || '',
        Observaciones: p.observations || '',
      });
    });
  });
  return rows;
}

function exportRowsToXlsx(rows, filename) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Datos');
  XLSX.writeFile(wb, filename);
}

function exportRowsToCsv(rows, filename) {
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => `"${String(r[h]).replace(/"/g, '""')}"`).join(',')),
  ].join('\n');
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function exportRowsToPdf(rows, filename, title) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFontSize(14);
  doc.setTextColor(11, 79, 138);
  doc.text(title, 14, 16);
  doc.autoTable({
    startY: 22,
    head: [Object.keys(rows[0])],
    body: rows.map((r) => Object.values(r)),
    headStyles: { fillColor: [11, 79, 138] },
    styles: { fontSize: 9 },
  });
  doc.save(filename);
}

el('export-xlsx').addEventListener('click', () => {
  const rows = buildExportRows();
  if (!rows.length) return Utils.toast('No hay casos para exportar.', 'error');
  exportRowsToXlsx(rows, `casos_lims_${Utils.todayISO()}.xlsx`);
});

el('export-csv').addEventListener('click', () => {
  const rows = buildExportRows();
  if (!rows.length) return Utils.toast('No hay casos para exportar.', 'error');
  exportRowsToCsv(rows, `casos_lims_${Utils.todayISO()}.csv`);
});

el('export-pdf').addEventListener('click', () => {
  const rows = buildExportRows();
  if (!rows.length) return Utils.toast('No hay casos para exportar.', 'error');
  exportRowsToPdf(rows, `casos_lims_${Utils.todayISO()}.pdf`, 'LIMS Salmones — Reporte de Casos');
});

el('export-case-xlsx').addEventListener('click', () => {
  const c = DB.cases.getById(currentViewCaseId);
  const rows = c && buildSingleCaseExportRows(c);
  if (!rows || !rows.length) return Utils.toast('Este caso no tiene patologías registradas para exportar.', 'error');
  exportRowsToXlsx(rows, `caso_${c.caseNumber}.xlsx`);
});

el('export-case-csv').addEventListener('click', () => {
  const c = DB.cases.getById(currentViewCaseId);
  const rows = c && buildSingleCaseExportRows(c);
  if (!rows || !rows.length) return Utils.toast('Este caso no tiene patologías registradas para exportar.', 'error');
  exportRowsToCsv(rows, `caso_${c.caseNumber}.csv`);
});

el('export-case-pdf').addEventListener('click', () => {
  const c = DB.cases.getById(currentViewCaseId);
  const rows = c && buildSingleCaseExportRows(c);
  if (!rows || !rows.length) return Utils.toast('Este caso no tiene patologías registradas para exportar.', 'error');
  exportRowsToPdf(rows, `caso_${c.caseNumber}.pdf`, `LIMS Salmones — Caso ${c.caseNumber}`);
});

// ============================================================
// Inicialización
// ============================================================
DB.init();
refreshCasesView();
renderPathologiesTable();
