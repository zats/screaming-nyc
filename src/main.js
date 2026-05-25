import "./styles.css";

const NYC_CENTER = { lat: 40.758, lon: -73.9855, label: "Times Square" };
const CITY_SOURCES = {
  noise311:
    "https://data.cityofnewyork.us/resource/erm2-nwe9.json",
  permittedEvents:
    "https://data.cityofnewyork.us/resource/tvpp-9vvx.json",
  geosearch:
    "https://geosearch.planninglabs.nyc/v2/search"
};

const BOROUGHS = [
  { label: "Manhattan", lat: 40.7831, lon: -73.9712 },
  { label: "Brooklyn", lat: 40.6782, lon: -73.9442 },
  { label: "Queens", lat: 40.7282, lon: -73.7949 },
  { label: "Bronx", lat: 40.8448, lon: -73.8648 }
];

const RADAR_SOURCES = {
  noise311: {
    label: "NYC 311",
    domain: "nyc.gov",
    favicon: "https://www.google.com/s2/favicons?domain=nyc.gov&sz=32",
    color: "#052c4b"
  },
  sports: {
    label: "ESPN sports",
    domain: "espn.com",
    favicon: "https://www.google.com/s2/favicons?domain=espn.com&sz=32",
    color: "#760e12"
  },
  eventbrite: {
    label: "Eventbrite",
    domain: "eventbrite.com",
    favicon: "https://www.eventbrite.com/favicon.ico",
    color: "#802f18"
  },
  songkick: {
    label: "Songkick",
    domain: "songkick.com",
    favicon: "https://assets.sk-static.com/images/favicon.ico",
    color: "#800b3c"
  },
  ticketmaster: {
    label: "Ticketmaster",
    domain: "ticketmaster.com",
    favicon: "https://www.google.com/s2/favicons?domain=ticketmaster.com&sz=32",
    color: "#013670"
  },
  seatgeek: {
    label: "SeatGeek",
    domain: "seatgeek.com",
    favicon: "https://www.google.com/s2/favicons?domain=seatgeek.com&sz=32",
    color: "#4b2d78"
  },
  permits: {
    label: "NYC permits",
    domain: "nyc.gov",
    favicon: "https://www.google.com/s2/favicons?domain=nyc.gov&sz=32",
    color: "#052c4b"
  },
  notify: {
    label: "Notify NYC",
    domain: "nyc.gov",
    favicon: "https://www.google.com/s2/favicons?domain=nyc.gov&sz=32",
    color: "#353535"
  },
  mta: {
    label: "MTA alerts",
    domain: "mta.info",
    favicon: "https://www.google.com/s2/favicons?domain=mta.info&sz=32",
    color: "#0039a6"
  },
  venues: {
    label: "Venue calendars",
    domain: "nyc.com",
    favicon: "https://www.google.com/s2/favicons?domain=nyc.com&sz=32",
    color: "#555"
  }
};

const app = document.querySelector("#app");
let state = {
  location: NYC_CENTER,
  status: "idle",
  reports: [],
  permits: [],
  contextEvents: [],
  sports: [],
  ticketedEvents: [],
  sourceDots: [],
  hasUserLocation: false,
  error: ""
};
let activeScan = 0;
let lastOpenRefreshAt = 0;
let radarFrame = 0;
let radarPoints = [];
const geocodeCache = new Map();

render();
registerServiceWorker();
refreshLocationAndData();
window.addEventListener("pageshow", refreshLocationAndData);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refreshLocationAndData();
});

function render() {
  const topGuess = getTopGuess();
  app.innerHTML = `
    <section class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">I'm screamin' here!</p>
          <h1>Screaming New York</h1>
        </div>
      </header>

      <section class="hero">
        <div class="radar-wrap">
          <canvas id="radar" width="520" height="280" aria-label="nearby activity radar"></canvas>
          <div id="radarTooltip" class="radar-tooltip" hidden></div>
        </div>
        <div class="readout">
          <p class="label">Best guess near ${escapeHtml(state.location.label)}</p>
          <h2>${escapeHtml(topGuess.title)}</h2>
          <p>${escapeHtml(topGuess.reason)}</p>
          <div class="stats">
            <span>${state.reports.length} noise reports</span>
            <span>${state.sports.length} sports</span>
            <span>${state.ticketedEvents.length} ticketed events</span>
            <span>${state.permits.length + state.contextEvents.length} city context</span>
          </div>
        </div>
      </section>

      ${state.hasUserLocation ? "" : `
        <nav class="chips">
          ${BOROUGHS.map((item) => `<button class="chip" data-place="${item.label}">${item.label}</button>`).join("")}
        </nav>
      `}

      <section class="panel">
        <div class="panel-head">
          <h3>Screaming reasons</h3>
          <button id="refresh" class="icon-button ${state.status === "loading" ? "is-spinning" : ""}" aria-label="${state.status === "loading" ? "Scanning" : "Refresh"}" title="${state.status === "loading" ? "Scanning" : "Refresh"}">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.45 10.9h-2.18A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h8V3z"/>
            </svg>
          </button>
        </div>
        ${state.error ? `<p class="error">${escapeHtml(state.error)}</p>` : ""}
        <div class="evidence">
          ${renderEvidence()}
        </div>
      </section>

      <section class="sources">
        <h3>Sources to keep</h3>
        <div class="source-grid">
          ${sourceCard("311 noise", "Live-ish", "Best immediate signal: clustered recent complaints.", "Official NYC Open Data")}
          ${sourceCard("Ticketed events", "Always on", "Searches broad event feeds for shows nearby now.", "Eventbrite, Songkick, Ticketmaster, SeatGeek")}
          ${sourceCard("Sports", "Always on", "Checks same-day public scoreboards for NYC teams.", "ESPN scoreboard JSON")}
          ${sourceCard("City alerts", "Context", "Emergency, transit, and planned activity signals.", "Notify NYC, MTA, NYC CECM")}
          ${sourceCard("Venue calendars", "Context", "Direct calendars for major NYC venues.", "MSG, Barclays, Apollo, Lincoln Center, clubs")}
        </div>
      </section>
    </section>
  `;

  bindEvents();
  drawRadar();
}

function bindEvents() {
  document.querySelector("#refresh").addEventListener("click", scan);
  document.querySelectorAll("[data-place]").forEach((button) => {
    button.addEventListener("click", () => {
      const place = BOROUGHS.find((item) => item.label === button.dataset.place);
      state.location = { ...place };
      state.hasUserLocation = false;
      scan();
    });
  });
}

async function autoLocateOrScan() {
  if (!navigator.geolocation) {
    scan();
    return;
  }

  if (navigator.permissions?.query) {
    try {
      const permission = await navigator.permissions.query({ name: "geolocation" });
      if (permission.state === "denied") {
        scan();
        return;
      }
    } catch {
      // Continue to browser geolocation; unsupported permission checks should not block it.
    }
  }

  requestLocation({ showDenied: false });
}

function refreshLocationAndData() {
  const now = Date.now();
  if (now - lastOpenRefreshAt < 1500) return;
  lastOpenRefreshAt = now;
  autoLocateOrScan();
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js");
  });
}

function requestLocation({ showDenied }) {
  if (!navigator.geolocation) {
    state.error = "Geolocation unavailable.";
    render();
    return;
  }

  state.status = "loading";
  render();

  navigator.geolocation.getCurrentPosition(
    (position) => {
      state.location = {
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        label: "your location"
      };
      state.hasUserLocation = true;
      scan();
    },
    () => {
      state.error = showDenied ? "Location permission denied." : "";
      state.status = "idle";
      state.hasUserLocation = false;
      scan();
    },
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 0 }
  );
}

async function scan() {
  const scanId = ++activeScan;
  state.status = "loading";
  state.error = "";
  state.reports = [];
  state.permits = [];
  state.contextEvents = [];
  state.sports = [];
  state.ticketedEvents = [];
  state.sourceDots = [];
  render();

  const tasks = [
    runSource(scanId, "noise311", () => fetchNoiseReports(state.location), (data) => {
      state.reports = data;
    }),
    runSource(scanId, "sports", () => fetchSports(state.location), (data) => {
      state.sports = data;
    }),
    runSource(scanId, "eventbrite", () => fetchTicketedSource(state.location, "eventbrite"), addTicketedEvents),
    runSource(scanId, "songkick", () => fetchTicketedSource(state.location, "songkick"), addTicketedEvents),
    runSource(scanId, "ticketmaster", () => fetchTicketedSource(state.location, "ticketmaster"), addTicketedEvents),
    runSource(scanId, "seatgeek", () => fetchTicketedSource(state.location, "seatgeek"), addTicketedEvents),
    runSource(scanId, "permits", () => fetchPermittedEvents(state.location), (data) => {
      state.permits = data;
    }),
    runSource(scanId, "notify", () => fetchContextSource(state.location, "notify"), addContextEvents),
    runSource(scanId, "mta", () => fetchContextSource(state.location, "mta"), addContextEvents),
    runSource(scanId, "venues", () => fetchContextSource(state.location, "venues"), addTicketedEvents)
  ];

  const results = await Promise.all(tasks);
  if (scanId !== activeScan) return;

  state.status = "idle";
  state.error = results.includes(false) ? "Some sources failed. Refresh in a minute." : "";
  render();
}

async function runSource(scanId, id, load, apply) {
  try {
    const data = await load();
    if (scanId !== activeScan) return true;
    apply(data);
    addSourceDot(id, data.length, false);
    render();
    return true;
  } catch {
    if (scanId !== activeScan) return false;
    addSourceDot(id, 0, true);
    render();
    return false;
  }
}

function addSourceDot(id, count, failed) {
  state.sourceDots = [
    ...state.sourceDots.filter((dot) => dot.id !== id),
    { id, count, failed, loadedAt: performance.now() }
  ];
}

function addTicketedEvents(data) {
  state.ticketedEvents = dedupeRows([...state.ticketedEvents, ...data]).sort(compareRows).slice(0, 18);
}

function addContextEvents(data) {
  state.contextEvents = dedupeRows([...state.contextEvents, ...data]).sort(compareRows).slice(0, 12);
}

function dedupeRows(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row.title}|${row.place}|${formatTime(row.time)}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function compareRows(a, b) {
  return likelihoodScore(b) - likelihoodScore(a) || new Date(a.time) - new Date(b.time);
}

async function fetchSports(location) {
  const url = new URL("/api/sports", window.location.origin);
  url.searchParams.set("lat", location.lat);
  url.searchParams.set("lon", location.lon);
  url.searchParams.set("radius", "3");
  const data = await fetchJson(url);
  return data.events || [];
}

async function fetchTicketedSource(location, source) {
  const url = new URL("/api/ticketed-source", window.location.origin);
  url.searchParams.set("lat", location.lat);
  url.searchParams.set("lon", location.lon);
  url.searchParams.set("radius", "3");
  url.searchParams.set("source", source);
  const data = await fetchJson(url);
  return data.events || [];
}

async function fetchContextSource(location, source) {
  const url = new URL("/api/context-source", window.location.origin);
  url.searchParams.set("lat", location.lat);
  url.searchParams.set("lon", location.lon);
  url.searchParams.set("radius", "3");
  url.searchParams.set("source", source);
  const data = await fetchJson(url);
  return data.events || [];
}

async function fetchNoiseReports(location) {
  const since = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString().slice(0, 19);
  const box = boundingBox(location.lat, location.lon, 1.25);
  const where = [
    `created_date > '${since}'`,
    `(complaint_type like '%Noise%' OR complaint_type = 'Illegal Fireworks')`,
    `latitude between '${box.south}' and '${box.north}'`,
    `longitude between '${box.west}' and '${box.east}'`
  ].join(" AND ");

  const url = new URL(CITY_SOURCES.noise311);
  url.searchParams.set("$select", "created_date,complaint_type,descriptor,incident_address,borough,latitude,longitude,unique_key");
  url.searchParams.set("$where", where);
  url.searchParams.set("$order", "created_date DESC");
  url.searchParams.set("$limit", "40");

  const data = await fetchJson(url);
  return data.map((item) => ({
    title: item.descriptor || item.complaint_type,
    type: item.complaint_type,
    time: item.created_date,
    place: item.incident_address || item.borough || "Nearby",
    source: "311",
    url: `https://data.cityofnewyork.us/resource/erm2-nwe9.json?unique_key=${item.unique_key}`
  }));
}

async function fetchPermittedEvents(location) {
  const borough = nearestBorough(location);
  const now = new Date();
  const start = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 19);
  const end = new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString().slice(0, 19);
  const types = ["Rally", "Parade", "Concert", "Street Festival", "Block Party", "Sport", "Special Event"];
  const typeClause = types.map((type) => `event_type like '%${type}%' OR event_name like '%${type}%'`).join(" OR ");
  const where = [
    `start_date_time <= '${end}'`,
    `end_date_time >= '${start}'`,
    `event_borough = '${borough}'`,
    `NOT(upper(event_name) like '%CLOSURE%' OR upper(event_name) like '%MAINTENANCE%' OR upper(event_name) like '%GREENMARKET%')`,
    `(${typeClause})`
  ].join(" AND ");

  const url = new URL(CITY_SOURCES.permittedEvents);
  url.searchParams.set("$select", "event_name,event_type,event_agency,event_location,start_date_time,end_date_time");
  url.searchParams.set("$where", where);
  url.searchParams.set("$order", "start_date_time ASC");
  url.searchParams.set("$limit", "12");

  const data = await fetchJson(url);
  const rows = data.map((item) => ({
    title: item.event_name || item.event_type,
    type: item.event_type,
    time: item.start_date_time,
    endTime: item.end_date_time,
    place: item.event_location || borough,
    source: item.event_agency || "NYC permit",
    url: "https://data.cityofnewyork.us/resource/tvpp-9vvx.json"
  }));

  return Promise.all(rows.map((row) => addGeocodedDistance(row, location)));
}

async function addGeocodedDistance(row, location) {
  const point = await geocodePlace(row.place, location);
  if (!point) return row;

  return {
    ...row,
    geocodedPlace: point.label,
    distance: distanceMiles(location.lat, location.lon, point.lat, point.lon)
  };
}

async function geocodePlace(place, location) {
  for (const query of geocodeQueries(place)) {
    const point = await geocodeQuery(query, location);
    if (point) return point;
  }
  return null;
}

function geocodeQueries(place) {
  const raw = normalizeWhitespace(place);
  const split = raw.match(/^(.+?):\s*(.+)$/);
  const queries = [raw];

  if (split) {
    const base = normalizeWhitespace(split[1]);
    const detail = normalizePermitDetail(split[2]);
    queries.push(base);
    if (detail) queries.push(`${base} ${detail}`);
  }

  return [...new Set(queries.filter(Boolean))];
}

function normalizePermitDetail(value) {
  return normalizeWhitespace(value)
    .replace(/\b(\d+)(st|nd|rd|th)\b/gi, "$1 $2")
    .replace(/-\d+.*$/i, "")
    .replace(/-[A-Z]\b.*$/i, "");
}

async function geocodeQuery(query, location) {
  const key = `${query}|${location.lat.toFixed(3)}|${location.lon.toFixed(3)}`.toLowerCase();
  if (geocodeCache.has(key)) return geocodeCache.get(key);

  const url = new URL(CITY_SOURCES.geosearch);
  url.searchParams.set("text", query);
  url.searchParams.set("focus.point.lat", location.lat);
  url.searchParams.set("focus.point.lon", location.lon);
  url.searchParams.set("size", "1");

  const data = await fetchJson(url);
  const feature = data.features?.[0];
  const coords = feature?.geometry?.coordinates || [];
  const lon = Number(coords[0]);
  const lat = Number(coords[1]);
  const point = Number.isFinite(lat) && Number.isFinite(lon)
    ? { lat, lon, label: feature.properties?.label || query }
    : null;

  geocodeCache.set(key, point);
  return point;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

function getTopGuess() {
  const strongestEvent = [...state.sports, ...state.ticketedEvents].sort(compareRows)[0];

  if (strongestEvent && likelihoodScore(strongestEvent) >= 45) {
    return {
      title: strongestEvent.type === "Sports" ? "Sports crowd nearby" : "Show or concert nearby",
      reason: `${strongestEvent.title} at ${strongestEvent.place}.`
    };
  }

  if (state.reports.length >= 4) {
    const common = mostCommon(state.reports.map((report) => report.title || report.type));
    return {
      title: common.includes("Music") || common.includes("Party") ? "Party or venue noise" : "Crowd noise nearby",
      reason: `${state.reports.length} nearby 311 noise reports in the last 12 hours.`
    };
  }

  if (strongestEvent) {
    return {
      title: "Possible event noise",
      reason: `${strongestEvent.title} is ${eventTimingLabel(strongestEvent)} and ${distanceLabel(strongestEvent)} away.`
    };
  }

  return {
    title: "No strong signal yet",
    reason: state.permits.length
      ? `${state.permits.length} city context rows found, but no nearby live complaints, sports, or ticketed events.`
      : "Refresh or move the pin."
  };
}

function renderEvidence() {
  const rows = [...state.reports, ...state.sports, ...state.ticketedEvents, ...state.permits, ...state.contextEvents]
    .sort(compareRows)
    .slice(0, 16);
  if (state.status === "loading") return `<p class="muted">Scanning nearby sources...</p>`;
  if (!rows.length) return `<p class="muted">No nearby live evidence found.</p>`;

  const likely = rows.filter((row) => likelihoodScore(row) >= 35);
  const lessLikely = rows.filter((row) => likelihoodScore(row) < 35);

  return `
    ${renderReasonGroup("More likely", likely)}
    ${renderReasonGroup("Less likely", lessLikely)}
  `;
}

function renderReasonGroup(title, rows) {
  if (!rows.length) return "";

  return `
    <section class="reason-group">
      <h4>${title}</h4>
      ${rows
        .map(
          (row) => `
        <a class="row" href="${escapeHtml(row.url)}" target="_blank" rel="noreferrer">
          <div class="row-title">
            <strong>${escapeHtml(row.title)}</strong>
            <span>${escapeHtml(formatEventTiming(row))}${renderDistance(row)}</span>
          </div>
          <small>${escapeHtml(row.place)} · ${escapeHtml(row.source)}${renderLikelihood(row)}</small>
        </a>
      `
        )
        .join("")}
    </section>
  `;
}

function renderLikelihood(row) {
  if (!Number.isFinite(row.distance) && row.source !== "311") return "";
  return ` · ${Math.round(likelihoodScore(row))}% likely`;
}

function renderDistance(row) {
  return Number.isFinite(row.distance) ? ` · ${distanceLabel(row)}` : "";
}

function sourceCard(title, status, body, source) {
  return `
    <article class="source-card">
      <div>
        <strong>${title}</strong>
        <span>${status}</span>
      </div>
      <p>${body}</p>
      <small>${source}</small>
    </article>
  `;
}

function drawRadar() {
  cancelAnimationFrame(radarFrame);
  const canvas = document.querySelector("#radar");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const tooltip = document.querySelector("#radarTooltip");
  const { width, height } = canvas;
  let hoveredId = "";
  let tooltipId = "";

  canvas.onmousemove = (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * width;
    const y = ((event.clientY - rect.top) / rect.height) * height;
    const point = radarPoints.find((item) => Math.hypot(item.x - x, item.y - y) < 12);
    hoveredId = point?.id || "";
  };

  canvas.onmouseleave = () => {
    hoveredId = "";
  };

  const paint = (time) => {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#f3f3f1";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "#d4d4d0";
    ctx.lineWidth = 1;
    const maxRing = Math.max(width, height) * 0.62;
    for (let radius = maxRing / 8; radius <= maxRing; radius += maxRing / 8) {
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    radarPoints = state.sourceDots.map((dot, index) => sourcePoint(dot, index, time));
    const activePoint = hoveredId
      ? radarPoints.find((point) => point.id === hoveredId)
      : cyclePoint(radarPoints, time);

    if (activePoint && tooltip) {
      updateRadarTooltip(tooltip, activePoint, tooltipId);
      tooltipId = activePoint.id;
      drawCallout(ctx, tooltip, activePoint, canvas);
    } else if (tooltip) {
      tooltip.hidden = true;
      tooltipId = "";
    }

    radarPoints.forEach((point) => {
      const source = RADAR_SOURCES[point.id];
      const size = 5 + Math.min(point.count, 12) * 0.22;

      ctx.fillStyle = point.failed ? "#c9c9c4" : source.color;
      ctx.beginPath();
      ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
      ctx.fill();

      if (point.id === hoveredId) {
        ctx.strokeStyle = "#111";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(point.x, point.y, size + 5, 0, Math.PI * 2);
        ctx.stroke();
      }
    });

    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, 7, 0, Math.PI * 2);
    ctx.fill();

    radarFrame = requestAnimationFrame(paint);
  };

  paint(performance.now());
}

function cyclePoint(points, time) {
  if (!points.length) return null;
  return points[Math.floor(time / 2000) % points.length];
}

function updateRadarTooltip(tooltip, point, tooltipId) {
  if (tooltipId === point.id && !tooltip.hidden) return;

  const source = RADAR_SOURCES[point.id];
  tooltip.hidden = false;
  tooltip.innerHTML = `
    <img alt="" src="${source.favicon}" />
    <span>${escapeHtml(source.label)}</span>
    <small>${point.failed ? "failed" : `${point.count} found`}</small>
  `;
}

function drawCallout(ctx, tooltip, point, canvas) {
  const canvasRect = canvas.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const scaleX = canvas.width / canvasRect.width;
  const scaleY = canvas.height / canvasRect.height;
  const startX = (tooltipRect.right - canvasRect.left) * scaleX;
  const startY = (tooltipRect.top + tooltipRect.height / 2 - canvasRect.top) * scaleY;

  ctx.strokeStyle = "#c6c6bf";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(point.x, point.y);
  ctx.stroke();
}

function sourcePoint(dot, index, time) {
  const maxRing = Math.min(520, 280) * 0.58;
  const radius = maxRing * (0.16 + index * 0.105);
  const angle = index * 2.24 + time * 0.00012 * (index % 2 ? -1 : 1);
  const appear = Math.min(1, Math.max(0, (time - dot.loadedAt) / 450));
  return {
    ...dot,
    x: 260 + Math.cos(angle) * radius * appear,
    y: 140 + Math.sin(angle) * radius * 0.72 * appear
  };
}

function boundingBox(lat, lon, miles) {
  const latDelta = miles / 69;
  const lonDelta = miles / (69 * Math.cos((lat * Math.PI) / 180));
  return {
    north: lat + latDelta,
    south: lat - latDelta,
    east: lon + lonDelta,
    west: lon - lonDelta
  };
}

function nearestBorough(location) {
  return BOROUGHS.reduce((best, borough) => {
    const distance = Math.hypot(location.lat - borough.lat, location.lon - borough.lon);
    return distance < best.distance ? { label: borough.label, distance } : best;
  }, { label: "Manhattan", distance: Infinity }).label;
}

function mostCommon(values) {
  const counts = new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "noise";
}

function likelihoodScore(row) {
  if (row.source === "311") return 80;

  const distance = Number.isFinite(row.distance) ? row.distance : 5;
  const time = row.time ? new Date(row.time).getTime() : NaN;
  if (!Number.isFinite(time)) return 0;

  const hoursFromStart = (Date.now() - time) / (60 * 60 * 1000);
  const timeScore = timeLikelihood(hoursFromStart, row.type);
  const distanceScore = soundDistanceLikelihood(distance, row.type);

  return Math.max(0, Math.min(100, timeScore * distanceScore));
}

function timeLikelihood(hoursFromStart, type) {
  const isSports = type === "Sports";
  const pre = isSports ? -0.75 : -0.5;
  const peakStart = isSports ? -0.1 : 0;
  const peakEnd = isSports ? 3.2 : 3.5;
  const post = isSports ? 4.2 : 4.5;

  if (hoursFromStart < pre) return 8;
  if (hoursFromStart < peakStart) return interpolate(hoursFromStart, pre, peakStart, 35, 75);
  if (hoursFromStart <= peakEnd) return 100;
  if (hoursFromStart <= post) return interpolate(hoursFromStart, peakEnd, post, 70, 25);
  return 6;
}

function soundDistanceLikelihood(distance, type) {
  const outdoorBoost = /festival|party|sport|auto|boat|air/i.test(type || "") ? 1.15 : 1;
  const base =
    distance <= 0.15 ? 1 :
    distance <= 0.35 ? 0.85 :
    distance <= 0.7 ? 0.58 :
    distance <= 1.2 ? 0.3 :
    distance <= 2 ? 0.14 :
    0.05;
  return Math.min(1, base * outdoorBoost);
}

function eventTimingLabel(row) {
  const hours = (Date.now() - new Date(row.time).getTime()) / (60 * 60 * 1000);
  if (hours < -1) return "later";
  if (hours < -0.25) return "starting soon";
  if (hours < 3.5) return "happening now";
  return "probably letting out";
}

function formatEventTiming(row) {
  const start = row.time ? new Date(row.time).getTime() : NaN;
  if (!Number.isFinite(start)) return "time unknown";

  const now = Date.now();
  if (now < start) return `in ${formatDuration(start - now)}`;

  const end = eventEndMs(row);
  if (Number.isFinite(end) && now <= end) return `${formatDuration(end - now)} to go`;

  return "ended";
}

function eventEndMs(row) {
  const explicit = row.endTime ? new Date(row.endTime).getTime() : NaN;
  if (Number.isFinite(explicit)) return explicit;

  const start = row.time ? new Date(row.time).getTime() : NaN;
  if (!Number.isFinite(start)) return NaN;

  const hours =
    row.source === "311" ? 0 :
    row.type === "Sports" ? 3.5 :
    /concert|music|ticketed|party|festival|auto|boat|air/i.test(`${row.type} ${row.source}`) ? 4 :
    2;

  return start + hours * 60 * 60 * 1000;
}

function formatDuration(ms) {
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes}m`;

  const hours = minutes / 60;
  if (hours < 10) return `${Math.round(hours * 10) / 10}h`;
  return `${Math.round(hours)}h`;
}

function distanceLabel(row) {
  if (!Number.isFinite(row.distance)) return "an unknown distance";
  if (row.distance < 0.2) return "very close";
  return `${formatNumber(row.distance, 1)} mi`;
}

function formatNumber(value, digits) {
  return Number(value.toFixed(digits)).toString();
}

function distanceMiles(lat1, lon1, lat2, lon2) {
  const radius = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(value) {
  return (value * Math.PI) / 180;
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function interpolate(value, min, max, start, end) {
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return start + (end - start) * t;
}

function formatTime(value) {
  if (!value) return "time unknown";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
