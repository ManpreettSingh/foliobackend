import type { Request, Response, NextFunction } from "express";
import { getDashboard } from "../services/portfolio.service.js";
import { convertCurrency } from "../config/fx.js";
import { generatePortfolioReport, type PortfolioReportInput } from "../services/ai.service.js";

/**
 * POST /portfolios/report/generate
 * Generates an AI-powered portfolio analysis report.
 */
export async function generateReport(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // 1. Get dashboard data
    const dashboard = await getDashboard(userId);

    if (dashboard.holdings.length === 0) {
      return res.status(400).json({ error: "No holdings found. Add some assets to generate a report." });
    }

    // 2. Build structured input for AI
    // Dashboard aggregates are USD-normalized; report displays in INR
    const toInr = (usd: number) => convertCurrency(usd, "USD", "INR");

    const allocationByClass: Record<string, number> = {};
    const allocationBySector: Record<string, number> = {};
    const allocationByRegion: Record<string, number> = {};

    const holdings = dashboard.holdings.map((h) => {
      const quantity = Number(h.quantity);
      // Prices are in the asset's own currency; the report is in INR, so convert them too.
      const avgPrice = convertCurrency(Number(h.averagePurchasePrice), h.asset.currency, "INR");
      const currentPrice = convertCurrency(h.currentPrice, h.asset.currency, "INR");
      const currentValue = toInr(h.currentValue);
      const invested = toInr(h.invested);
      const unrealizedPL = toInr(h.unrealizedProfitLoss);
      const returnPct = invested > 0 ? (unrealizedPL / invested) * 100 : 0;
      const type = h.asset.type;
      const sector = h.asset.sector || inferSectorSimple(h.asset.symbol, h.asset.name, type);
      const region = h.asset.region || inferRegionSimple(h.asset.symbol, type);

      // Aggregate allocations
      allocationByClass[type] = (allocationByClass[type] ?? 0) + currentValue;
      allocationBySector[sector] = (allocationBySector[sector] ?? 0) + currentValue;
      allocationByRegion[region] = (allocationByRegion[region] ?? 0) + currentValue;

      return {
        symbol: h.asset.symbol,
        name: h.asset.name,
        type,
        quantity,
        avgPrice,
        currentPrice,
        invested,
        currentValue,
        unrealizedPL,
        returnPct,
        sector,
        region,
      };
    });

    const reportInput: PortfolioReportInput = {
      totalValue: toInr(dashboard.totalPortfolioValue),
      totalInvested: toInr(dashboard.investedAmount),
      todaysGainLoss: toInr(dashboard.todaysGainLoss),
      overallPL: toInr(dashboard.totalPortfolioValue - dashboard.investedAmount),
      overallPLPct:
        dashboard.investedAmount > 0
          ? ((dashboard.totalPortfolioValue - dashboard.investedAmount) / dashboard.investedAmount) * 100
          : 0,
      holdingsCount: dashboard.holdingsCount,
      currency: "INR", // Default display currency
      holdings,
      allocationByClass,
      allocationBySector,
      allocationByRegion,
    };

    // 3. Generate AI report
    const report = await generatePortfolioReport(reportInput);

    return res.json({ report });
  } catch (err: any) {
    const msg = err.message || "Unknown error";
    if (msg.includes("GEMINI_API_KEY")) {
      return res.status(503).json({ error: "Gemini API key not configured. Please add GEMINI_API_KEY to backend .env file." });
    }
    // The AI service already produces a user-facing message and status for model failures.
    if (typeof err.statusCode === "number") {
      return res.status(err.statusCode).json({ error: msg });
    }
    console.error("[AI Report] Error:", msg);
    return res.status(500).json({ error: "Failed to generate report. Please try again in a moment." });
  }
}

/* ── Lightweight server-side sector/region inference (mirrors frontend sector-map.ts) ── */

function inferSectorSimple(symbol: string, name: string, type: string): string {
  if (type === "CRYPTO") return "Crypto";
  if (type === "ETF") return "ETF";
  if (type === "COMMODITY") return "Commodity";
  if (type === "INDEX") return "Index";
  if (type === "MUTUAL_FUND") return "Mutual Fund";

  const n = name.toLowerCase();
  if (/bank/i.test(n)) return "Banking";
  if (/financ|insurance|capital/i.test(n)) return "Finance";
  if (/tech|software|info|digital|consult/i.test(n)) return "Technology";
  if (/pharma|health|hospital|medic/i.test(n)) return "Healthcare";
  if (/energy|oil|gas|petrol|power/i.test(n)) return "Energy";
  if (/auto|motor|vehicle/i.test(n)) return "Automobile";
  if (/consumer|food|beverage|fmcg/i.test(n)) return "FMCG";
  if (/telecom|commun/i.test(n)) return "Telecom";
  if (/metal|steel|iron|mining/i.test(n)) return "Metals";
  if (/cement/i.test(n)) return "Cement";

  return "Other";
}

function inferRegionSimple(symbol: string, type: string): string {
  if (type === "CRYPTO") return "Global";
  const s = symbol.toUpperCase();
  if (s.endsWith(".NS") || s.endsWith(".BO")) return "India";
  if (s.endsWith(".L")) return "UK";
  if (s.endsWith(".T")) return "Japan";
  return "USA";
}
