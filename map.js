import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';

mapboxgl.accessToken = 'pk.eyJ1Ijoic2Ftc29vc2VvIiwiYSI6ImNtaHhjbDd0MjAweG0ybHBuandiYmVkam4ifQ.22gKHktWkKE2EJqqcmOpeg';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/streets-v12',
    center: [-71.09415, 42.36027],
    zoom: 12
});


function formatTime(minutes) {
    const date = new Date(0,0,0,0,minutes);
    return date.toLocaleString('en-US', { timeStyle: 'short' });
}

function minutesSinceMidnight(date) {
    return date.getHours() * 60 + date.getMinutes();
}


function computeStationTraffic(stations, trips) {
    const departures = d3.rollup(trips, v => v.length, d => d.start_station_id);
    const arrivals = d3.rollup(trips, v => v.length, d => d.end_station_id);

    return stations.map(station => {
        const id = station.short_name;
        station.departures = departures.get(id) ?? 0;
        station.arrivals = arrivals.get(id) ?? 0;
        station.totalTraffic = station.departures + station.arrivals;
        return station;
    });
}


function filterTripsByTime(trips, timeFilter) {
    if (timeFilter === -1) return trips;
    return trips.filter(trip => {
        const started = minutesSinceMidnight(trip.started_at);
        const ended = minutesSinceMidnight(trip.ended_at);
        return Math.abs(started - timeFilter) <= 60 || Math.abs(ended - timeFilter) <= 60;
    });
}

map.on('load', async () => {


    const bostonData = await (await fetch('Existing_Bike_Network_2022.geojson')).json();
    map.addSource('bostonDataSource', { type: 'geojson', data: bostonData });
    map.addLayer({
        id: 'bostonBikeLanes',
        type: 'line',
        source: 'bostonDataSource',
        paint: { 'line-width': 2, 'line-opacity': 0.7, 'line-color': '#32D400' }
    });

    const cambridgeData = await (await fetch('bike.geojson')).json();
    map.addSource('cambridgeDataSource', { type: 'geojson', data: cambridgeData });
    map.addLayer({
        id: 'cambridgeBikeLanes',
        type: 'line',
        source: 'cambridgeDataSource',
        paint: { 'line-width': 2, 'line-opacity': 0.7, 'line-color': '#32D400' }
    });


    const stationsUrl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
    let stationsData = await d3.json(stationsUrl);
    let stations = stationsData.data?.stations || stationsData;

    const tripsUrl = 'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv';
    const trips = await d3.csv(tripsUrl, d => {
        d.started_at = new Date(d.started_at);
        d.ended_at = new Date(d.ended_at);
        return d;
    });


    stations = computeStationTraffic(stations, trips);


    const svg = d3.select(map.getCanvasContainer())
        .append('svg')
        .attr('class', 'stations-layer')
        .style('position','absolute')
        .style('top',0)
        .style('left',0)
        .style('width','100%')
        .style('height','100%')
        .style('pointer-events','none')
        .style('z-index',1);

    let radiusScale = d3.scaleSqrt()
        .domain([0, d3.max(stations, d => d.totalTraffic)])
        .range([0, 20]);

    let stationFlow = d3.scaleQuantize()
        .domain([0, 1])
        .range([0, 0.5, 1]);

const circles = svg.selectAll('circle')
    .data(stations, d => d.short_name)
    .enter()
    .append('circle')
    .attr('r', d => radiusScale(d.totalTraffic))
    .attr('fill-opacity',0.6)
    .attr('stroke','white')
    .attr('stroke-width',1)
    .style('pointer-events','auto')
    .style('--departure-ratio', d => 
        stationFlow(d.departures / d.totalTraffic || 0)
    )
    .each(function(d) {
        d3.select(this)
            .append('title')
            .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
    });

    function updateMarkers() {
        circles
            .attr('cx', d => map.project([+d.lon, +d.lat]).x)
            .attr('cy', d => map.project([+d.lon, +d.lat]).y);
    }
    updateMarkers();
    map.on('move', updateMarkers);
    map.on('zoom', updateMarkers);
    map.on('resize', updateMarkers);
    map.on('moveend', updateMarkers);


    const timeSlider = document.getElementById('time-slider');
    const selectedTime = document.getElementById('time-display');
    const anyTimeLabel = document.getElementById('any-time-text');

    function updateScatterPlot(timeFilter) {
        const filteredTrips = filterTripsByTime(trips, timeFilter);
        const filteredStations = computeStationTraffic(stations, filteredTrips);

        timeFilter === -1 ? radiusScale.range([0,25]) : radiusScale.range([3,25]);

circles
    .data(filteredStations, d => d.short_name)
    .attr('r', d => radiusScale(d.totalTraffic))
    .style('--departure-ratio', d =>
        stationFlow(d.departures / d.totalTraffic || 0)
    );
    }

    function updateTimeDisplay() {
        const timeFilter = Number(timeSlider.value);

        if(timeFilter === -1){
            selectedTime.textContent = '';
            anyTimeLabel.style.display = 'block';
        } else {
            selectedTime.textContent = formatTime(timeFilter);
            anyTimeLabel.style.display = 'none';
        }

        updateScatterPlot(timeFilter);
    }

    timeSlider.addEventListener('input', updateTimeDisplay);
    updateTimeDisplay();
});

