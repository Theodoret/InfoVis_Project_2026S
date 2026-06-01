
function getSelDatasets() {
    const checked = document.querySelectorAll(".choose_datasets:checked");
    return Array.from(checked).map(cb => cb.value);
}

let values_per_country = {};
function calculate_values_per_country(){
    const year = parseInt(document.getElementById('year_change').value);
    var selected = getSelDatasets();
    var row_year = data.filter(row => row['year'] === year);
    var country_values = {}
    row_year.forEach(row => {
                var country = row['Country Code'];
                var total = selected.reduce((sum, col) => {
                var val = row[col];
                return val !== null && val !== undefined ? sum + val : sum;
            }, 0);
            country_values[country] = total;
            });
    return country_values;
}

function updateTopN() {
    values_per_country = calculate_values_per_country();
    const ranked = Object.entries(values_per_country)
        .sort((a,b) => b[1] - a[1])
        .slice(0,10);

    const list = document.getElementById('top_n_list');
    list.innerHTML = ranked
        .map(([country, val]) => `<li>${country} — ${val.toFixed(2)}</li>`)
        .join('');
    updateMapColour(values_per_country);
    updateScatterplot(values_per_country);
}


document.addEventListener('change', function(e){
    if (e.target.classList.contains('choose_datasets')){
        updateTopN();
    }
})