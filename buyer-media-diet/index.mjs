#!/usr/bin/env node
/**
 * Buyer Media Diet — Competitive Ad Intelligence CLI
 *
 * Usage: node index.mjs <customer-domain>
 * Example: node index.mjs loopbacksystems.com
 *
 * Pipeline:
 *   1. Analyze customer domain
 *   2. Infer 2 direct competitors
 *   3. User confirms / corrects
 *   4. Pull ad intelligence on each competitor
 *   5. Synthesize whitespace + positioning recommendations
 *   6. Write JSON + markdown reports
 */

import Anthropic from "@anthropic-ai/sdk";
import "dotenv/config";
import readline from "node:readline/promises";
import fs from "node:fs/promises";
import path from "node:path";

// ────────────────────────────────────────────────────────────────────
// CONFIG
// ────────────────────────────────────────────────────────────────────
const MODEL = process.env.MODEL || "claude-sonnet-4-5";
const OUT_DIR = "./out";
const MAX_SEARCHES_INFERENCE = 6;
const MAX_SEARCHES_INTEL = 12;

const client = new Anthropic();

// ────────────────────────────────────────────────────────────────────
// TERMINAL HELPERS
// ────────────────────────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m", dim: "\x1b[2m", bold: "\x1b[1m",
  amber: "\x1b[38;5;214m", green: "\x1b[38;5;42m",
  red: "\x1b[38;5;203m", cyan: "\x1b[38;5;81m", grey: "\x1b[38;5;245m"
};

const log = {
  header: (s) => console.log(`\n${c.amber}${c.bold}${s}${c.reset}`),
  step: (n, total, s) => console.log(`\n${c.amber}[${n}/${total}]${c.reset} ${c.bold}${s}${c.reset}`),
  ok: (s) => console.log(`     ${c.green}✓${c.reset} ${s}`),
  info: (s) => console.log(`     ${c.dim}↳${c.reset} ${c.grey}${s}${c.reset}`),
  warn: (s) => console.log(`     ${c.amber}!${c.reset} ${s}`),
  err: (s) => console.log(`     ${c.red}✗${c.reset} ${s}`),
  raw: (s) => console.log(s),
};

const banner = () => {
  log.raw(`
${c.amber}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}
${c.amber}${c.bold}  📡  BUYER MEDIA DIET${c.reset}${c.dim}  ·  v0.1${c.reset}
${c.dim}      Competitive Ad Intelligence  ·  CleanTech GrowthLab${c.reset}
${c.amber}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
};

// ────────────────────────────────────────────────────────────────────
// CORE: CLAUDE API CALL WITH WEB SEARCH
// ────────────────────────────────────────────────────────────────────
async function callClaude({ system, prompt, maxSearches = 8 }) {
  const tools = maxSearches > 0
    ? [{ type: "web_search_20250305", name: "web_search", max_uses: maxSearches }]
    : [];
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system,
    ...(tools.length > 0 && { tools }),
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const searches = response.content.filter((b) => b.type === "server_tool_use").length;

  return { text, searches, usage: response.usage };
}

function parseJSON(text, label = "response") {
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error(`No JSON object found in ${label}`);
  }
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch (e) {
    throw new Error(`Invalid JSON in ${label}: ${e.message}`);
  }
}

// ────────────────────────────────────────────────────────────────────
// STAGE 1 — CUSTOMER ANALYSIS
// ────────────────────────────────────────────────────────────────────
async function analyzeCustomer(domain) {
  const system = `You are a B2B market analyst. You are precise and never make things up. If you cannot find information, say so explicitly in the relevant field. Return ONLY a raw JSON object — no markdown fences, no preamble.`;

  const prompt = `Use web search to research the company at ${domain}. Visit their website if possible. Determine:
- The actual company name
- What product or service they sell (be specific — what does the software/hardware/service actually do?)
- Their primary buyer persona (industry, role, company size, segment)
- Their go-to-market stage (early/growth/mature)
- Any unique positioning or category language they use

Return JSON in this exact schema:
{
  "domain": "${domain}",
  "company_name": "...",
  "product_summary": "1-2 sentences describing what they actually sell",
  "target_buyer": "Industry + role + scale",
  "industry_segment": "Specific segment, not generic — e.g. 'distribution grid software for electric cooperatives', not 'energy software'",
  "category_language": "How they describe their category in their own words",
  "stage_estimate": "early|growth|mature"
}`;

  log.info("Visiting domain and researching company...");
  const { text, searches } = await callClaude({ system, prompt, maxSearches: MAX_SEARCHES_INFERENCE });
  const data = parseJSON(text, "customer analysis");
  log.ok(`${data.company_name} — ${data.industry_segment}`);
  log.info(`${data.product_summary}`);
  log.info(`Buyer: ${data.target_buyer}`);
  log.info(`(${searches} searches used)`);
  return data;
}

// ────────────────────────────────────────────────────────────────────
// STAGE 2 — COMPETITOR INFERENCE
// ────────────────────────────────────────────────────────────────────
async function inferCompetitors(customer) {
  const system = `You are a B2B competitive intelligence analyst. You identify TRUE direct competitors, not loose adjacencies. A direct competitor must (1) sell to the same buyer persona, (2) solve the same problem, and (3) operate at a comparable stage/scale. You never include category-defining incumbents 100x larger unless that's genuinely the closest match. Return ONLY raw JSON.`;

  const prompt = `Customer profile:
${JSON.stringify(customer, null, 2)}

Use web search to identify the TWO most direct competitors of ${customer.company_name}.

CRITERIA for "direct competitor":
- Same buyer (same industry segment, same buyer role)
- Same problem solved (not just same broad category)
- Comparable stage and scale — avoid massive incumbents unless genuinely closest

Search strategies to use:
- "alternatives to ${customer.company_name}"
- "${customer.industry_segment} companies"
- "${customer.category_language || customer.product_summary} vendors"
- Any analyst reports, comparison articles, or G2/Capterra-style listings

Return JSON in this exact schema:
{
  "competitors": [
    {
      "rank": 1,
      "company_name": "...",
      "domain": "exact root domain like example.com (no https, no www)",
      "reasoning": "Specifically why this is a direct competitor — 2 sentences"
    },
    {
      "rank": 2,
      "company_name": "...",
      "domain": "...",
      "reasoning": "..."
    }
  ],
  "rejected_alternatives": ["Names of bigger/adjacent companies you considered but excluded, with one-line reason each"]
}`;

  log.info("Searching for direct competitors...");
  const { text, searches } = await callClaude({ system, prompt, maxSearches: MAX_SEARCHES_INFERENCE });
  const data = parseJSON(text, "competitor inference");
  data.competitors.forEach((comp) => {
    log.ok(`${c.bold}${comp.company_name}${c.reset} (${comp.domain})`);
    log.info(comp.reasoning);
  });
  if (data.rejected_alternatives?.length) {
    log.info(`Considered but rejected: ${data.rejected_alternatives.join("; ")}`);
  }
  log.info(`(${searches} searches used)`);
  return data;
}

// ────────────────────────────────────────────────────────────────────
// STAGE 3 — USER CONFIRMATION
// ────────────────────────────────────────────────────────────────────
async function confirmCompetitors(suggested) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log(`\n${c.amber}${c.bold}  Confirm competitor selection:${c.reset}`);
  suggested.competitors.forEach((comp, i) => {
    console.log(`    ${c.cyan}${i + 1}.${c.reset} ${c.bold}${comp.company_name}${c.reset} ${c.dim}(${comp.domain})${c.reset}`);
  });

  console.log(`\n  ${c.dim}Options:${c.reset}`);
  console.log(`    ${c.green}[Enter]${c.reset} or ${c.green}y${c.reset}  → Accept both`);
  console.log(`    ${c.amber}edit${c.reset}        → Replace one or both`);
  console.log(`    ${c.red}q${c.reset}           → Quit`);

  const answer = (await rl.question(`\n  ${c.amber}>${c.reset} `)).trim().toLowerCase();

  if (answer === "q") { rl.close(); process.exit(0); }
  if (answer === "" || answer === "y" || answer === "yes") { rl.close(); return suggested.competitors; }

  if (answer === "edit") {
    const result = [];
    for (let i = 0; i < 2; i++) {
      const current = suggested.competitors[i];
      const replace = (await rl.question(`  Replace #${i + 1} (${current.company_name})? Enter new domain or press Enter to keep: `)).trim();
      if (replace) {
        result.push({
          rank: i + 1,
          company_name: replace.replace(/\.[a-z]+$/, "").replace(/[^a-z0-9]/gi, " ").trim(),
          domain: replace.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""),
          reasoning: "User-supplied replacement",
        });
      } else {
        result.push(current);
      }
    }
    rl.close();
    return result;
  }

  rl.close();
  return suggested.competitors;
}

// ────────────────────────────────────────────────────────────────────
// STAGE 4 — AD INTELLIGENCE PULL (PER COMPETITOR)
// ────────────────────────────────────────────────────────────────────
async function pullAdIntel(competitor) {
  const system = `You are a B2B competitive advertising intelligence analyst specializing in cleantech and climate tech. You search advertising libraries, find real ad copy, and map it to messaging strategy. You only report ads you can actually find evidence of. If a channel has no findings, say so. Return ONLY raw JSON — no markdown.`;

  const prompt = `Pull all available advertising intelligence on ${competitor.company_name} (${competitor.domain}).

REQUIRED SEARCH STRATEGY — use all of these:
1. Search "site:linkedin.com/ad-library ${competitor.company_name}"
2. Search "${competitor.company_name} linkedin ads"
3. Search "site:adstransparency.google.com ${competitor.company_name}"
4. Search "${competitor.company_name} google ads"
5. Search "${competitor.company_name}" directly to surface any visible search ads
6. Search "${competitor.company_name} advertising campaign" or marketing case studies

For every ad or copy snippet you can verify, capture: channel, headline, body, CTA, source URL. Quote exact copy where available.

Then analyze the messaging strategy and return JSON in this exact schema:
{
  "competitor": "${competitor.company_name}",
  "domain": "${competitor.domain}",
  "data_quality": "high|medium|low — how much ad copy was actually findable",
  "narrative_positioning": "2-3 sentences on the mental model they're building in buyers' minds",
  "total_ads_found": <integer>,
  "channels_covered": ["LinkedIn", "Google", ...],
  "messaging_angles": [
    {
      "angle_name": "short name",
      "description": "what this angle is doing strategically",
      "example_copy": "exact quote from ad",
      "funnel_stage": "awareness|consideration|decision",
      "campaign_objective": "what they want the buyer to do"
    }
  ],
  "buyer_pain_points": ["specific pain points addressed"],
  "ctas": [
    { "text": "...", "type": "awareness|lead-gen|demo|content", "relative_frequency": 0.0-1.0 }
  ],
  "funnel_distribution": { "awareness": 0-100, "consideration": 0-100, "decision": 0-100 },
  "raw_ads": [
    { "source": "LinkedIn|Google|Meta|Other", "headline": "...", "body": "...", "cta": "...", "url": "..." }
  ],
  "strategic_insight": "1-2 sentences: what does this competitor's media diet tell us about the buyer's frame of reference?"
}

If you cannot find ad copy on a channel, set total_ads_found accordingly and note data_quality honestly. Do not fabricate ads.`;

  log.info(`Searching LinkedIn Ad Library, Google Transparency, search ads...`);
  const { text, searches } = await callClaude({ system, prompt, maxSearches: MAX_SEARCHES_INTEL });
  const data = parseJSON(text, `${competitor.company_name} ad intel`);
  log.ok(`${data.total_ads_found} ads found · data quality: ${data.data_quality} · ${data.messaging_angles.length} angles`);
  log.info(`(${searches} searches used)`);
  return data;
}

// ────────────────────────────────────────────────────────────────────
// STAGE 5 — WHITESPACE SYNTHESIS
// ────────────────────────────────────────────────────────────────────
async function synthesizeWhitespace(customer, intelReports) {
  const system = `You are a B2B positioning strategist for cleantech companies. Given competitive ad intelligence on direct competitors, you identify the saturated angles (avoid), undefended pain points (claim), and concrete positioning + channel implications. Be opinionated, specific, and grounded in the evidence. Return ONLY raw JSON.`;

  const prompt = `CUSTOMER:
${JSON.stringify(customer, null, 2)}

COMPETITOR INTELLIGENCE:
${intelReports.map((r, i) => `--- COMPETITOR ${i + 1} ---\n${JSON.stringify(r, null, 2)}`).join("\n\n")}

Synthesize the buyer's media diet and identify positioning whitespace for ${customer.company_name}.

Return JSON in this exact schema:
{
  "buyer_frame_summary": "3 sentences: based on what the buyer has already been exposed to from competitors, what mental model do they likely already hold? What pain points have already been activated? What objections will already be in their head?",
  "shared_angles": [
    { "angle": "...", "evidence": "Used by both X and Y" }
  ],
  "saturated_pain_points": ["Pain points the buyer has been hammered on — diminishing returns to repeat"],
  "undefended_pain_points": ["Real buyer pain points that NO competitor is meaningfully addressing in their ads"],
  "creative_whitespace": [
    {
      "angle": "Specific angle the customer could own",
      "rationale": "Why this is open and why it would land",
      "channel_implication": "Which channels this should be tested on first and what the campaign objective should be",
      "creative_direction": "1-2 sentences of creative brief"
    }
  ],
  "objections_to_pre_handle": ["Objections the buyer will likely have because of competitor messaging — these need air cover in the customer's funnel"],
  "channel_strategy": "2-3 sentences on funnel stage focus the customer should choose given competitor distribution"
}`;

  log.info("Comparing angles, mapping whitespace, drafting positioning recommendations...");
  const { text } = await callClaude({ system, prompt, maxSearches: 0 });
  const data = parseJSON(text, "whitespace synthesis");
  log.ok(`${data.creative_whitespace.length} whitespace opportunities identified`);
  return data;
}

// ────────────────────────────────────────────────────────────────────
// OUTPUT WRITER
// ────────────────────────────────────────────────────────────────────
function makeMarkdownReport(customer, competitors, intelReports, synthesis) {
  const lines = [];
  const push = (s = "") => lines.push(s);

  push(`# Buyer Media Diet — ${customer.company_name}`);
  push();
  push(`> Competitive ad intelligence and positioning whitespace analysis`);
  push(`> Generated ${new Date().toISOString().split("T")[0]} · CleanTech GrowthLab · Satellite Series`);
  push();
  push(`---`);
  push();

  push(`## Customer`);
  push();
  push(`**${customer.company_name}** (${customer.domain})`);
  push();
  push(customer.product_summary);
  push();
  push(`- **Buyer:** ${customer.target_buyer}`);
  push(`- **Segment:** ${customer.industry_segment}`);
  push(`- **Stage:** ${customer.stage_estimate}`);
  push();

  push(`## Buyer's Existing Frame of Reference`);
  push();
  push(synthesis.buyer_frame_summary);
  push();

  push(`## Competitors Analyzed`);
  push();
  competitors.forEach((comp, i) => {
    const intel = intelReports[i];
    push(`### ${i + 1}. ${comp.company_name} (${comp.domain})`);
    push();
    push(`*Why direct:* ${comp.reasoning}`);
    push();
    push(`**Narrative positioning:** ${intel.narrative_positioning}`);
    push();
    push(`**Funnel distribution:** Awareness ${intel.funnel_distribution.awareness}% · Consideration ${intel.funnel_distribution.consideration}% · Decision ${intel.funnel_distribution.decision}%`);
    push();
    push(`**Top angles:**`);
    intel.messaging_angles.slice(0, 5).forEach((a) => {
      push(`- *${a.angle_name}* (${a.funnel_stage}) — ${a.description}`);
      if (a.example_copy) push(`  > "${a.example_copy}"`);
    });
    push();
    push(`**Strategic read:** ${intel.strategic_insight}`);
    push();
    push(`*Data quality: ${intel.data_quality} · ${intel.total_ads_found} ads · channels: ${intel.channels_covered.join(", ")}*`);
    push();
  });

  push(`## Saturated Pain Points`);
  push(`*The buyer has already been hammered on these — diminishing returns to repeat.*`);
  push();
  synthesis.saturated_pain_points.forEach((p) => push(`- ${p}`));
  push();

  push(`## Undefended Pain Points`);
  push(`*Real pain points that no competitor is addressing meaningfully — claim these.*`);
  push();
  synthesis.undefended_pain_points.forEach((p) => push(`- ${p}`));
  push();

  push(`## Creative Whitespace`);
  push();
  synthesis.creative_whitespace.forEach((w, i) => {
    push(`### ${i + 1}. ${w.angle}`);
    push();
    push(`**Why this is open:** ${w.rationale}`);
    push();
    push(`**Channel & objective:** ${w.channel_implication}`);
    push();
    push(`**Creative direction:** ${w.creative_direction}`);
    push();
  });

  push(`## Objections to Pre-Handle`);
  push(`*The buyer will arrive carrying these because of competitor messaging — give them air cover in your funnel.*`);
  push();
  synthesis.objections_to_pre_handle.forEach((o) => push(`- ${o}`));
  push();

  push(`## Channel Strategy Recommendation`);
  push();
  push(synthesis.channel_strategy);
  push();

  return lines.join("\n");
}

async function writeOutputs(customer, competitors, intelReports, synthesis) {
  const slug = customer.domain.replace(/\./g, "-");
  const dir = path.join(OUT_DIR, slug);
  await fs.mkdir(dir, { recursive: true });

  const fullReport = {
    generated_at: new Date().toISOString(),
    customer,
    competitors,
    intel_reports: intelReports,
    synthesis,
  };

  await fs.writeFile(path.join(dir, "report.json"), JSON.stringify(fullReport, null, 2));
  await fs.writeFile(path.join(dir, "report.md"), makeMarkdownReport(customer, competitors, intelReports, synthesis));

  for (let i = 0; i < intelReports.length; i++) {
    const compSlug = competitors[i].domain.replace(/\./g, "-");
    await fs.writeFile(
      path.join(dir, `competitor-${i + 1}-${compSlug}.json`),
      JSON.stringify(intelReports[i], null, 2)
    );
  }

  return dir;
}

// ────────────────────────────────────────────────────────────────────
// MAIN
// ────────────────────────────────────────────────────────────────────
async function main() {
  banner();

  const domain = process.argv[2];
  if (!domain) {
    log.err("Usage: node index.mjs <customer-domain>");
    log.info("Example: node index.mjs loopbacksystems.com");
    process.exit(1);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    log.err("ANTHROPIC_API_KEY not set. Add it to .env or export it.");
    process.exit(1);
  }

  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");

  try {
    log.step(1, 5, `Analyzing customer: ${cleanDomain}`);
    const customer = await analyzeCustomer(cleanDomain);

    log.step(2, 5, "Inferring direct competitors");
    const suggested = await inferCompetitors(customer);

    log.step(3, 5, "Awaiting confirmation");
    const competitors = await confirmCompetitors(suggested);

    log.step(4, 5, "Pulling ad intelligence");
    const intelReports = [];
    for (const comp of competitors) {
      console.log(`\n  ${c.cyan}→ ${comp.company_name}${c.reset}`);
      intelReports.push(await pullAdIntel(comp));
    }

    log.step(5, 5, "Synthesizing positioning whitespace");
    const synthesis = await synthesizeWhitespace(customer, intelReports);

    const outDir = await writeOutputs(customer, competitors, intelReports, synthesis);

    log.raw(`\n${c.green}${c.bold}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
    log.raw(`${c.green}${c.bold}  ✓  Intelligence report complete${c.reset}`);
    log.raw(`${c.green}${c.bold}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}\n`);
    log.raw(`  Outputs:`);
    log.raw(`    ${c.dim}•${c.reset} ${outDir}/report.json`);
    log.raw(`    ${c.dim}•${c.reset} ${outDir}/report.md`);
    log.raw(`    ${c.dim}•${c.reset} ${outDir}/competitor-*.json`);
    log.raw();
  } catch (err) {
    log.err(`Pipeline failed: ${err.message}`);
    if (process.env.DEBUG) console.error(err);
    process.exit(1);
  }
}

main();
