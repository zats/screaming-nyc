const SPORTS = [
  { name: "MLB", url: "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard" },
  { name: "NBA", url: "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard" },
  { name: "NHL", url: "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard" },
  { name: "WNBA", url: "https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard" },
  { name: "MLS", url: "https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/scoreboard" },
  { name: "NFL", url: "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard" }
];

const NYC_VENUES = [
  { name: "Madison Square Garden", lat: 40.7505, lon: -73.9934 },
  { name: "Barclays Center", lat: 40.6826, lon: -73.9754 },
  { name: "Yankee Stadium", lat: 40.8296, lon: -73.9262 },
  { name: "Citi Field", lat: 40.7571, lon: -73.8458 },
  { name: "Red Bull Arena", lat: 40.7368, lon: -74.1502 }
];

const HOME_VENUES = new Map([
  ["New York Knicks", venue("Madison Square Garden")],
  ["New York Rangers", venue("Madison Square Garden")],
  ["Brooklyn Nets", venue("Barclays Center")],
  ["New York Liberty", venue("Barclays Center")],
  ["New York Yankees", venue("Yankee Stadium")],
  ["New York Mets", venue("Citi Field")],
  ["New York City FC", venue("Yankee Stadium")],
  ["New York Red Bulls", venue("Red Bull Arena")]
]);

export function parseScanParams(request) {
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));
  const radius = Number(url.searchParams.get("radius") || 3);
  const source = url.searchParams.get("source") || "";

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error("lat/lon required");
  }

  return { lat, lon, radius, source };
}

export async function scanSports(lat, lon, radius) {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const results = await Promise.allSettled(
    SPORTS.map(async (sport) => {
      const url = new URL(sport.url);
      url.searchParams.set("dates", date);
      url.searchParams.set("limit", "100");
      const data = await fetchJson(url);
      return (data.events || []).flatMap((event) => mapSportEvent(sport.name, event, lat, lon, radius));
    })
  );

  return dedupeEvents(results.flatMap((result) => (result.status === "fulfilled" ? result.value : [])));
}

export async function scanTicketedEvents(lat, lon, radius) {
  const results = await Promise.allSettled([
    scanTicketedSource("eventbrite", lat, lon, radius),
    scanTicketedSource("songkick", lat, lon, radius),
    scanTicketedSource("ticketmaster", lat, lon, radius)
  ]);

  return dedupeEvents(results.flatMap((result) => (result.status === "fulfilled" ? result.value : [])))
    .sort((a, b) => scoreEvent(a) - scoreEvent(b))
    .slice(0, 18);
}

export async function scanTicketedSource(source, lat, lon, radius) {
  if (source === "eventbrite") return scanEventbrite(lat, lon, radius);
  if (source === "songkick") return scanSongkick(lat, lon, radius);
  if (source === "ticketmaster") return scanTicketmaster(lat, lon, radius);
  throw new Error("unknown source");
}

function mapSportEvent(league, event, lat, lon, radius) {
  const competition = event.competitions?.[0];
  const competitors = competition?.competitors || [];
  const home = competitors.find((team) => team.homeAway === "home")?.team?.displayName;
  const away = competitors.find((team) => team.homeAway === "away")?.team?.displayName;
  const eventVenue = (home && HOME_VENUES.get(home)) || matchKnownVenue(competition?.venue?.fullName || "");
  if (!eventVenue) return [];

  const miles = distanceMiles(lat, lon, eventVenue.lat, eventVenue.lon);
  if (miles > radius) return [];

  return [
    {
      title: event.shortName || event.name || `${away} at ${home}`,
      type: "Sports",
      time: event.date,
      endTime: eventEndTime(event.date, "Sports"),
      place: eventVenue.name,
      source: `ESPN ${league}`,
      url: event.links?.[0]?.href || sportUrl(league),
      distance: miles
    }
  ];
}

async function scanEventbrite(lat, lon, radius) {
  const html = await fetchText("https://www.eventbrite.com/d/ny--new-york/events--today/");
  const json = extractAssignmentJson(html, "window.__SERVER_DATA__");
  const events = json?.search_data?.events?.results || [];

  return events.flatMap((event) => {
    const venue = event.primary_venue;
    const eventLat = Number(venue?.address?.latitude);
    const eventLon = Number(venue?.address?.longitude);
    if (!Number.isFinite(eventLat) || !Number.isFinite(eventLon)) return [];

    const distance = distanceMiles(lat, lon, eventLat, eventLon);
    if (distance > radius) return [];

    const time = eventDateTime(event.start_date, event.start_time);
    const endTime = eventDateTime(event.end_date || event.start_date, event.end_time);
    if (!isNearNow(time)) return [];

    return {
      title: event.name,
      type: event.tags?.find((tag) => tag.prefix === "EventbriteCategory")?.display_name || "Event",
      time,
      endTime,
      place: venue.name || venue.address?.localized_address_display || "Nearby",
      source: "Eventbrite",
      url: event.url,
      distance
    };
  });
}

async function scanSongkick(lat, lon, radius) {
  const html = await fetchText("https://www.songkick.com/metro-areas/7644-us-new-york-nyc");
  return extractJsonLdEvents(html).flatMap((event) => {
    const item = Array.isArray(event) ? event[0] : event;
    const eventLat = Number(item?.location?.geo?.latitude);
    const eventLon = Number(item?.location?.geo?.longitude);
    if (!Number.isFinite(eventLat) || !Number.isFinite(eventLon)) return [];

    const distance = distanceMiles(lat, lon, eventLat, eventLon);
    if (distance > radius) return [];

    const time = parseLocalDate(item.startDate);
    if (!isNearNow(time)) return [];

    return {
      title: item.name,
      type: "Concert",
      time,
      endTime: eventEndTime(time, "Concert"),
      place: item.location?.name || "Nearby",
      source: "Songkick",
      url: item.url,
      distance
    };
  });
}

async function scanTicketmaster(lat, lon, radius) {
  const today = localDate(new Date());
  const tomorrow = localDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const queries = ["", "concert", "sports", "comedy", "theater"];
  const pages = await Promise.allSettled(
    queries.map((query) => {
      const url = new URL("https://www.ticketmaster.com/search");
      if (query) url.searchParams.set("q", query);
      url.searchParams.set("startDate", today);
      url.searchParams.set("endDate", tomorrow);
      url.searchParams.set("sort", "date");
      return fetchText(url);
    })
  );

  return pages.flatMap((result) => {
    if (result.status !== "fulfilled") return [];
    const data = extractNextData(result.value);
    const queriesData = data?.props?.pageProps?.initialReduxState?.api?.queries || {};
    return Object.entries(queriesData).flatMap(([, value]) => {
      const events = value?.data?.events || [];
      return events.flatMap((event) => mapTicketmasterEvent(event, lat, lon, radius));
    });
  });
}

function mapTicketmasterEvent(event, lat, lon, radius) {
  const eventLat = Number(event.venue?.latitude);
  const eventLon = Number(event.venue?.longitude);
  if (!Number.isFinite(eventLat) || !Number.isFinite(eventLon)) return [];

  const distance = distanceMiles(lat, lon, eventLat, eventLon);
  if (distance > radius) return [];

  const time = event.dates?.startDate;
  if (!isNearNow(time)) return [];

  return {
    title: event.title,
    type: "Ticketed event",
    time,
    endTime: eventEndTime(time, "Ticketed event"),
    place: event.venue?.name || "Nearby",
    source: "Ticketmaster",
    url: event.url,
    distance
  };
}

function extractNextData(html) {
  const match = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/);
  return match ? JSON.parse(match[1]) : null;
}

function extractAssignmentJson(html, name) {
  const start = html.indexOf(`${name} = `);
  if (start < 0) return null;

  const jsonStart = html.indexOf("{", start);
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = jsonStart; index < html.length; index += 1) {
    const char = html[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') inString = !inString;
    if (inString) continue;
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return JSON.parse(html.slice(jsonStart, index + 1));
  }

  return null;
}

function extractJsonLdEvents(html) {
  const matches = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  return matches.flatMap((match) => {
    try {
      return findEvents(JSON.parse(cleanJson(match[1])));
    } catch {
      return [];
    }
  });
}

function findEvents(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(findEvents);
  if (typeof value !== "object") return [];
  if (String(value["@type"] || "").toLowerCase().includes("event")) return [value];
  if (value["@graph"]) return findEvents(value["@graph"]);
  return Object.values(value).flatMap(findEvents);
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: requestHeaders() });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, { headers: requestHeaders() });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

function requestHeaders() {
  return {
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
    "accept-language": "en-US,en;q=0.9",
    "user-agent": "Mozilla/5.0 screaming-new-york/0.1"
  };
}

function eventDateTime(date, time) {
  return `${date}T${time || "00:00"}:00`;
}

function eventEndTime(start, type) {
  const startMs = new Date(start).getTime();
  if (!Number.isFinite(startMs)) return "";
  const hours = type === "Sports" ? 3.5 : 4;
  return new Date(startMs + hours * 60 * 60 * 1000).toISOString();
}

function parseLocalDate(value) {
  if (!value) return "";
  return /Z|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}-04:00`;
}

function isNearNow(value) {
  const time = value ? new Date(value).getTime() : NaN;
  const now = Date.now();
  return Number.isFinite(time) && time >= now - 2 * 60 * 60 * 1000 && time <= now + 12 * 60 * 60 * 1000;
}

function dedupeEvents(events) {
  const seen = new Set();
  return events.filter((event) => {
    const key = `${event.title}|${event.place}|${new Date(event.time).toISOString().slice(0, 13)}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function scoreEvent(event) {
  const time = new Date(event.time).getTime();
  const agePenalty = Math.abs(time - Date.now()) / (60 * 60 * 1000);
  return event.distance * 2 + agePenalty;
}

function localDate(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function cleanJson(value) {
  return value.replace(/&quot;/g, '"').replace(/&amp;/g, "&").trim();
}

function venue(name) {
  return NYC_VENUES.find((item) => item.name === name);
}

function matchKnownVenue(name) {
  const lower = name.toLowerCase();
  return NYC_VENUES.find((item) => lower.includes(item.name.toLowerCase()));
}

function sportUrl(league) {
  return `https://www.espn.com/${league.toLowerCase()}/scoreboard`;
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
