/**
 * ai.service.ts — Generates portfolio analysis reports using Google Gemini.
 *
 * The API key is read from the GEMINI_API_KEY environment variable.
 * The report is returned as markdown text (~2000–3000 words).
 * Supports model fallback: gemini-2.0-flash → gemini-1.5-flash → gemini-1.5-flash-8b
 */

export interface PortfolioReportInput {
  totalValue: number;
  totalInvested: number;
  todaysGainLoss: number;
  overallPL: number;
  overallPLPct: number;
  holdingsCount: number;
  currency: string;
  holdings: Array<{
    symbol: string;
    name: string;
    type: string;
    quantity: number;
    avgPrice: number;
    currentPrice: number;
    invested: number;
    currentValue: number;
    unrealizedPL: number;
    returnPct: number;
    sector: string;
    region: string;
  }>;
  allocationByClass: Record<string, number>;
  allocationBySector: Record<string, number>;
  allocationByRegion: Record<string, number>;
}

export async function generatePortfolioReport(data: PortfolioReportInput): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set in environment variables. Please add it to your .env file.");
  }

  const holdingsSummary = data.holdings
    .map(
      (h) =>
        `- ${h.symbol} (${h.name}): ${h.type}, Sector: ${h.sector}, Region: ${h.region}, ` +
        `Qty: ${h.quantity}, Avg Price: ${data.currency} ${h.avgPrice.toFixed(2)}, ` +
        `Current: ${data.currency} ${h.currentPrice.toFixed(2)}, ` +
        `Value: ${data.currency} ${h.currentValue.toFixed(2)}, ` +
        `P&L: ${h.unrealizedPL >= 0 ? "+" : ""}${data.currency} ${h.unrealizedPL.toFixed(2)} (${h.returnPct >= 0 ? "+" : ""}${h.returnPct.toFixed(1)}%)`
    )
    .join("\n");

  const classAlloc = Object.entries(data.allocationByClass)
    .map(([k, v]) => `- ${k}: ${((v / data.totalValue) * 100).toFixed(1)}%`)
    .join("\n");

  const sectorAlloc = Object.entries(data.allocationBySector)
    .map(([k, v]) => `- ${k}: ${((v / data.totalValue) * 100).toFixed(1)}%`)
    .join("\n");

  const regionAlloc = Object.entries(data.allocationByRegion)
    .map(([k, v]) => `- ${k}: ${((v / data.totalValue) * 100).toFixed(1)}%`)
    .join("\n");

  const prompt = `You are a professional portfolio analyst. Generate a highly structured, modern, executive-style portfolio analysis report based on the following data.
The report must be concise, data-driven, and designed to be scanned in 2-3 minutes (approx. 500-800 words total). Avoid repetitive text or long explanations.

## Portfolio Data

**Overview:**
- Total Portfolio Value: ${data.currency} ${data.totalValue.toFixed(2)}
- Total Invested: ${data.currency} ${data.totalInvested.toFixed(2)}
- Overall P&L: ${data.overallPL >= 0 ? "+" : ""}${data.currency} ${data.overallPL.toFixed(2)} (${data.overallPLPct >= 0 ? "+" : ""}${data.overallPLPct.toFixed(1)}%)
- Today's Change: ${data.todaysGainLoss >= 0 ? "+" : ""}${data.currency} ${data.todaysGainLoss.toFixed(2)}
- Number of Holdings: ${data.holdingsCount}
- Display Currency: ${data.currency}

**Holdings:**
${holdingsSummary}

**Asset Class Allocation:**
${classAlloc}

**Sector Allocation:**
${sectorAlloc}

**Geographic Allocation:**
${regionAlloc}

## Report Structure
You MUST follow this exact structure with these exact headings. Do not invent other headings. Keep paragraphs short (1-2 sentences max).

### Executive Overview
**Overview Metrics:**
- **Portfolio Value:** ${data.currency} ${data.totalValue.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
- **Total Invested:** ${data.currency} ${data.totalInvested.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
- **Overall P&L:** ${data.overallPL >= 0 ? "+" : ""}${data.currency} ${data.overallPL.toLocaleString("en-IN", { maximumFractionDigits: 2 })} (${data.overallPLPct >= 0 ? "+" : ""}${data.overallPLPct.toFixed(1)}%)
- **Today's Change:** ${data.todaysGainLoss >= 0 ? "+" : ""}${data.currency} ${data.todaysGainLoss.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
- **Overall Rating:** [AI-generated overall rating: e.g. Excellent / Good / Needs Improvement]

[Write a single, concise paragraph summarizing the overall status and composition of the portfolio here]

### Overall Health Score
[Provide individual scores on a scale of 0-10 or High/Medium/Low based on the portfolio data. Format EXACTLY like this list]:
- **Performance:** [Score]/10
- **Diversification:** [Score]/10
- **Risk:** [High / Moderate / Low]
- **Overall Health:** [Score]/10

### Strengths
[List 3 to 6 concise positive bullet points about the portfolio, e.g. outperforming assets, strong return areas, healthy cash balance, etc.]

### Areas That Need Improvement
[List 3 to 6 concise bullet points of areas that need attention, e.g. heavy concentration, lack of sector exposure, currency or geographic bias, etc.]

### Key Risks
[Create a markdown table summarizing the key risks. Must follow this exact table structure]:
| Risk | Severity | Explanation |
| :--- | :--- | :--- |
| [Risk Name] | [High / Medium / Low] | [Concise 1-sentence explanation] |
| [Risk Name] | [High / Medium / Low] | [Concise 1-sentence explanation] |
| [Risk Name] | [High / Medium / Low] | [Concise 1-sentence explanation] |

### AI Recommendations
[List 3 to 5 practical, actionable, educational-only suggestions. Make them specific to this portfolio's asset allocation and holdings, but add a brief disclaimer that this is not financial advice.]

### Top Winners & Losers
[Present a compact markdown table of the top performance contributors and underperformers]:
| Asset | Return % | Contribution to Portfolio |
| :--- | :---: | :---: |
| [Best Performer 1 Name] | [Return %] | [Current Value % of Portfolio] |
| [Best Performer 2 Name] | [Return %] | [Current Value % of Portfolio] |
| [Worst Performer 1 Name] | [Return %] | [Current Value % of Portfolio] |
| [Worst Performer 2 Name] | [Return %] | [Current Value % of Portfolio] |
### Quick Portfolio Metrics
[List the following metrics based on the data. Format EXACTLY like this list]:
- **Diversification Score:** [Score 1-10]
- **Risk Level:** [Low / Moderate / High]
- **Largest Holding:** [Symbol & % size]
- **Number of Assets:** ${data.holdingsCount}
- **Best Performer:** [Symbol & Return %]
- **Worst Performer:** [Symbol & Return %]
- **Expected Volatility:** [Low / Moderate / High]
- **Dominant Asset Class:** [Asset class name & % size]

### Overall Assessment
> [Write a short, professional, 2-3 sentence concluding summary and verdict here summarizing the strengths, key concentration risk warning, and final guidance on rebalancing.]
`;

  // Try multiple models in order of preference (fallback for rate limits)
  const models = [
    "gemini-2.5-flash",
    "gemini-flash-latest",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-flash-8b",
  ];

  let lastError = "";

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    try {
      console.log(`[AI Report] Trying model: ${model}...`);

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8192,
            topP: 0.9,
          },
        }),
      });

      if (response.status === 429) {
        const errorBody = await response.text();
        console.warn(`[AI Report] Model ${model} rate limited (429). Trying next model...`);
        lastError = `Rate limit exceeded for ${model}. `;
        continue; // try next model
      }

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[AI Report] Model ${model} error:`, response.status, errorBody);
        lastError = `${model} returned ${response.status}. `;
        continue; // try next model
      }

      const result = await response.json();

      const text =
        result?.candidates?.[0]?.content?.parts?.[0]?.text ??
        "Unable to generate report. The AI model returned an empty response.";

      console.log(`[AI Report] Successfully generated report using ${model} (${text.length} chars)`);
      return text;
    } catch (err: any) {
      console.error(`[AI Report] Model ${model} fetch error:`, err.message);
      lastError = `${model}: ${err.message}. `;
      continue;
    }
  }

  // All models failed
  throw new Error(
    `All Gemini models exhausted. ${lastError}This is usually a rate limit issue with Google's free tier. ` +
    `Please wait a few minutes and try again, or upgrade your Gemini API plan at https://ai.google.dev/pricing`
  );
}

