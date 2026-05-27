// 6.2: Global year state for temporal interaction
let currentYear = 2020;

// 6.2: Initialize year slider control
function initSlider() {
    const slider = d3.select("#yearSlider");
    const label = d3.select("#yearLabel");

    const years = data.map(d => +d.year).filter(Number.isFinite);
    const minYear = d3.min(years) ?? 1960;
    const maxYear = d3.max(years) ?? 2020;

    currentYear = maxYear;

    slider
        .attr("min", minYear)
        .attr("max", maxYear)
        .attr("step", 1)
        .property("value", currentYear);

    label.text(`Year: ${currentYear}`);

    // 6.2: Update all views when year changes
    slider.on("input", function() {
        currentYear = +this.value;
        label.text(`Year: ${currentYear}`);

        if (window.updateMap) {
            window.updateMap();
        }

        if (window.updateLinePlot) {
            window.updateLinePlot(window.selectedLineCountryCodes || []);
        }
    });

    if (window.updateMap) {
        window.updateMap();
    }
}

window.initSlider = initSlider;
