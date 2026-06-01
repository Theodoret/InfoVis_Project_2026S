const map = L.map('map').setView([54.5, 15.3], 4);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

let geoJSONLayer;

function getColour(value, min, max){
    var t = (value-min)/(max-min);
    var r = 255;
    var g = Math.round(255*(1-t));
    var b = 0;
    return `rgb(${r},${g},${b})`;
}
function initMap(){
    fetch("/static/data/europe.geojson")
        .then(res => res.json())
        .then(geojson => {
            geoJSONLayer = L.geoJSON(geojson, {
                style: feature => styleFeature(feature),
                onEachFeature: (feature, layer) => {layer.bindTooltip(getTooltip(feature));}
            }).addTo(map)
        });
}

function styleFeature(feature){
    var code = feature.properties.ISO3;
    var value = country_values[code];
    var values = Object.values(country_values).filter(v => v !== undefined);
    var min = Math.min(...values);
    var max = Math.max(...values);
    return {
        fillColor: value !== undefined ? getColour(value, min, max) : "#ADADAD",
        fillOpacity: 0.7,
        color: "white",
        weight: 1,
    };
}

function getTooltip(feature){
    var code = feature.properties.ISO3;
    var value = country_values[code];
    return `${feature.properties.NAME}: ${value !== undefined ? value.toFixed(2) : 'Unknown'}`
}

function updateMapColour(newCountry_values) {
    country_values = newCountry_values;
    if(!geoJSONLayer) {return;}
    geoJSONLayer.setStyle(feature => styleFeature(feature));
    geoJSONLayer.eachLayer(layer => {layer.setTooltipContent(getTooltip(layer.feature));});

}
initMap();