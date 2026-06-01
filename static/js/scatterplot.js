let svg, xScale, yScale, xAxis, yAxis;
const margin = {top: 20, right: 20, bottom: 40, left: 50};

function initScatterplot(){
    console.log("Scatterplot initialized!")
    var container = document.getElementById('scatterplot');
    var width  = container.clientWidth - margin.left - margin.right;
    var height = container.clientHeight - margin.top  - margin.bottom;

    svg = d3.select("#scatterplot")
            .append("svg")
            .attr("width", "100%")
            .attr("height", "100%")
            .append("g")
            .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
    xScale = d3.scaleLinear().range([0,width]).domain([0, 5000000000000]);
    yScale = d3.scaleLinear().range([height,0]).domain([0, 3.3]);
    xAxis = svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .attr('class', 'x-axis');
    yAxis = svg.append('g')
        .attr('class', 'y-axis');

    svg.append('g').attr('class','dots')
}
initScatterplot();

function updateScatterplot(newCountry_values){
    var year = parseInt(document.getElementById('year_change').value);
    var df = data.filter(row => row['year']===year)
                    .map(row => ({country:row['Country Name'],
                                  gdp:row['GDP (current US$)'],
                                  code: row['Country Code'],
                                  value:newCountry_values[row['Country Code']]
                    })).filter(d => d.gdp !== null && d.gdp !== undefined && d.gdp !== null);

    xAxis.call(d3.axisBottom(xScale).tickFormat(d3.format('.2s')));
    yAxis.call(d3.axisLeft(yScale));

    const dots = svg.select(".dots")
                    .selectAll("circle")
                    .data(df, d => d.country);

    dots.enter()
        .append('circle')
        .attr("r", 5)
        .attr("fill", "blue")
        .on("mouseover", function(event, d) {
            showTooltip(event, d);
        })
        .on("mousemove", moveTooltip)
        .on("mouseout", hideTooltip)
        .attr("opacity", 0.7)
        .merge(dots)
        .attr("cx", d => xScale(d.gdp))
        .attr("cy", d => yScale(d.value));
    dots.exit().remove();
}