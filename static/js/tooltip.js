const tooltip = d3.select("#tooltip");


function showTooltip(event, d) {
    var currentYear = parseInt(document.getElementById('year_change').value);
    values_per_country = calculate_values_per_country();
    var value = values_per_country[d.code];
console.log("Show Tooltip!", value, d.code);

    if (value === undefined || value === null) {
    tooltip.style("opacity", 1)
            .html(`<strong>${d.country}</strong><br/>
            No data available for ${currentYear}`);
    }
    else {
    console.log("show the values");
        tooltip.style("opacity", 1)
                .html(`<strong>${d.country}</strong><br/>
                    Year: ${currentYear}<br/>
                    GDP: ${d3.format(".2s")(d.gdp)}<br/>
                    Index: ${value.toFixed(2)}
                `);
    }

    moveTooltip(event);
}

function moveTooltip(event){
    tooltip.style("left", (event.pageX + 20) + "px")
            .style ("top", (event.pageY - 20) + "px");
}

function hideTooltip(){
console.log("Hide Tooltip!");
    tooltip.style("opacity", 0);
}