# Crease — deploy guide

Get the app live on real cricket data and installed on your phone.
Three stages: secure your key, deploy, install.

---

## 0. First: roll your API key

You pasted a key into a chat. Treat it as burned. Log in to
**cricketdata.org → Member Area** and regenerate the key. Use the
**new** one below. Never put a key in the app code or in any file you
push to GitHub — it goes in Vercel's environment variables only.

The free tier is ~100 hits/day, so the proxy caches responses. Don't
set the refresh interval too low (the app already throttles).

---

## 1. Project layout

```
crease/
├─ api/
│  └─ cric.js          ← serverless proxy (holds key via env var)
├─ public/
│  ├─ manifest.json    ← PWA manifest
│  ├─ sw.js            ← service worker (installability + offline shell)
│  ├─ icon-192.png     ← you add these two (see step 4)
│  └─ icon-512.png
├─ src/
│  ├─ App.jsx          ← the app (same as crease-app.jsx)
│  └─ main.jsx         ← React entry
├─ index.html
├─ package.json
└─ vite.config.js
```

`api/cric.js` is a Vercel serverless function. On Vercel, anything in
`/api` becomes an endpoint automatically — no extra config.

---

## 2. Point the app at your proxy

After your first deploy you'll have a URL like
`https://crease-yourname.vercel.app`. Open **src/App.jsx**, find:

```js
const PROXY = "";
```

and set it to your function URL:

```js
const PROXY = "https://crease-yourname.vercel.app/api/cric";
```

Until you set this, the app runs on bundled mock data — which is why
the preview works with no key. With it set, every screen pulls live.

---

## 3. Deploy to Vercel

**Option A — GitHub (recommended):**
1. Push this folder to a new GitHub repo.
2. vercel.com → **Add New → Project** → import the repo.
3. Framework preset: **Vite**. Build command `npm run build`, output
   `dist`. (Vercel usually detects this.)
4. **Settings → Environment Variables** → add:
   - Name: `CRICAPI_KEY`
   - Value: *your regenerated key*
   - Apply to Production, Preview, Development.
5. Deploy. Then do step 2 with the real URL and redeploy (a git push
   redeploys automatically).

**Option B — CLI:**
```bash
npm i -g vercel
cd crease
vercel            # follow prompts, links the project
vercel env add CRICAPI_KEY    # paste key when asked
vercel --prod
```

Test the proxy directly in a browser:
`https://crease-yourname.vercel.app/api/cric?endpoint=currentMatches`
You should get JSON. If you see "missing CRICAPI_KEY", the env var
isn't set or you didn't redeploy after adding it.

---

## 4. App icons

PWA install needs two PNGs in `/public`: `icon-192.png` (192×192) and
`icon-512.png` (512×512). Any cricket-y square image works — export
from Figma/Canva, or generate at realfavicongenerator.net. Without
them the app still runs; the install prompt just won't fire on some
phones.

---

## 5. Install on your phone

Open the live URL on your phone:
- **iPhone (Safari):** Share → **Add to Home Screen**.
- **Android (Chrome):** menu → **Install app** / **Add to Home
  Screen**, or tap the install banner.

It launches full-screen with no browser chrome, like a native app.

---

## Notes on data depth

CricketData.org free tier covers live scores, match info, players and
series well. Some deep fields (full ball-by-ball commentary, every
fall-of-wicket) live behind their paid tier or aren't always present —
the app degrades gracefully (shows what's available, mock fills gaps).
If you outgrow it, EntitySport or Roanuz give richer ball-by-ball; the
mappers in `App.jsx` are where you'd adapt to a new source.

## Local dev

```bash
npm install
npm run dev      # app at localhost:5173 (mock data)
```
The proxy only runs on Vercel (or `vercel dev`), so local uses mock
unless you point PROXY at your deployed function.
