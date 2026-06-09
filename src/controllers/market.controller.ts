import type { Request, Response } from "express";
import { MarketDataService } from "../services/market-data.service.js";
import { NewsService } from "../services/news.service.js";
import { HttpError } from "../utils/http-error.js";

export async function quote(req: Request, res: Response) {
  const symbol = String(req.params.symbol ?? "").trim().toUpperCase();
  if (!symbol) throw new HttpError(400, "Symbol is required");
  const data = await MarketDataService.getQuote(symbol);
  res.json(data);
}

export async function batchQuotes(req: Request, res: Response) {
  const symbols = req.query.symbols;
  if (typeof symbols !== "string" || !symbols.trim()) {
    throw new HttpError(400, "Provide a comma-separated list of symbols via ?symbols=AAPL,MSFT");
  }
  const list = symbols.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (list.length === 0) throw new HttpError(400, "At least one symbol is required");
  if (list.length > 50) throw new HttpError(400, "Maximum 50 symbols per request");
  const quotes = await MarketDataService.getQuotes(list);
  res.json({ quotes });
}

export async function searchAssets(req: Request, res: Response) {
  const q = String(req.query.q ?? "").trim();
  if (!q) throw new HttpError(400, "Search query (q) is required");
  if (q.length > 50) throw new HttpError(400, "Query too long (max 50 characters)");
  const results = await MarketDataService.searchAssets(q);
  res.json({ assets: results });
}

export async function history(req: Request, res: Response) {
  const symbol = String(req.params.symbol ?? "").trim().toUpperCase();
  if (!symbol) throw new HttpError(400, "Symbol is required");
  const days = Math.min(Math.max(parseInt(String(req.query.days ?? "30"), 10) || 30, 1), 365);
  const data = await MarketDataService.getHistory(symbol, days);
  res.json({ symbol, days, history: data });
}

export async function news(req: Request, res: Response) {
  const q = String(req.query.q ?? "").trim();
  if (!q) throw new HttpError(400, "Query (q) is required");
  const data = await NewsService.getNewsForQuery(q);
  res.json({ news: data });
}
