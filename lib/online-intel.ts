export type OnlineIntelKind = "weather" | "traffic" | "news" | "web" | "market" | "none";

export type OnlineIntelResult = {
  kind: OnlineIntelKind;
  query: string;
  summary: string;
  details?: string[];
  source?: string;
  url?: string;
  missingConfig?: string[];
};

const weatherCodes: Record<number, string> = {
  0: "Clear",
  1: "Mostly clear",
  2: "Partly cloudy",
  3: "Cloudy",
  45: "Fog",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  80: "Light showers",
  81: "Showers",
  82: "Heavy showers",
  95: "Thunderstorm"
};

function env(name: string) {
  return process.env[name]?.trim();
}

function encode(value: string) {
  return encodeURIComponent(value.trim());
}

function extractLocation(query: string) {
  const match =
    query.match(/\b(?:weather|temperature|temp|forecast)\s+(?:in|for|at)\s+(.+)/i) ||
    query.match(/\b(?:in|for|at)\s+([^?]+)$/i);
  return match?.[1]?.replace(/[?.!]+$/, "").trim() || env("JARVIS_DEFAULT_LOCATION") || "";
}

function extractRoute(query: string) {
  const fromTo = query.match(/\bfrom\s+(.+?)\s+to\s+(.+)/i);
  if (fromTo?.[1] && fromTo?.[2]) {
    return {
      origin: fromTo[1].replace(/[?.!]+$/, "").trim(),
      destination: fromTo[2].replace(/[?.!]+$/, "").trim()
    };
  }
  return {
    origin: env("JARVIS_TRAFFIC_ORIGIN") || "",
    destination: env("JARVIS_TRAFFIC_DESTINATION") || ""
  };
}

export function classifyOnlineIntent(query: string): OnlineIntelKind {
  const text = query.toLowerCase();
  if (/\b(weather|temperature|temp|forecast|rain|snow|wind)\b/.test(text)) return "weather";
  if (/\b(traffic|drive time|commute|eta|route)\b/.test(text)) return "traffic";
  if (/\b(market news|economic calendar|futures news|mnq news|nq news|fed news)\b/.test(text)) {
    return "market";
  }
  if (/\b(news|headlines)\b/.test(text)) return "news";
  if (/\b(search|look up|lookup|online|internet|web)\b/.test(text)) return "web";
  return "none";
}

export async function getWeatherIntel(query: string): Promise<OnlineIntelResult> {
  const location = extractLocation(query);
  if (!location) {
    return {
      kind: "weather",
      query,
      summary: "Weather lookup needs a location. Set JARVIS_DEFAULT_LOCATION or ask for weather in a city.",
      missingConfig: ["JARVIS_DEFAULT_LOCATION"]
    };
  }

  const geoRes = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encode(location)}&count=1&language=en&format=json`,
    { cache: "no-store" }
  );
  if (!geoRes.ok) throw new Error("Weather geocoding failed.");
  const geo = (await geoRes.json()) as {
    results?: Array<{ name: string; admin1?: string; country?: string; latitude: number; longitude: number }>;
  };
  const place = geo.results?.[0];
  if (!place) {
    return {
      kind: "weather",
      query,
      summary: `I could not find weather coordinates for ${location}.`,
      source: "Open-Meteo"
    };
  }

  const weatherRes = await fetch(
    [
      "https://api.open-meteo.com/v1/forecast",
      `?latitude=${place.latitude}`,
      `&longitude=${place.longitude}`,
      "&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m",
      "&temperature_unit=fahrenheit",
      "&wind_speed_unit=mph",
      "&timezone=auto"
    ].join(""),
    { cache: "no-store" }
  );
  if (!weatherRes.ok) throw new Error("Weather lookup failed.");
  const weather = (await weatherRes.json()) as {
    current?: {
      apparent_temperature?: number;
      relative_humidity_2m?: number;
      temperature_2m?: number;
      weather_code?: number;
      wind_speed_10m?: number;
    };
  };
  const current = weather.current;
  if (!current) throw new Error("Weather response did not include current conditions.");

  const condition = weatherCodes[current.weather_code || 0] || "Unknown conditions";
  const placeName = [place.name, place.admin1, place.country].filter(Boolean).join(", ");
  return {
    kind: "weather",
    query,
    summary: `${placeName}: ${Math.round(current.temperature_2m || 0)}°F, feels like ${Math.round(
      current.apparent_temperature || current.temperature_2m || 0
    )}°F, ${condition}.`,
    details: [
      `Humidity ${Math.round(current.relative_humidity_2m || 0)}%`,
      `Wind ${Math.round(current.wind_speed_10m || 0)} mph`
    ],
    source: "Open-Meteo",
    url: "https://open-meteo.com/"
  };
}

export async function getTrafficIntel(query: string): Promise<OnlineIntelResult> {
  const key = env("GOOGLE_MAPS_API_KEY");
  const route = extractRoute(query);
  const missingConfig = [
    !key ? "GOOGLE_MAPS_API_KEY" : "",
    !route.origin ? "JARVIS_TRAFFIC_ORIGIN or say 'from ...'" : "",
    !route.destination ? "JARVIS_TRAFFIC_DESTINATION or say 'to ...'" : ""
  ].filter(Boolean);

  if (missingConfig.length) {
    return {
      kind: "traffic",
      query,
      summary:
        "Traffic lookup is ready, but it needs Google Maps configuration and a route before Jarvis can pull live drive time.",
      missingConfig
    };
  }

  const url = [
    "https://maps.googleapis.com/maps/api/distancematrix/json",
    `?origins=${encode(route.origin)}`,
    `&destinations=${encode(route.destination)}`,
    "&departure_time=now",
    `&key=${encode(key || "")}`
  ].join("");
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Traffic lookup failed.");
  const data = (await res.json()) as {
    destination_addresses?: string[];
    origin_addresses?: string[];
    rows?: Array<{ elements?: Array<{ status: string; duration?: { text: string }; duration_in_traffic?: { text: string }; distance?: { text: string } }> }>;
    status?: string;
  };
  const element = data.rows?.[0]?.elements?.[0];
  if (data.status !== "OK" || !element || element.status !== "OK") {
    return {
      kind: "traffic",
      query,
      summary: "Google Maps did not return a usable traffic route.",
      details: [`Status ${data.status || element?.status || "unknown"}`],
      source: "Google Maps"
    };
  }

  return {
    kind: "traffic",
    query,
    summary: `Traffic from ${data.origin_addresses?.[0] || route.origin} to ${
      data.destination_addresses?.[0] || route.destination
    }: ${element.duration_in_traffic?.text || element.duration?.text}.`,
    details: [`Distance ${element.distance?.text || "unknown"}`, `Normal duration ${element.duration?.text || "unknown"}`],
    source: "Google Maps"
  };
}

async function getBraveSearch(query: string, kind: OnlineIntelKind): Promise<OnlineIntelResult> {
  const key = env("BRAVE_SEARCH_API_KEY");
  if (!key) {
    return {
      kind,
      query,
      summary: "Live web/news lookup is ready, but Brave Search is not configured yet.",
      missingConfig: ["BRAVE_SEARCH_API_KEY"]
    };
  }

  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encode(query)}&count=5`, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": key
    }
  });
  if (!res.ok) throw new Error("Brave Search lookup failed.");
  const data = (await res.json()) as {
    web?: { results?: Array<{ title?: string; description?: string; url?: string }> };
  };
  const results = data.web?.results || [];
  if (!results.length) {
    return {
      kind,
      query,
      summary: "I searched online but did not find strong results.",
      source: "Brave Search"
    };
  }
  return {
    kind,
    query,
    summary: results[0]?.description || results[0]?.title || "Online search complete.",
    details: results.slice(0, 5).map((item) => `${item.title || "Result"} - ${item.url || ""}`),
    source: "Brave Search",
    url: results[0]?.url
  };
}

export async function getOnlineIntel(query: string): Promise<OnlineIntelResult | null> {
  const kind = classifyOnlineIntent(query);
  if (kind === "none") return null;

  try {
    if (kind === "weather") return await getWeatherIntel(query);
    if (kind === "traffic") return await getTrafficIntel(query);
    if (kind === "market") return await getBraveSearch(`${query} futures markets economic calendar`, "market");
    if (kind === "news") return await getBraveSearch(query, "news");
    return await getBraveSearch(query, "web");
  } catch (error) {
    return {
      kind,
      query,
      summary: error instanceof Error ? error.message : "Online lookup failed.",
      source: "Jarvis Online Intel"
    };
  }
}

export function formatOnlineIntelForPrompt(intel: OnlineIntelResult | null) {
  if (!intel) return "No live online data was requested.";
  return [
    `Kind: ${intel.kind}`,
    `Query: ${intel.query}`,
    `Summary: ${intel.summary}`,
    intel.details?.length ? `Details:\n${intel.details.map((detail) => `- ${detail}`).join("\n")}` : "",
    intel.source ? `Source: ${intel.source}` : "",
    intel.url ? `URL: ${intel.url}` : "",
    intel.missingConfig?.length ? `Missing config: ${intel.missingConfig.join(", ")}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}
