function initializeSummaryAnalysis() {
  const root = document.querySelector('#summary-analysis');
  if (!root) {
    return;
  }

  const SUMMARY_STORAGE_KEY = 'infovis.summaryAnalysis';
  const datasetSelect = root.querySelector('#summary-dataset-select');
  const gdpMetricSelect = root.querySelector('#summary-gdp-metric-select');
  const gdpScaleSelect = root.querySelector('#summary-gdp-scale-select');
  const filterContainer = root.querySelector('#summary-filter-controls');
  const toolbar = root.querySelector('[data-standardization-root]');
  const standardizeControl = root.querySelector('[data-standardize-filter="standardize"]');
  const tableBody = root.querySelector('#summary-score-table tbody');
  const state = {
    view: 'summary',
    dataset: '',
    loadingOptions: false,
  };

  function formatScore(value) {
    return Number.isFinite(value) ? d3.format('.2f')(value) : '-';
  }

  function formatCorrelation(value) {
    return Number.isFinite(value) ? d3.format('.3f')(value) : '-';
  }

  function formatGdp(value, scale) {
    if (!Number.isFinite(value)) {
      return '-';
    }
    return scale === 'log' ? d3.format('.2f')(value) : d3.format(',.0f')(value);
  }

  function loadSummaryState() {
    try {
      return JSON.parse(localStorage.getItem(SUMMARY_STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function saveSummaryState(updates = {}) {
    localStorage.setItem(SUMMARY_STORAGE_KEY, JSON.stringify({
      ...loadSummaryState(),
      ...updates,
    }));
  }

  function datasetState(dataset) {
    const stored = loadSummaryState();
    return stored.datasets && stored.datasets[dataset] ? stored.datasets[dataset] : {};
  }

  function saveDatasetState(dataset, updates = {}) {
    const stored = loadSummaryState();
    const datasets = {
      ...(stored.datasets || {}),
      [dataset]: {
        ...datasetState(dataset),
        ...updates,
      },
    };
    saveSummaryState({ datasets });
  }

  function selectedValues(select) {
    return Array.from(select.selectedOptions || [])
      .map(option => option.value)
      .filter(Boolean);
  }

  function controlValue(select) {
    return select.multiple ? selectedValues(select).join(',') : select.value;
  }

  function fillSelect(select, options, selectedValue = '') {
    const previousValue = selectedValue || select.value;
    select.innerHTML = '';
    options.forEach(option => {
      const node = document.createElement('option');
      node.value = option.value;
      node.textContent = option.label;
      node.selected = option.value === previousValue;
      select.appendChild(node);
    });
    if (!select.value && select.options.length) {
      select.value = select.options[0].value;
    }
  }

  function fillMultiSelect(select, options, selectedValues = null) {
    const optionValues = new Set(options.map(option => option.value));
    const selectedSet = new Set(
      Array.isArray(selectedValues)
        ? selectedValues.filter(value => optionValues.has(value))
        : []
    );
    const hasSavedSelection = selectedSet.size > 0;

    select.innerHTML = '';
    select.multiple = true;
    options.forEach(option => {
      const node = document.createElement('option');
      node.value = option.value;
      node.textContent = option.label;
      node.selected = hasSavedSelection ? selectedSet.has(option.value) : true;
      select.appendChild(node);
    });
  }

  function collectParams() {
    const params = new URLSearchParams({
      dataset: datasetSelect.value,
      standardize: '1',
      combine: '1',
      gdpMetric: gdpMetricSelect.value,
      gdpScale: gdpScaleSelect.value,
    });

    root.querySelectorAll('.summary-filter-controls [data-indicator-filter]').forEach(select => {
      params.set(select.dataset.indicatorFilter, controlValue(select));
    });

    if (typeof window.getStandardizationDirections === 'function') {
      params.set('directions', JSON.stringify(window.getStandardizationDirections(root)));
    }

    return params;
  }

  function setSummary(payload) {
    const correlation = payload.correlation || {};
    const pearson = root.querySelector('[data-summary-pearson]');
    const spearman = root.querySelector('[data-summary-spearman]');
    const count = root.querySelector('[data-summary-count]');
    const meta = root.querySelector('[data-summary-meta]');

    if (pearson) pearson.textContent = formatCorrelation(correlation.pearson);
    if (spearman) spearman.textContent = formatCorrelation(correlation.spearman);
    if (count) count.textContent = Number.isFinite(correlation.count) ? d3.format(',')(correlation.count) : '-';
    if (meta) {
      meta.textContent = `${payload.datasetLabel || 'Dataset'} compared with ${payload.gdpMetricLabel || 'GDP'} (${payload.gdpYear || '-'})`;
    }
  }

  function renderTable(payload) {
    const records = Array.isArray(payload.records) ? payload.records : [];
    tableBody.innerHTML = '';

    if (!records.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 4;
      cell.textContent = 'No summary records available';
      row.appendChild(cell);
      tableBody.appendChild(row);
      return;
    }

    records.forEach(record => {
      const row = document.createElement('tr');
      const country = document.createElement('td');
      const score = document.createElement('td');
      const gdp = document.createElement('td');
      const combined = document.createElement('td');
      const flagUrl = typeof window.flagUrlForRecord === 'function' ? window.flagUrlForRecord(record) : null;
      const countryContent = document.createElement('span');
      const countryName = document.createElement('span');

      countryContent.className = 'summary-country-cell';
      if (flagUrl) {
        const flag = document.createElement('img');
        flag.src = flagUrl;
        flag.alt = '';
        countryContent.appendChild(flag);
      }
      countryName.textContent = record.country || '-';
      countryContent.appendChild(countryName);
      country.appendChild(countryContent);
      score.textContent = formatScore(record.score);
      gdp.textContent = formatGdp(record.gdp, payload.gdpScale);
      combined.textContent = Number.isFinite(record.combinedCount) ? d3.format(',')(record.combinedCount) : '-';

      row.appendChild(country);
      row.appendChild(score);
      row.appendChild(gdp);
      row.appendChild(combined);
      tableBody.appendChild(row);
    });
  }

  async function loadData() {
    if (!datasetSelect.value || state.loadingOptions) {
      return;
    }

    const response = await fetch(`/summary-analysis/data?${collectParams().toString()}`);
    if (!response.ok) {
      throw new Error(`Failed to load summary analysis (${response.status})`);
    }
    const payload = await response.json();
    setSummary(payload);
    renderTable(payload);
  }

  function addFilterControl(dimension) {
    const savedFilters = datasetState(datasetSelect.value).filters || {};
    const label = document.createElement('label');
    const title = document.createElement('span');
    const select = document.createElement('select');
    title.textContent = dimension.label;
    select.dataset.indicatorFilter = dimension.key;
    fillMultiSelect(select, dimension.options || [], savedFilters[dimension.key]);
    select.addEventListener('change', () => {
      saveCurrentFilterState();
      loadData().catch(error => console.error('Failed to refresh summary analysis', error));
    });
    label.appendChild(title);
    label.appendChild(select);
    filterContainer.appendChild(label);
  }

  function saveCurrentFilterState() {
    const filters = {};
    root.querySelectorAll('.summary-filter-controls [data-indicator-filter]').forEach(select => {
      filters[select.dataset.indicatorFilter] = selectedValues(select);
    });
    saveDatasetState(datasetSelect.value, { filters });
  }

  function renderFilters(payload) {
    filterContainer.innerHTML = '';
    (payload.dimensions || []).forEach(addFilterControl);
    if (toolbar) {
      toolbar.dataset.standardizationRoot = `summary.${payload.selectedDataset}`;
      toolbar.dataset.summaryDataset = payload.selectedDataset;
    }
    if (standardizeControl) {
      standardizeControl.value = '1';
    }
    if (typeof window.refreshStandardizationControls === 'function') {
      window.refreshStandardizationControls(root);
    }
  }

  async function loadOptions(dataset = datasetSelect.value) {
    state.loadingOptions = true;
    const stored = loadSummaryState();
    const response = await fetch(`/summary-analysis/options?dataset=${encodeURIComponent(dataset || '')}`);
    if (!response.ok) {
      throw new Error(`Failed to load summary options (${response.status})`);
    }
    const payload = await response.json();
    state.dataset = payload.selectedDataset;

    if (!datasetSelect.options.length) {
      fillSelect(datasetSelect, payload.datasets || [], stored.dataset || payload.selectedDataset);
    }
    datasetSelect.value = payload.selectedDataset;
    fillSelect(gdpMetricSelect, payload.gdpMetricOptions || [], stored.gdpMetric || gdpMetricSelect.value || 'total');
    fillSelect(gdpScaleSelect, payload.gdpScaleOptions || [], stored.gdpScale || gdpScaleSelect.value || 'raw');
    renderFilters(payload);
    state.loadingOptions = false;
    await loadData();
  }

  datasetSelect.addEventListener('change', () => {
    saveSummaryState({ dataset: datasetSelect.value });
    loadOptions(datasetSelect.value).catch(error => console.error('Failed to switch summary dataset', error));
  });
  gdpMetricSelect.addEventListener('change', () => {
    saveSummaryState({ gdpMetric: gdpMetricSelect.value });
    loadData().catch(error => console.error('Failed to refresh summary analysis', error));
  });
  gdpScaleSelect.addEventListener('change', () => {
    saveSummaryState({ gdpScale: gdpScaleSelect.value });
    loadData().catch(error => console.error('Failed to refresh summary analysis', error));
  });
  if (standardizeControl) {
    standardizeControl.addEventListener('change', () => {
      loadData().catch(error => console.error('Failed to refresh summary analysis', error));
    });
  }

  root.__eurostatExplorer = {
    loadData,
    state,
  };

  loadOptions(loadSummaryState().dataset || '').catch(error => console.error('Summary analysis failed', error));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeSummaryAnalysis);
} else {
  initializeSummaryAnalysis();
}
