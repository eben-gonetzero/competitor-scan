# buyer-media-diet

A CLI tool that maps what media and content buyers in a target market actually consume — publications, newsletters, podcasts, communities, and thought leaders.

Powered by Claude (`claude-sonnet-4-6`) with live web search.

## Setup

```bash
cp .env.example .env
# Paste your ANTHROPIC_API_KEY into .env
npm install
```

## Usage

```bash
node index.mjs "<company or industry>"
```

### Examples

```bash
node index.mjs "DevSecOps"
node index.mjs "Salesforce competitors"
node index.mjs "B2B data enrichment"
node index.mjs "cloud security"
```

## Output

The tool produces a structured report covering:

- **Publications & blogs** buyers read
- **Newsletters** they subscribe to
- **Podcasts** they listen to
- **Communities** (Slack, Discord, Reddit, LinkedIn groups)
- **Analyst reports** they rely on
- **Thought leaders** they follow
- **Events & conferences** they attend

## Requirements

- Node.js 18+
- Anthropic API key with access to `claude-sonnet-4-6`
