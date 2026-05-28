let worldMapPromise = null;
let hoveredCountryKey = null;

const COUNTRY_ALIASES = {
    "Czechia": "Czech Republic",
    "Slovakia": "Slovak Republic",
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
            if (!hoveredCountryKey) {
                return base;
            }
            return key === hoveredCountryKey ? "var(--hover-color, #ff9f43)" : base;
        })
        .attr("opacity", function () {
            const key = d3.select(this).attr("data-country-key") || "";
            if (!hoveredCountryKey) {
                return 1;
            }
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
            if (!hoveredCountryKey) {
                return base;
            }
            return key === hoveredCountryKey ? "var(--hover-color, #ff9f43)" : base;
        })
        .attr("r", function () {
            const key = d3.select(this).attr("data-country-key") || "";
            if (!hoveredCountryKey) {
                return 5.5;
            }
            return key === hoveredCountryKey ? 8 : 4;
        })
        .attr("opacity", function () {
            const key = d3.select(this).attr("data-country-key") || "";
            if (!hoveredCountryKey) {
                return 0.95;
            }
            return key === hoveredCountryKey ? 1 : 0.25;
        });
}

function getWorldTopoUrl() {
    return window.worldTopoUrl || "static/data/world-topo.json";
}

function getWorldFeatures(world) {
    const objects = world?.objects || {};
    const primaryObject = objects.countries || objects[Object.keys(objects)[0]];
    if (!primaryObject) {
        return [];
    }
    return topojson.feature(world, primaryObject).features || [];
}

function isInEuropeBounds(centroid) {
    const lon = centroid[0];
    const lat = centroid[1];
    return lon >= -25 && lon <= 45 && lat >= 34 && lat <= 72;
}

function keepEuropeanGeometry(feature) {
    if (!feature || !feature.geometry) {
        return null;
    }

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

        if (keptPolygons.length === 0) {
            return null;
        }

        return {
            ...feature,
            geometry: {
                type: "MultiPolygon",
                coordinates: keptPolygons,
            },
        };
    }

    return feature;
}

function drawScatter(svgId, yearData, metricKey, title, color) {
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
        d => Number.isFinite(+d.gdp_usd) && +d.gdp_usd >= 0 && Number.isFinite(+d[metricKey])
    );
    if (filtered.length === 0) {
        svg.append("text")
            .attr("class", "error-text")
            .attr("x", width / 2)
            .attr("y", height / 2)
            .attr("text-anchor", "middle")
            .text("No data available");
        return;
    }

    const logValues = filtered.map(d => Math.log10(+d.gdp_usd + 1));
    const xScale = d3.scaleLinear()
        .domain(d3.extent(logValues))
        .range([margin.left, width - margin.right])
        .nice();

    const yScale = d3.scaleLinear()
        .domain([0, d3.max(filtered, d => +d[metricKey]) * 1.08])
        .range([height - margin.bottom, margin.top])
        .nice();

    const minLog = Math.floor(d3.min(logValues));
    const maxLog = Math.ceil(d3.max(logValues));
    const xTicks = d3.range(minLog, maxLog + 1, 1);

    // Gridlines (rendered in background)
    svg.append("g")
        .attr("class", "grid grid-x")
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(xScale)
            .tickValues(xTicks)
            .tickSize(-height + margin.top + margin.bottom)
            .tickFormat("")
        )
        .call(g => g.select(".domain").remove())
        .call(g => g.selectAll(".tick line").attr("stroke-dasharray", "3,3"));

    svg.append("g")
        .attr("class", "grid grid-y")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(yScale)
            .tickSize(-width + margin.left + margin.right)
            .tickFormat("")
        )
        .call(g => g.select(".domain").remove())
        .call(g => g.selectAll(".tick line").attr("stroke-dasharray", "3,3"));

    // Axes
    svg.append("g")
        .attr("class", "axis x-axis")
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .call(
            d3.axisBottom(xScale)
                .tickValues(xTicks)
                .tickFormat(d => {
                    const val = 10 ** d;
                    if (val >= 1e12) return `$${val / 1e12}T`;
                    if (val >= 1e9) return `$${val / 1e9}B`;
                    if (val >= 1e6) return `$${val / 1e6}M`;
                    return `$${val}`;
                })
        );

    svg.append("g")
        .attr("class", "axis y-axis")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(yScale).ticks(6).tickFormat(d => `${d}%`));

    // Titles and Labels
    svg.append("text")
        .attr("class", "chart-title")
        .attr("x", width / 2)
        .attr("y", 22)
        .attr("text-anchor", "middle")
        .text(title);

    svg.append("text")
        .attr("class", "axis-label")
        .attr("x", width / 2)
        .attr("y", height - 8)
        .attr("text-anchor", "middle")
        .text("GDP (current USD, log scale)");

    // Scatter points
    svg.selectAll("circle")
        .data(filtered)
        .join("circle")
        .attr("class", "country-dot")
        .attr("data-country-key", d => normalizeName(d["Country Name"]))
        .attr("data-base-fill", color)
        .attr("cx", d => xScale(Math.log10(+d.gdp_usd + 1)))
        .attr("cy", d => yScale(+d[metricKey]))
        .attr("r", 5.5)
        .attr("fill", color)
        .attr("opacity", 0.95)
        .on("mouseover", (event, d) => {
            setHoveredCountry(normalizeName(d["Country Name"]));
            tooltip.style("visibility", "visible")
                .html(`
                    <div class="tooltip-title">${d["Country Name"]}</div>
                    <div class="tooltip-row">
                        <span class="tooltip-label">GDP:</span>
                        <span class="tooltip-value">${formatCurrency(d.gdp_usd)}</span>
                    </div>
                    <div class="tooltip-row">
                        <span class="tooltip-label">Value:</span>
                        <span class="tooltip-value" style="color: ${color}">${d3.format(".1f")(d[metricKey])}%</span>
                    </div>
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

function drawMap(svgId, yearData, metricKey, title, colorScheme) {
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

    const values = new Map(
        yearData
            .filter(d => Number.isFinite(+d[metricKey]))
            .map(d => [normalizeName(d["Country Name"]), +d[metricKey]])
    );

    // Color scale is static from 0% to 100%
    const scale = d3.scaleSequential(colorScheme).domain([0, 100]);
    const projection = d3.geoNaturalEarth1();
    const path = d3.geoPath().projection(projection);

    if (!worldMapPromise) {
        worldMapPromise = d3.json(getWorldTopoUrl());
    }

    worldMapPromise.then(world => {
        const countries = getWorldFeatures(world);
        if (countries.length === 0) {
            svg.append("text")
                .attr("class", "error-text")
                .attr("x", width / 2)
                .attr("y", height / 2)
                .attr("text-anchor", "middle")
                .text("Map topology not found");
            return;
        }

        const europeFeatures = countries
            .map(keepEuropeanGeometry)
            .filter(Boolean);

        if (europeFeatures.length > 0) {
            projection.fitExtent(
                [[30, 45], [width - 30, height - 20]],
                { type: "FeatureCollection", features: europeFeatures }
            );
            // Slight zoom-out so Europe is not too tight in frame.
            projection.scale(projection.scale() * 0.92);
        } else {
            projection.fitExtent(
                [[20, 45], [width - 20, height - 20]],
                { type: "FeatureCollection", features: countries }
            );
        }

        svg.append("text")
            .attr("class", "chart-title")
            .attr("x", width / 2)
            .attr("y", 22)
            .attr("text-anchor", "middle")
            .text(title);

        // Gradient legend for map color scale.
        const legendWidth = 130;
        const legendHeight = 8;
        const legendX = width - legendWidth - 18;
        const legendY = 26;
        const legendId = `legend-${svgId.replace("#", "")}`;

        const defs = svg.append("defs");
        const gradient = defs.append("linearGradient")
            .attr("id", legendId)
            .attr("x1", "0%")
            .attr("x2", "100%")
            .attr("y1", "0%")
            .attr("y2", "0%");

        const [minVal, maxVal] = [0, 100];
        const legendStops = 8;
        for (let i = 0; i <= legendStops; i += 1) {
            const t = i / legendStops;
            gradient.append("stop")
                .attr("offset", `${t * 100}%`)
                .attr("stop-color", colorScheme(t));
        }

        svg.append("rect")
            .attr("x", legendX)
            .attr("y", legendY)
            .attr("width", legendWidth)
            .attr("height", legendHeight)
            .attr("fill", `url(#${legendId})`)
            .attr("stroke", "var(--legend-stroke, #475569)")
            .attr("stroke-width", 0.5);

        svg.append("text")
            .attr("class", "legend-text")
            .attr("x", legendX)
            .attr("y", legendY - 3)
            .text(Number.isFinite(minVal) ? `${d3.format(".1f")(minVal)}%` : "NA");

        svg.append("text")
            .attr("class", "legend-text")
            .attr("x", legendX + legendWidth)
            .attr("y", legendY - 3)
            .attr("text-anchor", "end")
            .text(Number.isFinite(maxVal) ? `${d3.format(".1f")(maxVal)}%` : "NA");

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
                const key = normalizeName(d?.properties?.admin || d?.properties?.name);
                return values.has(key) ? scale(values.get(key)) : "var(--map-empty-fill, #1e202b)";
            })
            .attr("fill", function () {
                return d3.select(this).attr("data-base-fill");
            })
            .on("mouseover", (event, d) => {
                const countryName = d?.properties?.admin || d?.properties?.name || "Unknown";
                const key = normalizeName(countryName);
                const value = values.get(key);
                setHoveredCountry(key);
                
                // Get corresponding GDP if available
                const matchingRecord = yearData.find(r => normalizeName(r["Country Name"]) === key);
                const gdpInfo = matchingRecord ? `<div class="tooltip-row"><span class="tooltip-label">GDP:</span><span class="tooltip-value">${formatCurrency(matchingRecord.gdp_usd)}</span></div>` : "";
                
                tooltip.style("visibility", "visible")
                    .html(`
                        <div class="tooltip-title">${countryName}</div>
                        <div class="tooltip-row">
                            <span class="tooltip-label">Value:</span>
                            <span class="tooltip-value" style="color: ${scale(value) || '#ccc'}">${Number.isFinite(value) ? `${d3.format(".1f")(value)}%` : "No data"}</span>
                        </div>
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

function renderMetricPair(scatterId, mapId, yearData, metricKey, title, color, colorScheme) {
    drawScatter(scatterId, yearData, metricKey, `${title} - Plot`, color);
    drawMap(mapId, yearData, metricKey, `${title} - Map`, colorScheme);
}

function updatePlots() {
    const yearData = (window.mergedData || []).filter(d => +d.year === +currentYear);
    renderMetricPair(
        "#svg_culture_scatter", "#svg_culture_map", yearData, "culture_sport_pct",
        "Culture/Sport", "#4e79a7", d3.interpolateBlues
    );
    renderMetricPair(
        "#svg_social_scatter", "#svg_social_map", yearData, "social_contacts_pct",
        "Social Contacts", "#59a14f", d3.interpolateGreens
    );
    renderMetricPair(
        "#svg_volunteer_scatter", "#svg_volunteer_map", yearData, "volunteering_citizenship_pct",
        "Volunteering/Citizenship", "#e15759", d3.interpolateReds
    );
}

function initPlots() {
    updatePlots();
}

window.initPlots = initPlots;
window.updatePlots = updatePlots;