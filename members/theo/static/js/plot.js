let worldMapPromise = null;
let hoveredCountryKey = null;
let stackUiInitialized = false;

const COUNTRY_ALIASES = {
    "Czechia": "Czech Republic",
    "Slovakia": "Slovak Republic",
};

const SCLMEET_LABELS = {
    1: "Never",
    2: "Less than monthly",
    3: "Monthly",
    4: "Several times / month",
    5: "Weekly",
    6: "Several times / week",
    7: "Every day",
};

function globalMetricExtent(key) {
    const vals = (window.mergedData || []).map(d => +d[key]).filter(Number.isFinite);
    if (vals.length === 0) return [0, 1];
    return [d3.min(vals), d3.max(vals)];
}

const HOURS_LEGEND = v => `${Math.round(v)} h`;

const METRICS = {
    work: {
        key: "wkhtot",
        title: "Working Hours",
        color: "#4e79a7",
        colorScheme: d3.interpolateBlues,
        yLabel: "Hours per week",
        formatValue: v => `${d3.format(".1f")(v)} h`,
        legendFormat: HOURS_LEGEND,
        yDomain: (data) => {
            const [lo, hi] = globalMetricExtent("wkhtot");
            return [Math.max(0, lo - 2), hi + 2];
        },
        mapDomain: () => globalMetricExtent("wkhtot"),
    },
    tv: {
        key: "tvtot_hours",
        title: "TV Time",
        color: "#e15759",
        colorScheme: d3.interpolateOrRd,
        yLabel: "Hours on weekday",
        formatValue: v => `${d3.format(".2f")(v)} h`,
        legendFormat: HOURS_LEGEND,
        yDomain: () => [0, 4.5],
        mapDomain: () => [0, 4.5],
    },
    social: {
        key: "sclmeet",
        title: "Social Meetings",
        color: "#59a14f",
        colorScheme: d3.interpolateGreens,
        yLabel: "Frequency (1–7)",
        formatValue: v => `${d3.format(".2f")(v)} (${SCLMEET_LABELS[Math.round(v)] || "—"})`,
        legendFormat: v => d3.format(".0f")(v),
        yDomain: () => [1, 7],
        mapDomain: () => [1, 7],
    },
};

function normalizeName(name) {
    if (!name) return "";
    return (COUNTRY_ALIASES[name] || name).toLowerCase().trim();
}

function formatCurrency(val) {
    if (!Number.isFinite(val)) return "N/A";
    if (val >= 1e12) return `$${(val / 1e12).toFixed(1)}T`;
    if (val >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
    if (val >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
    return `$${d3.format(",")(Math.round(val))}`;
}

function getTooltip() {
    return d3.select("body").selectAll("div.tooltip").data([null]).join("div")
        .attr("class", "tooltip")
        .style("visibility", "hidden");
}

function setHoveredCountry(countryKey) {
    hoveredCountryKey = countryKey || null;
    applyHoverStyles();
}

function clearHoveredCountry() {
    hoveredCountryKey = null;
    applyHoverStyles();
}

function applyHoverStyles() {
    d3.selectAll(".country-shape")
        .attr("fill", function () {
            const base = d3.select(this).attr("data-base-fill") || "var(--map-empty-fill, #1e202b)";
            const key = d3.select(this).attr("data-country-key") || "";
            if (!hoveredCountryKey) return base;
            return key === hoveredCountryKey ? "var(--hover-color, #ff9f43)" : base;
        })
        .attr("opacity", function () {
            const key = d3.select(this).attr("data-country-key") || "";
            if (!hoveredCountryKey) return 1;
            return key === hoveredCountryKey ? 1 : 0.4;
        })
        .attr("stroke-width", function () {
            const key = d3.select(this).attr("data-country-key") || "";
            return hoveredCountryKey && key === hoveredCountryKey ? 1.5 : 0.5;
        });

    d3.selectAll(".country-dot")
        .attr("fill", function () {
            const base = d3.select(this).attr("data-base-fill") || "#4e79a7";
            const key = d3.select(this).attr("data-country-key") || "";
            if (!hoveredCountryKey) return base;
            return key === hoveredCountryKey ? "var(--hover-color, #ff9f43)" : base;
        })
        .attr("r", function () {
            const key = d3.select(this).attr("data-country-key") || "";
            if (!hoveredCountryKey) return 5.5;
            return key === hoveredCountryKey ? 8 : 4;
        })
        .attr("opacity", function () {
            const key = d3.select(this).attr("data-country-key") || "";
            if (!hoveredCountryKey) return 0.95;
            return key === hoveredCountryKey ? 1 : 0.25;
        });
}

function getWorldTopoUrl() {
    return window.worldTopoUrl || "/theo/data/world-topo.json";
}

function getWorldFeatures(world) {
    const objects = world?.objects || {};
    const primaryObject = objects.countries || objects[Object.keys(objects)[0]];
    if (!primaryObject) return [];
    return topojson.feature(world, primaryObject).features || [];
}

function isInEuropeBounds(centroid) {
    const lon = centroid[0];
    const lat = centroid[1];
    return lon >= -25 && lon <= 45 && lat >= 34 && lat <= 72;
}

function keepEuropeanGeometry(feature) {
    if (!feature || !feature.geometry) return null;
    const { type, coordinates } = feature.geometry;

    if (type === "Polygon") {
        const centroid = d3.geoCentroid(feature);
        return isInEuropeBounds(centroid) ? feature : null;
    }

    if (type === "MultiPolygon") {
        const keptPolygons = coordinates.filter((polygonCoords) => {
            const polygonFeature = {
                type: "Feature",
                properties: feature.properties,
                geometry: { type: "Polygon", coordinates: polygonCoords },
            };
            return isInEuropeBounds(d3.geoCentroid(polygonFeature));
        });
        if (keptPolygons.length === 0) return null;
        return { ...feature, geometry: { type: "MultiPolygon", coordinates: keptPolygons } };
    }
    return feature;
}

function drawScatter(svgId, yearData, config, title) {
    const { key, color, yLabel, formatValue, yDomain } = config;
    const svg = d3.select(svgId);
    const width = 560;
    const height = 330;
    const margin = { top: 45, right: 18, bottom: 50, left: 70 };
    const tooltip = getTooltip();

    svg.attr("viewBox", `0 0 ${width} ${height}`)
       .attr("width", "100%")
       .attr("height", "100%")
       .style("max-width", `${width}px`)
       .style("max-height", `${height}px`);
    svg.selectAll("*").remove();

    const filtered = yearData.filter(
        d => Number.isFinite(+d.gdp_usd) && +d.gdp_usd >= 0 && Number.isFinite(+d[key])
    );
    if (filtered.length === 0) {
        svg.append("text").attr("class", "error-text")
            .attr("x", width / 2).attr("y", height / 2)
            .attr("text-anchor", "middle").text("No data available");
        return;
    }

    const logValues = filtered.map(d => Math.log10(+d.gdp_usd + 1));
    const xScale = d3.scaleLinear()
        .domain(d3.extent(logValues))
        .range([margin.left, width - margin.right])
        .nice();

    const [yMin, yMax] = yDomain(filtered);
    const yScale = d3.scaleLinear()
        .domain([yMin, yMax])
        .range([height - margin.bottom, margin.top])
        .nice();

    const minLog = Math.floor(d3.min(logValues));
    const maxLog = Math.ceil(d3.max(logValues));
    const xTicks = d3.range(minLog, maxLog + 1, 1);

    svg.append("g")
        .attr("class", "grid grid-x")
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(xScale).tickValues(xTicks).tickSize(-height + margin.top + margin.bottom).tickFormat(""))
        .call(g => g.select(".domain").remove())
        .call(g => g.selectAll(".tick line").attr("stroke-dasharray", "3,3"));

    svg.append("g")
        .attr("class", "grid grid-y")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(yScale).tickSize(-width + margin.left + margin.right).tickFormat(""))
        .call(g => g.select(".domain").remove())
        .call(g => g.selectAll(".tick line").attr("stroke-dasharray", "3,3"));

    svg.append("g")
        .attr("class", "axis x-axis")
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(xScale).tickValues(xTicks).tickFormat(d => {
            const val = 10 ** d;
            if (val >= 1e12) return `$${val / 1e12}T`;
            if (val >= 1e9) return `$${val / 1e9}B`;
            if (val >= 1e6) return `$${val / 1e6}M`;
            return `$${val}`;
        }));

    svg.append("g")
        .attr("class", "axis y-axis")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(yScale).ticks(6));

    svg.append("text").attr("class", "chart-title")
        .attr("x", width / 2).attr("y", 22).attr("text-anchor", "middle").text(title);

    svg.append("text").attr("class", "axis-label")
        .attr("x", width / 2).attr("y", height - 8).attr("text-anchor", "middle")
        .text("GDP (current USD, log scale)");

    svg.append("text").attr("class", "axis-label")
        .attr("transform", `translate(14,${height / 2}) rotate(-90)`)
        .attr("text-anchor", "middle").text(yLabel);

    svg.selectAll("circle")
        .data(filtered)
        .join("circle")
        .attr("class", "country-dot")
        .attr("data-country-key", d => normalizeName(d["Country Name"]))
        .attr("data-base-fill", color)
        .attr("cx", d => xScale(Math.log10(+d.gdp_usd + 1)))
        .attr("cy", d => yScale(+d[key]))
        .attr("r", 5.5)
        .attr("fill", color)
        .attr("opacity", 0.95)
        .on("mouseover", (event, d) => {
            setHoveredCountry(normalizeName(d["Country Name"]));
            tooltip.style("visibility", "visible").html(`
                <div class="tooltip-title">${d["Country Name"]}</div>
                <div class="tooltip-row"><span class="tooltip-label">GDP:</span><span class="tooltip-value">${formatCurrency(d.gdp_usd)}</span></div>
                <div class="tooltip-row"><span class="tooltip-label">Value:</span><span class="tooltip-value" style="color:${color}">${formatValue(+d[key])}</span></div>
            `);
        })
        .on("mousemove", event => {
            tooltip.style("top", `${event.pageY - 12}px`).style("left", `${event.pageX + 12}px`);
        })
        .on("mouseout", () => {
            clearHoveredCountry();
            tooltip.style("visibility", "hidden");
        });

    applyHoverStyles();
}

function drawMap(svgId, yearData, config, title) {
    const { key, colorScheme, formatValue, legendFormat, mapDomain } = config;
    const formatLegend = legendFormat || formatValue;
    const svg = d3.select(svgId);
    const width = 560;
    const height = 330;
    const tooltip = getTooltip();

    svg.attr("viewBox", `0 0 ${width} ${height}`)
       .attr("width", "100%")
       .attr("height", "100%")
       .style("max-width", `${width}px`)
       .style("max-height", `${height}px`);
    svg.selectAll("*").remove();

    const filtered = yearData.filter(d => Number.isFinite(+d[key]));
    const values = new Map(
        filtered.map(d => [normalizeName(d["Country Name"]), +d[key]])
    );

    let domain = mapDomain(filtered);
    if (!Number.isFinite(domain[0]) || !Number.isFinite(domain[1])) {
        domain = [0, 1];
    }
    if (domain[0] === domain[1]) {
        domain = [domain[0] - 0.5, domain[1] + 0.5];
    }

    const scale = d3.scaleSequential(colorScheme).domain(domain);
    const projection = d3.geoNaturalEarth1();
    const path = d3.geoPath().projection(projection);

    if (!worldMapPromise) {
        worldMapPromise = d3.json(getWorldTopoUrl());
    }

    worldMapPromise.then(world => {
        const countries = getWorldFeatures(world);
        if (countries.length === 0) {
            svg.append("text").attr("class", "error-text")
                .attr("x", width / 2).attr("y", height / 2)
                .attr("text-anchor", "middle").text("Map topology not found");
            return;
        }

        const europeFeatures = countries.map(keepEuropeanGeometry).filter(Boolean);
        if (europeFeatures.length > 0) {
            projection.fitExtent(
                [[30, 45], [width - 30, height - 20]],
                { type: "FeatureCollection", features: europeFeatures }
            );
            projection.scale(projection.scale() * 0.92);
        } else {
            projection.fitExtent(
                [[20, 45], [width - 20, height - 20]],
                { type: "FeatureCollection", features: countries }
            );
        }

        svg.append("text").attr("class", "chart-title")
            .attr("x", width / 2).attr("y", 22).attr("text-anchor", "middle").text(title);

        const legendWidth = 130;
        const legendHeight = 8;
        const legendX = width - legendWidth - 18;
        const legendY = 26;
        const legendId = `legend-${svgId.replace("#", "")}`;

        const defs = svg.append("defs");
        const gradient = defs.append("linearGradient")
            .attr("id", legendId)
            .attr("x1", "0%").attr("x2", "100%").attr("y1", "0%").attr("y2", "0%");

        for (let i = 0; i <= 8; i += 1) {
            const t = i / 8;
            gradient.append("stop")
                .attr("offset", `${t * 100}%`)
                .attr("stop-color", colorScheme(domain[0] + t * (domain[1] - domain[0])));
        }

        svg.append("rect")
            .attr("x", legendX).attr("y", legendY)
            .attr("width", legendWidth).attr("height", legendHeight)
            .attr("fill", `url(#${legendId})`)
            .attr("stroke", "var(--legend-stroke, #475569)")
            .attr("stroke-width", 0.5);

        svg.append("text").attr("class", "legend-text")
            .attr("x", legendX).attr("y", legendY - 3)
            .text(formatLegend(domain[0]));

        svg.append("text").attr("class", "legend-text")
            .attr("x", legendX + legendWidth).attr("y", legendY - 3)
            .attr("text-anchor", "end")
            .text(formatLegend(domain[1]));

        const displayedFeatures = europeFeatures.length > 0 ? europeFeatures : countries;

        svg.append("g")
            .selectAll("path")
            .data(displayedFeatures)
            .join("path")
            .attr("class", "country-shape")
            .attr("data-country-key", d => normalizeName(d?.properties?.admin || d?.properties?.name))
            .attr("d", path)
            .attr("stroke", "var(--map-stroke, #32364a)")
            .attr("stroke-width", 0.6)
            .attr("data-base-fill", d => {
                const countryKey = normalizeName(d?.properties?.admin || d?.properties?.name);
                return values.has(countryKey) ? scale(values.get(countryKey)) : "var(--map-empty-fill, #1e202b)";
            })
            .attr("fill", function () {
                return d3.select(this).attr("data-base-fill");
            })
            .on("mouseover", (event, d) => {
                const countryName = d?.properties?.admin || d?.properties?.name || "Unknown";
                const countryKey = normalizeName(countryName);
                const value = values.get(countryKey);
                setHoveredCountry(countryKey);
                const matchingRecord = yearData.find(r => normalizeName(r["Country Name"]) === countryKey);
                const gdpInfo = matchingRecord
                    ? `<div class="tooltip-row"><span class="tooltip-label">GDP:</span><span class="tooltip-value">${formatCurrency(matchingRecord.gdp_usd)}</span></div>`
                    : "";
                tooltip.style("visibility", "visible").html(`
                    <div class="tooltip-title">${countryName}</div>
                    <div class="tooltip-row"><span class="tooltip-label">Value:</span><span class="tooltip-value">${Number.isFinite(value) ? formatValue(value) : "No data"}</span></div>
                    ${gdpInfo}
                `);
            })
            .on("mousemove", event => {
                tooltip.style("top", `${event.pageY - 12}px`).style("left", `${event.pageX + 12}px`);
            })
            .on("mouseout", () => {
                clearHoveredCountry();
                tooltip.style("visibility", "hidden");
            });

        applyHoverStyles();
    });
}

function drawPcaScatter(svgId, year, color) {
    const svg = d3.select(svgId);
    const width = 1160;
    const height = 340;
    const margin = { top: 45, right: 20, bottom: 50, left: 60 };
    const tooltip = getTooltip();

    svg.attr("viewBox", `0 0 ${width} ${height}`)
       .attr("width", "100%")
       .attr("height", "100%")
       .style("max-width", `${width}px`)
       .style("max-height", `${height}px`);
    svg.selectAll("*").remove();

    const points = (window.pcaData || []).filter(d => +d.year === +year);
    if (points.length === 0) {
        svg.append("text")
            .attr("class", "error-text")
            .attr("x", width / 2)
            .attr("y", height / 2)
            .attr("text-anchor", "middle")
            .text("No PCA data available");
        return;
    }

    const xScale = d3.scaleLinear()
        .domain(d3.extent(points, d => +d.pc1))
        .range([margin.left, width - margin.right])
        .nice();
    const yScale = d3.scaleLinear()
        .domain(d3.extent(points, d => +d.pc2))
        .range([height - margin.bottom, margin.top])
        .nice();

    svg.append("g")
        .attr("class", "axis x-axis")
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(xScale));

    svg.append("g")
        .attr("class", "axis y-axis")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(yScale));

    svg.append("text")
        .attr("class", "chart-title")
        .attr("x", width / 2)
        .attr("y", 22)
        .attr("text-anchor", "middle")
        .text("PCA Plot");

    svg.append("text")
        .attr("class", "axis-label")
        .attr("x", width / 2)
        .attr("y", height - 8)
        .attr("text-anchor", "middle")
        .text("PC1");

    svg.append("text")
        .attr("class", "axis-label")
        .attr("transform", `translate(16,${height / 2}) rotate(-90)`)
        .attr("text-anchor", "middle")
        .text("PC2");

    svg.selectAll(".pca-dot")
        .data(points)
        .join("circle")
        .attr("class", "country-dot pca-dot")
        .attr("data-country-key", d => normalizeName(d["Country Name"]))
        .attr("data-base-fill", color)
        .attr("cx", d => xScale(+d.pc1))
        .attr("cy", d => yScale(+d.pc2))
        .attr("r", 5.2)
        .attr("fill", color)
        .attr("opacity", 0.9)
        .on("mouseover", (event, d) => {
            setHoveredCountry(normalizeName(d["Country Name"]));
            tooltip.style("visibility", "visible")
                .html(`
                    <div class="tooltip-title">${d["Country Name"]}</div>
                    <div class="tooltip-row"><span class="tooltip-label">PC1:</span><span class="tooltip-value">${d3.format(".2f")(d.pc1)}</span></div>
                    <div class="tooltip-row"><span class="tooltip-label">PC2:</span><span class="tooltip-value">${d3.format(".2f")(d.pc2)}</span></div>
                `);
        })
        .on("mousemove", event => {
            tooltip.style("top", `${event.pageY - 12}px`).style("left", `${event.pageX + 12}px`);
        })
        .on("mouseout", () => {
            clearHoveredCountry();
            tooltip.style("visibility", "hidden");
        });

    applyHoverStyles();
}

function renderMetricPair(scatterId, mapId, yearData, config) {
    const { title } = config;
    drawMap(mapId, yearData, config, `${title} Map`);
    drawScatter(scatterId, yearData, config, `${title} Plot`);
}

function initSectionStack() {
    const heads = Array.from(document.querySelectorAll(".stack-head"));
    const panels = Array.from(document.querySelectorAll(".stack-panel"));
    if (heads.length === 0 || panels.length === 0) {
        return;
    }

    function activate(targetId) {
        heads.forEach(head => {
            head.classList.toggle("active", head.dataset.target === targetId);
        });
        panels.forEach(panel => {
            panel.classList.toggle("active", panel.id === targetId);
        });
    }

    heads.forEach(head => {
        head.addEventListener("click", () => activate(head.dataset.target));
    });

    activate("sec_pca");
}

function updatePlots() {
    const yearData = (window.mergedData || []).filter(d => +d.year === +currentYear);

    drawPcaScatter("#svg_pca_scatter", currentYear, "#a78bfa");
    renderMetricPair("#svg_work_scatter", "#svg_work_map", yearData, METRICS.work);
    renderMetricPair("#svg_tv_scatter", "#svg_tv_map", yearData, METRICS.tv);
    renderMetricPair("#svg_social_scatter", "#svg_social_map", yearData, METRICS.social);
}

function initPlots() {
    if (!stackUiInitialized) {
        initSectionStack();
        stackUiInitialized = true;
    }
    updatePlots();
}

window.initPlots = initPlots;
window.updatePlots = updatePlots;
