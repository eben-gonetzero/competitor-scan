# Buyer Media Diet — Competitive Ad Intelligence

A CLI that takes one customer domain, infers their two most direct competitors, pulls live ad intelligence from LinkedIn Ad Library and Google Ads Transparency Center, and synthesizes positioning whitespace.

Built for CleanTech GrowthLab. Part of the Satellite signal intelligence series.

## What it does

```
loopbacksystems.com
        │
        ▼
   [1] Customer analysis           → who they are, what they sell
        │
        ▼
   [2] Competitor inference        → top 2 direct competitors with reasoning
        │
        ▼
   [3] User confirmation           → accept / replace / edit
        │
        ▼
   [4] Ad intelligence pull        → LinkedIn, Google, search ads (per competitor)
        │
        ▼
   [5] Whitespace synthesis        → saturated angles, undefended pain points,
                                     creative direction, channel strategy
        │
        ▼
   ./out/<domain>/
        ├── report.json            → full structured data
        ├── report.md              → readable strategic narrative
        └── competitor-N-*.json    → per-competitor raw intelligence
```

## Setup

You need Node.js 18+ and an Anthropic API key.

```bash
# 1. Install dependencies
npm install

# 2. Add your API key
cp .env.example .env
# Edit .env and paste your key

# 3. Run
node index.mjs loopbacksystems.com
```

## Stress-testing on Loopback

```bash
node index.mjs loopbacksystems.com
```

The tool will analyze Loopback's positioning, suggest two direct competitors (likely something like Camus Energy and Sense / Bidgely / similar grid-software peers), prompt you to confirm or replace them, then pull ads on each. The final synthesis tells you what messaging space is open for Loopback to claim.

## Confirmation step

When the tool suggests two competitors, you get four options:

- `[Enter]` or `y` — accept both
- `edit` — step through each and replace by typing a new domain
- `q` — quit

## Output

Everything lands in `./out/<domain-with-dashes>/`:

- **`report.json`** — the complete pipeline output. Drop this directly into the `BuyerMediaDiet` React artifact for client-facing visualization.
- **`report.md`** — readable narrative report. Send to clients, paste into Notion, or include in audit deliverables.
- **`competitor-1-*.json`** and **`competitor-2-*.json`** — per-competitor raw intelligence (messaging angles, ads found, funnel distribution).

## How the data is sourced

The tool uses Claude's web search to query:

1. `linkedin.com/ad-library` — LinkedIn's public ad library
2. `adstransparency.google.com` — Google's Ads Transparency Center
3. Direct Google searches for the company name to surface visible search ads
4. Marketing case studies, press releases, and articles that quote ad copy

Coverage varies by competitor. The output includes a `data_quality` field (`high` / `medium` / `low`) so you can see how much was actually findable. Companies that advertise heavily on LinkedIn produce richer reports than those running primarily on dark social or events.

## Known limitations

- Web search returns synthesized text, not raw HTML — some ad creative formats (video, carousel) won't have full visibility
- Google Ads Transparency Center is harder to scrape than LinkedIn; data quality on Google often skews lower
- Companies with no recent paid activity will return sparse reports — this is a true negative, not a tool failure

## Where this fits in the stack

This is a Satellite-series tool. Sits alongside the GTM Value Scan and feeds into Channel Precision work. Run it before any new client engagement to ground the campaign brief in the actual buyer media diet, not assumed positioning.

## Iterating on the prompts

The four prompts (customer analysis, competitor inference, ad intelligence, whitespace synthesis) are inline in `index.mjs`. Edit them in place. The JSON schemas are explicit, so changes propagate predictably.
