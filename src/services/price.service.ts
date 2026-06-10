import { MarketDataService, type PriceQuote } from "./market-data.service.js";

export type { PriceQuote };

export async function getLatestPrice(symbol: string): Promise<PriceQuote> {
  return MarketDataService.getQuote(symbol);
}

export async function getLatestPrices(symbols: string[]): Promise<PriceQuote[]> {
  return MarketDataService.getQuotes(symbols);
}
