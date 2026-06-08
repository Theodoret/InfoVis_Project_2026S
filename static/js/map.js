const defaultEuropeBbox = [-25, 34, 45, 72];
const defaultTopoPath = (typeof topoUrl !== 'undefined') ? topoUrl : '/static/world-topo.json';
const europeMapDataPromises = new Map();

function normalizeCountryName(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function getCountryIdentifiers(feature) {
  const properties = feature && feature.properties ? feature.properties : {};
  const candidates = [
    properties.name,
    properties.NAME,
    properties.admin,
    properties.ADMIN,
    properties.NAME_LONG,
    properties.name_long,
    properties.sovereignt,
    properties.iso_a3,
    properties.ISO_A3,
    properties.id,
  ];

  return candidates
    .map(normalizeCountryName)
    .filter(Boolean);
}

function getCountryName(feature) {
  return getCountryIdentifiers(feature)[0] || '';
}

function pointInBbox(point, bbox) {
  if (!point || point.length < 2) {
    return false;
  }

  const lon = point[0];
  const lat = point[1];
  return lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];
}

async function loadEuropeMapFeatures(topoPath = defaultTopoPath, europeBbox = defaultEuropeBbox) {
  const cacheKey = `${topoPath}|${europeBbox.join(',')}`;

  if (!europeMapDataPromises.has(cacheKey)) {
    europeMapDataPromises.set(cacheKey, d3.json(topoPath).then(topoData => {
      const objectName = Object.keys(topoData.objects)[0];
      const geoData = topojson.feature(topoData, topoData.objects[objectName]);
      let filteredFeatures = [];

      if (typeof turf !== 'undefined' && turf && typeof turf.bboxClip === 'function') {
        for (const feature of geoData.features) {
          try {
            const clipped = turf.bboxClip(feature, europeBbox);
            if (clipped && clipped.geometry && clipped.geometry.coordinates && clipped.geometry.coordinates.length) {
              clipped.properties = Object.assign({}, feature.properties || {});
              filteredFeatures.push(clipped);
            }
          } catch (error) {
            // Some geometries can fail clipping; the centroid fallback below keeps the map usable.
          }
        }
      }

      if (!filteredFeatures.length) {
        filteredFeatures = geoData.features.filter(feature => {
          try {
            return pointInBbox(d3.geoCentroid(feature), europeBbox);
          } catch (error) {
            return false;
          }
        });
      }

      return filteredFeatures.length ? filteredFeatures : geoData.features;
    }));
  }

  return europeMapDataPromises.get(cacheKey);
}

function createEuropeMap(containerSelector, options = {}) {
  const width = options.width || 620;
  const height = options.height || 620;
  const microstatePanelWidth = Math.max(0, Number(options.microstatePanelWidth) || 0);
  const mapWidth = Math.max(320, width - microstatePanelWidth);
  const defaultCountryColor = options.defaultCountryColor || '#ddd';
  const strokeColor = options.strokeColor || '#333';
  const strokeWidth = options.strokeWidth ?? 0.5;
  const container = d3.select(containerSelector);

  container.html('');

  const svg = container
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('class', options.svgClass || 'europe-map-svg');

  if (microstatePanelWidth) {
    svg.append('rect')
      .attr('class', 'microstate-panel-background')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', microstatePanelWidth)
      .attr('height', height);

    svg.append('line')
      .attr('class', 'microstate-panel-divider')
      .attr('x1', microstatePanelWidth)
      .attr('x2', microstatePanelWidth)
      .attr('y1', 0)
      .attr('y2', height);
  }

  let countrySelection = null;
  let drawFeatures = [];
  let projection = null;
  let path = null;

  function setCountryColor(country, color, transitionValue = 1) {
    if (!countrySelection) {
      return;
    }

    const targetCountry = normalizeCountryName(country);
    const clampedTransition = Math.max(0, Math.min(1, Number(transitionValue)));
    const interpolatedColor = d3.interpolateRgb(defaultCountryColor, color)(clampedTransition);

    countrySelection
      .filter(feature => getCountryIdentifiers(feature).includes(targetCountry))
      .attr('fill', interpolatedColor);
  }

  function resetCountryColors() {
    if (!countrySelection) {
      return;
    }

    countrySelection
      .attr('fill', defaultCountryColor)
      .attr('stroke', strokeColor)
      .attr('stroke-width', strokeWidth);
  }

  function setHoverHandlers(handlers = {}) {
    if (!countrySelection) {
      return;
    }

    countrySelection
      .on('mouseenter', function(event, feature) {
        if (handlers.mouseenter) {
          handlers.mouseenter.call(this, event, feature);
        }
      })
      .on('mousemove', function(event, feature) {
        if (handlers.mousemove) {
          handlers.mousemove.call(this, event, feature);
        }
      })
      .on('mouseleave', function(event, feature) {
        if (handlers.mouseleave) {
          handlers.mouseleave.call(this, event, feature);
        }
      });
  }

  const ready = loadEuropeMapFeatures(options.topoPath || defaultTopoPath, options.europeBbox || defaultEuropeBbox)
    .then(features => {
      drawFeatures = features;
      const drawCollection = { type: 'FeatureCollection', features: drawFeatures };

      projection = d3.geoMercator().fitSize([mapWidth, height], drawCollection);
      if (microstatePanelWidth) {
        const translate = projection.translate();
        projection.translate([translate[0] + microstatePanelWidth, translate[1]]);
      }
      path = d3.geoPath().projection(projection);

      countrySelection = svg.selectAll('path')
        .data(drawFeatures)
        .join('path')
        .attr('d', path)
        .attr('fill', defaultCountryColor)
        .attr('stroke', strokeColor)
        .attr('stroke-width', strokeWidth);

      return api;
    })
    .catch(error => {
      console.error('Failed to render Europe map', error);
      container.text('Failed to load map');
      throw error;
    });

  const api = {
    ready,
    svg,
    get countrySelection() {
      return countrySelection;
    },
    get drawFeatures() {
      return drawFeatures;
    },
    get projection() {
      return projection;
    },
    get path() {
      return path;
    },
    get microstatePanelWidth() {
      return microstatePanelWidth;
    },
    setCountryColor,
    resetCountryColors,
    setHoverHandlers,
    getCountryIdentifiers,
    getCountryName,
  };

  return api;
}

window.createEuropeMap = createEuropeMap;
window.loadEuropeMapFeatures = loadEuropeMapFeatures;
window.getCountryIdentifiers = getCountryIdentifiers;
window.getCountryName = getCountryName;

if (document.querySelector('#map')) {
  window.ivanGdpEuropeMap = createEuropeMap('#map', {
    width: 760,
    height: 620,
    microstatePanelWidth: 140,
    defaultCountryColor: '#ddd',
    strokeColor: '#333',
    strokeWidth: 0.5,
  });

  window.ivanMapReady = window.ivanGdpEuropeMap.ready.then(map => {
    window.ivanCountrySelection = map.countrySelection;
    window.ivanCountryData = map.drawFeatures;
    window.ivanCountryPath = map.path;
    return map;
  });

  window.setCountryColor = (...args) => window.ivanGdpEuropeMap.setCountryColor(...args);
  window.resetCountryColors = (...args) => window.ivanGdpEuropeMap.resetCountryColors(...args);
}
