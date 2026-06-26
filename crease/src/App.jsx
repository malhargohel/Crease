import React, { useState, useEffect, useMemo, createContext, useContext } from "react";

/* ════════════════════════════════════════════════════════════════
   CREASE — cricket, live
   Mobile PWA · futuristic dark "control-room" aesthetic
   Screens: Live feed · Match detail (ball-by-ball) · Player search
            · Player profile · Fixtures · Series/Squads · Points table
   Data layer: real-API ready (swap API_KEY) with full mock fallback
════════════════════════════════════════════════════════════════ */

// ── design tokens ──────────────────────────────────────────────
const T = {
  bg: "#0a0e14",
  bg2: "#0f1219",
  panel: "#121822",
  panel2: "#19212e",
  line: "#222c3a",
  lineSoft: "#1a2230",
  text: "#eef2f7",
  textDim: "#8b97a8",
  textFaint: "#586172",
  live: "#ff4d5e",
  liveSoft: "#3a1820",
  mint: "#34e6b0",     // primary accent — "scoreboard phosphor"
  mintDim: "#0f3b30",
  amber: "#ffb547",    // boundaries
  violet: "#8b7cff",
  cyan: "#4dd0ff",
};

const MONO = "'JetBrains Mono','DM Mono',monospace";
const SANS = "'Space Grotesk','Inter',system-ui,sans-serif";

/* ════════════════════════ DATA LAYER ════════════════════════════
   The app talks to YOUR proxy, never to CricketData.org directly.
   The proxy (api/cric.js) holds the key in an env var server-side.

   1. Deploy the proxy (see DEPLOY.md).
   2. Put its base URL here, e.g.
        const PROXY = "https://crease-yourname.vercel.app/api/cric";
   3. Leave it "" to run on bundled mock data (this preview does).

   Why a proxy: cricket APIs block direct browser calls (CORS) and a
   key in frontend code is public to anyone who opens devtools. The
   free tier is only ~100 hits/day, so the proxy also caches.
─────────────────────────────────────────────────────────────── */
const PROXY = ""; // ← paste your deployed proxy URL here to go live

async function call(endpoint, params = {}) {
  if (!PROXY) throw new Error("no-proxy"); // → triggers mock fallback
  const qs = new URLSearchParams({ endpoint, ...params });
  const r = await fetch(`${PROXY}?${qs}`);
  if (!r.ok) throw new Error("bad-status");
  const json = await r.json();
  if (json.status && json.status !== "success" && !json.data) throw new Error("api-error");
  return json.data;
}

/* ── mappers: CricketData.org shapes → this app's models ──
   These turn the real API JSON into the exact objects the UI reads,
   so screens don't need to know which source they came from.       */
const FLAG = (name = "") => {
  const k = name.toLowerCase();
  const M = { india:"🇮🇳", australia:"🇦🇺", england:"🏴", "new zealand":"🇳🇿", pakistan:"🇵🇰",
    bangladesh:"🇧🇩", "sri lanka":"🇱🇰", "south africa":"🇿🇦", "west indies":"🏝️", afghanistan:"🇦🇫",
    ireland:"🇮🇪", scotland:"🏴", netherlands:"🇳🇱", zimbabwe:"🇿🇼", nepal:"🇳🇵", usa:"🇺🇸",
    "united states":"🇺🇸", canada:"🇨🇦", namibia:"🇳🇦", oman:"🇴🇲", uae:"🇦🇪" };
  for (const key in M) if (k.includes(key)) return M[key];
  return "🏏";
};
const isWomen = (s = "") => /women|girls|\bw\b/i.test(s);

function mapMatch(m) {
  // m.score: [{ r, w, o, inning }], m.teamInfo: [{ name, shortname, img }]
  const info = m.teamInfo || [];
  const sc = m.score || [];
  const teamScore = (idx) => {
    const tname = m.teams?.[idx];
    const s = sc.find((x) => x.inning?.toLowerCase().includes((tname || "").toLowerCase().split(" ")[0]));
    const ti = info.find((x) => x.name === tname) || info[idx] || {};
    return {
      name: tname || ti.name || `Team ${idx + 1}`,
      short: ti.shortname || (tname || "").slice(0, 3).toUpperCase(),
      flag: FLAG(tname || ti.name),
      runs: s ? s.r : null, wkts: s ? s.w : null,
      overs: s ? String(s.o) : null,
      batting: false,
    };
  };
  const live = m.matchStarted && !m.matchEnded;
  const t1 = teamScore(0), t2 = teamScore(1);
  if (live && sc.length) { const last = sc[sc.length - 1].inning || ""; (last.includes(t2.name.split(" ")[0]) ? t2 : t1).batting = true; }
  return {
    id: m.id,
    series: m.series || m.name?.split(",")[0] || "Match",
    note: m.matchType ? m.matchType.toUpperCase() : "",
    format: (m.matchType || "T20").toUpperCase(),
    gender: isWomen(m.name) || isWomen(m.series) ? "W" : "M",
    venue: m.venue || "",
    status: m.matchEnded ? "result" : live ? "live" : "upcoming",
    statusText: m.status || "",
    t1, t2,
    _raw: m,
  };
}

function mapPlayerSummary(p) {
  return { id: p.id, name: p.name, country: p.country || "", role: "", flag: FLAG(p.country), img: (p.name || "").split(" ").map(w => w[0]).join("").slice(0, 2) };
}

function mapPlayerInfo(p) {
  // p.stats: [{ fn:"batting", matchtype:"test", stat:"runs", value:"..." }]
  const bat = {};
  (p.stats || []).forEach((s) => {
    if (s.fn !== "batting") return;
    const fmt = (s.matchtype || "").toUpperCase().replace("TEST", "Test").replace("ODI", "ODI").replace("T20I", "T20I");
    const key = fmt === "TEST" ? "Test" : fmt;
    bat[key] = bat[key] || { m: "-", runs: "-", hs: "-", avg: "-", sr: "-", hundreds: "-", fifties: "-" };
    const map = { matches: "m", runs: "runs", hs: "hs", avg: "avg", sr: "sr", "100s": "hundreds", "50s": "fifties" };
    if (map[s.stat]) bat[key][map[s.stat]] = s.value;
  });
  return {
    id: p.id, name: p.name, country: p.country || "", role: p.role || p.playingRole || "Player",
    flag: FLAG(p.country), born: p.dateOfBirth || "", style: [p.battingStyle, p.bowlingStyle].filter(Boolean).join(" · "),
    img: (p.name || "").split(" ").map(w => w[0]).join("").slice(0, 2),
    bat: Object.keys(bat).length ? bat : null,
  };
}

function mapSeries(s) {
  return {
    id: s.id, name: s.name, gender: isWomen(s.name) ? "W" : "M",
    dates: [s.startDate, s.endDate].filter(Boolean).join(" – "),
    host: "", matches: s.matches || s.t20 + s.odi + s.test || 0,
    ongoing: s.startDate && s.endDate ? (new Date() >= new Date(s.startDate) && new Date() <= new Date(s.endDate)) : false,
    squads: [],
  };
}

// thin API surface — each returns mock on failure so UI never breaks
const api = {
  async currentMatches() { try { const d = await call("currentMatches"); return d.map(mapMatch); } catch { return MOCK.matches; } },
  async matchInfo(id)    { try { const d = await call("match_info", { id }); const base = mapMatch(d); return { ...base, ...detailFromRaw(d, base) }; } catch { return MOCK.matches.find(m => m.id === id); } },
  async searchPlayer(q)  { try { const d = await call("players", { search: q }); return d.map(mapPlayerSummary); } catch { return MOCK.players.filter(p => p.name.toLowerCase().includes(q.toLowerCase())); } },
  async playerInfo(id)   { try { const d = await call("players_info", { id }); return mapPlayerInfo(d); } catch { return MOCK.players.find(p => p.id === id); } },
  async series()         { try { const d = await call("series"); return d.map(mapSeries); } catch { return MOCK.series; } },
};

// pull batting/bowling/over detail out of a match_info raw payload
function detailFromRaw(raw, base) {
  const out = {};
  const sc = raw.scorecard || [];
  const inn = sc[sc.length - 1];
  if (inn) {
    out.batters = (inn.batting || []).filter(b => b["dismissal-text"] === "batting" || b.batsman).slice(0, 6).map(b => ({
      name: b.batsman?.name || b.batsman || "—",
      runs: b.r ?? 0, balls: b.b ?? 0, fours: b["4s"] ?? 0, sixes: b["6s"] ?? 0,
      sr: b.sr ?? 0, out: (b["dismissal-text"] && b["dismissal-text"] !== "batting"),
    }));
    out.bowlers = (inn.bowling || []).slice(0, 4).map(b => ({
      name: b.bowler?.name || b.bowler || "—",
      overs: String(b.o ?? 0), maidens: b.m ?? 0, runs: b.r ?? 0, wkts: b.w ?? 0, econ: b.eco ?? 0,
    }));
  }
  return out;
}

/* ──────────────────────── MOCK DATA ─────────────────────────────
   Modelled on real fixtures of 26 Jun 2026.                       */
const MOCK = {
  matches: [
    {
      id: "wt20-23", series: "ICC Women's T20 World Cup", note: "Group A · 23rd Match",
      format: "T20I", gender: "W", venue: "Old Trafford, Manchester", status: "live",
      statusText: "India Women need to defend 15 off 12 balls",
      t1: { name: "India Women", short: "INDW", flag: "🇮🇳", runs: 162, wkts: 6, overs: "20.0", batting: false },
      t2: { name: "Bangladesh W", short: "BANW", flag: "🇧🇩", runs: 148, wkts: 9, overs: "18.0", batting: true },
      toss: "Bangladesh won the toss and chose to field",
      crr: 8.22, rrr: 7.50, target: 163,
      thisOver: ["1", "4", "W", "2", "1", "·"],
      recentOvers: [
        { ov: 18, balls: ["1","4","W","2","1","·"], runs: 8 },
        { ov: 17, balls: ["·","6","1","1","W","4"], runs: 12 },
        { ov: 16, balls: ["2","1","1","4","·","1"], runs: 9 },
      ],
      batters: [
        { name: "Nigar Sultana", runs: 52, balls: 38, fours: 5, sixes: 1, sr: 136.8, out: false },
        { name: "Ritu Moni", runs: 14, balls: 9, fours: 2, sixes: 0, sr: 155.5, out: false },
      ],
      bowlers: [
        { name: "Deepti Sharma", overs: "4.0", maidens: 0, runs: 28, wkts: 2, econ: 7.0 },
        { name: "Renuka Singh", overs: "3.0", maidens: 0, runs: 24, wkts: 1, econ: 8.0 },
      ],
      fow: ["5-1 (1.2)","31-2 (4.5)","68-3 (9.1)","99-4 (13.0)","120-5 (15.4)"],
    },
    {
      id: "mlc-9", series: "Major League Cricket", note: "9th Match (N)",
      format: "T20", gender: "M", venue: "Oakland Coliseum, California", status: "live",
      statusText: "Washington Freedom chose to bat",
      t1: { name: "Washington Freedom", short: "WSF", flag: "🦅", runs: 118, wkts: 2, overs: "13.0", batting: true },
      t2: { name: "Seattle Orcas", short: "SEO", flag: "🐋", runs: null, wkts: null, overs: null, batting: false },
      toss: "Washington won the toss and chose to bat", crr: 9.07, rrr: null, target: null,
      thisOver: ["6","1","1","4","·","2"],
      recentOvers: [
        { ov: 12, balls: ["6","1","1","4","·","2"], runs: 14 },
        { ov: 11, balls: ["1","·","4","4","1","1"], runs: 11 },
      ],
      batters: [
        { name: "Glenn Maxwell", runs: 61, balls: 34, fours: 6, sixes: 3, sr: 179.4, out: false },
        { name: "Rachin Ravindra", runs: 38, balls: 26, fours: 4, sixes: 1, sr: 146.1, out: false },
      ],
      bowlers: [
        { name: "Imad Wasim", overs: "3.0", maidens: 0, runs: 22, wkts: 1, econ: 7.3 },
        { name: "Cameron Gannon", overs: "3.0", maidens: 0, runs: 31, wkts: 1, econ: 10.3 },
      ],
      fow: ["44-1 (5.2)","79-2 (9.3)"],
    },
    {
      id: "irl-ind-1", series: "India tour of Ireland", note: "1st T20I",
      format: "T20I", gender: "M", venue: "Civil Service CC, Belfast", status: "upcoming",
      statusText: "Starts today · 19:00 local",
      t1: { name: "Ireland", short: "IRE", flag: "🇮🇪" },
      t2: { name: "India", short: "IND", flag: "🇮🇳" },
    },
    {
      id: "blast-62", series: "Vitality Blast", note: "Game 62",
      format: "T20", gender: "M", venue: "Edgbaston, Birmingham", status: "upcoming",
      statusText: "Starts today · 18:30 local",
      t1: { name: "Warwickshire", short: "WAR", flag: "🐻" },
      t2: { name: "Worcestershire", short: "WOR", flag: "🍐" },
    },
    {
      id: "mpl-sf2", series: "Madhya Pradesh League", note: "2nd Semi-final",
      format: "T20", gender: "M", venue: "Holkar Stadium, Indore", status: "result",
      statusText: "Chambal Ghariyals won by 11 runs", pom: "S. Tiwari · 78 (41)",
      t1: { name: "Chambal Ghariyals", short: "CHG", flag: "🐊", runs: 213, wkts: 8, overs: "20.0" },
      t2: { name: "Jabalpur Lions", short: "JRL", flag: "🦁", runs: 202, wkts: 8, overs: "20.0" },
    },
    {
      id: "wt20-slsco", series: "ICC Women's T20 World Cup", note: "Group A · 25th Match",
      format: "T20I", gender: "W", venue: "Old Trafford, Manchester", status: "upcoming",
      statusText: "Starts tomorrow · 14:30 local",
      t1: { name: "Sri Lanka Women", short: "SLW", flag: "🇱🇰" },
      t2: { name: "Scotland Women", short: "SCOW", flag: "🏴" },
    },
  ],

  players: [
    {
      id: "smriti-m", name: "Smriti Mandhana", country: "India", role: "Batter (LH)",
      flag: "🇮🇳", born: "18 Jul 1996", style: "Left-hand bat", img: "SM",
      ranking: { t20: 2, odi: 1 },
      bat: {
        T20I: { m: 158, runs: 4012, hs: "112", avg: 28.4, sr: 125.3, hundreds: 1, fifties: 28 },
        ODI:  { m: 102, runs: 4189, hs: "136", avg: 44.1, sr: 95.2, hundreds: 10, fifties: 28 },
        Test: { m: 12, runs: 699, hs: "149", avg: 38.8, sr: 72.1, hundreds: 1, fifties: 4 },
      },
    },
    {
      id: "glenn-m", name: "Glenn Maxwell", country: "Australia", role: "All-rounder",
      flag: "🇦🇺", born: "14 Oct 1988", style: "Right-hand bat · Off break", img: "GM",
      ranking: { t20: 14, odi: 22 },
      bat: {
        T20I: { m: 121, runs: 2362, hs: "145*", avg: 29.5, sr: 154.7, hundreds: 1, fifties: 11 },
        ODI:  { m: 148, runs: 3990, hs: "201*", avg: 33.8, sr: 126.7, hundreds: 4, fifties: 23 },
      },
    },
    {
      id: "harman-k", name: "Harmanpreet Kaur", country: "India", role: "Batter · Captain",
      flag: "🇮🇳", born: "8 Mar 1989", style: "Right-hand bat", img: "HK",
      ranking: { t20: 9, odi: 6 },
      bat: {
        T20I: { m: 178, runs: 3470, hs: "103", avg: 27.1, sr: 110.2, hundreds: 1, fifties: 9 },
        ODI:  { m: 142, runs: 3705, hs: "171*", avg: 36.3, sr: 80.4, hundreds: 6, fifties: 19 },
      },
    },
    {
      id: "rachin-r", name: "Rachin Ravindra", country: "New Zealand", role: "All-rounder",
      flag: "🇳🇿", born: "18 Nov 1999", style: "Left-hand bat · SLA orthodox", img: "RR",
      ranking: { t20: 19, odi: 11 },
      bat: {
        ODI:  { m: 41, runs: 1654, hs: "123", avg: 43.5, sr: 106.1, hundreds: 5, fifties: 7 },
        Test: { m: 18, runs: 1102, hs: "240", avg: 36.7, sr: 60.2, hundreds: 3, fifties: 4 },
      },
    },
    {
      id: "nigar-s", name: "Nigar Sultana", country: "Bangladesh", role: "WK-Batter · Captain",
      flag: "🇧🇩", born: "5 Oct 1997", style: "Right-hand bat", img: "NS",
      ranking: { t20: 24, odi: 18 },
      bat: {
        T20I: { m: 102, runs: 1988, hs: "81", avg: 23.1, sr: 96.4, hundreds: 0, fifties: 8 },
        ODI:  { m: 58, runs: 1420, hs: "92", avg: 28.4, sr: 68.9, hundreds: 0, fifties: 9 },
      },
    },
  ],

  series: [
    { id: "wt20-2026", name: "ICC Women's T20 World Cup 2026", gender: "W",
      dates: "12 Jun – 5 Jul 2026", host: "England", matches: 33, ongoing: true,
      squads: [
        { team: "India Women", flag: "🇮🇳", captain: "Harmanpreet Kaur",
          players: ["Harmanpreet Kaur (c)","Smriti Mandhana (vc)","Shafali Verma","Jemimah Rodrigues","Richa Ghosh (wk)","Deepti Sharma","Renuka Singh","Pooja Vastrakar","Radha Yadav","Sneh Rana","Arundhati Reddy","Asha Sobhana","Shreyanka Patil","Uma Chetry (wk)","Saima Thakor"] },
        { team: "Australia Women", flag: "🇦🇺", captain: "Alyssa Healy",
          players: ["Alyssa Healy (c/wk)","Tahlia McGrath (vc)","Ashleigh Gardner","Georgia Wareham","Beth Mooney","Ellyse Perry","Megan Schutt","Annabel Sutherland","Grace Harris","Phoebe Litchfield","Sophie Molineux","Darcie Brown","Kim Garth","Georgia Voll","Alana King"] },
        { team: "England Women", flag: "🏴", captain: "Nat Sciver-Brunt",
          players: ["Nat Sciver-Brunt (c)","Heather Knight","Danni Wyatt-Hodge","Amy Jones (wk)","Sophia Dunkley","Alice Capsey","Sophie Ecclestone","Lauren Bell","Charlie Dean","Linsey Smith","Em Arlott","Lauren Filer","Maia Bouchier","Paige Scholfield","Bess Heath (wk)"] },
      ],
    },
    { id: "mlc-2026", name: "Major League Cricket 2026", gender: "M",
      dates: "5 Jun – 13 Jul 2026", host: "USA", matches: 34, ongoing: true,
      squads: [
        { team: "Washington Freedom", flag: "🦅", captain: "Glenn Maxwell",
          players: ["Glenn Maxwell (c)","Rachin Ravindra","Travis Head","Marcus Stoinis","Andries Gous (wk)","Saurabh Netravalkar","Mukhamed Smith","Lockie Ferguson","Jason Holder","Steven Smith","Justin Dill"] },
        { team: "Seattle Orcas", flag: "🐋", captain: "Heinrich Klaasen",
          players: ["Heinrich Klaasen (c/wk)","Quinton de Kock (wk)","Shimron Hetmyer","Imad Wasim","Cameron Gannon","Wayne Parnell","Dushmantha Chameera","Aaron Jones","Nauman Anwar","Phillip Salt","Harmeet Singh"] },
      ],
    },
    { id: "irl-ind-2026", name: "India tour of Ireland 2026", gender: "M",
      dates: "26 – 28 Jun 2026", host: "Ireland", matches: 2, ongoing: false, squads: [] },
  ],

  pointsTable: {
    title: "ICC Women's T20 World Cup · Group A",
    rows: [
      { team: "Australia Women", flag: "🇦🇺", p: 3, w: 3, l: 0, nr: 0, pts: 6, nrr: "+2.105" },
      { team: "India Women", flag: "🇮🇳", p: 3, w: 2, l: 1, nr: 0, pts: 4, nrr: "+1.240" },
      { team: "Bangladesh W", flag: "🇧🇩", p: 3, w: 2, l: 1, nr: 0, pts: 4, nrr: "+0.180" },
      { team: "Pakistan W", flag: "🇵🇰", p: 3, w: 1, l: 2, nr: 0, pts: 2, nrr: "-0.640" },
      { team: "Netherlands W", flag: "🇳🇱", p: 3, w: 1, l: 2, nr: 0, pts: 2, nrr: "-1.110" },
      { team: "Scotland W", flag: "🏴", p: 3, w: 0, l: 3, nr: 0, pts: 0, nrr: "-1.980" },
    ],
  },
};

/* ════════════════════════ NAV CONTEXT ══════════════════════════ */
const Nav = createContext();
const useNav = () => useContext(Nav);

/* ════════════════════════ SHARED UI ════════════════════════════ */
function LiveDot({ size = 7 }) {
  return <span className="crz-pulse" style={{ width: size, height: size, borderRadius: "50%", background: T.live, display: "inline-block", boxShadow: `0 0 8px ${T.live}` }} />;
}

function Pill({ children, color = T.textDim, bg = T.panel2 }) {
  return <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color, background: bg, padding: "3px 7px", borderRadius: 5 }}>{children}</span>;
}

function Ball({ v }) {
  const isW = v === "W", isBoundary = v === "4" || v === "6", isDot = v === "·";
  const bg = isW ? T.live : isBoundary ? T.amber : isDot ? "transparent" : T.mintDim;
  const col = isW || isBoundary ? "#0a0e14" : isDot ? T.textFaint : T.mint;
  return (
    <span style={{ width: 25, height: 25, borderRadius: "50%", display: "grid", placeItems: "center", fontFamily: MONO, fontSize: 11.5, fontWeight: 600, color: col, background: bg, border: isDot ? `1.5px solid ${T.line}` : "none", flexShrink: 0 }}>{v}</span>
  );
}

/* ════════════════════════ SCREEN: LIVE FEED ════════════════════ */
const FILTERS = ["Live", "All", "Men", "Women", "Leagues", "Upcoming"];

function passes(m, f) {
  if (f === "All") return true;
  if (f === "Live") return m.status === "live";
  if (f === "Upcoming") return m.status === "upcoming";
  if (f === "Women") return m.gender === "W";
  if (f === "Men") return m.gender === "M";
  if (f === "Leagues") return !/World Cup|tour of/.test(m.series);
  return true;
}

function MiniScore({ t, bat }) {
  if (!t) return null;
  const score = t.runs != null ? `${t.runs}/${t.wkts}` : "yet to bat";
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", opacity: bat === false ? 0.55 : 1 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 17 }}>{t.flag}</span>
        <span style={{ fontWeight: 600, fontSize: 14.5, color: T.text }}>{t.short || t.name}</span>
        {bat && <LiveDot size={6} />}
      </span>
      <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontFamily: MONO, fontSize: 15.5, fontWeight: 600, color: t.runs != null ? T.text : T.textFaint }}>{score}</span>
        {t.overs && <span style={{ fontFamily: MONO, fontSize: 11, color: T.textDim }}>{t.overs}</span>}
      </span>
    </div>
  );
}

function MatchCard({ m }) {
  const { go } = useNav();
  const live = m.status === "live", result = m.status === "result";
  return (
    <button onClick={() => go("match", m.id)} style={{ textAlign: "left", width: "100%", background: T.panel, border: `1px solid ${T.line}`, borderRadius: 14, overflow: "hidden", cursor: "pointer", padding: 0, position: "relative" }}>
      {live && <div style={{ position: "absolute", inset: 0, borderRadius: 14, padding: 1, background: `linear-gradient(135deg, ${T.live}55, transparent 40%)`, WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)", WebkitMaskComposite: "xor", maskComposite: "exclude", pointerEvents: "none" }} />}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 13px", borderBottom: `1px solid ${T.lineSoft}` }}>
        <span style={{ display: "flex", gap: 7, alignItems: "center", minWidth: 0 }}>
          <Pill color={T.cyan} bg="#0e2730">{m.format}</Pill>
          <span style={{ fontSize: 11.5, color: T.textDim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.series}</span>
        </span>
        {live ? <span style={{ display: "flex", gap: 5, alignItems: "center" }}><LiveDot /><span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 1, color: T.live }}>LIVE</span></span>
              : <Pill>{result ? "Result" : "Soon"}</Pill>}
      </div>
      <div style={{ padding: "12px 13px", display: "flex", flexDirection: "column", gap: 9 }}>
        <MiniScore t={m.t1} bat={m.t1?.batting} />
        <MiniScore t={m.t2} bat={m.t2?.batting} />
      </div>
      <div style={{ padding: "0 13px 11px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: live ? T.mint : result ? T.textDim : T.amber, fontWeight: 500 }}>{m.statusText}</span>
        {live && m.thisOver && <span style={{ display: "flex", gap: 4 }}>{m.thisOver.map((b, i) => <Ball key={i} v={b} />)}</span>}
      </div>
      {m.pom && <div style={{ padding: "0 13px 11px", fontSize: 11.5, color: T.textDim }}><span style={{ color: T.amber }}>★</span> {m.pom}</div>}
    </button>
  );
}

function LiveFeed() {
  const [filter, setFilter] = useState("Live");
  const [matches, setMatches] = useState(MOCK.matches);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.currentMatches().then(d => { setMatches(d); setLoading(false); }); }, []);
  const visible = matches.filter(m => passes(m, filter));
  const liveN = matches.filter(m => m.status === "live").length;
  return (
    <div>
      <Header title="Crease" sub="Live cricket · every format" right={<div style={{ textAlign: "right" }}><div className={liveN ? "crz-pulse" : ""} style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: T.mint }}>{String(liveN).padStart(2, "0")}</div><div style={{ fontSize: 8.5, letterSpacing: 1.5, color: T.textFaint, textTransform: "uppercase" }}>live now</div></div>} />
      <div style={{ display: "flex", gap: 7, overflowX: "auto", padding: "12px 16px", borderBottom: `1px solid ${T.line}`, position: "sticky", top: 0, background: T.bg, zIndex: 4 }} className="crz-noscroll">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: "7px 14px", borderRadius: 20, border: `1px solid ${filter === f ? T.mint : T.line}`, background: filter === f ? T.mint : "transparent", color: filter === f ? T.bg : T.textDim, fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", fontFamily: SANS, flexShrink: 0 }}>{f}{f === "Live" && <span style={{ marginLeft: 5, fontFamily: MONO }}>{liveN}</span>}</button>
        ))}
      </div>
      <div style={{ padding: "14px 16px 90px", display: "flex", flexDirection: "column", gap: 12 }}>
        {visible.length ? visible.map(m => <MatchCard key={m.id} m={m} />)
          : <Empty title="No matches here" sub="Switch to “All” to see today’s full card." />}
      </div>
    </div>
  );
}

/* ════════════════════════ SCREEN: MATCH DETAIL ═════════════════ */
function MatchDetail({ id }) {
  const { go, back } = useNav();
  const [m, setM] = useState(MOCK.matches.find(x => x.id === id));
  const [tab, setTab] = useState("Live");
  useEffect(() => { api.matchInfo(id).then(setM); }, [id]);
  const live = m && m.status === "live";
  useEffect(() => { if (m && !live) setTab("Scorecard"); }, [live, m]);
  if (!m) return <Empty title="Match not found" />;
  const tabs = live ? ["Live", "Scorecard", "Commentary", "Info"] : ["Scorecard", "Info"];

  return (
    <div>
      <SubHeader onBack={back} title={`${m.t1.short || m.t1.name} v ${m.t2.short || m.t2.name}`} sub={m.note} />
      {/* hero scoreboard */}
      <div style={{ margin: "14px 16px 0", background: `linear-gradient(160deg, ${T.panel2}, ${T.panel})`, border: `1px solid ${T.line}`, borderRadius: 16, padding: 16, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -40, right: -40, width: 140, height: 140, borderRadius: "50%", background: live ? T.live : T.mint, opacity: 0.07, filter: "blur(8px)" }} />
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
          <Pill color={T.cyan} bg="#0e2730">{m.format} · {m.gender === "W" ? "Women" : "Men"}</Pill>
          {live && <span style={{ display: "flex", gap: 5, alignItems: "center" }}><LiveDot /><span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color: T.live }}>LIVE</span></span>}
        </div>
        {[m.t1, m.t2].map((t, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: i === 0 ? 12 : 0, opacity: t.runs == null && live ? 0.5 : 1 }}>
            <span style={{ display: "flex", gap: 10, alignItems: "center" }}><span style={{ fontSize: 26 }}>{t.flag}</span><span style={{ fontSize: 16, fontWeight: 600 }}>{t.name}</span>{t.batting && <LiveDot size={6} />}</span>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 700, color: T.text }}>{t.runs != null ? `${t.runs}/${t.wkts}` : "—"}</div>
              {t.overs && <div style={{ fontFamily: MONO, fontSize: 11, color: T.textDim }}>{t.overs} ov</div>}
            </div>
          </div>
        ))}
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${T.lineSoft}`, fontSize: 13, color: live ? T.mint : T.textDim, fontWeight: 500 }}>{m.statusText}</div>
        {live && (m.crr || m.rrr) && (
          <div style={{ display: "flex", gap: 20, marginTop: 10 }}>
            {m.crr && <Metric label="CRR" value={m.crr} />}
            {m.rrr && <Metric label="REQ" value={m.rrr} color={T.amber} />}
            {m.target && <Metric label="TARGET" value={m.target} />}
          </div>
        )}
      </div>

      {/* tabs */}
      <div style={{ display: "flex", gap: 6, padding: "14px 16px 0", overflowX: "auto" }} className="crz-noscroll">
        {tabs.map(tb => <button key={tb} onClick={() => setTab(tb)} style={{ padding: "8px 14px", borderRadius: 10, border: "none", background: tab === tb ? T.panel2 : "transparent", color: tab === tb ? T.mint : T.textDim, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: SANS, flexShrink: 0 }}>{tb}</button>)}
      </div>

      <div style={{ padding: "14px 16px 90px" }}>
        {tab === "Live" && live && <LiveTab m={m} />}
        {tab === "Scorecard" && <ScorecardTab m={m} />}
        {tab === "Commentary" && <CommentaryTab m={m} />}
        {tab === "Info" && <InfoTab m={m} />}
      </div>
    </div>
  );
}

function Metric({ label, value, color = T.text }) {
  return <div><div style={{ fontSize: 9, letterSpacing: 1, color: T.textFaint }}>{label}</div><div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color }}>{value}</div></div>;
}

function LiveTab({ m }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Section title="At the crease">
        {m.batters?.map(b => (
          <Row key={b.name} left={<span style={{ fontWeight: 600 }}>{b.name}{!b.out && <span style={{ color: T.live }}> *</span>}</span>}
               right={<span style={{ fontFamily: MONO }}>{b.runs} <span style={{ color: T.textDim, fontSize: 11 }}>({b.balls})</span></span>}
               sub={`4s ${b.fours} · 6s ${b.sixes} · SR ${b.sr}`} />
        ))}
      </Section>
      <Section title="Bowling">
        {m.bowlers?.map(b => (
          <Row key={b.name} left={<span style={{ fontWeight: 600 }}>{b.name}</span>}
               right={<span style={{ fontFamily: MONO }}>{b.wkts}/{b.runs}</span>}
               sub={`${b.overs} ov · ${b.maidens} md · econ ${b.econ}`} />
        ))}
      </Section>
      {m.recentOvers && (
        <Section title="Recent overs">
          {m.recentOvers.map(o => (
            <div key={o.ov} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: `1px solid ${T.lineSoft}` }}>
              <span style={{ fontFamily: MONO, fontSize: 11, color: T.textFaint, width: 26 }}>Ov{o.ov}</span>
              <span style={{ display: "flex", gap: 4, flex: 1 }}>{o.balls.map((b, i) => <Ball key={i} v={b} />)}</span>
              <span style={{ fontFamily: MONO, fontSize: 12, color: T.mint, fontWeight: 700 }}>{o.runs}</span>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}

function ScorecardTab({ m }) {
  if (m.t1.runs == null && m.t2.runs == null) return <Empty title="No scorecard yet" sub="Innings haven’t started." />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Section title={`${m.t2.batting ? m.t2.name : m.t1.name} — batting`}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: T.textFaint, padding: "0 0 6px", letterSpacing: 0.5 }}>
          <span>BATTER</span><span style={{ fontFamily: MONO }}>R&nbsp;&nbsp;B&nbsp;&nbsp;4s&nbsp;6s&nbsp;&nbsp;SR</span>
        </div>
        {m.batters?.map(b => (
          <div key={b.name} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${T.lineSoft}` }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{b.name}{!b.out && <span style={{ color: T.live }}> *</span>}</span>
            <span style={{ fontFamily: MONO, fontSize: 12.5, color: T.textDim }}>{b.runs} {b.balls} {b.fours} {b.sixes} <span style={{ color: T.text }}>{b.sr}</span></span>
          </div>
        ))}
      </Section>
      {m.fow && <Section title="Fall of wickets"><div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{m.fow.map((f, i) => <span key={i} style={{ fontFamily: MONO, fontSize: 11, color: T.textDim, background: T.panel2, padding: "4px 8px", borderRadius: 6 }}>{f}</span>)}</div></Section>}
      <Section title="Bowling">
        {m.bowlers?.map(b => (
          <div key={b.name} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${T.lineSoft}` }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{b.name}</span>
            <span style={{ fontFamily: MONO, fontSize: 12.5, color: T.textDim }}>{b.overs}-{b.maidens}-{b.runs}-<span style={{ color: T.mint }}>{b.wkts}</span></span>
          </div>
        ))}
      </Section>
    </div>
  );
}

function CommentaryTab({ m }) {
  const lines = m.recentOvers?.flatMap(o => o.balls.map((b, i) => ({
    ov: `${o.ov}.${i + 1}`, b,
    txt: b === "W" ? "OUT! Edged behind, the keeper does the rest." : b === "4" ? "FOUR — driven crisply through the covers." : b === "6" ? "SIX! Launched over long-on." : b === "·" ? "No run, defended solidly." : `${b} run${b === "1" ? "" : "s"}, worked into the gap.`,
  }))) || [];
  return (
    <div>
      {lines.map((l, i) => (
        <div key={i} style={{ display: "flex", gap: 11, padding: "11px 0", borderBottom: `1px solid ${T.lineSoft}` }}>
          <span style={{ fontFamily: MONO, fontSize: 11, color: T.textFaint, width: 30, flexShrink: 0, paddingTop: 3 }}>{l.ov}</span>
          <Ball v={l.b} />
          <span style={{ fontSize: 13.5, color: T.text, lineHeight: 1.5 }}>{l.txt}</span>
        </div>
      ))}
    </div>
  );
}

function InfoTab({ m }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Section title="Match info">
        <Row left="Series" right={m.series} />
        <Row left="Match" right={m.note} />
        <Row left="Format" right={m.format} />
        <Row left="Venue" right={m.venue} />
        {m.toss && <Row left="Toss" right={m.toss} />}
      </Section>
    </div>
  );
}

/* ════════════════════════ SCREEN: PLAYERS ══════════════════════ */
function Players() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState(MOCK.players);
  useEffect(() => {
    if (!q.trim()) { setResults(MOCK.players); return; }
    const t = setTimeout(() => api.searchPlayer(q).then(setResults), 250);
    return () => clearTimeout(t);
  }, [q]);
  const { go } = useNav();
  return (
    <div>
      <Header title="Players" sub="Search 11,000+ cricketers" />
      <div style={{ padding: "12px 16px", position: "sticky", top: 0, background: T.bg, zIndex: 4, borderBottom: `1px solid ${T.line}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: "11px 14px" }}>
          <span style={{ color: T.textDim }}>⌕</span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search players — e.g. Mandhana, Maxwell" style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: T.text, fontSize: 14.5, fontFamily: SANS }} />
        </div>
      </div>
      <div style={{ padding: "12px 16px 90px", display: "flex", flexDirection: "column", gap: 9 }}>
        {results.length ? results.map(p => (
          <button key={p.id} onClick={() => go("player", p.id)} style={{ display: "flex", alignItems: "center", gap: 13, background: T.panel, border: `1px solid ${T.line}`, borderRadius: 13, padding: "12px 14px", cursor: "pointer", textAlign: "left" }}>
            <span style={{ width: 44, height: 44, borderRadius: 11, background: `linear-gradient(135deg, ${T.mintDim}, ${T.panel2})`, display: "grid", placeItems: "center", fontFamily: MONO, fontWeight: 700, color: T.mint, fontSize: 15, flexShrink: 0 }}>{p.img || p.name.split(" ").map(w => w[0]).join("").slice(0, 2)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{p.name}</div>
              <div style={{ fontSize: 12, color: T.textDim }}>{p.flag} {p.country} · {p.role}</div>
            </div>
            <span style={{ color: T.textFaint }}>›</span>
          </button>
        )) : <Empty title="No players found" sub={`Nothing matches “${q}”.`} />}
      </div>
    </div>
  );
}

function PlayerProfile({ id }) {
  const { back } = useNav();
  const [p, setP] = useState(MOCK.players.find(x => x.id === id));
  const [fmt, setFmt] = useState(null);
  useEffect(() => { api.playerInfo(id).then(d => { setP(d); }); }, [id]);
  const formats = p?.bat ? Object.keys(p.bat) : [];
  const active = fmt || formats[0];
  if (!p) return <Empty title="Player not found" />;
  const s = p.bat?.[active];
  return (
    <div>
      <SubHeader onBack={back} title={p.name} sub={`${p.flag} ${p.country}`} />
      <div style={{ padding: "16px", display: "flex", gap: 15, alignItems: "center" }}>
        <span style={{ width: 76, height: 76, borderRadius: 18, background: `linear-gradient(135deg, ${T.mintDim}, ${T.panel2})`, display: "grid", placeItems: "center", fontFamily: MONO, fontWeight: 700, color: T.mint, fontSize: 26, flexShrink: 0 }}>{p.img}</span>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{p.name}</div>
          <div style={{ fontSize: 13, color: T.textDim, marginTop: 3 }}>{p.role}</div>
          <div style={{ fontSize: 12, color: T.textFaint, marginTop: 6 }}>{p.style} · b. {p.born}</div>
        </div>
      </div>

      {p.ranking && (
        <div style={{ display: "flex", gap: 10, padding: "0 16px 8px" }}>
          {p.ranking.t20 && <RankChip fmt="T20I" rank={p.ranking.t20} />}
          {p.ranking.odi && <RankChip fmt="ODI" rank={p.ranking.odi} />}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, padding: "10px 16px 0" }}>
        {formats.map(f => <button key={f} onClick={() => setFmt(f)} style={{ padding: "7px 15px", borderRadius: 9, border: "none", background: active === f ? T.mint : T.panel2, color: active === f ? T.bg : T.textDim, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: SANS }}>{f}</button>)}
      </div>

      {s && (
        <div style={{ padding: "16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <BigStat label="Matches" value={s.m} />
            <BigStat label="Runs" value={s.runs} accent />
            <BigStat label="Average" value={s.avg} />
            <BigStat label="High score" value={s.hs} />
            <BigStat label="Strike rate" value={s.sr} />
            <BigStat label="100s / 50s" value={`${s.hundreds}/${s.fifties}`} />
          </div>
          <div style={{ marginTop: 18 }}>
            <Section title={`Batting · ${active}`}>
              <Row left="Innings" right={s.m} />
              <Row left="Runs" right={s.runs} />
              <Row left="Highest" right={s.hs} />
              <Row left="Average" right={s.avg} />
              <Row left="Strike rate" right={s.sr} />
              <Row left="Hundreds" right={s.hundreds} />
              <Row left="Fifties" right={s.fifties} />
            </Section>
          </div>
        </div>
      )}
      <div style={{ height: 90 }} />
    </div>
  );
}

function RankChip({ fmt, rank }) {
  return <div style={{ flex: 1, background: T.panel, border: `1px solid ${T.line}`, borderRadius: 11, padding: "10px 12px" }}>
    <div style={{ fontSize: 9.5, color: T.textFaint, letterSpacing: 1 }}>ICC {fmt} RANK</div>
    <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 700, color: rank <= 3 ? T.amber : T.text }}>#{rank}</div>
  </div>;
}

function BigStat({ label, value, accent }) {
  return <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: "13px 12px" }}>
    <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, color: accent ? T.mint : T.text }}>{value}</div>
    <div style={{ fontSize: 10, color: T.textFaint, marginTop: 3, letterSpacing: 0.5 }}>{label}</div>
  </div>;
}

/* ════════════════════════ SCREEN: SERIES / SQUADS ══════════════ */
function SeriesScreen() {
  const [series, setSeries] = useState(MOCK.series);
  const { go } = useNav();
  useEffect(() => { api.series().then(setSeries); }, []);
  return (
    <div>
      <Header title="Series" sub="Tournaments · fixtures · squads" />
      <div style={{ padding: "14px 16px 90px", display: "flex", flexDirection: "column", gap: 11 }}>
        {series.map(s => (
          <button key={s.id} onClick={() => go("series", s.id)} style={{ textAlign: "left", background: T.panel, border: `1px solid ${T.line}`, borderRadius: 14, padding: "15px 15px", cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 15.5, lineHeight: 1.3 }}>{s.name}</div>
                <div style={{ fontSize: 12, color: T.textDim, marginTop: 5 }}>{s.dates} · {s.host}</div>
              </div>
              {s.ongoing && <span style={{ display: "flex", gap: 5, alignItems: "center" }}><LiveDot size={6} /><span style={{ fontSize: 9, fontWeight: 800, color: T.live, letterSpacing: 0.5 }}>ON</span></span>}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 11 }}>
              <Pill>{s.gender === "W" ? "Women" : "Men"}</Pill>
              <Pill>{s.matches} matches</Pill>
              {s.squads?.length > 0 && <Pill color={T.mint} bg={T.mintDim}>{s.squads.length} squads</Pill>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function SeriesDetail({ id }) {
  const { back, go } = useNav();
  const s = MOCK.series.find(x => x.id === id);
  const [tab, setTab] = useState("Squads");
  if (!s) return <Empty title="Series not found" />;
  return (
    <div>
      <SubHeader onBack={back} title={s.name} sub={`${s.dates} · ${s.host}`} />
      <div style={{ display: "flex", gap: 6, padding: "14px 16px 0" }}>
        {["Squads", "Table", "Matches"].map(t => <button key={t} onClick={() => setTab(t)} style={{ padding: "8px 15px", borderRadius: 10, border: "none", background: tab === t ? T.panel2 : "transparent", color: tab === t ? T.mint : T.textDim, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: SANS }}>{t}</button>)}
      </div>
      <div style={{ padding: "14px 16px 90px" }}>
        {tab === "Squads" && (s.squads?.length ? s.squads.map(sq => (
          <div key={sq.team} style={{ marginBottom: 14, background: T.panel, border: `1px solid ${T.line}`, borderRadius: 14, overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: `1px solid ${T.lineSoft}` }}>
              <span style={{ display: "flex", gap: 9, alignItems: "center" }}><span style={{ fontSize: 20 }}>{sq.flag}</span><span style={{ fontWeight: 600, fontSize: 15 }}>{sq.team}</span></span>
              <span style={{ fontSize: 11, color: T.textDim }}>©  {sq.captain.split(" ").slice(-1)}</span>
            </div>
            <div style={{ padding: "11px 14px", display: "flex", flexWrap: "wrap", gap: 7 }}>
              {sq.players.map(pl => <span key={pl} style={{ fontSize: 12.5, color: T.textDim, background: T.panel2, padding: "5px 10px", borderRadius: 7 }}>{pl}</span>)}
            </div>
          </div>
        )) : <Empty title="Squads not announced" sub="Check back closer to the series." />)}
        {tab === "Table" && <PointsTable />}
        {tab === "Matches" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            {MOCK.matches.filter(m => m.series.includes(s.name.split(" 2026")[0].split(" ").slice(0, 3).join(" ")) || s.name.includes(m.series)).map(m => <MatchCard key={m.id} m={m} />)}
            {!MOCK.matches.some(m => s.name.includes(m.series)) && <Empty title="No linked fixtures in demo" sub="Live API returns the full schedule here." />}
          </div>
        )}
      </div>
    </div>
  );
}

function PointsTable() {
  const pt = MOCK.pointsTable;
  return (
    <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 14, overflow: "hidden" }}>
      <div style={{ padding: "12px 14px", borderBottom: `1px solid ${T.lineSoft}`, fontSize: 12.5, fontWeight: 700, color: T.mint }}>{pt.title}</div>
      <div style={{ display: "flex", padding: "8px 14px", fontSize: 10, color: T.textFaint, letterSpacing: 0.5, borderBottom: `1px solid ${T.lineSoft}` }}>
        <span style={{ flex: 1 }}>TEAM</span>
        <span style={{ fontFamily: MONO, width: 130, display: "flex", justifyContent: "space-between" }}><span>P</span><span>W</span><span>L</span><span>PTS</span><span>NRR</span></span>
      </div>
      {pt.rows.map((r, i) => (
        <div key={r.team} style={{ display: "flex", alignItems: "center", padding: "11px 14px", borderBottom: i < pt.rows.length - 1 ? `1px solid ${T.lineSoft}` : "none", background: i < 2 ? `${T.mintDim}22` : "transparent" }}>
          <span style={{ flex: 1, display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
            <span style={{ fontFamily: MONO, fontSize: 11, color: i < 2 ? T.mint : T.textFaint, width: 14 }}>{i + 1}</span>
            <span style={{ fontSize: 16 }}>{r.flag}</span>
            <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.team}</span>
          </span>
          <span style={{ fontFamily: MONO, fontSize: 12, color: T.textDim, width: 130, display: "flex", justifyContent: "space-between" }}>
            <span>{r.p}</span><span>{r.w}</span><span>{r.l}</span><span style={{ color: T.text, fontWeight: 700 }}>{r.pts}</span><span style={{ color: r.nrr.startsWith("+") ? T.mint : T.live, fontSize: 11 }}>{r.nrr}</span>
          </span>
        </div>
      ))}
      <div style={{ padding: "10px 14px", fontSize: 10.5, color: T.textFaint }}>Top 2 (highlighted) advance to the semi-finals.</div>
    </div>
  );
}

/* ════════════════════════ LAYOUT PRIMITIVES ════════════════════ */
function Header({ title, sub, right }) {
  return (
    <div style={{ padding: "20px 16px 14px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: `1px solid ${T.line}` }}>
      <div>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 26, fontWeight: 700, letterSpacing: -0.5, color: T.text }}>{title}</div>
        <div style={{ fontSize: 11, letterSpacing: 1.5, color: T.textFaint, textTransform: "uppercase", marginTop: 3 }}>{sub}</div>
      </div>
      {right}
    </div>
  );
}
function SubHeader({ onBack, title, sub }) {
  return (
    <div style={{ padding: "16px 16px 12px", display: "flex", gap: 13, alignItems: "center", borderBottom: `1px solid ${T.line}`, position: "sticky", top: 0, background: T.bg, zIndex: 6 }}>
      <button onClick={onBack} style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${T.line}`, background: T.panel, color: T.text, fontSize: 17, cursor: "pointer", flexShrink: 0 }}>‹</button>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
        {sub && <div style={{ fontSize: 11.5, color: T.textDim }}>{sub}</div>}
      </div>
    </div>
  );
}
function Section({ title, children }) {
  return <div><div style={{ fontSize: 10.5, letterSpacing: 1, color: T.textFaint, fontWeight: 700, marginBottom: 8, textTransform: "uppercase" }}>{title}</div><div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 13, padding: "4px 14px" }}>{children}</div></div>;
}
function Row({ left, right, sub }) {
  return <div style={{ padding: "10px 0", borderBottom: `1px solid ${T.lineSoft}` }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13.5 }}><span style={{ color: T.text }}>{left}</span><span style={{ color: T.text }}>{right}</span></div>
    {sub && <div style={{ fontFamily: MONO, fontSize: 10.5, color: T.textDim, marginTop: 2 }}>{sub}</div>}
  </div>;
}
function Empty({ title, sub }) {
  return <div style={{ textAlign: "center", padding: "50px 20px", color: T.textDim }}>
    <div style={{ fontSize: 30, marginBottom: 10, opacity: 0.4 }}>◌</div>
    <div style={{ fontSize: 15, fontWeight: 600, color: T.text }}>{title}</div>
    {sub && <div style={{ fontSize: 13, marginTop: 4 }}>{sub}</div>}
  </div>;
}

/* ════════════════════════ TAB BAR ══════════════════════════════ */
const TABS = [
  { id: "feed", label: "Live", icon: "◉" },
  { id: "series", label: "Series", icon: "▤" },
  { id: "players", label: "Players", icon: "⌕" },
];

function TabBar({ active, go }) {
  return (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, maxWidth: 430, margin: "0 auto", display: "flex", background: "rgba(10,14,20,0.85)", backdropFilter: "blur(16px)", borderTop: `1px solid ${T.line}`, padding: "9px 0 calc(9px + env(safe-area-inset-bottom))", zIndex: 20 }}>
      {TABS.map(t => {
        const on = active === t.id;
        return <button key={t.id} onClick={() => go(t.id)} style={{ flex: 1, background: "transparent", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, color: on ? T.mint : T.textFaint }}>
          <span style={{ fontSize: 19 }}>{t.icon}</span>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.3 }}>{t.label}</span>
        </button>;
      })}
    </div>
  );
}

/* ════════════════════════ ROOT / ROUTER ════════════════════════ */
export default function App() {
  const [stack, setStack] = useState([{ screen: "feed" }]);
  const cur = stack[stack.length - 1];
  const rootTab = stack[0].screen;

  const go = (screen, param) => {
    if (TABS.some(t => t.id === screen)) setStack([{ screen }]);
    else setStack(s => [...s, { screen, param }]);
  };
  const back = () => setStack(s => s.length > 1 ? s.slice(0, -1) : s);

  return (
    <Nav.Provider value={{ go, back }}>
      <div style={{ background: T.bg, minHeight: "100vh" }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap');
          *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
          body{margin:0}
          @keyframes crzpulse{0%,100%{opacity:1}50%{opacity:.35}}
          .crz-pulse{animation:crzpulse 1.4s ease-in-out infinite}
          @media (prefers-reduced-motion:reduce){.crz-pulse{animation:none}}
          .crz-noscroll::-webkit-scrollbar{display:none}
          .crz-noscroll{-ms-overflow-style:none;scrollbar-width:none}
          button:focus-visible{outline:2px solid ${T.cyan};outline-offset:2px}
          input{caret-color:${T.mint}}
        `}</style>
        {/* phone frame */}
        <div style={{ maxWidth: 430, margin: "0 auto", minHeight: "100vh", background: T.bg, color: T.text, fontFamily: SANS, position: "relative", paddingBottom: 70, boxShadow: "0 0 80px rgba(0,0,0,0.5)" }}>
          {cur.screen === "feed" && <LiveFeed />}
          {cur.screen === "match" && <MatchDetail id={cur.param} />}
          {cur.screen === "players" && <Players />}
          {cur.screen === "player" && <PlayerProfile id={cur.param} />}
          {cur.screen === "series" && stack.length === 1 && <SeriesScreen />}
          {cur.screen === "series" && stack.length > 1 && <SeriesDetail id={cur.param} />}
          <TabBar active={rootTab} go={go} />
        </div>
      </div>
    </Nav.Provider>
  );
}
