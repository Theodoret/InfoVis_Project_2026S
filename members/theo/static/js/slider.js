let currentYear = null;

function initSlider() {
    const years = (window.availableYears || []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    const slider = document.getElementById("yearSlider");
    const output = document.getElementById("yearSliderValue");

    if (!slider || years.length === 0) {
        return;
    }

    const minYear = years[0];
    const maxYear = years[years.length - 1];
    currentYear = maxYear;

    slider.min = String(minYear);
    slider.max = String(maxYear);
    slider.step = "1";
    slider.value = String(currentYear);
    slider.setAttribute("aria-valuemin", String(minYear));
    slider.setAttribute("aria-valuemax", String(maxYear));
    slider.setAttribute("aria-valuenow", String(currentYear));

    if (output) {
        output.textContent = String(currentYear);
    }

    const syncYear = (raw) => {
        const requested = Number(raw);
        const nearest = years.reduce((best, y) =>
            Math.abs(y - requested) < Math.abs(best - requested) ? y : best
        , years[0]);
        currentYear = nearest;
        slider.value = String(nearest);
        slider.setAttribute("aria-valuenow", String(nearest));
        if (output) {
            output.textContent = String(nearest);
        }
        if (window.updatePlots) {
            window.updatePlots();
        }
    };

    slider.addEventListener("input", () => syncYear(slider.value));
    slider.addEventListener("change", () => syncYear(slider.value));
}

window.initSlider = initSlider;
