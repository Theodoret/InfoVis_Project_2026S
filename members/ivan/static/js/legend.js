function formatMillions(value) {
  if (!Number.isFinite(value)) {
    return 'No data';
  }

  const millions = Math.round(value / 1_000_000);
  return `${d3.format(',')(millions)} million`;
}

function createGradientLegend(options = {}) {
  const containerSelector = options.containerSelector;
  const titleFormatter = options.titleFormatter || (context => String(context || ''));
  const valueFormatter = options.valueFormatter || (value => String(value));

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

    legend.append('div')
      .attr('class', 'legend-bar');

    const labels = legend.append('div')
      .attr('class', 'legend-labels');

    labels.append('span').text(valueFormatter(minValue));
    labels.append('span').text(valueFormatter((minValue + maxValue) / 2));
    labels.append('span').text(valueFormatter(maxValue));
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
window.createGradientLegend = createGradientLegend;
window.ivanGdpLegend = createGradientLegend({
  containerSelector: '#gdp-legend',
  titleFormatter: year => `GDP (${year})`,
  valueFormatter: formatMillions,
});
