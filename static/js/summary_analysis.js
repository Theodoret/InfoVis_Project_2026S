function initializeSummaryAnalysis() {
  const root = document.querySelector('#summary-analysis');
  if (!root) {
    return;
  }

  const SUMMARY_STORAGE_KEY = 'infovis.summaryAnalysis';
  const datasetSelect = root.querySelector('#summary-dataset-select');
  const gdpMetricSelect = root.querySelector('#summary-gdp-metric-select');
  const gdpYearSelect = root.querySelector('#summary-gdp-year-select');
  const gdpScaleSelect = root.querySelector('#summary-gdp-scale-select');
  const filterContainer = root.querySelector('#summary-filter-controls');
  const toolbar = root.querySelector('[data-standardization-root]');
  const standardizeControl = root.querySelector('[data-standardize-filter="standardize"]');
  const radarChart = root.querySelector('#summary-radar-chart');
  const radarLegend = root.querySelector('#summary-radar-legend');
  const state = {
    view: 'summary',
    dataset: '',
    loadingOptions: false,
  };

  function formatCorrelation(value) {
    return Number.isFinite(value) ? d3.format('.3f')(value) : '-';
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
    if (stored.datasets && stored.datasets[dataset]) {
      return stored.datasets[dataset];
    }

    const legacyKey = legacyDatasetKey(dataset);
    return legacyKey && stored.datasets && stored.datasets[legacyKey]
      ? stored.datasets[legacyKey]
      : {};
  }

  function standardizationStateForDataset(dataset) {
    try {
      const exact = JSON.parse(localStorage.getItem(`infovis.standardization.summary.${dataset}`) || '{}');
      if (Object.keys(exact).length) {
        return exact;
      }

      const legacyKey = legacyDatasetKey(dataset);
      return legacyKey
        ? JSON.parse(localStorage.getItem(`infovis.standardization.summary.${legacyKey}`) || '{}')
        : {};
    } catch {
      return {};
    }
  }

  function legacyDatasetKey(dataset) {
    if (String(dataset || '').startsWith('education:')) {
      return 'education:education';
    }
    if (String(dataset || '').startsWith('activities:')) {
      return 'activities:activities';
    }
    return '';
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

  function latestSelectedYear(values) {
    const years = values
      .map(value => Number.parseInt(value, 10))
      .filter(Number.isFinite);
    return years.length ? String(Math.max(...years)) : '';
  }

  function defaultGdpYearFromFilters() {
    const yearSelect = root.querySelector('.summary-filter-controls [data-indicator-filter="year"]');
    return yearSelect ? latestSelectedYear(selectedValues(yearSelect)) : '';
  }

  function fillSelect(select, options, selectedValue = '') {
    const previousValues = Array.isArray(selectedValue)
      ? selectedValue
      : String(selectedValue || select.value || '')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);
    if (select.id === 'summary-gdp-year-select' && previousValues.length > 1) {
      select.multiple = true;
    }
    const selectedSet = new Set(previousValues);
    select.innerHTML = '';
    options.forEach(option => {
      const node = document.createElement('option');
      node.value = option.value;
      node.textContent = option.label;
      node.selected = selectedSet.has(option.value);
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
      gdpYear: controlValue(gdpYearSelect),
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
    const count = root.querySelector('[data-summary-count]');
    const meta = root.querySelector('[data-summary-meta]');

    if (pearson) pearson.textContent = formatCorrelation(correlation.pearson);
    if (count) count.textContent = Number.isFinite(correlation.count) ? d3.format(',')(correlation.count) : '-';
    if (meta) {
      meta.textContent = `${payload.datasetLabel || 'Indicator'} compared with ${payload.gdpMetricLabel || 'GDP'} (${payload.gdpYear || '-'})`;
    }
  }

  function currentFilterValues() {
    const filters = {};
    root.querySelectorAll('.summary-filter-controls [data-indicator-filter]').forEach(select => {
      filters[select.dataset.indicatorFilter] = selectedValues(select);
    });
    return filters;
  }

  function collectRadarRequest() {
    const datasets = {};
    Array.from(datasetSelect.options || []).forEach(option => {
      const savedDataset = datasetState(option.value);
      const savedStandardization = standardizationStateForDataset(option.value);
      datasets[option.value] = {
        filters: savedDataset.filters || {},
        gdpYear: savedDataset.gdpYear || '',
        directions: savedStandardization.directions || {},
      };
    });

    if (datasetSelect.value) {
      datasets[datasetSelect.value] = {
        ...(datasets[datasetSelect.value] || {}),
        filters: currentFilterValues(),
        gdpYear: controlValue(gdpYearSelect),
        directions: typeof window.getStandardizationDirections === 'function'
          ? window.getStandardizationDirections(root)
          : ((datasets[datasetSelect.value] && datasets[datasetSelect.value].directions) || {}),
      };
    }

    return {
      gdpMetric: gdpMetricSelect.value,
      gdpScale: gdpScaleSelect.value,
      datasets,
    };
  }

  function radarPoints(payload) {
    return (payload.sectors || []).flatMap(sector => (
      (sector.points || []).map(point => ({
        ...point,
        sector: sector.label,
        color: sector.color,
      }))
    ));
  }

  function updateRadarStats(payload, points) {
    const average = root.querySelector('[data-radar-average]');
    const strongest = root.querySelector('[data-radar-strongest]');
    const count = root.querySelector('[data-radar-count]');
    const strongestPoint = payload.strongest || points
      .filter(point => Number.isFinite(point.value))
      .sort((left, right) => right.value - left.value)[0];

    if (average) {
      average.textContent = Number.isFinite(payload.average) ? d3.format('.2f')(payload.average) : '-';
    }
    if (strongest) {
      strongest.textContent = strongestPoint
        ? `${strongestPoint.shortLabel || strongestPoint.label} ${d3.format('.2f')(strongestPoint.value)}`
        : '-';
    }
    if (count) {
      count.textContent = Number.isFinite(payload.count) ? d3.format(',')(payload.count) : '-';
    }
  }

  function renderRadarLegend(sectors) {
    if (!radarLegend) {
      return;
    }
    radarLegend.innerHTML = '';
    (sectors || []).forEach(sector => {
      const item = document.createElement('div');
      const swatch = document.createElement('span');
      const label = document.createElement('strong');
      const meta = document.createElement('small');
      item.className = 'summary-radar-legend-item';
      swatch.style.background = sector.color;
      label.textContent = sector.label;
      meta.textContent = `${(sector.points || []).length} metrics`;
      item.appendChild(swatch);
      item.appendChild(label);
      item.appendChild(meta);
      radarLegend.appendChild(item);
    });
  }

  function wrapRadarLabel(text, maxCharacters = 15) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    words.forEach(word => {
      const next = line ? `${line} ${word}` : word;
      if (next.length > maxCharacters && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    });
    if (line) {
      lines.push(line);
    }
    return lines.slice(0, 3);
  }

  function polarPoint(centerX, centerY, angle, radius) {
    return [
      centerX + Math.cos(angle) * radius,
      centerY + Math.sin(angle) * radius,
    ];
  }

  function drawRadarEuropeBackground(svg, centerX, centerY, radius) {
    const layer = svg.append('g').attr('class', 'summary-radar-europe-map');
    if (typeof window.loadEuropeMapFeatures !== 'function') {
      return;
    }

    window.loadEuropeMapFeatures()
      .then(features => {
        if (!features || !features.length || !layer.node() || !layer.node().ownerSVGElement) {
          return;
        }
        const collection = { type: 'FeatureCollection', features };
        const projection = d3.geoMercator().fitExtent(
          [
            [centerX - radius * 1.02, centerY - radius * 0.86],
            [centerX + radius * 1.02, centerY + radius * 0.92],
          ],
          collection
        );
        const path = d3.geoPath().projection(projection);
        layer.selectAll('path')
          .data(features)
          .join('path')
          .attr('d', path);
      })
      .catch(error => {
        console.error('Failed to draw radar Europe background', error);
      });
  }

  function renderRadar(payload) {
    if (!radarChart) {
      return;
    }

    const points = radarPoints(payload).filter(point => Number.isFinite(point.value));
    updateRadarStats(payload, points);
    renderRadarLegend(payload.sectors || []);
    radarChart.innerHTML = '';

    if (points.length < 3) {
      const empty = document.createElement('div');
      empty.className = 'summary-radar-empty';
      empty.textContent = 'Not enough correlations for radar view';
      radarChart.appendChild(empty);
      return;
    }

    const width = Math.max(780, radarChart.clientWidth || 780);
    const height = 640;
    const centerX = width / 2;
    const centerY = height / 2 + 8;
    const radius = Math.min(width, height) * 0.33;
    const labelRadius = radius + 58;
    const step = (Math.PI * 2) / points.length;
    const angleForIndex = index => -Math.PI / 2 + index * step;
    const valueRadius = value => radius * Math.max(0, Math.min(1, value));
    const line = d3.line().curve(d3.curveLinearClosed);

    const svg = d3.select(radarChart)
      .append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('role', 'img')
      .attr('aria-label', 'Radar chart of absolute Pearson correlations by sector');

    const defs = svg.append('defs');
    const fillGradient = defs.append('radialGradient')
      .attr('id', 'summary-radar-fill')
      .attr('cx', '50%')
      .attr('cy', '50%')
      .attr('r', '62%');
    fillGradient.append('stop').attr('offset', '0%').attr('stop-color', '#ffffff').attr('stop-opacity', 0.9);
    fillGradient.append('stop').attr('offset', '58%').attr('stop-color', '#60a5fa').attr('stop-opacity', 0.34);
    fillGradient.append('stop').attr('offset', '100%').attr('stop-color', '#4f46e5').attr('stop-opacity', 0.24);

    drawRadarEuropeBackground(svg, centerX, centerY, radius);

    const background = svg.append('g').attr('class', 'summary-radar-background');
    let cursor = 0;
    (payload.sectors || []).forEach(sector => {
      const sectorCount = (sector.points || []).filter(point => Number.isFinite(point.value)).length;
      if (!sectorCount) {
        return;
      }
      const startAngle = angleForIndex(cursor) - step / 2;
      const endAngle = angleForIndex(cursor + sectorCount - 1) + step / 2;
      const middleAngle = (startAngle + endAngle) / 2;
      const arc = d3.arc()
        .innerRadius(0)
        .outerRadius(radius + 26)
        .startAngle(startAngle + Math.PI / 2)
        .endAngle(endAngle + Math.PI / 2);
      background.append('path')
        .attr('transform', `translate(${centerX},${centerY})`)
        .attr('d', arc)
        .attr('fill', sector.color)
        .attr('opacity', 0.1);

      const [labelX, labelY] = polarPoint(centerX, centerY, middleAngle, radius + 108);
      background.append('text')
        .attr('x', labelX)
        .attr('y', labelY)
        .attr('text-anchor', labelX < centerX - 8 ? 'end' : labelX > centerX + 8 ? 'start' : 'middle')
        .attr('class', 'summary-radar-sector-label')
        .attr('fill', sector.color)
        .text(sector.label);
      cursor += sectorCount;
    });

    const grid = svg.append('g').attr('class', 'summary-radar-grid');
    [0.25, 0.5, 0.75, 1].forEach(value => {
      const ringPoints = points.map((_, index) => polarPoint(centerX, centerY, angleForIndex(index), radius * value));
      grid.append('path')
        .attr('d', line(ringPoints))
        .attr('class', 'summary-radar-ring');
      const [tickX, tickY] = polarPoint(centerX, centerY, -Math.PI / 2, radius * value);
      grid.append('text')
        .attr('x', tickX + 8)
        .attr('y', tickY + 4)
        .attr('class', 'summary-radar-tick')
        .text(d3.format('.2f')(value));
    });

    points.forEach((point, index) => {
      const angle = angleForIndex(index);
      const [axisX, axisY] = polarPoint(centerX, centerY, angle, radius);
      const [labelX, labelY] = polarPoint(centerX, centerY, angle, labelRadius);
      grid.append('line')
        .attr('x1', centerX)
        .attr('y1', centerY)
        .attr('x2', axisX)
        .attr('y2', axisY)
        .attr('class', 'summary-radar-axis');

      const label = grid.append('text')
        .attr('x', labelX)
        .attr('y', labelY)
        .attr('text-anchor', labelX < centerX - 8 ? 'end' : labelX > centerX + 8 ? 'start' : 'middle')
        .attr('class', 'summary-radar-axis-label');
      wrapRadarLabel(point.shortLabel || point.label).forEach((lineText, lineIndex) => {
        label.append('tspan')
          .attr('x', labelX)
          .attr('dy', lineIndex ? 13 : 0)
          .text(lineText);
      });
    });

    const polygonPoints = points.map((point, index) => (
      polarPoint(centerX, centerY, angleForIndex(index), valueRadius(point.value))
    ));

    svg.append('path')
      .attr('class', 'summary-radar-area')
      .attr('d', line(polygonPoints));
    svg.append('path')
      .attr('class', 'summary-radar-stroke')
      .attr('d', line(polygonPoints));

    const markerLayer = svg.append('g').attr('class', 'summary-radar-markers');
    points.forEach((point, index) => {
      const [x, y] = polygonPoints[index];
      const marker = markerLayer.append('g')
        .attr('transform', `translate(${x},${y})`);
      marker.append('circle')
        .attr('r', 7)
        .attr('fill', point.color)
        .attr('class', 'summary-radar-point');
      marker.append('circle')
        .attr('r', 12)
        .attr('fill', 'transparent')
        .attr('stroke', point.color)
        .attr('stroke-opacity', 0.24)
        .attr('stroke-width', 2);
      marker.append('title')
        .text(`${point.label}\n${point.sector}\nAbsolute Pearson: ${d3.format('.3f')(point.value)}\nCountries: ${point.count}`);
    });
  }

  async function loadRadarData() {
    if (!datasetSelect.options.length) {
      return;
    }

    const response = await fetch('/summary-analysis/radar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(collectRadarRequest()),
    });
    if (!response.ok) {
      throw new Error(`Failed to load summary radar (${response.status})`);
    }
    renderRadar(await response.json());
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
    await loadRadarData();
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
      const previousGdpYear = datasetState(datasetSelect.value).gdpYear;
      saveCurrentFilterState();
      if (dimension.key === 'year' && !previousGdpYear) {
        fillSelect(gdpYearSelect, state.gdpYearOptions || [], defaultGdpYearFromFilters() || gdpYearSelect.value);
        if (typeof window.refreshStandardizationControls === 'function') {
          window.refreshStandardizationControls(root);
        }
      }
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
    state.gdpYearOptions = payload.gdpYearOptions || [];

    if (!datasetSelect.options.length) {
      fillSelect(datasetSelect, payload.datasets || [], stored.dataset || payload.selectedDataset);
    }
    datasetSelect.value = payload.selectedDataset;
    const selectedDatasetState = datasetState(payload.selectedDataset);
    fillSelect(gdpMetricSelect, payload.gdpMetricOptions || [], stored.gdpMetric || gdpMetricSelect.value || 'total');
    renderFilters(payload);
    fillSelect(gdpYearSelect, payload.gdpYearOptions || [], selectedDatasetState.gdpYear || stored.gdpYear || defaultGdpYearFromFilters() || gdpYearSelect.value);
    fillSelect(gdpScaleSelect, payload.gdpScaleOptions || [], stored.gdpScale || gdpScaleSelect.value || 'raw');
    if (typeof window.refreshStandardizationControls === 'function') {
      window.refreshStandardizationControls(root);
    }
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
  gdpYearSelect.addEventListener('change', () => {
    saveDatasetState(datasetSelect.value, { gdpYear: controlValue(gdpYearSelect) });
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
