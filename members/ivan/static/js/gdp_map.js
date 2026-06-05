// GDP choropleth for Ivan's Europe map
// Assumes map.js has already created the base Europe map and exposed window.ivanMapReady

const initialGdpYear = '2023';
let currentGdpYear = initialGdpYear;

async function loadGdpData(year) {
  const response = await fetch(`/ivan/gdp-data?year=${encodeURIComponent(year)}`);
  if (!response.ok) {
    throw new Error(`Failed to load GDP data (${response.status})`);
  }
  return response.json();
}

function renderGdpLegend(minValue, maxValue, year) {
  if (window.ivanGdpLegend && typeof window.ivanGdpLegend.renderRange === 'function') {
    window.ivanGdpLegend.renderRange(minValue, maxValue, year);
  }
}

function renderEmptyGdpLegend(year) {
  if (window.ivanGdpLegend && typeof window.ivanGdpLegend.renderEmpty === 'function') {
    window.ivanGdpLegend.renderEmpty(year);
  }
}

function formatCurrency(value) {
  if (!Number.isFinite(value)) {
    return 'No data';
  }

  const millions = Math.round(value / 1_000_000);
  return `$${d3.format(',')(millions)} million`;
}

function updateHoverCard(country, gdpValue, year) {
  const countryNode = document.getElementById('gdp-hover-country');
  const valueNode = document.getElementById('gdp-hover-value');
  const yearNode = document.getElementById('gdp-hover-year');

  if (countryNode) countryNode.textContent = country || '—';
  if (valueNode) valueNode.textContent = Number.isFinite(gdpValue) ? formatCurrency(gdpValue) : '—';
  if (yearNode) yearNode.textContent = year || currentGdpYear || '—';
}

function clearHoverCard() {
  updateHoverCard('Hover a country', NaN, '—');
}

async function colorCountriesByGdp(year) {
  const map = await Promise.resolve(window.ivanMapReady);

  const payload = await loadGdpData(year);
  currentGdpYear = String(payload.year || year);
  const records = Array.isArray(payload.records) ? payload.records : [];
  const validRecords = records.filter(record => Number.isFinite(record.gdp));

  if (!validRecords.length) {
    console.warn('No GDP records available for coloring');
    if (map && typeof map.resetCountryColors === 'function') {
      map.resetCountryColors();
    }
    renderEmptyGdpLegend(currentGdpYear);
    clearHoverCard();
    return;
  }

  if (map && typeof map.resetCountryColors === 'function') {
    map.resetCountryColors();
  }

  const minValue = d3.min(validRecords, record => record.gdp);
  const maxValue = d3.max(validRecords, record => record.gdp);
  const colorScale = d3.scaleSequential(d3.interpolateBlues)
    .domain([minValue, maxValue]);

  const recordByCode = new Map(validRecords.map(record => [String(record.countryCode || '').toUpperCase(), record]));
  const recordByName = new Map(validRecords.map(record => [String(record.country || '').toLowerCase(), record]));

  function findRecord(feature) {
    const properties = feature && feature.properties ? feature.properties : {};
    const codeCandidates = [properties.iso_a3, properties.ISO_A3, properties.id];
    for (const code of codeCandidates) {
      const match = recordByCode.get(String(code || '').toUpperCase());
      if (match) return match;
    }

    const nameCandidates = [properties.name, properties.NAME, properties.admin, properties.ADMIN, properties.NAME_LONG, properties.name_long, properties.sovereignt];
    for (const name of nameCandidates) {
      const match = recordByName.get(String(name || '').toLowerCase());
      if (match) return match;
    }

    return null;
  }

  for (const record of validRecords) {
    const fillColor = colorScale(record.gdp);
    if (map && typeof map.setCountryColor === 'function') {
      map.setCountryColor(record.countryCode, fillColor, 1);
      map.setCountryColor(record.country, fillColor, 1);
    }
  }

  renderGdpLegend(minValue, maxValue, currentGdpYear);

  if (map && typeof map.setHoverHandlers === 'function') {
    map.setHoverHandlers({
      mouseenter(event, feature) {
        const record = findRecord(feature);
        const countryName = record ? record.country : (feature.properties && (feature.properties.name || feature.properties.ADMIN || feature.properties.admin)) || 'Unknown country';
        updateHoverCard(countryName, record ? record.gdp : NaN, currentGdpYear);

        d3.select(this)
          .attr('stroke', '#111')
          .attr('stroke-width', 1.5);
      },
      mousemove(event) {
        // keep the card updated if the browser re-renders tooltip text later
        // nothing needed here, but we keep the handler for smoother interaction hooks
      },
      mouseleave() {
        clearHoverCard();

        d3.select(this)
          .attr('stroke', '#333')
          .attr('stroke-width', 0.5);
      },
    });
  }

  clearHoverCard();
}

function setGdpYear(year) {
  currentGdpYear = String(year);
  return colorCountriesByGdp(currentGdpYear);
}

window.ivanGdpMap = {
  setYear: setGdpYear,
  getYear: () => currentGdpYear,
};

setGdpYear(initialGdpYear).catch(error => {
  console.error('GDP map failed', error);
  const mapNode = d3.select('#map');
  if (!mapNode.empty() && mapNode.select('svg').empty()) {
    mapNode.text('Failed to load GDP map');
  }
});
