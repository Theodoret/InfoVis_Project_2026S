function getSectorApiBase() {
  return (window.sectorApiBase || '/healthcare').replace(/\/$/, '');
}

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
  correlation: {
    chartSelector: '#bmi-correlation-scatter',
    summarySelector: '[data-bmi-summary="correlation"]',
    dataUrl: `${getSectorApiBase()}/bmi-gdp-correlation`,
    filters: ['bmi', 'sex', 'age', 'education', 'year', 'gdpMetric', 'gdpYear', 'gdpScale', 'correlationVariable'],
  },
};

const BMI_ORANGE_GRADIENT = 'linear-gradient(90deg, #fff7ed 0%, #fed7aa 35%, #fb923c 68%, #c2410c 100%)';
const bmiCorrelationState = {
  spreadOverlaps: true,
  payload: null,
};

function bmiFormatValue(value) {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return `${d3.format('.1f')(value)}%`;
}

function bmiValueFormatterForPayload(payload) {
  return typeof window.valueFormatterForPayload === 'function'
    ? window.valueFormatterForPayload(payload, bmiFormatValue)
    : bmiFormatValue;
}

function isBmiStandardized(payload) {
  return typeof window.isStandardizedPayload === 'function' && window.isStandardizedPayload(payload);
}

function formatCorrelation(value) {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return d3.format('.3f')(value);
}

function formatGdpAxis(value) {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return d3.format('.2s')(value);
}

function formatLogGdpAxis(value) {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return d3.format('.2f')(value);
}

function isAggregateCountry(record) {
  const code = String(record && record.countryCode ? record.countryCode : '').toUpperCase();
  return (
    !code ||
    code.startsWith('EU') ||
    code.startsWith('EA') ||
    code.startsWith('EEA') ||
    code.startsWith('EFTA') ||
    code === 'DE_TOT'
  );
}

function renderBmiMapLegend(minValue, maxValue, containerSelector = '#bmi-map-legend', options = {}) {
  if (typeof window.createGradientLegend !== 'function') {
    return;
  }

  const legend = window.createGradientLegend({
    containerSelector,
    titleFormatter: () => options.title || 'BMI percentage',
    valueFormatter: options.valueFormatter || bmiFormatValue,
    gradient: BMI_ORANGE_GRADIENT,
  });

  legend.renderRange(minValue, maxValue);
}

function getBmiChart(view = 'line') {
  return d3.select(bmiViewConfigs[view].chartSelector);
}

function renderBmiEmpty(view, message) {
  window.renderEmptyChart(bmiViewConfigs[view].chartSelector, message);
}

async function renderBmiCountryMap(options = {}) {
  const selector = options.selector;
  const valueFormatter = options.valueFormatter || bmiFormatValue;
  const colorInterpolator = options.colorInterpolator || d3.interpolateOranges;
  const defaultCountryColor = options.defaultCountryColor || '#e5e7eb';
  const strokeColor = options.strokeColor || '#333';
  const strokeWidth = options.strokeWidth ?? 0.5;
  const records = (options.records || [])
    .filter(record => Number.isFinite(record.value) && !isAggregateCountry(record));

  if (!records.length) {
    return { data: [], top: null };
  }

  const { width } = window.getChartSize(selector);
  const panelWidth = Math.min(140, Math.max(118, Math.round(width * 0.18)));
  const mapSize = Math.min(options.maxMapSize || 620, Math.max(360, width - panelWidth));
  const chartWidth = mapSize + panelWidth;
  const chart = d3.select(selector);
  chart.html('').style('min-height', `${mapSize}px`);

  const minValue = d3.min(records, record => record.value);
  const maxValue = d3.max(records, record => record.value);
  const colorScale = d3.scaleSequential(colorInterpolator)
    .domain([minValue, maxValue]);
  const recordByIdentifier = new Map();

  for (const record of records) {
    const iso3 = window.eurostatCountryIso3[record.countryCode];
    if (iso3) {
      recordByIdentifier.set(String(iso3).toLowerCase(), record);
    }
    if (record.iso3) {
      recordByIdentifier.set(String(record.iso3).toLowerCase(), record);
    }
    recordByIdentifier.set(String(record.country).toLowerCase(), record);
  }

  if (typeof window.createEuropeMap !== 'function') {
    return { data: records, top: records[0] || null, mapUnavailable: true };
  }

  const map = window.createEuropeMap(selector, {
    width: chartWidth,
    height: mapSize,
    microstatePanelWidth: panelWidth,
    defaultCountryColor,
    strokeColor,
    strokeWidth,
    svgClass: options.svgClass || 'bmi-map-svg',
  });

  await map.ready;
  if (typeof options.isStale === 'function' && options.isStale()) {
    return { data: records, top: records[0] || null, stale: true };
  }

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
      return record ? colorScale(record.value) : defaultCountryColor;
    });

  map.setHoverHandlers({
    mouseenter(event, feature) {
      const properties = feature && feature.properties ? feature.properties : {};
      const fallbackName = properties.admin || properties.ADMIN || properties.name || properties.NAME || 'Unknown country';
      const record = findRecord(feature);
      if (typeof options.onHover === 'function') {
        options.onHover(record, fallbackName);
      }

      d3.select(this)
        .attr('stroke', '#111827')
        .attr('stroke-width', 1.4);
    },
    mouseleave() {
      if (typeof options.onLeave === 'function') {
        options.onLeave(records[0] || null);
      }

      d3.select(this)
        .attr('stroke', strokeColor)
        .attr('stroke-width', strokeWidth);
    },
  });

  if (typeof options.renderLegend === 'function') {
    options.renderLegend(minValue, maxValue);
  }

  if (typeof window.renderMicrostateCallouts === 'function') {
    window.renderMicrostateCallouts(map, {
      records,
      valueKey: 'value',
      colorScale,
      valueFormatter,
      onHover(record, fallbackName) {
        if (typeof options.onHover === 'function') {
          options.onHover(record, fallbackName);
        }
      },
      onLeave() {
        if (typeof options.onLeave === 'function') {
          options.onLeave(records[0] || null);
        }
      },
    });
  }

  return {
    data: records,
    top: records[0] || null,
  };
}

function renderBmiLine(records, context) {
  const view = 'line';
  const valueFormatter = bmiValueFormatterForPayload(context.payload);
  const standardized = isBmiStandardized(context.payload);
  if (!records.length) {
    renderBmiEmpty(view, 'No BMI trend data available');
    context.setSummary(view, 'No data', NaN, 0);
    return;
  }

  const result = window.renderLineChart({
    selector: bmiViewConfigs[view].chartSelector,
    records,
    valueFormatter,
    yTickFormatter: valueFormatter,
    lineColor: '#2563eb',
    backgroundRecord: records[0],
    backgroundOpacity: 0.07,
    yDomain: standardized ? [0, 1] : undefined,
  });

  context.setSummary(view, result.latest.country, result.latest.value, result.data.length);
}

function renderBmiBars(records, context) {
  const view = 'bar';
  const valueFormatter = bmiValueFormatterForPayload(context.payload);
  const data = records.filter(record => !isAggregateCountry(record));

  if (!data.length) {
    renderBmiEmpty(view, 'No BMI ranking data available');
    context.setSummary(view, 'No data', NaN, 0);
    return;
  }

  const result = window.renderHorizontalBarChart({
    selector: bmiViewConfigs[view].chartSelector,
    records: data,
    labelKey: 'country',
    valueKey: 'value',
    valueFormatter,
    barColor: '#2563eb',
    showFlags: true,
    flagPlacement: 'bar-end',
    flagHeight: 16,
    flagWidth: 24,
    rowHeight: 30,
    margin: { top: 24, right: 72, bottom: 28, left: 118 },
  });

  context.setSummary(view, result.top.country, result.top.value, result.data.length);
}

async function renderBmiMap(records, context) {
  const view = 'map';
  const valueFormatter = bmiValueFormatterForPayload(context.payload);
  const standardized = isBmiStandardized(context.payload);
  const result = await renderBmiCountryMap({
    selector: bmiViewConfigs[view].chartSelector,
    records,
    valueFormatter,
    onHover(record, fallbackName) {
      const validCount = result.data.length;
      context.setSummary(view, record ? record.country : fallbackName, record ? record.value : NaN, validCount);
    },
    onLeave(top) {
      context.setSummary(view, top ? top.country : 'No data', top ? top.value : NaN, result.data.length);
    },
    renderLegend(minValue, maxValue) {
      renderBmiMapLegend(minValue, maxValue, '#bmi-map-legend', {
        title: standardized ? 'Standardized score' : 'BMI percentage',
        valueFormatter,
      });
    },
  });

  if (!result.data.length) {
    renderBmiEmpty(view, 'No BMI map data available');
    context.setSummary(view, 'No data', NaN, 0);
    return;
  }

  if (result.mapUnavailable) {
    renderBmiEmpty(view, 'Map module is unavailable');
    context.setSummary(view, 'No map', NaN, 0);
    return;
  }

  context.setSummary(view, result.top.country, result.top.value, result.data.length);
}

function setCorrelationSummary(payload) {
  const summary = document.querySelector(bmiViewConfigs.correlation.summarySelector);
  if (!summary) {
    return;
  }

  const selected = payload.selectedCorrelation || {};
  const titleNode = summary.querySelector('[data-bmi-summary-title]');
  const pearsonNode = summary.querySelector('[data-correlation-pearson]');
  const countNode = summary.querySelector('[data-correlation-count]');

  if (titleNode) titleNode.textContent = payload.selectedLabel || '—';
  if (pearsonNode) pearsonNode.textContent = formatCorrelation(selected.pearson);
  if (countNode) countNode.textContent = Number.isFinite(selected.count) ? d3.format(',')(selected.count) : '—';
}

function selectedCorrelationPoints(payload) {
  return payload && payload.scatter && Array.isArray(payload.scatter.points)
    ? payload.scatter.points
    : [];
}

function selectCorrelationVariable(row) {
  const variable = row && row.variable ? row.variable : row;
  const panel = document.querySelector('[data-bmi-view-panel="correlation"]');
  const dimensionSelect = panel ? panel.querySelector('[data-bmi-filter="correlationVariable"]') : null;
  const dimension = dimensionSelect && dimensionSelect.value ? dimensionSelect.value : 'bmi';
  const targetSelect = panel ? panel.querySelector(`[data-bmi-filter="${dimension}"]`) : null;
  if (!targetSelect || !variable) {
    return;
  }

  const hasOption = Array.from(targetSelect.options).some(option => option.value === variable);
  if (!hasOption) {
    return;
  }

  targetSelect.value = variable;
  bmiExplorer.loadData('correlation').catch(error => {
    console.error('Failed to update correlation variable', error);
    renderBmiEmpty('correlation', 'Failed to load GDP correlation data');
  });
}

function syncCorrelationDimensionSelect(payload) {
  const select = document.getElementById('bmi-correlation-variable');
  if (!select) {
    return;
  }

  if (payload.correlationVariable) {
    select.value = payload.correlationVariable;
  }
}

function renderCorrelationScatter(payload) {
  const view = 'correlation';
  const isLogGdp = payload.gdpScale === 'log';
  const yFormatter = bmiValueFormatterForPayload(payload);
  const standardized = isBmiStandardized(payload);
  bmiCorrelationState.payload = payload;
  window.renderScatterPlot({
    selector: bmiViewConfigs[view].chartSelector,
    points: selectedCorrelationPoints(payload),
    trend: payload.scatter.trend,
    xLabel: `${payload.gdpScaleLabel || 'GDP'} (${payload.gdpYear})`,
    yLabel: standardized ? `Score: ${payload.selectedLabel}` : payload.selectedLabel,
    xFormatter: isLogGdp ? formatLogGdpAxis : formatGdpAxis,
    yFormatter,
    pointColor: '#2563eb',
    trendColor: '#111827',
    yDomain: standardized ? [0, 1] : undefined,
    markerRadius: 11,
    collisionPadding: 5,
    spreadOverlaps: bmiCorrelationState.spreadOverlaps,
    spreadToggle: {
      label: 'Spread overlaps',
      onChange(isChecked) {
        bmiCorrelationState.spreadOverlaps = isChecked;
        if (bmiCorrelationState.payload) {
          renderCorrelationScatter(bmiCorrelationState.payload);
        }
      },
    },
  });
}

function renderBmiCorrelation(records, context) {
  const view = 'correlation';
  const payload = context.payload || {};
  const points = selectedCorrelationPoints(payload);

  if (!points.length) {
    renderBmiEmpty(view, 'No GDP correlation data available');
    syncCorrelationDimensionSelect(payload);
    window.renderCorrelationTable({
      bodySelector: '#bmi-correlation-table tbody',
      rows: [],
      selectedVariable: payload.selectedVariable,
      onSelect: selectCorrelationVariable,
      coefficientFormatter: formatCorrelation,
    });
    setCorrelationSummary({});
    return;
  }

  syncCorrelationDimensionSelect(payload);
  window.renderCorrelationTable({
    bodySelector: '#bmi-correlation-table tbody',
    rows: payload.correlations || [],
    selectedVariable: payload.selectedVariable,
    onSelect: selectCorrelationVariable,
    coefficientFormatter: formatCorrelation,
  });

  setCorrelationSummary(payload);
  renderCorrelationScatter(payload);
}

const bmiExplorer = window.createEurostatExplorer({
  rootSelector: '#bmi-explorer',
  initialView: 'line',
  optionsUrl: `${getSectorApiBase()}/bmi-options`,
  dataUrl: `${getSectorApiBase()}/bmi-data`,
  tabSelector: '.bmi-tab',
  tabDatasetKey: 'bmiView',
  panelSelector: '[data-bmi-view-panel]',
  panelAttribute: 'data-bmi-view-panel',
  panelDatasetKey: 'bmiViewPanel',
  filterSelector: '[data-bmi-filter]',
  filterDatasetKey: 'bmiFilter',
  summaryTitleSelector: '[data-bmi-summary-title]',
  summaryValueSelector: '[data-bmi-summary-value]',
  summaryCountSelector: '[data-bmi-summary-count]',
  valueFormatter: bmiFormatValue,
  valueFormatterForPayload: bmiValueFormatterForPayload,
  extraFilterSelector: '[data-standardize-filter]',
  extraFilterDatasetKey: 'standardizeFilter',
  transformValues(values, context) {
    const standardized = values.standardize === '1';
    if (typeof window.getStandardizationDirections === 'function') {
      return {
        ...values,
        combine: standardized ? '1' : '0',
        directions: JSON.stringify(window.getStandardizationDirections(context.root)),
      };
    }
    return {
      ...values,
      combine: standardized ? '1' : '0',
    };
  },
  views: bmiViewConfigs,
  renderEmpty: renderBmiEmpty,
  renderers: {
    line: renderBmiLine,
    bar: renderBmiBars,
    map: renderBmiMap,
    correlation: renderBmiCorrelation,
  },
});

window.renderEurostatCountryMap = renderBmiCountryMap;
window.isAggregateCountry = isAggregateCountry;
window.bmiExplorer = bmiExplorer;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    bmiExplorer.initialize().catch(error => {
      console.error('BMI explorer failed', error);
      renderBmiEmpty(bmiExplorer.state.view, 'Failed to load BMI data');
    });
  });
} else {
  bmiExplorer.initialize().catch(error => {
    console.error('BMI explorer failed', error);
    renderBmiEmpty(bmiExplorer.state.view, 'Failed to load BMI data');
  });
}
