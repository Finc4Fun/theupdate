# DIME Advisor Brief Dashboard

A lightweight, open-source briefing dashboard for military advisor teams. Present a monthly
country update across the **DIME** framework (Diplomatic, Informational, Military, Economic)
with an interactive map, live open-source data feeds, a key-leaders reference, and an
LLM-powered research workflow — all from a single static site with **no backend and no build step**.

The dashboard is a blank canvas: it contains no country- or unit-specific data. Everything is
driven by a JSON brief file that you generate each reporting period.

---

## Quick Start

1. **Host it** (see *Deploy to GitHub Pages* below) or just open `index.html` in a browser.
2. Open the **Prompt Lab** tab and fill in your mission details (country, unit, partner unit, location).
   Every research prompt updates automatically and is saved in your browser.
3. Copy the **Full Brief Generator** prompt into any web-enabled LLM (Claude, GPT, Gemini, …).
4. Save the JSON the LLM returns as `brief_YYYYMM.json`.
5. Click **Load JSON** (or drag the file onto the window). The whole dashboard populates.

`brief-template.json` documents every supported field.

## Deploy to GitHub Pages

1. Create a new repository and push these files to the root of the default branch:
   ```
   index.html
   styles.css
   app.js
   brief-template.json
   README.md
   ```
2. In the repository: **Settings → Pages → Source: Deploy from a branch → Branch: main / (root) → Save**.
3. Your dashboard is live at `https://<username>.github.io/<repo>/` within a minute or two.

No build tools, no dependencies to install. Brief JSON files are loaded client-side and are
**never uploaded anywhere** — analysts can load locally saved briefs against the hosted page.

## Features

| Tab | What it does |
|---|---|
| **Overview** | Mission metadata, DIME summaries, and an interactive Leaflet map (drag divider to resize, fullscreen button, dark/light/terrain/satellite layers). Map markers come from your JSON. |
| **Diplomatic / Informational / Military / Economic** | Per-pillar executive summary, stat cards (numbers and hover-tooltip sparklines), optional chart panels, and status items (red/amber/green + trend arrows) each linking to its direct source article. |
| **Prompt Lab** | Mission-config panel + copy-ready research prompts per pillar, a key-leaders prompt, and a one-shot Full Brief Generator that returns the complete JSON. |
| **Key Leaders** | Civilian, military, and partner-unit leadership cards from the `leaders` block. |
| **Resources** | Curated global open-source references by pillar, plus a *Mission-Specific Sources* section and a live RSS feed — both overridable from your JSON (`resources.links`, `resources.feeds`). |

**Live data:** when a brief is loaded, the Informational page pulls 30-day media volume and tone
for `meta.country` from the free [GDELT](https://www.gdeltproject.org/) API. The Resources page
pulls recent articles from RSS feeds (defaults: NATO, ISW, EUvsDisinfo). Both degrade gracefully
on restricted networks — the brief content itself always renders.

**Keyboard shortcuts:** `0` Overview · `←`/`→` cycle DIME pillars · `P` Prompt Lab · `L` Key Leaders · `R` Resources

## JSON Schema (summary)

```jsonc
{
  "meta": {
    "unit": "...", "country": "...", "period": "...",
    "data_fetched": "DD Mon YYYY",        // drives the data-currency badge (green/amber/red by age)
    "classification": "...",
    "partner_unit": "...",                 // shown on the map header and Key Leaders tab
    "map": { "center": [lat, lon], "zoom": 6, "markers": [ {lat, lon, color, symbol, title, notes} ] }
  },
  "dime": {
    "<pillar>": {                          // diplomatic | informational | military | economic
      "summary": "...",
      "stats": [                           // number cards or sparklines
        {"label", "value", "delta", "delta_dir", "type": "number"},
        {"label", "values": [..], "years": [..], "unit", "label_end", "type": "sparkline"}
      ],
      "charts": [ {title, values, years, unit, color, explain} ],   // optional full-width chart panels
      "items":  [ {title, status, trend, notes, link} ]             // status: green|amber|red · trend: up|flat|down
    }
  },
  "leaders":   { "civilian": [...], "military": [...], "unit": [...] },   // {name, title, notes}
  "resources": { "links": [{category, cards:[{tag,title,desc,url}]}], "feeds": [{label,url,color}] }
}
```

Only `meta` and `dime` are required; every other block is optional.
Item `link` values should be **direct article URLs**, not homepages — they render as clickable
source citations on each item.

## Notes & Limits

- **External services** (all free, no keys): Leaflet + CartoDB/Esri map tiles, Google Fonts,
  GDELT, and the AllOrigins CORS proxy for RSS/GDELT fallback. On air-gapped or filtered
  networks these degrade to placeholders; JSON-driven content is unaffected.
- **Classification:** this is an open-source tool for open-source material. The classification
  field is a display label only. Do not put controlled information in brief files hosted on
  public GitHub Pages.
- Mission-config values in the Prompt Lab persist in browser `localStorage` only.

## License

Released as a free resource for advisor teams. Adapt freely.
