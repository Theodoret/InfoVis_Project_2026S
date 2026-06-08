function formatMillions(value) {
  if (!Number.isFinite(value)) {
    return 'No data';
  }

  const millions = Math.round(value / 1_000_000);
  return `${d3.format(',')(millions)} million`;
}

function formatDollarsPerPerson(value) {
  if (!Number.isFinite(value)) {
    return 'No data';
  }

  return `$${d3.format(',')(Math.round(value))}`;
}

function formatGdpLegendValue(value, context = {}) {
  return context && context.unit === 'person'
    ? formatDollarsPerPerson(value)
    : formatMillions(value);
}

function createGradientLegend(options = {}) {
  const containerSelector = options.containerSelector;
  const titleFormatter = options.titleFormatter || (context => String(context || ''));
  const valueFormatter = options.valueFormatter || (value => String(value));
  const gradient = options.gradient || '';

  function getLegend() {
    return d3.select(containerSelector);
  }

  function renderRange(minValue, maxValue, context) {
    const legend = getLegend();
    if (legend.empty()) {
      return;
    }

    legend.html('');
    legend.append('span')
      .attr('class', 'legend-title')
      .text(titleFormatter(context));

    const bar = legend.append('div')
      .attr('class', 'legend-bar');
    if (gradient) {
      bar.style('background', gradient);
    }

    const labels = legend.append('div')
      .attr('class', 'legend-labels');

    labels.append('span').text(valueFormatter(minValue, context));
    labels.append('span').text(valueFormatter((minValue + maxValue) / 2, context));
    labels.append('span').text(valueFormatter(maxValue, context));
  }

  function renderEmpty(context, message = 'No data available') {
    const legend = getLegend();
    if (legend.empty()) {
      return;
    }

    legend.html('');
    legend.append('span')
      .attr('class', 'legend-title')
      .text(titleFormatter(context));
    legend.append('span').text(message);
  }

  return {
    renderRange,
    renderEmpty,
  };
}

window.formatMillions = formatMillions;
window.formatDollarsPerPerson = formatDollarsPerPerson;
window.createGradientLegend = createGradientLegend;
if (document.querySelector('#gdp-legend')) {
  window.ivanGdpLegend = createGradientLegend({
    containerSelector: '#gdp-legend',
    titleFormatter: context => `${context && context.label ? context.label : 'GDP'} (${context && context.year ? context.year : '—'})`,
    valueFormatter: (value, context) => formatGdpLegendValue(value, context),
    gradient: 'linear-gradient(90deg, #eff6ff 0%, #bfdbfe 35%, #60a5fa 68%, #1d4ed8 100%)',
  });
}
