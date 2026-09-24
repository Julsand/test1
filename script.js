// Mobile menu
var navToggle = document.querySelector('.nav-toggle');
var navLinks = document.getElementById('nav-links');

navToggle.addEventListener('click', function () {
  var open = navLinks.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', open);
});

// Close the menu after choosing a link
navLinks.addEventListener('click', function (event) {
  if (event.target.tagName === 'A') {
    navLinks.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
  }
});

// Show / hide the session plan
var planToggle = document.getElementById('plan-toggle');
var planList = document.getElementById('plan-list');

planToggle.addEventListener('click', function () {
  var show = planList.hidden;
  planList.hidden = !show;
  planToggle.setAttribute('aria-expanded', show);
  planToggle.textContent = show ? 'Hide session plan' : 'Show session plan';
});

// Getting there: Entur (public transport) and Oslo Bysykkel (city bikes)
var CLIENT_NAME = 'Oslo-vibecoding';
var DESTINATION = { name: 'Rådhusplassen, Oslo', lat: 59.9118, lon: 10.7336 };
var GEOCODER_URL = 'https://api.entur.io/geocoder/v1/autocomplete';
var JOURNEY_URL = 'https://api.entur.io/journey-planner/v3/graphql';
var GBFS_URL = 'https://gbfs.urbansharing.com/oslobysykkel.no/';

var travelForm = document.getElementById('travel-form');
var originInput = document.getElementById('origin');
var suggestionList = document.getElementById('origin-suggestions');
var results = document.getElementById('travel-results');
var suggestions = [];

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' });
}

function formatDistance(metres) {
  return metres < 1000 ? Math.round(metres / 10) * 10 + ' m' : (metres / 1000).toFixed(1) + ' km';
}

function walkMinutes(metres) {
  return Math.max(1, Math.round(metres / 80));
}

function mapLink(lat, lon) {
  return 'https://www.google.com/maps/search/?api=1&query=' + lat + ',' + lon;
}

function directionsLink(from, to, mode) {
  return 'https://www.google.com/maps/dir/?api=1&origin=' + from.lat + ',' + from.lon +
    '&destination=' + to.lat + ',' + to.lon + '&travelmode=' + mode;
}

// Distance in metres between two points
function distance(a, b) {
  var rad = Math.PI / 180;
  var dLat = (b.lat - a.lat) * rad;
  var dLon = (b.lon - a.lon) * rad;
  var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// The next 18:00 in Oslo (today, or tomorrow if it has passed)
function nextSessionStart() {
  var now = new Date();
  var osloNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Oslo' }));
  var target = new Date(osloNow);
  target.setHours(18, 0, 0, 0);
  if (osloNow >= target) target.setDate(target.getDate() + 1);
  // Shift back from "Oslo wall-clock" to a real instant
  var instant = now.getTime() + (target - osloNow);
  return new Date(Math.round(instant / 60000) * 60000);
}

function geocode(text, size) {
  var url = GEOCODER_URL + '?lang=en&size=' + size +
    '&focus.point.lat=' + DESTINATION.lat + '&focus.point.lon=' + DESTINATION.lon +
    '&text=' + encodeURIComponent(text);
  return fetch(url, { headers: { 'ET-Client-Name': CLIENT_NAME } })
    .then(function (res) {
      if (!res.ok) throw new Error('Place search failed');
      return res.json();
    })
    .then(function (data) {
      return data.features.map(function (f) {
        return { name: f.properties.label, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] };
      });
    });
}

// Suggest places while typing
var suggestTimer;
originInput.addEventListener('input', function () {
  clearTimeout(suggestTimer);
  var text = originInput.value.trim();
  if (text.length < 3) return;
  suggestTimer = setTimeout(function () {
    geocode(text, 5).then(function (places) {
      suggestions = places;
      suggestionList.innerHTML = places.map(function (p) {
        return '<option value="' + escapeHtml(p.name) + '"></option>';
      }).join('');
    }).catch(function () { /* suggestions are optional */ });
  }, 300);
});

function findOrigin(text) {
  var picked = suggestions.filter(function (p) { return p.name === text; })[0];
  if (picked) return Promise.resolve(picked);
  return geocode(text, 1).then(function (places) {
    if (!places.length) throw new Error('We could not find “' + text + '”. Try a street, stop or place name.');
    return places[0];
  });
}

function showMessage(text, isError) {
  results.innerHTML = '<p class="' + (isError ? 'result-error' : 'result-note') + '">' + escapeHtml(text) + '</p>';
}

// Public transport
var TRIP_QUERY = 'query ($from: Location!, $to: Location!, $dateTime: DateTime!) {' +
  ' trip(from: $from, to: $to, dateTime: $dateTime, arriveBy: true, numTripPatterns: 3) {' +
  '  tripPatterns { expectedStartTime expectedEndTime duration walkDistance' +
  '   legs { mode distance expectedStartTime fromPlace { name } toPlace { name } line { publicCode name } }' +
  '  }' +
  ' }' +
  '}';

var MODE_NAMES = { bus: 'Bus', tram: 'Tram', metro: 'Metro', rail: 'Train', water: 'Ferry', coach: 'Coach' };

function findTrips(origin) {
  var arriveBy = nextSessionStart();
  var body = {
    query: TRIP_QUERY,
    variables: {
      from: { name: origin.name, coordinates: { latitude: origin.lat, longitude: origin.lon } },
      to: { name: DESTINATION.name, coordinates: { latitude: DESTINATION.lat, longitude: DESTINATION.lon } },
      dateTime: arriveBy.toISOString()
    }
  };
  return fetch(JOURNEY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'ET-Client-Name': CLIENT_NAME },
    body: JSON.stringify(body)
  })
    .then(function (res) {
      if (!res.ok) throw new Error('Journey search failed');
      return res.json();
    })
    .then(function (data) {
      if (!data.data || !data.data.trip) throw new Error('Journey search failed');
      renderTrips(origin, arriveBy, data.data.trip.tripPatterns);
    });
}

function renderTrips(origin, arriveBy, trips) {
  var day = arriveBy.toDateString() === new Date().toDateString() ? 'today' : 'tomorrow';
  if (!trips.length) {
    showMessage('No trips found from ' + origin.name + '. Try a different starting point.', true);
    return;
  }
  trips.sort(function (a, b) { return new Date(a.expectedStartTime) - new Date(b.expectedStartTime); });

  var cards = trips.map(function (trip) {
    var legs = trip.legs.map(function (leg) {
      if (leg.mode === 'foot') {
        return '<li>Walk ' + walkMinutes(leg.distance) + ' min</li>';
      }
      var label = (MODE_NAMES[leg.mode] || leg.mode) + (leg.line && leg.line.publicCode ? ' ' + leg.line.publicCode : '');
      return '<li class="line">' + escapeHtml(label) + ' · ' + formatTime(leg.expectedStartTime) +
        ' from ' + escapeHtml(leg.fromPlace.name) + '</li>';
    }).join('');
    var changes = trip.legs.filter(function (leg) { return leg.mode !== 'foot'; }).length - 1;

    return '<li class="result-card">' +
      '<h3>' + formatTime(trip.expectedStartTime) + ' → ' + formatTime(trip.expectedEndTime) + '</h3>' +
      '<p class="meta">' + Math.round(trip.duration / 60) + ' min · ' +
      (changes > 0 ? changes + (changes === 1 ? ' change' : ' changes') : 'no changes') +
      ' · ' + formatDistance(trip.walkDistance) + ' walking</p>' +
      '<ul class="legs">' + legs + '</ul>' +
      '</li>';
  }).join('');

  results.innerHTML =
    '<p class="result-note">Trips from <strong>' + escapeHtml(origin.name) + '</strong> arriving by 18:00 ' + day + '.</p>' +
    '<ul class="result-list">' + cards + '</ul>' +
    '<p><a href="' + directionsLink(origin, DESTINATION, 'transit') + '" target="_blank" rel="noopener">Open route in map</a></p>';
}

// City bikes
function getGbfs(file) {
  return fetch(GBFS_URL + file, { headers: { 'Client-Identifier': CLIENT_NAME } })
    .catch(function () {
      // Retry without the custom header in case the browser blocks it (CORS)
      return fetch(GBFS_URL + file);
    })
    .then(function (res) {
      if (!res.ok) throw new Error('City bike data is not available right now');
      return res.json();
    });
}

function findBikes(origin) {
  return Promise.all([getGbfs('station_information.json'), getGbfs('station_status.json')])
    .then(function (data) {
      var status = {};
      data[1].data.stations.forEach(function (s) { status[s.station_id] = s; });
      var stations = data[0].data.stations.map(function (s) {
        var st = status[s.station_id] || {};
        return {
          name: s.name,
          lat: s.lat,
          lon: s.lon,
          bikes: st.is_renting ? st.num_bikes_available : 0,
          docks: st.is_returning ? st.num_docks_available : 0
        };
      });
      renderBikes(origin, stations, data[1].last_updated);
    });
}

function nearest(stations, point, count) {
  return stations
    .map(function (s) { return Object.assign({ distance: distance(point, s) }, s); })
    .sort(function (a, b) { return a.distance - b.distance; })
    .slice(0, count);
}

function stationCard(station, number, label) {
  return '<li class="result-card">' +
    '<h3>' + escapeHtml(station.name) + '</h3>' +
    '<p class="meta">' + formatDistance(station.distance) + ' away · about ' + walkMinutes(station.distance) + ' min walk</p>' +
    '<p><span class="bike-count' + (number ? '' : ' none') + '">' + number + '</span>' + label + '</p>' +
    '<a href="' + mapLink(station.lat, station.lon) + '" target="_blank" rel="noopener">Show on map</a>' +
    '</li>';
}

function renderBikes(origin, stations, lastUpdated) {
  var start = nearest(stations, origin, 3);
  var end = nearest(stations, DESTINATION, 3);
  var updated = lastUpdated ? ' Updated ' + formatTime(lastUpdated * 1000) + '.' : '';

  results.innerHTML =
    '<p class="result-note">Live city bike data.' + updated + '</p>' +
    '<h3 class="group">Pick up a bike near ' + escapeHtml(origin.name) + '</h3>' +
    '<ul class="result-list">' + start.map(function (s) {
      return stationCard(s, s.bikes, s.bikes === 1 ? 'bike available' : 'bikes available');
    }).join('') + '</ul>' +
    '<h3 class="group">Return it near Rådhusplassen</h3>' +
    '<ul class="result-list">' + end.map(function (s) {
      return stationCard(s, s.docks, s.docks === 1 ? 'free dock' : 'free docks');
    }).join('') + '</ul>' +
    '<p><a href="' + directionsLink(origin, DESTINATION, 'bicycling') + '" target="_blank" rel="noopener">Open bike route in map</a></p>';
}

travelForm.addEventListener('submit', function (event) {
  event.preventDefault();
  var text = originInput.value.trim();
  if (!text) {
    showMessage('Please type where you are coming from.', true);
    originInput.focus();
    return;
  }
  var mode = travelForm.elements.mode.value;
  var button = travelForm.querySelector('button');
  button.disabled = true;
  showMessage('Looking up the best way to get there…');

  findOrigin(text)
    .then(function (origin) {
      return mode === 'bike' ? findBikes(origin) : findTrips(origin);
    })
    .catch(function (error) {
      var message = error instanceof TypeError
        ? 'Could not reach the travel service. Check your connection and try again.'
        : error.message;
      showMessage(message, true);
    })
    .then(function () {
      button.disabled = false;
    });
});

// Footer year
document.getElementById('year').textContent = new Date().getFullYear();
