let selectedLineCountryCodes = [];
window.selectedLineCountryCodes = selectedLineCountryCodes;

const indicators = [
    'Access to electricity (% of population)',
    'Agricultural irrigated land (% of total agricultural land)',
    'Average precipitation in depth (mm per year)',
    'Employment in agriculture (% of total employment) (modeled ILO estimate)',
    'GDP per capita (current US$)',
    'Land area (sq. km)',
    'Population, total'
];

function initLinePlot() {
    const indicatorDropdown = d3.select("#indicator_change");

    indicatorDropdown.selectAll("option")
        .data(indicators)
        .join("option")
        .text(d => d)
        .attr("value", d => d);

    if (!indicatorDropdown.property("value")) {
        indicatorDropdown.property("value", indicators[0]);
    }

    // 6.1 & 6.2: Update time series and map when indicator changes
    indicatorDropdown.on("change", function() {
        updateLinePlot(selectedLineCountryCodes);
            // 6.1 & 6.2: Update time series and map when indicator changes
        if (window.updateMap) {
            window.updateMap();
        }
    });

    updateLinePlot([]);
}

function updateLinePlot(countryCodes = []) {
    selectedLineCountryCodes = Array.from(new Set(countryCodes));
    window.selectedLineCountryCodes = selectedLineCountryCodes;

    const container = d3.select("#svg_line_plot");
    container.selectAll("*").remove();

    const indicator = d3.select("#indicator_change").property("value") || indicators[0];
    const activeYear = Number(currentYear);
    const svgElement = document.getElementById("svg_line_plot");
    const totalWidth = svgElement.clientWidth || 900;
    const totalHeight = svgElement.clientHeight || 500;

    const margin = {top: 25, right: 150, bottom: 25, left: 20};
    const width = Math.max(totalWidth - margin.left - margin.right, 0);
    const height = Math.max(totalHeight - margin.top - margin.bottom, 0);

    const svg = container
        .append("svg")
        .attr("width", totalWidth)
        .attr("height", totalHeight)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    if (selectedLineCountryCodes.length === 0) {
        svg.append("text")
            .attr("x", width / 2)
            .attr("y", height / 2)
            .attr("text-anchor", "middle")
            .attr("fill", "#666")
                .text("Brush countries in the PCA scatterplot to show their time series."); // 6.1: Handle empty brush selection
        return;
    }

    // 5.3: Resolve either country names or codes for map-clicked selections
    const countries = selectedLineCountryCodes
        .map(countryKey => {
            const countryValues = data
                .filter(d => d["Country Code"] === countryKey || d["Country Name"] === countryKey)
                .sort((a, b) => +a.year - +b.year)
                .map(d => ({...d, year: +d.year}));

            return {
                code: countryValues[0]?.["Country Code"] || countryKey,
                name: countryValues[0]?.["Country Name"] || countryKey,
                values: countryValues
            };
        })
        .filter(country => country.values.length > 0);

    if (countries.length === 0) {
        svg.append("text")
            .attr("x", width / 2)
            .attr("y", height / 2)
            .attr("text-anchor", "middle")
            .attr("fill", "#666")
            .text("No time-series data available for the brushed countries.");
        return;
    }

    const allYears = countries.flatMap(country => country.values.map(d => d.year));
    const allValues = countries.flatMap(country => country.values)
        .map(d => +d[indicator])
        .filter(value => Number.isFinite(value));

    if (allYears.length === 0 || allValues.length === 0) {
        svg.append("text")
            .attr("x", width / 2)
            .attr("y", height / 2)
            .attr("text-anchor", "middle")
            .attr("fill", "#666")
            .text("No valid values available for the selected indicator.");
        return;
    }

    const xScale = d3.scaleLinear()
        .domain(d3.extent(allYears))
        .range([0, width])
        .nice();

    const yScale = d3.scaleLinear()
        .domain([d3.min(allValues) * 0.95, d3.max(allValues) * 1.05])
        .range([height, 0])
        .nice();

    const colorScale = d3.scaleOrdinal(d3.schemeTableau10)
        .domain(countries.map(country => country.code));

    svg.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(xScale).ticks(6).tickFormat(d3.format("d")));

    svg.append("g")
        .call(d3.axisLeft(yScale));

    svg.append("line")
        .attr("x1", xScale(activeYear))
        .attr("x2", xScale(activeYear))
        .attr("y1", 0)
        .attr("y2", height)
        .attr("stroke", "#d62728")
        .attr("stroke-width", 1.5)
         .attr("stroke-dasharray", "4 3"); // 6.2: Show selected year marker

    svg.append("text")
        .attr("x", width / 2)
        .attr("y", -8)
        .attr("text-anchor", "middle")
        .attr("font-weight", "bold")
        .text(indicator);

    svg.append("text")
        .attr("x", width)
        .attr("y", -8)
        .attr("text-anchor", "end")
        .attr("fill", "#d62728")
        .attr("font-weight", "bold")
        .text(`Year: ${activeYear}`);

    const lineGenerator = d3.line()
        .defined(d => d[indicator] != null && d[indicator] !== "")
        .x(d => xScale(d.year))
        .y(d => yScale(+d[indicator]));

    // 5.3: Render the selected country's line from 1960 to 2020
    svg.selectAll(".country-line")
        .data(countries)
        .join("path")
        .attr("class", "country-line")
        .attr("fill", "none")
        .attr("stroke", d => colorScale(d.code))
        .attr("stroke-width", 2)
        .attr("d", d => lineGenerator(d.values));

    svg.selectAll(".country-year-point")
        .data(countries.map(country => {
            const yearPoint = country.values.find(d => d.year === activeYear);
            return { ...country, yearPoint };
        }).filter(d => d.yearPoint && Number.isFinite(+d.yearPoint[indicator])))
        .join("circle")
        .attr("class", "country-year-point")
        .attr("cx", d => xScale(d.yearPoint.year))
        .attr("cy", d => yScale(+d.yearPoint[indicator]))
        .attr("r", 4)
        .attr("fill", d => colorScale(d.code))
        .attr("stroke", "white")
         .attr("stroke-width", 1.5); // 6.2: Mark data points at selected year

    svg.selectAll(".country-label")
        .data(countries)
        .join("text")
        .attr("class", "country-label")
        .attr("x", width + 5)
        .attr("y", (d, i) => 15 + i * 16)
        .attr("fill", d => colorScale(d.code))
        .attr("font-size", "12px")
        .text(d => d.name);
}

window.initLinePlot = initLinePlot;
window.updateLinePlot = updateLinePlot;
