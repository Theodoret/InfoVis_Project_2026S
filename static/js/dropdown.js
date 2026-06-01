const indicatorDropdown = d3.select("#year_change");
const years = [...new Set(data.map(row => row['year']))].sort()

indicatorDropdown.selectAll("option")
    .data(years)
    .enter().append("option")
    .text(d => d)
    .attr("value", d=> d);

indicatorDropdown.property("value", years[years.length - 1]);

indicatorDropdown.on("change", function(){
    updateTopN();
})

updateTopN();