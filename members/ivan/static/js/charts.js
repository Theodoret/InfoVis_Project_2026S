function getChartSize(selector, options = {}) {
  const node = document.querySelector(selector);
  const width = node ? Math.max(options.minWidth || 520, node.getBoundingClientRect().width || options.fallbackWidth || 760) : options.fallbackWidth || 760;
  return { width, height: options.height || 300 };
}

function clearChart(selector, minHeight = null) {
  const chart = d3.select(selector);
  chart.html('').style('min-height', minHeight ? `${minHeight}px` : null);
  return chart;
}

function renderEmptyChart(selector, message) {
  const chart = clearChart(selector);
  chart.append('div')
    .attr('class', 'bmi-empty')
    .text(message);
}

function flagCodeForRecord(record, countryCodeKey = 'countryCode') {
  const rawCode = String(record[countryCodeKey] || record.countryCode || '').trim();
  const code = rawCode.toLowerCase();

  if (code === 'el' || code === 'grc') return 'gr';
  if (code === 'uk' || code === 'gbr') return 'gb';
  if (code.length === 2) return code;

  if (code.length === 3 && window.eurostatCountryIso3) {
    const iso3 = rawCode.toUpperCase();
    const match = Object.entries(window.eurostatCountryIso3)
      .find(([, value]) => value === iso3);
    return match ? match[0].toLowerCase() : '';
  }

  return '';
}

function flagUrlForRecord(record, countryCodeKey = 'countryCode') {
  const code = flagCodeForRecord(record, countryCodeKey);
  return code ? `https://flagcdn.com/w40/${code}.png` : null;
}

function flagSvgUrlForRecord(record, countryCodeKey = 'countryCode') {
  const code = flagCodeForRecord(record, countryCodeKey);
  return code ? `https://flagcdn.com/${code}.svg` : null;
}

function renderEuropeMapChartBackground(layer, width, height) {
  if (typeof window.loadEuropeMapFeatures !== 'function') {
    return;
  }

  window.loadEuropeMapFeatures()
    .then(features => {
      if (!features || !features.length || layer.empty()) {
        return;
      }

      const backgroundWidth = width;
      const backgroundHeight = height;
      const collection = { type: 'FeatureCollection', features };
      const projection = d3.geoMercator().fitSize([backgroundWidth, backgroundHeight], collection);
      const path = d3.geoPath().projection(projection);

      layer.append('g')
        .selectAll('path')
        .data(features)
        .join('path')
        .attr('d', path)
        .attr('fill', '#dbeafe')
        .attr('stroke', '#93a4bd')
        .attr('stroke-width', 0.45)
        .attr('opacity', 0.28);
    })
    .catch(error => {
      console.warn('Failed to render Europe chart background', error);
    });
}

function renderLineChartBackground(svg, width, height, record, options = {}) {
  const layer = svg.append('g')
    .attr('class', 'line-chart-background');
  const flagUrl = record ? flagSvgUrlForRecord(record, options.countryCodeKey || 'countryCode') : null;

  if (flagUrl) {
    layer.append('image')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', width)
      .attr('height', height)
      .attr('preserveAspectRatio', 'xMidYMid slice')
      .attr('opacity', options.opacity || 0.075)
      .attr('href', flagUrl);
    return;
  }

  renderEuropeMapChartBackground(layer, width, height);
}

function renderLineChart(options = {}) {
  const records = options.records || [];
  const selector = options.selector;
  const xKey = options.xKey || 'year';
  const yKey = options.yKey || 'value';
  const valueFormatter = options.valueFormatter || (value => String(value));
  const yTickFormatter = options.yTickFormatter || valueFormatter;
  const lineColor = options.lineColor || '#2563eb';
  const { width, height } = getChartSize(selector, { height: options.height || 300 });
  const chart = clearChart(selector);
  const margin = options.margin || { top: 28, right: 32, bottom: 42, left: 56 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const data = records
    .map(record => ({ ...record, __xNumber: Number(record[xKey]) }))
    .filter(record => Number.isFinite(record.__xNumber))
    .sort((a, b) => a.__xNumber - b.__xNumber);
  const yMax = d3.max(data, record => record[yKey]) || 100;
  let yDomain = [Number.isFinite(options.yDomainMin) ? options.yDomainMin : 0, yMax];

  if (Array.isArray(options.yDomain) && options.yDomain.length === 2) {
    yDomain = options.yDomain;
  } else if (options.yDomainMin === 'auto') {
    const yMin = d3.min(data, record => record[yKey]);
    const spread = yMax - yMin;
    const padding = spread > 0 ? spread * 0.16 : Math.max(1, yMax * 0.04);
    yDomain = [yMin - padding, yMax + padding];
  }

  const x = d3.scalePoint()
    .domain(data.map(record => record[xKey]))
    .range([0, innerWidth])
    .padding(0.4);
  const y = d3.scaleLinear()
    .domain(yDomain)
    .nice()
    .range([innerHeight, 0]);

  const svg = chart.append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', `0 0 ${width} ${height}`);

  if (options.showCountryBackground !== false) {
    renderLineChartBackground(svg, width, height, options.backgroundRecord || data[data.length - 1], {
      countryCodeKey: options.countryCodeKey || 'countryCode',
      opacity: options.backgroundOpacity,
    });
  }

  const group = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  group.append('g')
    .attr('transform', `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x));
  group.append('g')
    .call(d3.axisLeft(y).ticks(5).tickFormat(yTickFormatter));

  group.append('path')
    .datum(data)
    .attr('fill', 'none')
    .attr('stroke', lineColor)
    .attr('stroke-width', 3)
    .attr('d', d3.line()
      .x(record => x(record[xKey]))
      .y(record => y(record[yKey])));

  group.selectAll('circle')
    .data(data)
    .join('circle')
    .attr('cx', record => x(record[xKey]))
    .attr('cy', record => y(record[yKey]))
    .attr('r', 5)
    .attr('fill', '#ffffff')
    .attr('stroke', lineColor)
    .attr('stroke-width', 3);

  group.selectAll('.point-label')
    .data(data)
    .join('text')
    .attr('class', 'point-label')
    .attr('x', record => x(record[xKey]))
    .attr('y', record => y(record[yKey]) - 12)
    .attr('text-anchor', 'middle')
    .attr('fill', '#14213d')
    .attr('font-weight', 800)
    .attr('font-size', 12)
    .text(record => valueFormatter(record[yKey]));

  return {
    data,
    latest: data[data.length - 1] || null,
  };
}

function renderHorizontalBarChart(options = {}) {
  const records = options.records || [];
  const selector = options.selector;
  const labelKey = options.labelKey || 'country';
  const valueKey = options.valueKey || 'value';
  const countryCodeKey = options.countryCodeKey || 'countryCode';
  const valueFormatter = options.valueFormatter || (value => String(value));
  const barColor = options.barColor || '#2563eb';
  const showFlags = Boolean(options.showFlags);
  const flagPlacement = options.flagPlacement || 'axis';
  const flagHeight = options.flagSize || options.flagHeight || 16;
  const flagWidth = options.flagWidth || Math.round(flagHeight * 1.45);
  const rowHeight = options.rowHeight || (showFlags ? 30 : 25);
  const height = Math.max(options.minHeight || 300, records.length * rowHeight + 72);
  const { width } = getChartSize(selector);
  const chart = clearChart(selector, height);
  const margin = options.margin || { top: 24, right: 72, bottom: 28, left: showFlags && flagPlacement === 'axis' ? 184 : 118 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const x = d3.scaleLinear()
    .domain([0, d3.max(records, record => record[valueKey]) || 100])
    .nice()
    .range([0, innerWidth]);
  const y = d3.scaleBand()
    .domain(records.map(record => record[labelKey]))
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
    .call(d3.axisBottom(x).ticks(5).tickFormat(valueFormatter));
  const yAxis = group.append('g')
    .call(d3.axisLeft(y).tickSize(0))
    .call(axis => axis.select('.domain').remove());

  if (showFlags && flagPlacement === 'axis') {
    const flagX = -margin.left + 12;
    const labelX = flagX + flagWidth + 8;
    const recordByLabel = new Map(records.map(record => [record[labelKey], record]));

    yAxis.selectAll('.tick text')
      .attr('x', labelX)
      .attr('text-anchor', 'start')
      .attr('font-weight', 700);

    yAxis.selectAll('.tick')
      .each(function(label, index) {
        const record = recordByLabel.get(label) || {};
        const flagUrl = flagUrlForRecord(record, countryCodeKey);
        const tick = d3.select(this);

        tick.append('rect')
          .attr('x', flagX - 1.5)
          .attr('y', -flagHeight / 2 - 1.5)
          .attr('width', flagWidth + 3)
          .attr('height', flagHeight + 3)
          .attr('rx', 3)
          .attr('fill', '#ffffff')
          .attr('stroke', 'rgba(15, 23, 42, 0.18)')
          .attr('stroke-width', 1);

        if (flagUrl) {
          tick.append('image')
            .attr('x', flagX)
            .attr('y', -flagHeight / 2)
            .attr('width', flagWidth)
            .attr('height', flagHeight)
            .attr('preserveAspectRatio', 'xMidYMid slice')
            .attr('href', flagUrl);
        } else {
          tick.append('rect')
            .attr('x', flagX)
            .attr('y', -flagHeight / 2)
            .attr('width', flagWidth)
            .attr('height', flagHeight)
            .attr('rx', 2)
            .attr('fill', '#e5e7eb');
        }
      });
  }

  const bars = group.selectAll('.horizontal-bar')
    .data(records)
    .join('rect')
    .attr('class', 'horizontal-bar')
    .attr('x', 0)
    .attr('y', record => y(record[labelKey]))
    .attr('width', record => x(record[valueKey]))
    .attr('height', y.bandwidth())
    .attr('rx', 5)
    .attr('fill', barColor)
    .attr('opacity', 0.82);

  if (showFlags && flagPlacement === 'bar-end') {
    const flagPadding = 7;
    const minFlagBarWidth = flagWidth + flagPadding * 2;

    const flagGroups = group.selectAll('.bar-flag')
      .data(records)
      .join('g')
      .attr('class', 'bar-flag')
      .attr('transform', record => {
        const barWidth = x(record[valueKey]);
        const flagX = Math.max(flagPadding, barWidth - flagWidth - flagPadding);
        const flagY = y(record[labelKey]) + y.bandwidth() / 2 - flagHeight / 2;
        return `translate(${flagX},${flagY})`;
      })
      .attr('opacity', record => x(record[valueKey]) >= minFlagBarWidth ? 1 : 0);

    flagGroups.append('rect')
      .attr('x', -2)
      .attr('y', -2)
      .attr('width', flagWidth + 4)
      .attr('height', flagHeight + 4)
      .attr('rx', 3)
      .attr('fill', 'rgba(255, 255, 255, 0.92)')
      .attr('stroke', 'rgba(15, 23, 42, 0.16)')
      .attr('stroke-width', 1);

    flagGroups.each(function(record) {
      const flagUrl = flagUrlForRecord(record, countryCodeKey);
      const groupNode = d3.select(this);

      if (flagUrl) {
        groupNode.append('image')
          .attr('x', 0)
          .attr('y', 0)
          .attr('width', flagWidth)
          .attr('height', flagHeight)
          .attr('preserveAspectRatio', 'xMidYMid slice')
          .attr('href', flagUrl);
      } else {
        groupNode.append('rect')
          .attr('width', flagWidth)
          .attr('height', flagHeight)
          .attr('rx', 2)
          .attr('fill', '#e5e7eb');
      }
    });
  }

  group.selectAll('.bar-label')
    .data(records)
    .join('text')
    .attr('class', 'bar-label')
    .attr('x', record => x(record[valueKey]) + 8)
    .attr('y', record => y(record[labelKey]) + y.bandwidth() / 2)
    .attr('dominant-baseline', 'middle')
    .attr('fill', '#14213d')
    .attr('font-weight', 800)
    .attr('font-size', 12)
    .text(record => valueFormatter(record[valueKey]));

  return {
    data: records,
    top: records[0] || null,
  };
}

function renderScatterPlot(options = {}) {
  const points = options.points || [];
  const selector = options.selector;
  const xKey = options.xKey || 'gdp';
  const yKey = options.yKey || 'value';
  const xFormatter = options.xFormatter || (value => String(value));
  const yFormatter = options.yFormatter || (value => String(value));
  const pointColor = options.pointColor || '#2563eb';
  const trendColor = options.trendColor || '#111827';
  const spreadOverlaps = options.spreadOverlaps !== false;
  const spreadToggle = options.spreadToggle || null;
  const { width, height } = getChartSize(selector, { height: options.height || 360 });
  const chart = clearChart(selector, height);
  chart.classed('scatter-chart-frame', true);
  if (spreadToggle) {
    const toggle = chart.append('label')
      .attr('class', 'scatter-option-toggle');
    toggle.append('input')
      .attr('type', 'checkbox')
      .property('checked', spreadOverlaps)
      .on('change', event => {
        if (typeof spreadToggle.onChange === 'function') {
          spreadToggle.onChange(event.target.checked);
        }
      });
    toggle.append('span')
      .text(spreadToggle.label || 'Spread overlaps');
  }
  const margin = options.margin || { top: 28, right: 34, bottom: 52, left: 72 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const xExtent = d3.extent(points, point => point[xKey]);
  const yExtent = d3.extent(points, point => point[yKey]);
  if (xExtent[0] === xExtent[1]) {
    xExtent[0] -= 1;
    xExtent[1] += 1;
  }
  if (yExtent[0] === yExtent[1]) {
    yExtent[0] -= 1;
    yExtent[1] += 1;
  }
  const x = d3.scaleLinear()
    .domain(xExtent)
    .nice()
    .range([0, innerWidth]);
  const y = d3.scaleLinear()
    .domain(yExtent)
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
    .call(d3.axisBottom(x).ticks(5).tickFormat(xFormatter));
  group.append('g')
    .call(d3.axisLeft(y).ticks(5).tickFormat(yFormatter));

  if (options.trend && Array.isArray(options.trend.points)) {
    group.append('path')
      .datum(options.trend.points)
      .attr('fill', 'none')
      .attr('stroke', trendColor)
      .attr('stroke-width', 2.5)
      .attr('stroke-dasharray', '7 5')
      .attr('d', d3.line()
        .x(point => x(point[xKey]))
        .y(point => y(point[yKey])));
  }

  const markerRadius = options.markerRadius || 10;
  const collisionPadding = options.collisionPadding || 4;
  const collisionDistance = markerRadius * 2 + collisionPadding;
  const displayPoints = points.map((point, index) => ({
    ...point,
    __index: index,
    __trueX: x(point[xKey]),
    __trueY: y(point[yKey]),
    __displayX: x(point[xKey]),
    __displayY: y(point[yKey]),
  }));

  if (spreadOverlaps) {
    for (let pass = 0; pass < 12; pass += 1) {
      let moved = false;
      for (let leftIndex = 0; leftIndex < displayPoints.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < displayPoints.length; rightIndex += 1) {
          const left = displayPoints[leftIndex];
          const right = displayPoints[rightIndex];
          const deltaX = right.__displayX - left.__displayX;
          const deltaY = right.__displayY - left.__displayY;
          const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

          if (distance >= collisionDistance) {
            continue;
          }

          const fallbackAngle = ((left.__index + right.__index) * 137.508 * Math.PI) / 180;
          const directionX = distance ? deltaX / distance : Math.cos(fallbackAngle);
          const directionY = distance ? deltaY / distance : Math.sin(fallbackAngle);
          const push = (collisionDistance - distance) / 2;

          left.__displayX = Math.max(markerRadius, Math.min(innerWidth - markerRadius, left.__displayX - directionX * push));
          left.__displayY = Math.max(markerRadius, Math.min(innerHeight - markerRadius, left.__displayY - directionY * push));
          right.__displayX = Math.max(markerRadius, Math.min(innerWidth - markerRadius, right.__displayX + directionX * push));
          right.__displayY = Math.max(markerRadius, Math.min(innerHeight - markerRadius, right.__displayY + directionY * push));
          moved = true;
        }
      }

      if (!moved) {
        break;
      }
    }
  }

  displayPoints.forEach(point => {
    point.__shifted = Math.hypot(point.__displayX - point.__trueX, point.__displayY - point.__trueY) > 1;
  });

  group.selectAll('.scatter-point-connector')
    .data(displayPoints.filter(point => point.__shifted))
    .join('line')
    .attr('class', 'scatter-point-connector')
    .attr('x1', point => point.__trueX)
    .attr('y1', point => point.__trueY)
    .attr('x2', point => point.__displayX)
    .attr('y2', point => point.__displayY)
    .attr('stroke', 'rgba(15, 23, 42, 0.18)')
    .attr('stroke-width', 1)
    .attr('stroke-dasharray', '3 3');

  const defs = svg.append('defs');
  const clipPrefix = `scatter-flag-${Math.round(Math.random() * 1000000)}`;
  displayPoints.forEach((point, index) => {
    defs.append('clipPath')
      .attr('id', `${clipPrefix}-${index}`)
      .append('circle')
      .attr('cx', point.__displayX)
      .attr('cy', point.__displayY)
      .attr('r', markerRadius);
  });

  const pointGroups = group.selectAll('.scatter-point')
    .data(displayPoints)
    .join('g')
    .attr('class', 'scatter-point');

  pointGroups.append('circle')
    .attr('cx', point => point.__displayX)
    .attr('cy', point => point.__displayY)
    .attr('r', markerRadius + 2)
    .attr('fill', '#ffffff')
    .attr('stroke', 'rgba(15, 23, 42, 0.18)')
    .attr('stroke-width', 1);

  pointGroups.append('circle')
    .attr('cx', point => point.__displayX)
    .attr('cy', point => point.__displayY)
    .attr('r', markerRadius)
    .attr('fill', pointColor)
    .attr('opacity', point => flagCodeForRecord(point) ? 0 : 0.82);

  pointGroups.append('image')
    .attr('x', point => point.__displayX - markerRadius)
    .attr('y', point => point.__displayY - markerRadius)
    .attr('width', markerRadius * 2)
    .attr('height', markerRadius * 2)
    .attr('preserveAspectRatio', 'xMidYMid slice')
    .attr('clip-path', (point, index) => `url(#${clipPrefix}-${index})`)
    .attr('href', point => flagUrlForRecord(point));

  pointGroups.append('circle')
    .attr('cx', point => point.__displayX)
    .attr('cy', point => point.__displayY)
    .attr('r', markerRadius)
    .attr('fill', 'none')
    .attr('stroke', '#ffffff')
    .attr('stroke-width', 1.8);

  pointGroups.append('title')
    .text(point => `${point.country}: ${xFormatter(point[xKey])}, ${yFormatter(point[yKey])}`);

  group.append('text')
    .attr('x', innerWidth / 2)
    .attr('y', innerHeight + 42)
    .attr('text-anchor', 'middle')
    .attr('fill', '#60708f')
    .attr('font-weight', 800)
    .attr('font-size', 12)
    .text(options.xLabel || '');

  group.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -innerHeight / 2)
    .attr('y', -52)
    .attr('text-anchor', 'middle')
    .attr('fill', '#60708f')
    .attr('font-weight', 800)
    .attr('font-size', 12)
    .text(options.yLabel || '');
}

function renderCorrelationTable(options = {}) {
  const tbody = d3.select(options.bodySelector);
  const rows = options.rows || [];
  const coefficientFormatter = options.coefficientFormatter || (value => String(value));
  const selectedVariable = options.selectedVariable;
  const onSelect = options.onSelect;

  if (tbody.empty()) {
    return;
  }

  const table = tbody.node().closest('table');
  const sortState = table && table.__correlationSort ? table.__correlationSort : null;
  const displayRows = [...rows];

  if (sortState && ['pearson', 'spearman'].includes(sortState.column)) {
    const direction = sortState.direction === 'asc' ? 1 : -1;
    displayRows.sort((left, right) => {
      const leftValue = Number.isFinite(left[sortState.column]) ? left[sortState.column] : null;
      const rightValue = Number.isFinite(right[sortState.column]) ? right[sortState.column] : null;

      if (leftValue === null && rightValue === null) return 0;
      if (leftValue === null) return 1;
      if (rightValue === null) return -1;
      return (leftValue - rightValue) * direction;
    });
  }

  if (table) {
    table.querySelectorAll('thead th').forEach(header => {
      const label = header.dataset.label || header.textContent.trim();
      const column = label.toLowerCase();
      header.dataset.label = label;

      if (!['pearson', 'spearman'].includes(column)) {
        header.classList.remove('is-sortable', 'is-active-sort');
        header.removeAttribute('aria-sort');
        header.textContent = label;
        return;
      }

      const isActive = sortState && sortState.column === column;
      header.classList.add('is-sortable');
      header.classList.toggle('is-active-sort', Boolean(isActive));
      header.setAttribute('aria-sort', isActive && sortState.direction === 'asc' ? 'ascending' : isActive ? 'descending' : 'none');
      header.innerHTML = '';

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'correlation-sort-button';
      button.setAttribute('aria-label', `Sort by ${label}`);
      button.addEventListener('click', () => {
        const current = table.__correlationSort;
        const nextDirection = current && current.column === column && current.direction === 'desc' ? 'asc' : 'desc';
        table.__correlationSort = { column, direction: nextDirection };
        renderCorrelationTable(options);
      });

      const labelNode = document.createElement('span');
      labelNode.textContent = label;
      button.appendChild(labelNode);

      const directionNode = document.createElement('span');
      directionNode.className = 'correlation-sort-indicator';
      directionNode.textContent = isActive ? (sortState.direction === 'asc' ? 'asc' : 'desc') : '';
      button.appendChild(directionNode);
      header.appendChild(button);
    });
  }

  tbody.html('');

  const tableRows = tbody.selectAll('tr')
    .data(displayRows)
    .join('tr')
    .classed('is-selected', row => row.variable === selectedVariable);

  tableRows.append('td')
    .append('button')
    .attr('class', 'correlation-variable-button')
    .attr('type', 'button')
    .text(row => row.label || row.variable)
    .on('click', (event, row) => {
      if (typeof onSelect === 'function') {
        onSelect(row);
      }
    });
  tableRows.append('td').text(row => coefficientFormatter(row.pearson));
  tableRows.append('td').text(row => coefficientFormatter(row.spearman));
  tableRows.append('td').text(row => row.count);
}

window.getChartSize = getChartSize;
window.clearChart = clearChart;
window.renderEmptyChart = renderEmptyChart;
window.renderLineChart = renderLineChart;
window.renderHorizontalBarChart = renderHorizontalBarChart;
window.renderScatterPlot = renderScatterPlot;
window.renderCorrelationTable = renderCorrelationTable;
window.flagCodeForRecord = flagCodeForRecord;
window.flagUrlForRecord = flagUrlForRecord;
window.flagSvgUrlForRecord = flagSvgUrlForRecord;
