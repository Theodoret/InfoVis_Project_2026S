const bmiState = {
  view: 'line',
  options: null,
  defaults: null,
};

const bmiViewConfigs = {
  line: {
    chartSelector: '#bmi-line-chart',
    summarySelector: '[data-bmi-summary="line"]',
    filters: ['bmi', 'country', 'sex', 'age', 'education'],
  },
  bar: {
    chartSelector: '#bmi-bar-chart',
    summarySelector: '[data-bmi-summary="bar"]',
    filters: ['bmi', 'sex', 'age', 'education', 'year'],
  },
  map: {
    chartSelector: '#bmi-map-chart',
    summarySelector: '[data-bmi-summary="map"]',
    filters: ['bmi', 'sex', 'age', 'education', 'year'],
  },
};

const bmiCountryIso3 = {
  AT: 'AUT',
  BE: 'BEL',
  BG: 'BGR',
  CY: 'CYP',
  CZ: 'CZE',
  DE: 'DEU',
  DK: 'DNK',
  EE: 'EST',
  EL: 'GRC',
  ES: 'ESP',
  FI: 'FIN',
  FR: 'FRA',
  HR: 'HRV',
  HU: 'HUN',
  IE: 'IRL',
  IS: 'ISL',
  IT: 'ITA',
  LT: 'LTU',
  LU: 'LUX',
  LV: 'LVA',
  MT: 'MLT',
  NL: 'NLD',
  NO: 'NOR',
  PL: 'POL',
  PT: 'PRT',
  RO: 'ROU',
  RS: 'SRB',
  SE: 'SWE',
  SI: 'SVN',
  SK: 'SVK',
  TR: 'TUR',
  UK: 'GBR',
};

function bmiFormatValue(value) {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return `${d3.format('.1f')(value)}%`;
}

function renderBmiMapLegend(minValue, maxValue) {
  if (typeof window.createGradientLegend !== 'function') {
    return;
  }

  const legend = window.createGradientLegend({
    containerSelector: '#bmi-map-legend',
    titleFormatter: () => 'BMI percentage',
    valueFormatter: bmiFormatValue,
  });

  legend.renderRange(minValue, maxValue);
}

function getBmiPanel(view = bmiState.view) {
  return document.querySelector(`[data-bmi-view-panel="${view}"]`);
}

function getBmiChart(view = bmiState.view) {
  return d3.select(bmiViewConfigs[view].chartSelector);
}

function getBmiChartSize(view = bmiState.view) {
  const node = document.querySelector(bmiViewConfigs[view].chartSelector);
  const width = node ? Math.max(520, node.getBoundingClientRect().width || 760) : 760;
  return { width, height: 300 };
}

function getBmiValues(view = bmiState.view) {
  const values = { ...(bmiState.defaults || {}) };
  const panel = getBmiPanel(view);
  if (!panel) {
    return values;
  }

  panel.querySelectorAll('[data-bmi-filter]').forEach(select => {
    values[select.dataset.bmiFilter] = select.value;
  });

  return values;
}

function setBmiSummary(view, title, value, count) {
  const summary = document.querySelector(bmiViewConfigs[view].summarySelector);
  if (!summary) {
    return;
  }

  const titleNode = summary.querySelector('[data-bmi-summary-title]');
  const valueNode = summary.querySelector('[data-bmi-summary-value]');
  const countNode = summary.querySelector('[data-bmi-summary-count]');

  if (titleNode) titleNode.textContent = title || '—';
  if (valueNode) valueNode.textContent = bmiFormatValue(value);
  if (countNode) countNode.textContent = Number.isFinite(count) ? d3.format(',')(count) : '—';
}

function fillBmiSelect(select, options, selectedValue) {
  select.innerHTML = '';
  for (const option of options) {
    const node = document.createElement('option');
    node.value = option.value;
    node.textContent = option.label;
    node.selected = option.value === selectedValue;
    select.appendChild(node);
  }
}

function renderBmiEmpty(view, message) {
  const chart = getBmiChart(view);
  chart.html('').style('min-height', null);
  chart.append('div')
    .attr('class', 'bmi-empty')
    .text(message);
}

function renderBmiLine(records) {
  const view = 'line';
  if (!records.length) {
    renderBmiEmpty(view, 'No BMI trend data available');
    setBmiSummary(view, 'No data', NaN, 0);
    return;
  }

  const { width, height } = getBmiChartSize(view);
  const chart = getBmiChart(view);
  chart.html('').style('min-height', null);

  const margin = { top: 28, right: 32, bottom: 42, left: 56 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const data = records
    .map(record => ({ ...record, yearNumber: Number(record.year) }))
    .filter(record => Number.isFinite(record.yearNumber))
    .sort((a, b) => a.yearNumber - b.yearNumber);

  const x = d3.scalePoint()
    .domain(data.map(record => record.year))
    .range([0, innerWidth])
    .padding(0.4);
  const y = d3.scaleLinear()
    .domain([0, d3.max(data, record => record.value) || 100])
    .nice()
    .range([innerHeight, 0]);

  const svg = chart.append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', `0 0 ${width} ${height}`);
  const group = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  group.append('g')
    .attr('transform', `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x));
  group.append('g')
    .call(d3.axisLeft(y).ticks(5).tickFormat(value => `${value}%`));

  group.append('path')
    .datum(data)
    .attr('fill', 'none')
    .attr('stroke', '#2563eb')
    .attr('stroke-width', 3)
    .attr('d', d3.line()
      .x(record => x(record.year))
      .y(record => y(record.value)));

  group.selectAll('circle')
    .data(data)
    .join('circle')
    .attr('cx', record => x(record.year))
    .attr('cy', record => y(record.value))
    .attr('r', 5)
    .attr('fill', '#ffffff')
    .attr('stroke', '#2563eb')
    .attr('stroke-width', 3);

  group.selectAll('.point-label')
    .data(data)
    .join('text')
    .attr('class', 'point-label')
    .attr('x', record => x(record.year))
    .attr('y', record => y(record.value) - 12)
    .attr('text-anchor', 'middle')
    .attr('fill', '#14213d')
    .attr('font-weight', 800)
    .attr('font-size', 12)
    .text(record => bmiFormatValue(record.value));

  const latest = data[data.length - 1];
  setBmiSummary(view, latest.country, latest.value, data.length);
}

function renderBmiBars(records) {
  const view = 'bar';
  const data = records.filter(record => !record.countryCode.startsWith('EU'));

  if (!data.length) {
    renderBmiEmpty(view, 'No BMI ranking data available');
    setBmiSummary(view, 'No data', NaN, 0);
    return;
  }

  const { width } = getBmiChartSize(view);
  const height = Math.max(300, data.length * 25 + 72);
  const chart = getBmiChart(view);
  chart.html('').style('min-height', `${height}px`);

  const margin = { top: 24, right: 54, bottom: 28, left: 118 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const x = d3.scaleLinear()
    .domain([0, d3.max(data, record => record.value) || 100])
    .nice()
    .range([0, innerWidth]);
  const y = d3.scaleBand()
    .domain(data.map(record => record.country))
    .range([0, innerHeight])
    .padding(0.24);

  const svg = chart.append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', `0 0 ${width} ${height}`);
  const group = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  group.append('g')
    .attr('transform', `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).ticks(5).tickFormat(value => `${value}%`));
  group.append('g')
    .call(d3.axisLeft(y).tickSize(0))
    .call(axis => axis.select('.domain').remove());

  group.selectAll('rect')
    .data(data)
    .join('rect')
    .attr('x', 0)
    .attr('y', record => y(record.country))
    .attr('width', record => x(record.value))
    .attr('height', y.bandwidth())
    .attr('rx', 5)
    .attr('fill', '#2563eb')
    .attr('opacity', 0.82);

  group.selectAll('.bar-label')
    .data(data)
    .join('text')
    .attr('class', 'bar-label')
    .attr('x', record => x(record.value) + 8)
    .attr('y', record => y(record.country) + y.bandwidth() / 2)
    .attr('dominant-baseline', 'middle')
    .attr('fill', '#14213d')
    .attr('font-weight', 800)
    .attr('font-size', 12)
    .text(record => bmiFormatValue(record.value));

  const top = data[0];
  setBmiSummary(view, top.country, top.value, data.length);
}

async function renderBmiMap(records) {
  const view = 'map';
  const validRecords = records.filter(record => Number.isFinite(record.value) && !record.countryCode.startsWith('EU'));
  if (!validRecords.length) {
    renderBmiEmpty(view, 'No BMI map data available');
    setBmiSummary(view, 'No data', NaN, 0);
    return;
  }

  const { width } = getBmiChartSize(view);
  const height = 620;
  const chart = getBmiChart(view);
  chart.html('').style('min-height', `${height}px`);

  const minValue = d3.min(validRecords, record => record.value);
  const maxValue = d3.max(validRecords, record => record.value);
  const colorScale = d3.scaleSequential(d3.interpolateOranges)
    .domain([minValue, maxValue]);
  const recordByIdentifier = new Map();

  for (const record of validRecords) {
    const iso3 = bmiCountryIso3[record.countryCode];
    if (iso3) {
      recordByIdentifier.set(String(iso3).toLowerCase(), record);
    }
    recordByIdentifier.set(String(record.country).toLowerCase(), record);
  }

  if (typeof window.createEuropeMap !== 'function') {
    renderBmiEmpty(view, 'Map module is unavailable');
    setBmiSummary(view, 'No map', NaN, 0);
    return;
  }

  const map = window.createEuropeMap(bmiViewConfigs.map.chartSelector, {
    width,
    height,
    defaultCountryColor: '#e5e7eb',
    strokeColor: '#333',
    strokeWidth: 0.5,
    svgClass: 'bmi-map-svg',
  });

  await map.ready;

  function findRecord(feature) {
    for (const identifier of map.getCountryIdentifiers(feature)) {
      const record = recordByIdentifier.get(identifier);
      if (record) {
        return record;
      }
    }
    return null;
  }

  map.countrySelection
    .attr('fill', feature => {
      const record = findRecord(feature);
      return record ? colorScale(record.value) : '#e5e7eb';
    });

  map.setHoverHandlers({
    mouseenter(event, feature) {
      const properties = feature && feature.properties ? feature.properties : {};
      const fallbackName = properties.admin || properties.ADMIN || properties.name || properties.NAME || 'Unknown country';
      const record = findRecord(feature);
      setBmiSummary(view, record ? record.country : fallbackName, record ? record.value : NaN, validRecords.length);

      d3.select(this)
        .attr('stroke', '#111827')
        .attr('stroke-width', 1.4);
    },
    mouseleave() {
      const top = validRecords[0];
      setBmiSummary(view, top.country, top.value, validRecords.length);

      d3.select(this)
        .attr('stroke', '#333')
        .attr('stroke-width', 0.5);
    },
  });

  renderBmiMapLegend(minValue, maxValue);

  const top = validRecords[0];
  setBmiSummary(view, top.country, top.value, validRecords.length);
}

async function loadBmiData(view = bmiState.view) {
  const params = new URLSearchParams({ ...getBmiValues(view), view });
  const response = await fetch(`/ivan/bmi-data?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Failed to load BMI data (${response.status})`);
  }
  const payload = await response.json();
  const records = Array.isArray(payload.records) ? payload.records : [];

  if (view === 'line') {
    renderBmiLine(records);
  } else if (view === 'map') {
    await renderBmiMap(records);
  } else {
    renderBmiBars(records);
  }
}

function setBmiView(view) {
  bmiState.view = view;
  document.querySelectorAll('.bmi-tab').forEach(tab => {
    const isActive = tab.dataset.bmiView === view;
    tab.classList.toggle('is-active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  });

  document.querySelectorAll('[data-bmi-view-panel]').forEach(panel => {
    panel.classList.toggle('is-active', panel.dataset.bmiViewPanel === view);
  });

  loadBmiData(view).catch(error => {
    console.error('Failed to update BMI explorer', error);
    renderBmiEmpty(view, 'Failed to load BMI data');
  });
}

function initializeBmiFilters(options, defaults) {
  document.querySelectorAll('[data-bmi-view-panel]').forEach(panel => {
    panel.querySelectorAll('[data-bmi-filter]').forEach(select => {
      const key = select.dataset.bmiFilter;
      fillBmiSelect(select, options[key] || [], defaults[key]);
      select.addEventListener('change', () => {
        const view = panel.dataset.bmiViewPanel;
        loadBmiData(view).catch(error => {
          console.error('Failed to update BMI explorer', error);
          renderBmiEmpty(view, 'Failed to load BMI data');
        });
      });
    });
  });
}

async function initializeBmiExplorer() {
  const response = await fetch('/ivan/bmi-options');
  if (!response.ok) {
    throw new Error(`Failed to load BMI options (${response.status})`);
  }

  const payload = await response.json();
  bmiState.options = payload.options;
  bmiState.defaults = payload.defaults;

  initializeBmiFilters(bmiState.options, bmiState.defaults);

  document.querySelectorAll('.bmi-tab').forEach(tab => {
    tab.addEventListener('click', () => setBmiView(tab.dataset.bmiView));
  });

  setBmiView(bmiState.view);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initializeBmiExplorer().catch(error => {
      console.error('BMI explorer failed', error);
      renderBmiEmpty(bmiState.view, 'Failed to load BMI data');
    });
  });
} else {
  initializeBmiExplorer().catch(error => {
    console.error('BMI explorer failed', error);
    renderBmiEmpty(bmiState.view, 'Failed to load BMI data');
  });
}
