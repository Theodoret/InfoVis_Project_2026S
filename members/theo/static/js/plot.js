function initPlot() {
    const svg = d3.select("#svg_plot");

    const width = 500;
    const height = 400;
    const margin = {top: 30, right: 30, bottom: 50, left: 50};

    svg.attr("width", width).attr("height", height);

    // Task 3: Setup Scales (PCA result as 2D scatterplot)
    const xScale = d3.scaleLinear()
        .domain(d3.extent(pca_data, d => d.x))
        .range([margin.left, width - margin.right])
        .nice();

    const yScale = d3.scaleLinear()
        .domain(d3.extent(pca_data, d => d.y))
        .range([height - margin.bottom, margin.top])
        .nice();

    // 6.1: Track brushed countries for rectangular brush selection
    let brushedCountryCodes = new Set();
    let hoveredCountryCode = null;

    // Task 3: Add Axes
//    svg.append("g")
//        .attr("transform", `translate(0,${height - margin.bottom})`)
//        .call(d3.axisBottom(xScale))
//        .append("text")
//        .attr("x", width - margin.right)
//        .attr("y", -10)
//        .attr("fill", "black")
//        .text("PC1");
//
//    svg.append("g")
//        .attr("transform", `translate(${margin.left},0)`)
//        .call(d3.axisLeft(yScale))
//        .append("text")
//        .attr("transform", "rotate(-90)")
//        .attr("x", -margin.top)
//        .attr("y", 15)
//        .attr("fill", "black")
//        .text("PC2");

    // 3. Draw Dots (Task 3)
    const dot_color = "#4e79a7"
    const dots = svg.selectAll(".dot")
        .data(pca_data)
        .join("circle")
        .attr("class", "dot")
        .attr("cx", d => xScale(d.x))
        .attr("cy", d => yScale(d.y))
        .attr("r", 5)
        .attr("fill", dot_color)
        .attr("stroke", "#fff")
        .attr("stroke-width", 1);

    // 6.1: Highlight brushed countries in scatterplot
    function renderScatterSelection() {
        dots
            .attr("fill", d => (brushedCountryCodes.has(d.code) || hoveredCountryCode === d.code) ? "#f28e2b" : dot_color)
            // 5.2: Keep hovered dots visible even when a brush selection is active
            .attr("opacity", d => hoveredCountryCode === d.code || brushedCountryCodes.size === 0 || brushedCountryCodes.has(d.code) ? 1 : 0.25)
            .attr("r", d => hoveredCountryCode === d.code ? 8 : brushedCountryCodes.has(d.code) ? 6 : 5)
            .attr("stroke", d => brushedCountryCodes.has(d.code) ? "#333" : "#fff");
    }

    // Bonus: Clear Association (Tooltips/Labels)
    // Create a simple tooltip div in your body if it doesn't exist
    const tooltip = d3.select("body").append("div")
        .attr("class", "tooltip")
        .style("position", "absolute")
        .style("visibility", "hidden")
        .style("background", "white")
        .style("border", "1px solid #ccc")
        .style("height", "200px")
        .style("padding", "5px");

    // 6.1: Clear brush selection and reset all views
    function clearBrushedSelection() {
        brushedCountryCodes = new Set();
        hoveredCountryCode = null;
        renderScatterSelection();

        if (window.updateMapSelection) {
            window.updateMapSelection([]);
        }

        if (window.updateLinePlot) {
            window.updateLinePlot([]);
        }
    }

    // 6.1: Coordinate brush selection across map and time series
    function updateBrushedSelection(selectedCountries) {
        brushedCountryCodes = new Set(selectedCountries.map(d => d.code));
        renderScatterSelection();

        if (window.updateMapSelection) {
            window.updateMapSelection(selectedCountries.map(d => d.country));
        }

        if (window.updateLinePlot) {
            window.updateLinePlot(selectedCountries.map(d => d.code));
        }
    }

    // 5.2: Highlight a scatterplot dot when hovering over a country on the map
    function highlightCountryOnScatterplot(countryName) {
        const match = pca_data.find(d => d.country === countryName || d.code === countryName);
        if (!match) {
            return;
        }

        hoveredCountryCode = match.code;
        renderScatterSelection();
    }

    // 5.2: Clear scatterplot highlight when the map hover ends
    function clearCountryHighlightOnScatterplot() {
        hoveredCountryCode = null;
        renderScatterSelection();
    }

    // 6.1: Rectangular brush selection using d3.brush
    const brush = d3.brush()
        .extent([[margin.left, margin.top], [width - margin.right, height - margin.bottom]])
        .on("start brush end", function(event) {
            if (!event.selection) {
                clearBrushedSelection();
                return;
            }

            const [[x0, y0], [x1, y1]] = event.selection;
            const selectedCountries = pca_data.filter(d => {
                const x = xScale(d.x);
                const y = yScale(d.y);
                return x0 <= x && x <= x1 && y0 <= y && y <= y1;
            });

            updateBrushedSelection(selectedCountries);
        });

    svg.append("g")
        .attr("class", "brush")
        .call(brush);
    // 5.1: Keep dots interactive by placing the brush behind the scatterplot marks
    svg.select(".brush").lower();

    // 5.1: Hover coordination - highlight country on map when hovering over dot
    dots.on("mouseover", function(event, d) {
        hoveredCountryCode = d.code;
        renderScatterSelection();
        // Bonus: show details-on-demand
        tooltip.style("visibility", "visible").text(d.country);
        tooltip.html(`
            <strong><u>${d.country}</u></strong><br/>
            <strong>Access to electricity (% of population):</strong> ${d.access}<br/>
            <strong>Agricultural irrigated land (% of total agricultural land):</strong> ${d.agricultural}<br/>
            <strong>Average precipitation in depth (mm per year):</strong> ${d.precipitation}<br/>
            <strong>Employment in agricultural (% of total employment) (modeled ILO estimate):</strong> ${d.employment}<br/>
            <strong>GDP per capita (current US$):</strong> ${d.gdp}<br/>
            <strong>Land area (sq. km):</strong> ${d.area}<br/>
            <strong>Population, total:</strong> ${d.population}<br/>
        `);
        // 5.1: Call map highlight function to highlight corresponding country
        if (window.highlightCountryOnMap) {
            window.highlightCountryOnMap(d.country);
        }
    })
    .on("mousemove", function(event, d) {
        tooltip.style("top", (event.pageY - 10) + "px")
               .style("left", (event.pageX + 10) + "px");
    })
    .on("mouseout", function() {
        tooltip.style("visibility", "hidden");
        hoveredCountryCode = null;
        renderScatterSelection();

        // 5.1: Clear map highlight when mouse leaves dot
        if (window.clearCountryHighlightOnMap) {
            window.clearCountryHighlightOnMap();
        }
    });

    renderScatterSelection();

    window.clearScatterSelection = clearBrushedSelection;
    window.highlightCountryOnScatterplot = highlightCountryOnScatterplot;
    window.clearCountryHighlightOnScatterplot = clearCountryHighlightOnScatterplot;
}