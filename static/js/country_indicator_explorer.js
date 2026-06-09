function createIndicatorValueFormatter(unit) {
  return function formatIndicatorValue(value) {
    if (!Number.isFinite(value)) {
      return '—';
    }

    if (unit === 'percent') {
      return `${d3.format('.1f')(value)}%`;
    }

    if (unit === 'years') {
      return `${d3.format('.1f')(value)} years`;
    }

    return d3.format(',.1f')(value);
  };
}

function indicatorValueFormatterForPayload(config, payload) {
  return typeof window.valueFormatterForPayload === 'function'
    ? window.valueFormatterForPayload(payload, config.valueFormatter)
    : config.valueFormatter;
}

function isIndicatorStandardized(payload) {
  return typeof window.isStandardizedPayload === 'function' && window.isStandardizedPayload(payload);
}

function getSectorApiBase() {
  return (window.sectorApiBase || '/healthcare').replace(/\/$/, '');
}

function isAggregateCountryRecord(record) {
  if (typeof window.isAggregateCountry === 'function') {
    return window.isAggregateCountry(record);
  }

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

function formatIndicatorCorrelation(value) {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return d3.format('.3f')(value);
}

function formatIndicatorGdpAxis(value) {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return d3.format('.2s')(value);
}

function formatIndicatorLogGdpAxis(value) {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return d3.format('.2f')(value);
}

function indicatorViewConfigs(slug, apiBase = getSectorApiBase()) {
  return {
    line: {
      chartSelector: `#${slug}-line-chart`,
      summarySelector: '[data-indicator-summary="line"]',
    },
    bar: {
      chartSelector: `#${slug}-bar-chart`,
      summarySelector: '[data-indicator-summary="bar"]',
    },
    map: {
      chartSelector: `#${slug}-map-chart`,
      summarySelector: '[data-indicator-summary="map"]',
    },
    correlation: {
      chartSelector: `#${slug}-correlation-scatter`,
      summarySelector: '[data-indicator-summary="correlation"]',
      dataUrl: `${apiBase}/eurostat/${slug}/gdp-correlation`,
    },
  };
}

function selectedIndicatorCorrelationPoints(payload) {
  return payload && payload.scatter && Array.isArray(payload.scatter.points)
    ? payload.scatter.points
    : [];
}

function setIndicatorCorrelationSummary(config, root, payload) {
  const summary = root ? root.querySelector(config.viewConfigs.correlation.summarySelector) : null;
  if (!summary) {
    return;
  }

  const selected = payload.selectedCorrelation || {};
  const titleNode = summary.querySelector('[data-indicator-summary-title]');
  const pearsonNode = summary.querySelector('[data-correlation-pearson]');
  const countNode = summary.querySelector('[data-correlation-count]');

  if (titleNode) titleNode.textContent = payload.selectedLabel || '—';
  if (pearsonNode) pearsonNode.textContent = formatIndicatorCorrelation(selected.pearson);
  if (countNode) countNode.textContent = Number.isFinite(selected.count) ? d3.format(',')(selected.count) : '—';
}

function syncIndicatorCorrelationDimensionSelect(config, root, payload) {
  const select = root ? root.querySelector(`#${config.slug}-correlation-variable`) : null;
  if (select && payload.correlationVariable) {
    select.value = payload.correlationVariable;
  }
}

function renderIndicatorMapLegend(config, minValue, maxValue, payload = null) {
  if (typeof window.createGradientLegend !== 'function') {
    return;
  }

  const standardized = isIndicatorStandardized(payload);
  const valueFormatter = indicatorValueFormatterForPayload(config, payload);
  const legend = window.createGradientLegend({
    containerSelector: `#${config.slug}-map-legend`,
    titleFormatter: () => standardized ? 'Standardized score' : config.valueLabel,
    valueFormatter,
    gradient: config.gradient,
  });

  legend.renderRange(minValue, maxValue);
}

async function renderCountryIndicatorMap(options = {}) {
  const selector = options.selector;
  const valueFormatter = options.valueFormatter || (value => String(value));
  const colorInterpolator = options.colorInterpolator || d3.interpolateBlues;
  const defaultCountryColor = options.defaultCountryColor || '#e5e7eb';
  const strokeColor = options.strokeColor || '#333';
  const strokeWidth = options.strokeWidth ?? 0.5;
  const records = (options.records || [])
    .filter(record => Number.isFinite(record.value) && !isAggregateCountryRecord(record));

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
  const colorScale = d3.scaleSequential(colorInterpolator).domain([minValue, maxValue]);
  const recordByIdentifier = new Map();

  for (const record of records) {
    const iso3 = record.iso3 || (window.eurostatCountryIso3 ? window.eurostatCountryIso3[record.countryCode] : '');
    if (iso3) {
      recordByIdentifier.set(String(iso3).toLowerCase(), record);
    }
    recordByIdentifier.set(String(record.countryCode || '').toLowerCase(), record);
    recordByIdentifier.set(String(record.country || '').toLowerCase(), record);
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
    svgClass: options.svgClass || 'indicator-map-svg',
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

function createCountryIndicatorExplorer(config) {
  const root = document.querySelector(config.rootSelector);
  if (!root || typeof window.createEurostatExplorer !== 'function') {
    return null;
  }

  const correlationState = {
    spreadOverlaps: true,
    payload: null,
  };

  function renderEmpty(view, message) {
    window.renderEmptyChart(config.viewConfigs[view].chartSelector, message);
  }

  function renderLine(records, context) {
    const view = 'line';
    const valueFormatter = indicatorValueFormatterForPayload(config, context.payload);
    const standardized = isIndicatorStandardized(context.payload);
    if (!records.length) {
      renderEmpty(view, `No ${config.shortLabel} trend data available`);
      context.setSummary(view, 'No data', NaN, 0);
      return;
    }

    const result = window.renderLineChart({
      selector: config.viewConfigs[view].chartSelector,
      records,
      valueFormatter,
      yTickFormatter: valueFormatter,
      lineColor: config.lineColor,
      backgroundRecord: records[0],
      backgroundOpacity: 0.07,
      yDomainMin: standardized ? undefined : config.yDomainMin,
      yDomain: standardized ? [0, 1] : undefined,
    });

    context.setSummary(view, result.latest.country, result.latest.value, result.data.length);
  }

  function renderBars(records, context) {
    const view = 'bar';
    const valueFormatter = indicatorValueFormatterForPayload(config, context.payload);
    const data = records.filter(record => !isAggregateCountryRecord(record));

    if (!data.length) {
      renderEmpty(view, `No ${config.shortLabel} ranking data available`);
      context.setSummary(view, 'No data', NaN, 0);
      return;
    }

    const result = window.renderHorizontalBarChart({
      selector: config.viewConfigs[view].chartSelector,
      records: data,
      labelKey: 'country',
      valueKey: 'value',
      valueFormatter,
      barColor: config.barColor,
      showFlags: true,
      flagPlacement: 'bar-end',
      flagHeight: 16,
      flagWidth: 24,
      rowHeight: 30,
      margin: { top: 24, right: 92, bottom: 28, left: 132 },
    });

    context.setSummary(view, result.top.country, result.top.value, result.data.length);
  }

  async function renderMap(records, context) {
    const view = 'map';
    const valueFormatter = indicatorValueFormatterForPayload(config, context.payload);
    const mapRenderer = window.renderEurostatCountryMap || renderCountryIndicatorMap;
    if (typeof mapRenderer !== 'function') {
      renderEmpty(view, 'Map module is unavailable');
      context.setSummary(view, 'No map', NaN, 0);
      return;
    }

    const result = await mapRenderer({
      selector: config.viewConfigs[view].chartSelector,
      records,
      valueFormatter,
      colorInterpolator: config.colorInterpolator,
      onHover(record, fallbackName) {
        const validCount = result.data.length;
        context.setSummary(view, record ? record.country : fallbackName, record ? record.value : NaN, validCount);
      },
      onLeave(top) {
        context.setSummary(view, top ? top.country : 'No data', top ? top.value : NaN, result.data.length);
      },
      renderLegend(minValue, maxValue) {
        renderIndicatorMapLegend(config, minValue, maxValue, context.payload);
      },
    });

    if (!result.data.length) {
      renderEmpty(view, `No ${config.shortLabel} map data available`);
      context.setSummary(view, 'No data', NaN, 0);
      return;
    }

    if (result.mapUnavailable) {
      renderEmpty(view, 'Map module is unavailable');
      context.setSummary(view, 'No map', NaN, 0);
      return;
    }

    context.setSummary(view, result.top.country, result.top.value, result.data.length);
  }

  function selectCorrelationVariable(row) {
    const variable = row && row.variable ? row.variable : row;
    const panel = root.querySelector('[data-indicator-view-panel="correlation"]');
    const dimensionSelect = panel ? panel.querySelector('[data-indicator-filter="correlationVariable"]') : null;
    const dimension = dimensionSelect && dimensionSelect.value ? dimensionSelect.value : config.defaultCorrelationVariable;
    const targetSelect = panel ? panel.querySelector(`[data-indicator-filter="${dimension}"]`) : null;
    if (!targetSelect || !variable) {
      return;
    }

    const hasOption = Array.from(targetSelect.options).some(option => option.value === variable);
    if (!hasOption) {
      return;
    }

    targetSelect.value = variable;
    explorer.loadData('correlation').catch(error => {
      console.error(`Failed to update ${config.shortLabel} correlation variable`, error);
      renderEmpty('correlation', `Failed to load ${config.shortLabel} GDP correlation data`);
    });
  }

  function renderCorrelationScatter(payload) {
    const view = 'correlation';
    const isLogGdp = payload.gdpScale === 'log';
    const yFormatter = indicatorValueFormatterForPayload(config, payload);
    const standardized = isIndicatorStandardized(payload);
    correlationState.payload = payload;
    window.renderScatterPlot({
      selector: config.viewConfigs[view].chartSelector,
      points: selectedIndicatorCorrelationPoints(payload),
      trend: payload.scatter.trend,
      xLabel: `${payload.gdpScaleLabel || 'GDP'} (${payload.gdpYear})`,
      yLabel: standardized ? `Score: ${payload.selectedLabel}` : payload.selectedLabel,
      xFormatter: isLogGdp ? formatIndicatorLogGdpAxis : formatIndicatorGdpAxis,
      yFormatter,
      pointColor: config.pointColor,
      trendColor: '#111827',
      yDomain: standardized ? [0, 1] : undefined,
      markerRadius: 11,
      collisionPadding: 5,
      spreadOverlaps: correlationState.spreadOverlaps,
      spreadToggle: {
        label: 'Spread overlaps',
        onChange(isChecked) {
          correlationState.spreadOverlaps = isChecked;
          if (correlationState.payload) {
            renderCorrelationScatter(correlationState.payload);
          }
        },
      },
    });
  }

  function renderCorrelation(records, context) {
    const view = 'correlation';
    const payload = context.payload || {};
    const points = selectedIndicatorCorrelationPoints(payload);

    if (!points.length) {
      renderEmpty(view, `No ${config.shortLabel} GDP correlation data available`);
      syncIndicatorCorrelationDimensionSelect(config, root, payload);
      window.renderCorrelationTable({
        bodySelector: `#${config.slug}-correlation-table tbody`,
        rows: [],
        selectedVariable: payload.selectedVariable,
        onSelect: selectCorrelationVariable,
        coefficientFormatter: formatIndicatorCorrelation,
      });
      setIndicatorCorrelationSummary(config, root, {});
      return;
    }

    syncIndicatorCorrelationDimensionSelect(config, root, payload);
    window.renderCorrelationTable({
      bodySelector: `#${config.slug}-correlation-table tbody`,
      rows: payload.correlations || [],
      selectedVariable: payload.selectedVariable,
      onSelect: selectCorrelationVariable,
      coefficientFormatter: formatIndicatorCorrelation,
    });

    setIndicatorCorrelationSummary(config, root, payload);
    renderCorrelationScatter(payload);
  }

  let explorer = null;
  explorer = window.createEurostatExplorer({
    rootSelector: config.rootSelector,
    initialView: 'line',
    optionsUrl: `${config.apiBase || getSectorApiBase()}/eurostat/${config.slug}/options`,
    dataUrl: `${config.apiBase || getSectorApiBase()}/eurostat/${config.slug}/data`,
    tabSelector: '[data-indicator-view]',
    tabDatasetKey: 'indicatorView',
    panelSelector: '[data-indicator-view-panel]',
    panelAttribute: 'data-indicator-view-panel',
    panelDatasetKey: 'indicatorViewPanel',
    filterSelector: '[data-indicator-filter]',
    filterDatasetKey: 'indicatorFilter',
    summaryTitleSelector: '[data-indicator-summary-title]',
    summaryValueSelector: '[data-indicator-summary-value]',
    summaryCountSelector: '[data-indicator-summary-count]',
    valueFormatter: config.valueFormatter,
    valueFormatterForPayload: payload => indicatorValueFormatterForPayload(config, payload),
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
    views: config.viewConfigs,
    renderEmpty,
    renderers: {
      line: renderLine,
      bar: renderBars,
      map: renderMap,
      correlation: renderCorrelation,
    },
  });

  return explorer;
}

function initializeCountryIndicatorExplorers() {
  const defaultConfigs = [
    {
      slug: 'life',
      rootSelector: '#life-expectancy-explorer',
      shortLabel: 'life expectancy',
      valueLabel: 'Life expectancy',
      valueFormatter: createIndicatorValueFormatter('years'),
      colorInterpolator: d3.interpolateGreens,
      gradient: 'linear-gradient(90deg, #ecfdf5 0%, #a7f3d0 35%, #10b981 70%, #065f46 100%)',
      lineColor: '#059669',
      barColor: '#059669',
      pointColor: '#059669',
      yDomainMin: 'auto',
      defaultCorrelationVariable: 'age',
    },
    {
      slug: 'unmet',
      rootSelector: '#unmet-needs-explorer',
      shortLabel: 'unmet needs',
      valueLabel: 'Unmet needs percentage',
      valueFormatter: createIndicatorValueFormatter('percent'),
      colorInterpolator: d3.interpolateOrRd,
      gradient: 'linear-gradient(90deg, #fff7ed 0%, #fed7aa 35%, #fb923c 70%, #dc2626 100%)',
      lineColor: '#ea580c',
      barColor: '#ea580c',
      pointColor: '#ea580c',
      yDomainMin: 0,
      defaultCorrelationVariable: 'reason',
    },
  ];
  const configuredExplorers = Array.isArray(window.countryIndicatorExplorerConfigs)
    ? window.countryIndicatorExplorerConfigs
    : defaultConfigs;
  const configs = configuredExplorers.map(config => ({
    ...config,
    apiBase: config.apiBase || getSectorApiBase(),
    valueFormatter: config.valueFormatter || createIndicatorValueFormatter(config.valueUnit),
    viewConfigs: indicatorViewConfigs(config.slug, config.apiBase || getSectorApiBase()),
  }));

  window.indicatorExplorers = window.indicatorExplorers || {};
  configs.forEach(config => {
    const explorer = createCountryIndicatorExplorer(config);
    if (!explorer) {
      return;
    }

    window.indicatorExplorers[config.slug] = explorer;
    explorer.initialize().catch(error => {
      console.error(`${config.shortLabel} explorer failed`, error);
      window.renderEmptyChart(config.viewConfigs.line.chartSelector, `Failed to load ${config.shortLabel} data`);
    });
  });
}

window.createCountryIndicatorExplorer = createCountryIndicatorExplorer;
window.renderCountryIndicatorMap = renderCountryIndicatorMap;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeCountryIndicatorExplorers);
} else {
  initializeCountryIndicatorExplorers();
}
