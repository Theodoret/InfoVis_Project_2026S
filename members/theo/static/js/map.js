let mapWidth = 800;
let mapHeight = 500;
let map = null;
let mapData = null;
// 6.1: Track brushed countries for map highlighting
let selectedCountryNames = new Set();
let hoveredCountryName = null;


const COUNTRIES = ['Afghanistan', 'Albania', 'Algeria', 'Angola', 'Argentina', 'Armenia', 'Australia', 'Austria',
             'Azerbaijan', 'Brazil', 'Bulgaria', 'Cameroon', 'Chile', 'China', 'Colombia', 'Croatia', 'Cuba',
             'Cyprus', 'Czech Republic', 'Ecuador', 'Egypt, Arab Rep.', 'Eritrea', 'Ethiopia', 'France', 'Germany',
             'Ghana', 'Greece', 'India', 'Indonesia', 'Iran, Islamic Rep.', 'Iraq', 'Ireland', 'Italy', 'Japan',
             'Jordan', 'Kazakhstan', 'Kenya', 'Lebanon', 'Malta', 'Mexico', 'Morocco', 'Pakistan', 'Peru',
             'Philippines', 'Russian Federation', 'Syrian Arab Republic', 'Tunisia', 'Turkey', 'Ukraine'];

function initMap() {

    // Task 4: loads the world map as topojson
    d3.json("../data/world-topo.json").then(function (countries) {

        // Task 4: defines the map projection method and scales the map within the SVG
        let projection = d3.geoEqualEarth()
            .scale(180)
            .translate([mapWidth / 2, mapHeight / 2]);

        // Task 4: generates the path coordinates from topojson
        let path = d3.geoPath()
            .projection(projection);

        // Task 4: configures the SVG element
        let svg = d3.select("#svg_map")
            .attr("width", mapWidth)
            .attr("height", mapHeight);

        // Task 4: map geometry
        mapData = topojson.feature(countries, countries.objects.countries).features;

        // Task 4: generates and styles the SVG path
        map = svg.append("g")
            .selectAll('path')
            .data(mapData)
            .enter().append('path')
            .attr('d', path)
            .attr('stroke', 'black')
            .attr('stroke-width', 0.5)
            .attr('fill', function(d) {
                if (COUNTRIES.includes(d.properties.admin)) {
                    return "grey";
                } else {
                    return "white";
                }
            });

        // 5.3: Clicking a country on the map renders its time series in the line plot
        map.on("click", function(event, d) {
            const countryName = getMapCountryName(d);

            if (window.updateLinePlot) {
                // 5.3: Pass the clicked country name to the line plot without affecting brushing
                window.updateLinePlot([countryName]);
            }
        });

        // 5.2: Hovering a map country highlights the corresponding scatterplot dot
        map.on("mouseover", function(event, d) {
            const countryName = getMapCountryName(d);
            hoveredCountryName = countryName;
            renderMapSelection();

            if (window.highlightCountryOnScatterplot) {
                window.highlightCountryOnScatterplot(countryName);
            }
        })
        .on("mouseout", function() {
            hoveredCountryName = null;
            renderMapSelection();

            // 5.2: Clear scatterplot highlight when the mouse leaves the map country
            if (window.clearCountryHighlightOnScatterplot) {
                window.clearCountryHighlightOnScatterplot();
            }
        });

        renderMapSelection();
    });


}

function getMapCountryName(feature) {
    return feature?.properties?.admin || feature?.properties?.name || feature?.properties?.id;
}

function getCurrentIndicator() {
    const indicatorNode = d3.select("#indicator_change");
    return indicatorNode.empty() ? null : indicatorNode.property("value");
}

// 6.2: Fetch country data for selected year to support temporal updates
function getCountryRecordForYear(countryName) {
    const year = Number(currentYear);
    const byName = data.find(d => d["Country Name"] === countryName && +d.year === year);
    if (byName) {
        return byName;
    }

    return data.find(d => d["Country Code"] === countryName && +d.year === year);
}

// 6.2: Build choropleth color scale based on selected year and indicator
function getChoroplethColorScale() {
    const indicator = getCurrentIndicator();
    if (!indicator) {
        return null;
    }

    const values = data
        .filter(d => +d.year === Number(currentYear))
        .map(d => +d[indicator])
        .filter(value => Number.isFinite(value));

    if (values.length === 0) {
        return null;
    }

    return d3.scaleSequential(d3.interpolateYlGnBu)
        .domain(d3.extent(values));
}

// 6.1 & 6.2 & 5.1: Render map with brush highlighting, choropleth coloring, and hover highlighting
function renderMapSelection() {
    const colorScale = getChoroplethColorScale();

    d3.select("#svg_map").selectAll("path")
        .attr("fill", function(d) {
            const countryName = getMapCountryName(d);
            const record = getCountryRecordForYear(countryName);
            const indicator = getCurrentIndicator();

            if (selectedCountryNames.size > 0) {
                return selectedCountryNames.has(countryName)
                    ? "#f28e2b"
                    : (record && colorScale && indicator ? colorScale(+record[indicator]) : (COUNTRIES.includes(countryName) ? "#d9d9d9" : "white"));
            }

            // 5.1: Highlight hovered country on map
            if (hoveredCountryName && hoveredCountryName === countryName) {
                return "#f28e2b";
            }

            if (record && colorScale && indicator) {
                const value = +record[indicator];
                return Number.isFinite(value) ? colorScale(value) : (COUNTRIES.includes(countryName) ? "grey" : "white");
            }

            return COUNTRIES.includes(countryName) ? "grey" : "white";
        })
        .attr("opacity", function(d) {
            const countryName = getMapCountryName(d);

            if (selectedCountryNames.size > 0) {
                return selectedCountryNames.has(countryName) ? 1 : 0.45;
            }

            return hoveredCountryName && hoveredCountryName === countryName ? 1 : 1;
        })
        .attr("stroke-width", function(d) {
            const countryName = getMapCountryName(d);
            return (selectedCountryNames.has(countryName) || hoveredCountryName === countryName) ? 1.5 : 0.5;
        })
        .classed("highlighted", function(d) {
            const countryName = getMapCountryName(d);
            return selectedCountryNames.has(countryName) || hoveredCountryName === countryName;
        });
}

// 6.1: Update map highlighting when brush selection changes
function updateMapSelection(countryNames) {
    selectedCountryNames = new Set((countryNames || []).filter(Boolean));
    renderMapSelection();
}

// 6.2: Update map when year or indicator slider changes
function updateMap() {
    renderMapSelection();
}

// 5.1: Highlight country on map when hovering over scatterplot dot
function highlightCountryOnMap(countryName) {
    hoveredCountryName = countryName;
    renderMapSelection();
}

// 5.1: Clear highlight when mouse leaves scatterplot dot
function clearCountryHighlightOnMap() {
    hoveredCountryName = null;
    renderMapSelection();
}

window.updateMapSelection = updateMapSelection;
window.updateMap = updateMap;
window.highlightCountryOnMap = highlightCountryOnMap;
window.clearCountryHighlightOnMap = clearCountryHighlightOnMap;
