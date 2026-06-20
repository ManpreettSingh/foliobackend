const fs = require('fs');
const path = './src/services/market-data.service.ts';
let code = fs.readFileSync(path, 'utf8');

// Add import
if (!code.includes('import yahooFinance')) {
  code = code.replace('import { env } from "../config/env.js";', 'import { env } from "../config/env.js";\nimport yahooFinance from "yahoo-finance2";\nyahooFinance.suppressNotices(["yahooSurvey"]);');
}

// Replace YahooFinanceProvider
const startMarker = '// ─── Yahoo Finance Provider (uses v8/finance/chart — no auth needed) ─────';
const endMarker = '// ─── Hybrid Data Provider';

const startIndex = code.indexOf(startMarker);
const endIndex = code.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
  console.log("Could not find markers!");
  process.exit(1);
}

const newProvider = `// ─── Yahoo Finance Provider (uses yahoo-finance2) ─────────────────────────
class YahooFinanceProvider implements MarketDataProvider {
  private priceCache: Map<string, { quote: PriceQuote; timestamp: number }> = new Map();
  private resolvedSymbolCache: Map<string, string> = new Map();
  private cacheTtl = 60 * 1000; // 60 seconds

  private async resolveYahooSymbol(symbol: string): Promise<string> {
    const upper = symbol.toUpperCase().trim();
    const cached = this.resolvedSymbolCache.get(upper);
    if (cached) return cached;
    
    if (upper.includes(".") || upper.includes("-")) {
      this.resolvedSymbolCache.set(upper, upper);
      return upper;
    }

    try {
      await yahooFinance.quote(upper);
      this.resolvedSymbolCache.set(upper, upper);
      return upper;
    } catch {
      const nsSymbol = \`\${upper}.NS\`;
      try {
        await yahooFinance.quote(nsSymbol);
        this.resolvedSymbolCache.set(upper, nsSymbol);
        return nsSymbol;
      } catch {
        this.resolvedSymbolCache.set(upper, upper);
        return upper;
      }
    }
  }

  private fallbackQuote(symbol: string): PriceQuote {
    const stale = this.priceCache.get(symbol);
    if (stale) return stale.quote;
    return { symbol, price: 0, changePercent: 0, asOf: new Date().toISOString() };
  }

  private async fetchQuote(symbol: string, bypassCache = false): Promise<PriceQuote> {
    const upperInput = symbol.toUpperCase().trim();
    const cached = this.priceCache.get(upperInput);
    const open = isMarketOpen(upperInput);

    if (cached && (!open || (!bypassCache && (Date.now() - cached.timestamp < this.cacheTtl)))) {
      return cached.quote;
    }

    try {
      const yahooSymbol = await this.resolveYahooSymbol(upperInput);
      const data = await yahooFinance.quote(yahooSymbol);
      if (!data || data.regularMarketPrice == null) {
        return this.fallbackQuote(upperInput);
      }

      const price = data.regularMarketPrice;
      const prevClose = data.regularMarketPreviousClose ?? price;
      const change = price - prevClose;
      const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0;

      const quote: PriceQuote = {
        symbol: upperInput,
        price: Math.round(price * 100) / 100,
        changePercent: Math.round(changePercent * 100) / 100,
        asOf: new Date().toISOString(),
        currency: data.currency ? data.currency.toUpperCase() : "USD",
      };

      this.priceCache.set(upperInput, { quote, timestamp: Date.now() });
      console.log(\`[YahooFinance2] \${upperInput} (\${yahooSymbol}): \${quote.price} (\${quote.changePercent > 0 ? "+" : ""}\${quote.changePercent}%)\`);
      return quote;
    } catch (err) {
      console.error(\`[YahooFinance2] Error fetching \${upperInput}:\`, err);
      return this.fallbackQuote(upperInput);
    }
  }

  async getQuote(symbol: string, bypassCache = false): Promise<PriceQuote> {
    return this.fetchQuote(symbol, bypassCache);
  }

  async getQuotes(symbols: string[], bypassCache = false): Promise<PriceQuote[]> {
    if (symbols.length === 0) return [];
    return Promise.all(symbols.map((s) => this.fetchQuote(s, bypassCache)));
  }

  async searchAssets(query: string): Promise<AssetSearchResult[]> {
    if (!query) return [];
    try {
      const data = await yahooFinance.search(query, { quotesCount: 15, newsCount: 0 });
      const quotes = data.quotes || [];

      return quotes
        .filter((q: any) => 
          q.quoteType === "EQUITY" || 
          q.quoteType === "ETF" || 
          q.quoteType === "MUTUALFUND" || 
          q.quoteType === "INDEX" || 
          q.quoteType === "COMMODITY" || 
          q.quoteType === "FUTURE" ||
          q.quoteType === "CRYPTOCURRENCY"
        )
        .map((q: any) => {
          let type = "STOCK";
          if (q.quoteType === "CRYPTOCURRENCY") type = "CRYPTO";
          else if (q.quoteType === "ETF") type = "ETF";
          else if (q.quoteType === "MUTUALFUND") type = "MUTUAL_FUND";
          else if (q.quoteType === "INDEX") type = "INDEX";
          else if (q.quoteType === "COMMODITY" || q.quoteType === "FUTURE") type = "COMMODITY";

          const isIndian = 
            (q.symbol && (q.symbol.toUpperCase().endsWith(".NS") || q.symbol.toUpperCase().endsWith(".BO"))) || 
            q.exchange === "NSI" || 
            q.exchange === "BSE";

          return {
            symbol: q.symbol.toUpperCase(),
            name: q.shortname || q.longname || q.symbol,
            type,
            exchange: q.exchange,
            region: isIndian ? "India" : "US",
          };
        });
    } catch (err) {
      console.error("Yahoo Finance searchAssets failed:", err);
      return [];
    }
  }

  async getHistory(symbol: string, days: number): Promise<HistoryPoint[]> {
    const upper = await this.resolveYahooSymbol(symbol);
    const now = Date.now();
    const isOneDay = days <= 1;

    let period1: Date;
    let period2: Date = new Date();
    let interval: "15m" | "1d" = "1d";

    if (isOneDay) {
      period1 = new Date(now - 5 * 24 * 60 * 60 * 1000); // 5 days back for padding
      interval = "15m";
    } else {
      period1 = new Date(now - days * 24 * 60 * 60 * 1000);
      interval = "1d";
    }

    try {
      const data = await yahooFinance.historical(upper, { period1, period2, interval });
      
      const rawPoints: HistoryPoint[] = [];
      for (const row of data) {
        if (row.close !== null && row.close !== undefined) {
          rawPoints.push({
            timestamp: row.date.getTime(),
            price: Math.round(row.close * 100) / 100,
          });
        }
      }

      if (isOneDay) {
        const start = now - 24 * 60 * 60 * 1000;
        const uniformPoints: HistoryPoint[] = [];
        let lastPrice = rawPoints.length > 0 ? rawPoints[rawPoints.length - 1].price : (await this.getQuote(symbol).catch(() => null))?.price ?? 100;
        
        for (let time = start; time <= now; time += 15 * 60 * 1000) {
          let closest = rawPoints[0];
          let minDiff = Infinity;
          for (const p of rawPoints) {
            const diff = Math.abs(p.timestamp - time);
            if (diff < minDiff) {
              minDiff = diff;
              closest = p;
            }
          }
          if (closest && minDiff < 48 * 60 * 60 * 1000) {
            uniformPoints.push({ timestamp: time, price: closest.price });
          } else {
            uniformPoints.push({ timestamp: time, price: lastPrice });
          }
        }
        return uniformPoints;
      }

      return rawPoints;
    } catch (err) {
      console.error(\`Yahoo Finance getHistory failed for \${symbol}:\`, err);
      return [];
    }
  }
}
`;

code = code.substring(0, startIndex) + newProvider + '\n' + code.substring(endIndex);
fs.writeFileSync(path, code);
console.log("Patched successfully.");
