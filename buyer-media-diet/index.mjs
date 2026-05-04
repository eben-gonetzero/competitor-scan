import Anthropic from "@anthropic-ai/sdk";
import "dotenv/config";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a B2B market intelligence analyst specializing in buyer behavior and content consumption patterns.

When given a company name or industry vertical, you will research and produce a structured "buyer media diet" report covering:
1. Key publications and blogs buyers in this space read
2. Influential newsletters they subscribe to
3. Podcasts they listen to
4. Communities and forums they participate in (Slack, Discord, Reddit, LinkedIn groups)
5. Analyst reports and research they rely on
6. Social media accounts and thought leaders they follow
7. Events and conferences they attend

Use web search to find current, specific sources. Prioritize sources that buyers (not just vendors) actually engage with.
Format your final output clearly with headers and bullet points.`;

async function runMediaDietResearch(target) {
  process.stdout.write(`\nResearching buyer media diet for: ${target}\n`);
  process.stdout.write("─".repeat(60) + "\n\n");

  const messages = [
    {
      role: "user",
      content: `Research and produce a buyer media diet report for: "${target}"\n\nSearch for the specific publications, newsletters, podcasts, communities, and thought leaders that buyers and practitioners in this space actively consume. Be specific with names and URLs where possible.`,
    },
  ];

  // Agentic loop: keep going until the model stops using tools
  while (true) {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages,
    });

    // Collect text streamed so far for display
    const textBlocks = response.content.filter((b) => b.type === "text");
    const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");

    if (textBlocks.length > 0) {
      for (const block of textBlocks) {
        process.stdout.write(block.text);
      }
    }

    if (response.stop_reason === "end_turn") {
      break;
    }

    if (response.stop_reason === "tool_use" && toolUseBlocks.length > 0) {
      // Show a progress indicator for each search
      for (const toolBlock of toolUseBlocks) {
        if (toolBlock.name === "web_search") {
          process.stdout.write(
            `\n[searching: ${toolBlock.input.query}]\n`
          );
        }
      }

      // Add assistant turn and tool results to continue the loop
      messages.push({ role: "assistant", content: response.content });

      const toolResults = response.content
        .filter((b) => b.type === "tool_result" || b.type === "tool_use")
        .filter((b) => b.type === "tool_use")
        .map((b) => ({
          type: "tool_result",
          tool_use_id: b.id,
          // The SDK handles web_search tool results automatically via the API;
          // we just need to pass an empty content so the loop continues.
          content: [],
        }));

      messages.push({ role: "user", content: toolResults });
    } else {
      // No tools used and not end_turn — shouldn't happen, but bail safely
      break;
    }
  }

  process.stdout.write("\n\n" + "─".repeat(60) + "\n");
  process.stdout.write("Report complete.\n");
}

// ── Entry point ──────────────────────────────────────────────
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error(
    "Usage: node index.mjs <company-name-or-industry>\n" +
      'Example: node index.mjs "DevSecOps"\n' +
      'Example: node index.mjs "Salesforce competitor"\n'
  );
  process.exit(1);
}

const target = args.join(" ");
runMediaDietResearch(target).catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
