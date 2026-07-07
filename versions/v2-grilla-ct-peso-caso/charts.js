/**
 * charts.js — Gráficos del Dashboard, todos con Chart.js (CDN).
 * Cada render* destruye la instancia previa del canvas antes de crear otra.
 */

const Charts = {
  instances: {},

  _render(canvasId, config) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    if (this.instances[canvasId]) this.instances[canvasId].destroy();
    this.instances[canvasId] = new Chart(ctx, config);
  },

  renderAll(cases) {
    this.renderCasesByMonth(cases);
    this.renderTopPathologies(cases);
    this.renderPositivesByPathology(cases);
    this.renderPositivePercentage(cases);
    this.renderCtDistribution(cases);
  },

  renderCasesByMonth(cases) {
    const counts = {};
    cases.forEach((c) => {
      const key = (c.date || '').slice(0, 7); // YYYY-MM
      if (!key) return;
      counts[key] = (counts[key] || 0) + 1;
    });
    const labels = Object.keys(counts).sort();
    this._render('chart-cases-by-month', {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Casos',
          data: labels.map((l) => counts[l]),
          borderColor: '#0B4F8A',
          backgroundColor: 'rgba(79,142,220,0.2)',
          tension: 0.3,
          fill: true,
        }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
    });
  },

  renderTopPathologies(cases) {
    const counts = {};
    cases.forEach((c) => (c.pathologies || []).forEach((p) => {
      counts[p.name] = (counts[p.name] || 0) + 1;
    }));
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
    this._render('chart-top-pathologies', {
      type: 'bar',
      data: {
        labels: sorted.map((s) => s[0]),
        datasets: [{ label: 'Veces solicitada', data: sorted.map((s) => s[1]), backgroundColor: '#4F8EDC' }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
      },
    });
  },

  renderPositivesByPathology(cases) {
    const counts = {};
    cases.forEach((c) => Utils.flattenCaseResults(c).forEach((r) => {
      if (r.result === 'POSITIVO') counts[r.pathologyName] = (counts[r.pathologyName] || 0) + 1;
    }));
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
    this._render('chart-positives-by-pathology', {
      type: 'bar',
      data: {
        labels: sorted.map((s) => s[0]),
        datasets: [{ label: 'Positivos', data: sorted.map((s) => s[1]), backgroundColor: '#D64545' }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
    });
  },

  renderPositivePercentage(cases) {
    let pos = 0;
    let neg = 0;
    let gray = 0;
    cases.forEach((c) => Utils.flattenCaseResults(c).forEach((r) => {
      if (r.result === 'POSITIVO') pos += 1;
      else if (r.result === 'NEGATIVO') neg += 1;
      else if (r.result === 'OBSERVAR') gray += 1;
    }));
    this._render('chart-positive-percentage', {
      type: 'doughnut',
      data: {
        labels: ['Positivos', 'Negativos', 'Observar'],
        datasets: [{ data: [pos, neg, gray], backgroundColor: ['#D64545', '#2E9E5B', '#C9861A'] }],
      },
      options: { responsive: true, maintainAspectRatio: false },
    });
  },

  renderCtDistribution(cases) {
    const cts = [];
    cases.forEach((c) => Utils.flattenCaseResults(c).forEach((r) => {
      if (r.ctObtained !== null && r.ctObtained !== undefined) cts.push(Number(r.ctObtained));
    }));
    const bucketSize = 2;
    const buckets = {};
    cts.forEach((ct) => {
      const bucket = Math.floor(ct / bucketSize) * bucketSize;
      const key = `${bucket}-${bucket + bucketSize}`;
      buckets[key] = (buckets[key] || 0) + 1;
    });
    const labels = Object.keys(buckets).sort((a, b) => Number(a.split('-')[0]) - Number(b.split('-')[0]));
    this._render('chart-ct-distribution', {
      type: 'bar',
      data: {
        labels,
        datasets: [{ label: 'N° de resultados', data: labels.map((l) => buckets[l]), backgroundColor: '#0B4F8A' }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
    });
  },
};
