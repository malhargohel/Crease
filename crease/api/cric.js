// api/cric.js — Vercel serverless proxy for CricketData.org
// The API key lives ONLY in an environment variable (CRICAPI_KEY),
// never in the frontend bundle. The browser calls THIS function;
// this function adds the key and forwards to cricapi.com.
//
// Set the env var in Vercel:  Project → Settings → Environment
// Variables → add  CRICAPI_KEY = <your key>
//
// Endpoints are whitelisted so the proxy can't be abused to call
// arbitrary URLs. A short in-memory cache softens the 100 hits/day
// free-tier limit (cache survives while the function stays warm).

const BASE = "https://api.cricapi.com/v1";

// Only these upstream endpoints may be proxied.
const ALLOWED = new Set([
  "currentMatches",
  "matches",
  "match_info",
  "match_scorecard",
  "match_squad",
  "players",
  "players_info",
  "series",
  "series_info",
  "countries",
]);

// naive warm-instance cache: { url: { at, data } }
const cache = new Map();
const TTL = {
  currentMatches: 30_000,   // live-ish, refresh often
  match_info: 20_000,
  match_scorecard: 20_000,
  default: 6 * 60 * 60_000, // squads/series/players rarely change
};

function ttlFor(ep) {
  return TTL[ep] ?? TTL.default;
}

export default async function handler(req, res) {
  // CORS — allow your own origin(s). "*" is fine for a personal app;
  // tighten to your domain for production.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  const key = process.env.CRICAPI_KEY;
  if (!key) {
    return res.status(500).json({
      ok: false,
      error: "Server is missing CRICAPI_KEY. Add it in Vercel env vars.",
    });
  }

  const { endpoint, ...rest } = req.query;
  if (!endpoint || !ALLOWED.has(endpoint)) {
    return res.status(400).json({
      ok: false,
      error: `Unknown or missing endpoint. Allowed: ${[...ALLOWED].join(", ")}`,
    });
  }

  // rebuild the upstream query (id, search, offset, etc.) minus our own key
  const params = new URLSearchParams({ apikey: key, offset: "0" });
  for (const [k, v] of Object.entries(rest)) {
    if (k !== "apikey") params.set(k, Array.isArray(v) ? v[0] : v);
  }

  const upstream = `${BASE}/${endpoint}?${params.toString()}`;
  const cacheKey = upstream;

  // serve from warm cache when fresh
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < ttlFor(endpoint)) {
    res.setHeader("x-cache", "HIT");
    return res.status(200).json(hit.data);
  }

  try {
    const r = await fetch(upstream);
    const data = await r.json();
    cache.set(cacheKey, { at: Date.now(), data });
    res.setHeader("x-cache", "MISS");
    // let the browser/CDN cache briefly too
    res.setHeader("Cache-Control", "public, max-age=15, s-maxage=30");
    return res.status(200).json(data);
  } catch (err) {
    // on failure, fall back to stale cache if we have any
    if (hit) {
      res.setHeader("x-cache", "STALE");
      return res.status(200).json(hit.data);
    }
    return res.status(502).json({ ok: false, error: "Upstream fetch failed." });
  }
}
