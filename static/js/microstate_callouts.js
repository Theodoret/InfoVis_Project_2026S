const EUROPE_MICROSTATES = [
  {
    name: 'Andorra',
    iso3: 'AND',
    alpha2: 'AD',
    lon: 1.5218,
    lat: 42.5063,
  },
  {
    name: 'Monaco',
    iso3: 'MCO',
    alpha2: 'MC',
    lon: 7.4246,
    lat: 43.7384,
  },
  {
    name: 'San Marino',
    iso3: 'SMR',
    alpha2: 'SM',
    lon: 12.4578,
    lat: 43.9424,
  },
  {
    name: 'Liechtenstein',
    iso3: 'LIE',
    alpha2: 'LI',
    lon: 9.5554,
    lat: 47.166,
  },
  {
    name: 'Malta',
    iso3: 'MLT',
    alpha2: 'MT',
    lon: 14.3754,
    lat: 35.9375,
  },
  {
    name: 'Vatican City',
    iso3: 'VAT',
    alpha2: 'VA',
    lon: 12.4534,
    lat: 41.9029,
  },
];

function normalizeMicrostateKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function microstateAliases(microstate) {
  return [
    microstate.name,
    microstate.iso3,
    microstate.alpha2,
    microstate.name.replace(/\s+/g, ''),
    microstate.name.replace(' City', ''),
  ].map(normalizeMicrostateKey);
}

function buildMicrostateRecordLookup(records = []) {
  const lookup = new Map();

  for (const record of records) {
    const candidates = [
      record.country,
      record.countryCode,
      record.iso3,
      window.eurostatCountryIso3 ? window.eurostatCountryIso3[record.countryCode] : '',
    ];

    for (const candidate of candidates) {
      const key = normalizeMicrostateKey(candidate);
      if (key) {
        lookup.set(key, record);
      }
    }
  }

  return lookup;
}

function microstateRecordFor(lookup, microstate) {
  for (const alias of microstateAliases(microstate)) {
    const record = lookup.get(alias);
    if (record) {
      return record;
    }
  }

  return null;
}

function microstateLayout(width, height, count, panelWidth = 0) {
  const margin = Math.max(8, Math.round(width * 0.018));
  const gap = Math.max(5, Math.round(height * 0.012));
  const availableHeight = Math.max(180, height - margin * 2 - gap * (count - 1));
  const cardHeight = Math.max(44, Math.min(74, availableHeight / count));
  const cardWidth = panelWidth
    ? Math.max(92, panelWidth - margin * 2)
    : Math.max(92, Math.min(136, width * 0.22));
  const fontSize = cardHeight < 54 ? 9 : 11;
  const valueSize = cardHeight < 54 ? 8 : 9;

  return {
    margin,
    gap,
    panelWidth,
    cardWidth,
    cardHeight,
    fontSize,
    valueSize,
  };
}

function renderMicrostateLabel(group, name, x, y, fontSize, maxChars = 14) {
  const words = name.split(/\s+/);
  const lines = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) {
    lines.push(line);
  }

  const text = group.append('text')
    .attr('x', x)
    .attr('y', y)
    .attr('fill', '#071330')
    .attr('font-size', fontSize)
    .attr('font-weight', 850);

  lines.slice(0, 2).forEach((part, index) => {
    text.append('tspan')
      .attr('x', x)
      .attr('dy', index ? fontSize + 2 : 0)
      .text(part);
  });
}

function renderMicrostateCallouts(map, options = {}) {
  if (!map || !map.svg || typeof map.projection !== 'function') {
    return;
  }

  const width = Number(map.svg.attr('width')) || options.width || 620;
  const height = Number(map.svg.attr('height')) || options.height || 620;
  const valueKey = options.valueKey || 'value';
  const valueFormatter = options.valueFormatter || (value => String(value));
  const colorScale = options.colorScale || (() => '#93c5fd');
  const records = options.records || [];
  const lookup = buildMicrostateRecordLookup(records);
  const microstates = options.microstates || EUROPE_MICROSTATES;
  const panelWidth = map.microstatePanelWidth || options.panelWidth || 0;
  const layout = microstateLayout(width, height, microstates.length, panelWidth);

  map.svg.selectAll('.microstate-callouts').remove();

  const layer = map.svg.append('g')
    .attr('class', 'microstate-callouts');
  const connectorLayer = layer.append('g')
    .attr('class', 'microstate-connectors');
  const cardLayer = layer.append('g')
    .attr('class', 'microstate-cards');
  const dotLayer = layer.append('g')
    .attr('class', 'microstate-dots');

  const prepared = microstates.map((microstate, index) => {
    const projected = map.projection([microstate.lon, microstate.lat]);
    const record = microstateRecordFor(lookup, microstate);
    const rawValue = record ? record[valueKey] : NaN;
    const hasValue = Number.isFinite(rawValue);
    const cardX = layout.margin;
    const cardY = layout.margin + index * (layout.cardHeight + layout.gap);
    const dotX = projected ? projected[0] : null;
    const dotY = projected ? projected[1] : null;
    const cardMidY = cardY + layout.cardHeight / 2;
    const railEdge = layout.panelWidth || (cardX + layout.cardWidth + 18);
    const elbowX = dotX === null
      ? railEdge
      : Math.max(railEdge + 12, Math.min(dotX - 20, railEdge + 52));

    return {
      microstate,
      record,
      rawValue,
      hasValue,
      color: hasValue ? colorScale(rawValue) : '#e5e7eb',
      cardX,
      cardY,
      dotX,
      dotY,
      cardMidY,
      elbowX,
    };
  }).filter(item => item.dotX !== null && item.dotY !== null);

  function setActive(item, active) {
    layer.selectAll(`[data-microstate="${item.microstate.iso3}"]`)
      .classed('is-active', active);
  }

  function onEnter(event, item) {
    setActive(item, true);
    if (typeof options.onHover === 'function') {
      options.onHover(item.record, item.microstate.name, item);
    }
  }

  function onLeave(event, item) {
    setActive(item, false);
    if (typeof options.onLeave === 'function') {
      options.onLeave(item.record, item.microstate.name, item);
    }
  }

  connectorLayer.selectAll('path')
    .data(prepared)
    .join('path')
    .attr('class', 'microstate-connector')
    .attr('data-microstate', item => item.microstate.iso3)
    .attr('d', item => [
      `M${item.cardX + layout.cardWidth},${item.cardMidY}`,
      `L${item.elbowX},${item.cardMidY}`,
      `L${item.dotX},${item.dotY}`,
    ].join(' '))
    .attr('fill', 'none')
    .attr('stroke', '#6b7280')
    .attr('stroke-width', 0.7)
    .attr('stroke-linecap', 'round')
    .attr('stroke-linejoin', 'round')
    .attr('opacity', 0.72);

  const cards = cardLayer.selectAll('g')
    .data(prepared)
    .join('g')
    .attr('class', item => `microstate-card${item.hasValue ? '' : ' is-empty'}`)
    .attr('data-microstate', item => item.microstate.iso3)
    .attr('transform', item => `translate(${item.cardX},${item.cardY})`)
    .attr('tabindex', 0)
    .attr('role', 'button')
    .attr('aria-label', item => `${item.microstate.name}: ${item.hasValue ? valueFormatter(item.rawValue) : 'no data'}`)
    .on('mouseenter', onEnter)
    .on('mouseleave', onLeave)
    .on('focus', onEnter)
    .on('blur', onLeave);

  cards.append('rect')
    .attr('width', layout.cardWidth)
    .attr('height', layout.cardHeight)
    .attr('rx', 8)
    .attr('fill', 'rgba(255,255,255,0.95)')
    .attr('stroke', 'rgba(148,163,184,0.45)')
    .attr('stroke-width', 0.8)
    .attr('filter', null);

  cards.append('circle')
    .attr('cx', 13)
    .attr('cy', layout.cardHeight - 15)
    .attr('r', Math.max(4, Math.min(7, layout.cardHeight * 0.11)))
    .attr('fill', item => item.color)
    .attr('stroke', '#334155')
    .attr('stroke-width', 0.5)
    .attr('opacity', item => item.hasValue ? 1 : 0.55);

  cards.each(function(item) {
    const group = d3.select(this);
    renderMicrostateLabel(group, item.microstate.name, 12, 19, layout.fontSize);
    group.append('text')
      .attr('x', 25)
      .attr('y', layout.cardHeight - 11)
      .attr('fill', item.hasValue ? '#475569' : '#94a3b8')
      .attr('font-size', layout.valueSize)
      .attr('font-weight', 800)
      .text(item.hasValue ? valueFormatter(item.rawValue) : 'No data');
  });

  const dots = dotLayer.selectAll('g')
    .data(prepared)
    .join('g')
    .attr('class', item => `microstate-dot${item.hasValue ? '' : ' is-empty'}`)
    .attr('data-microstate', item => item.microstate.iso3)
    .attr('transform', item => `translate(${item.dotX},${item.dotY})`)
    .on('mouseenter', onEnter)
    .on('mouseleave', onLeave);

  dots.append('circle')
    .attr('r', 10)
    .attr('fill', 'transparent');

  dots.append('circle')
    .attr('r', 3.8)
    .attr('fill', item => item.color)
    .attr('stroke', '#111827')
    .attr('stroke-width', 0.8)
    .attr('opacity', item => item.hasValue ? 1 : 0.72);
}

window.EUROPE_MICROSTATES = EUROPE_MICROSTATES;
window.renderMicrostateCallouts = renderMicrostateCallouts;
