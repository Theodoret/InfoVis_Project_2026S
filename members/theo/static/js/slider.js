let currentYear = null;

function initSlider() {
    const years = (window.availableYears || []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    const select = d3.select("#yearSelect");

    if (years.length === 0) {
        select.append("option").attr("value", "").text("No years available");
        return;
    }

    currentYear = years[years.length - 1];
    select.selectAll("option")
        .data(years)
        .join("option")
        .attr("value", d => d)
        .text(d => d);
    select.property("value", String(currentYear));

    select.on("change", function () {
        currentYear = Number(this.value);
        if (window.updatePlots) {
            window.updatePlots();
        }
    });
}

window.initSlider = initSlider;
