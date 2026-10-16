import { env } from "../config/env.js";
import YahooFinance from "yahoo-finance2";
import nodeFetch from "node-fetch";

const proxyFetch = async (url: string, init?: any) => {
  let res;
  if (url.includes("yahoo.com")) {
    const proxyUrl = `https://strata-portfolio-sepia.vercel.app/api/yahoo?url=${encodeURIComponent(url)}`;
    res = await nodeFetch(proxyUrl, init);
  } else {
    res = await nodeFetch(url, init);
  }
  
  // Monkey-patch getSetCookie to satisfy yahoo-finance2's cookie extraction
  // @ts-ignore
  if (typeof res.headers.getSetCookie !== "function") {
    // @ts-ignore
    res.headers.getSetCookie = () => (res.headers.raw() as any)["set-cookie"] || [];
  }
  return res;
};

const yahooFinance = new YahooFinance({ fetch: proxyFetch as any });
// ─── Types ────────────────────────────────────────────────────────────
export type PriceQuote = {
  symbol: string;
  price: number;
  changePercent: number;
  asOf: string;
  currency?: string;
};

export type AssetSearchResult = {
  symbol: string;
  name: string;
  type: string;
  exchange?: string;
  region?: string;
};

export type HistoryPoint = {
  timestamp: number; // unix ms
  price: number;
};

// ─── Provider Interface ───────────────────────────────────────────────
interface MarketDataProvider {
  getQuote(symbol: string, bypassCache?: boolean): Promise<PriceQuote>;
  getQuotes(symbols: string[], bypassCache?: boolean): Promise<PriceQuote[]>;
  searchAssets(query: string): Promise<AssetSearchResult[]>;
  getHistory(symbol: string, days: number): Promise<HistoryPoint[]>;
  /** Map a user-facing symbol to the exact symbol the upstream feed uses (e.g. RELIANCE -> RELIANCE.NS). */
  resolveSymbol?(symbol: string): Promise<string>;
}

// ─── Market Hours Check ────────────────────────────────────────────────
export function isMarketOpen(symbol: string): boolean {
  const upper = symbol.toUpperCase().trim();

  // 1. Crypto is open 24/7
  const knownCryptos = [
    "BTC", "ETH", "SOL", "ADA", "XRP", "DOT", "DOGE", "SHIB", "AVAX", "LINK", 
    "MATIC", "POL", "LTC", "UNI", "XLM", "ATOM", "NEAR", "OP", "ARB", "RENDER", "RNDR",
    "USDT", "USDC", "BNB", "TRX", "TON"
  ];
  const isCrypto = knownCryptos.includes(upper) || upper.endsWith("-USD") || upper.endsWith("-INR");
  if (isCrypto) {
    return true;
  }

  // Helper to get day/hour/minute in a specific timezone
  const getTimeInTz = (timezone: string) => {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour12: false,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      weekday: "short"
    });
    
    const parts = formatter.formatToParts(new Date());
    const valOf = (type: string) => parts.find(p => p.type === type)?.value || "";
    
    const weekdayStr = valOf("weekday"); // "Mon", "Tue", etc.
    const hour = parseInt(valOf("hour"), 10);
    const minute = parseInt(valOf("minute"), 10);
    
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const day = dayMap[weekdayStr] ?? new Date().getDay();

    return { day, hour, minute };
  };

  // 2. Indian stock market (NSE / BSE)
  if (upper.endsWith(".NS") || upper.endsWith(".BO")) {
    const { day, hour, minute } = getTimeInTz("Asia/Kolkata");
    
    // Monday to Friday
    if (day < 1 || day > 5) return false;
    
    // 9:00 AM to 4:00 PM IST (to cover 9:15 to 15:30 plus some buffer)
    const timeInMinutes = hour * 60 + minute;
    const startMinutes = 9 * 60; // 09:00
    const endMinutes = 16 * 60; // 16:00
    
    return timeInMinutes >= startMinutes && timeInMinutes <= endMinutes;
  }

  // 3. US stock market (default for other symbols unless they have another country dot suffix)
  // Check if it's a US stock (has no dot suffix, e.g. "AAPL", "MSFT")
  if (!upper.includes(".") && !upper.includes("=")) {
    const { day, hour, minute } = getTimeInTz("America/New_York");
    
    // Monday to Friday
    if (day < 1 || day > 5) return false;
    
    // 9:00 AM to 4:30 PM EST/EDT (to cover 9:30 to 16:00 plus buffer)
    const timeInMinutes = hour * 60 + minute;
    const startMinutes = 9 * 60; // 09:00
    const endMinutes = 16 * 60 + 30; // 16:30
    
    return timeInMinutes >= startMinutes && timeInMinutes <= endMinutes;
  }

  // Default fallback (e.g. global tickers from other exchanges)
  return true;
}

// ─── Stub Provider (offline / no API key) ─────────────────────────────
const FALLBACK_PRICES: Record<string, PriceQuote> = {
  AAPL:  { symbol: "AAPL",  price: 218.74,  changePercent:  0.84, asOf: new Date().toISOString() },
  MSFT:  { symbol: "MSFT",  price: 418.32,  changePercent:  1.21, asOf: new Date().toISOString() },
  NVDA:  { symbol: "NVDA",  price: 894.50,  changePercent:  2.45, asOf: new Date().toISOString() },
  GOOGL: { symbol: "GOOGL", price: 174.92,  changePercent:  0.31, asOf: new Date().toISOString() },
  TSLA:  { symbol: "TSLA",  price: 219.30,  changePercent: -2.18, asOf: new Date().toISOString() },
  AMZN:  { symbol: "AMZN",  price: 189.45,  changePercent:  0.92, asOf: new Date().toISOString() },
  META:  { symbol: "META",  price: 521.34,  changePercent:  1.42, asOf: new Date().toISOString() },
  NFLX:  { symbol: "NFLX",  price: 698.21,  changePercent: -0.32, asOf: new Date().toISOString() },
  AMD:   { symbol: "AMD",   price: 168.55,  changePercent:  2.18, asOf: new Date().toISOString() },
  BTC:   { symbol: "BTC",   price: 67230,   changePercent: -1.12, asOf: new Date().toISOString() },
  ETH:   { symbol: "ETH",   price: 3480,    changePercent: -0.55, asOf: new Date().toISOString() },
  SOL:   { symbol: "SOL",   price: 168.40,  changePercent:  3.12, asOf: new Date().toISOString() },
  DOGE:  { symbol: "DOGE",  price: 0.158,   changePercent: -1.84, asOf: new Date().toISOString() },
  COIN:  { symbol: "COIN",  price: 234.12,  changePercent:  3.45, asOf: new Date().toISOString() },
  VOO:   { symbol: "VOO",   price: 512.40,  changePercent:  0.42, asOf: new Date().toISOString() },
  VTI:   { symbol: "VTI",   price: 268.40,  changePercent:  0.38, asOf: new Date().toISOString() },
  VWRL:  { symbol: "VWRL",  price: 118.60,  changePercent:  0.21, asOf: new Date().toISOString() },
  QQQ:   { symbol: "QQQ",   price: 481.22,  changePercent:  0.65, asOf: new Date().toISOString() },
};

const STUB_ASSETS: AssetSearchResult[] = Object.entries(FALLBACK_PRICES).map(([symbol]) => ({
  symbol,
  name: symbol,
  type: ["BTC", "ETH", "SOL", "DOGE"].includes(symbol) ? "CRYPTO" : "STOCK",
}));

class StubProvider implements MarketDataProvider {
  async getQuote(symbol: string, bypassCache = false): Promise<PriceQuote> {
    const normalized = symbol.toUpperCase();
    return FALLBACK_PRICES[normalized] ?? {
      symbol: normalized,
      price: 100,
      changePercent: 0,
      asOf: new Date().toISOString(),
    };
  }

  async getQuotes(symbols: string[], bypassCache = false): Promise<PriceQuote[]> {
    return Promise.all(symbols.map((s) => this.getQuote(s, bypassCache)));
  }

  async searchAssets(query: string): Promise<AssetSearchResult[]> {
    const q = query.toLowerCase();
    return STUB_ASSETS.filter(
      (a) => a.symbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q),
    ).slice(0, 20);
  }

  async getHistory(symbol: string, days: number): Promise<HistoryPoint[]> {
    // Generate stub historical data
    const normalized = symbol.toUpperCase();
    const currentPrice = FALLBACK_PRICES[normalized]?.price ?? 100;
    const points: HistoryPoint[] = [];
    const now = Date.now();
    const totalPoints = days <= 1 ? 24 : Math.min(days, 365);
    const intervalMs = days <= 1
      ? 60 * 60 * 1000        // 1 hour
      : 24 * 60 * 60 * 1000;  // 1 day

    let price = currentPrice * 0.75;
    for (let i = totalPoints; i >= 0; i--) {
      const drift = (currentPrice - price) / (i + 1);
      const noise = (Math.sin(i * 0.3) + Math.cos(i * 0.13)) * (currentPrice * 0.008);
      price = Math.max(currentPrice * 0.5, price + drift + noise);
      points.push({
        timestamp: now - i * intervalMs,
        price: Math.round(price * 100) / 100,
      });
    }
    points[points.length - 1].price = currentPrice;
    return points;
  }
}

// "BTC-INR" -> { base: "BTC", currency: "INR" }; plain "BTC" and "BTC-USD" are quoted in USD.
function splitCryptoSymbol(symbol: string): { base: string; currency: "USD" | "INR" } {
  const upper = symbol.toUpperCase().trim();
  if (upper.endsWith("-INR")) return { base: upper.slice(0, -4), currency: "INR" };
  if (upper.endsWith("-USD")) return { base: upper.slice(0, -4), currency: "USD" };
  return { base: upper, currency: "USD" };
}

// ─── CoinGecko Provider ───────────────────────────────────────────────
class CoinGeckoProvider implements MarketDataProvider {
  private apiKey: string;
  private baseUrl: string;
  private headers: Record<string, string>;
  
  // Price Cache with 5-minute TTL (300,000 ms)
  private priceCache: Map<string, { quote: PriceQuote; timestamp: number }> = new Map();
  // History Cache with 5-minute TTL
  private historyCache: Map<string, { data: HistoryPoint[]; timestamp: number }> = new Map();
  private cacheTtl = 5 * 60 * 1000; // 5 minutes in ms

  private symbolToIdMap: Map<string, string> = new Map([
    ["BTC", "bitcoin"],
    ["ETH", "ethereum"],
    ["SOL", "solana"],
    ["DOGE", "dogecoin"],
    ["ADA", "cardano"],
    ["DOT", "polkadot"],
    ["XRP", "ripple"],
    ["LINK", "chainlink"],
    ["AVAX", "avalanche-2"],
    // Polygon migrated MATIC -> POL; the old "matic-network" id is frozen at a stale price.
    ["MATIC", "polygon-ecosystem-token"],
    ["POL", "polygon-ecosystem-token"],
    ["SHIB", "shiba-inu"],
    ["LTC", "litecoin"],
    ["UNI", "uniswap"],
    ["XLM", "stellar"],
    ["ATOM", "cosmos"],
  ]);

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.baseUrl = "https://api.coingecko.com/api/v3";
    this.headers = {
      "Accept": "application/json",
      "x-cg-demo-api-key": apiKey
    };
  }

  private async resolveId(symbol: string): Promise<string | null> {
    const upper = symbol.toUpperCase();
    if (this.symbolToIdMap.has(upper)) {
      return this.symbolToIdMap.get(upper)!;
    }

    try {
      const url = `${this.baseUrl}/search?query=${encodeURIComponent(symbol)}`;
      const res = await fetch(url, { headers: this.headers });
      if (!res.ok) {
        console.error(`CoinGecko resolveId failed for ${symbol}: ${res.status} ${res.statusText}`);
        return null;
      }
      const data = await res.json() as any;
      const coin = data.coins?.find((c: any) => c.symbol.toUpperCase() === upper);
      if (coin) {
        this.symbolToIdMap.set(upper, coin.id);
        return coin.id;
      }
      if (data.coins && data.coins.length > 0) {
        this.symbolToIdMap.set(upper, data.coins[0].id);
        return data.coins[0].id;
      }
    } catch (err) {
      console.error(`Error resolving CoinGecko ID for ${symbol}:`, err);
    }
    return null;
  }

  async getQuote(symbol: string, bypassCache = false): Promise<PriceQuote> {
    const quotes = await this.getQuotes([symbol], bypassCache);
    return quotes[0] || {
      symbol: symbol.toUpperCase(),
      price: 0,
      changePercent: 0,
      asOf: new Date().toISOString()
    };
  }

  async getQuotes(symbols: string[], bypassCache = false): Promise<PriceQuote[]> {
    if (symbols.length === 0) return [];
    
    const now = Date.now();
    const results: PriceQuote[] = [];
    const symbolsToFetch: string[] = [];

    for (const symbol of symbols) {
      const upper = symbol.toUpperCase();
      const cached = this.priceCache.get(upper);
      if (!bypassCache && cached && (now - cached.timestamp < this.cacheTtl)) {
        console.log(`[Cache HIT] Price quote for ${upper}: $${cached.quote.price} (${cached.quote.changePercent}%)`);
        results.push(cached.quote);
      } else {
        console.log(`[Cache MISS] Price quote for ${upper}`);
        symbolsToFetch.push(symbol);
      }
    }

    if (symbolsToFetch.length === 0) {
      return results;
    }

    const ids: string[] = [];
    const validSymbolsToFetch: string[] = [];
    for (const symbol of symbolsToFetch) {
      const id = await this.resolveId(splitCryptoSymbol(symbol).base);
      if (id) {
        ids.push(id);
        validSymbolsToFetch.push(symbol);
      } else {
        results.push({
          symbol: symbol.toUpperCase(),
          price: 0,
          changePercent: 0,
          asOf: new Date().toISOString()
        });
      }
    }

    if (ids.length > 0) {
      try {
        const url = `${this.baseUrl}/simple/price?ids=${ids.join(",")}&vs_currencies=usd,inr&include_24hr_change=true`;
        const res = await fetch(url, { headers: this.headers });
        if (!res.ok) {
          throw new Error(`CoinGecko getQuotes failed: ${res.status} ${res.statusText}`);
        }
        const data = await res.json() as any;
        
        for (const symbol of validSymbolsToFetch) {
          const upper = symbol.toUpperCase();
          const { base, currency } = splitCryptoSymbol(upper);
          const key = currency.toLowerCase();
          const id = this.symbolToIdMap.get(base);
          const priceData = id ? data[id] : null;
          const quote: PriceQuote = {
            symbol: upper,
            price: priceData?.[key] ?? 0,
            changePercent: priceData?.[`${key}_24h_change`] ?? 0,
            asOf: new Date().toISOString(),
            currency,
          };
          this.priceCache.set(upper, { quote, timestamp: now });
          results.push(quote);
        }
      } catch (err) {
        console.error("Error fetching bulk quotes from CoinGecko:", err);
        for (const symbol of validSymbolsToFetch) {
          results.push({
            symbol: symbol.toUpperCase(),
            price: 0,
            changePercent: 0,
            asOf: new Date().toISOString()
          });
        }
      }
    }

    const symbolMap = new Map(results.map(r => [r.symbol, r]));
    return symbols.map(s => symbolMap.get(s.toUpperCase()) || {
      symbol: s.toUpperCase(),
      price: 0,
      changePercent: 0,
      asOf: new Date().toISOString()
    });
  }

  async getHistory(symbol: string, days: number): Promise<HistoryPoint[]> {
    const upper = symbol.toUpperCase();
    const cacheKey = `${upper}:${days}`;
    const now = Date.now();

    // Check cache
    const cached = this.historyCache.get(cacheKey);
    if (cached && (now - cached.timestamp < this.cacheTtl)) {
      console.log(`[Cache HIT] History for ${upper} (${days}d): ${cached.data.length} points`);
      return cached.data;
    }
    console.log(`[Cache MISS] History for ${upper} (${days}d)`);

    const { base, currency } = splitCryptoSymbol(symbol);
    const id = await this.resolveId(base);
    if (!id) {
      console.error(`Could not resolve CoinGecko ID for ${symbol}`);
      return [];
    }

    try {
      const url = `${this.baseUrl}/coins/${id}/market_chart?vs_currency=${currency.toLowerCase()}&days=${days}`;
      const res = await fetch(url, { headers: this.headers });
      if (!res.ok) {
        throw new Error(`CoinGecko getHistory failed: ${res.status} ${res.statusText}`);
      }
      const data = await res.json() as any;

      if (!data.prices || !Array.isArray(data.prices)) {
        console.error(`Invalid history response for ${symbol}`);
        return [];
      }

      const points: HistoryPoint[] = data.prices.map(([ts, price]: [number, number]) => ({
        timestamp: ts,
        price,
      }));

      // Cache the result
      this.historyCache.set(cacheKey, { data: points, timestamp: now });
      return points;
    } catch (err) {
      console.error(`Error fetching history for ${symbol}:`, err);
      return [];
    }
  }

  async searchAssets(query: string): Promise<AssetSearchResult[]> {
    if (!query) return [];
    try {
      const url = `${this.baseUrl}/search?query=${encodeURIComponent(query)}`;
      const res = await fetch(url, { headers: this.headers });
      if (!res.ok) {
        throw new Error(`CoinGecko searchAssets failed: ${res.status} ${res.statusText}`);
      }
      const data = await res.json() as any;
      if (!data.coins) return [];
      
      return data.coins.map((c: any) => ({
        symbol: c.symbol.toUpperCase(),
        name: c.name,
        type: "CRYPTO",
        exchange: "CoinGecko",
        region: "Global"
      })).slice(0, 20);
    } catch (err) {
      console.error(`Error searching assets on CoinGecko for ${query}:`, err);
      return [];
    }
  }
}

// ─── Yahoo Finance Provider (uses yahoo-finance2) ─────────────────────────
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
      const nsSymbol = `${upper}.NS`;
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

  async resolveSymbol(symbol: string): Promise<string> {
    return this.resolveYahooSymbol(symbol);
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
      const data = await yahooFinance.quote(yahooSymbol) as any;
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
      console.log(`[YahooFinance2] ${upperInput} (${yahooSymbol}): ${quote.price} (${quote.changePercent > 0 ? "+" : ""}${quote.changePercent}%)`);
      return quote;
    } catch (err) {
      console.error(`[YahooFinance2] Error fetching ${upperInput}:`, err);
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
      const data = await yahooFinance.search(query, { quotesCount: 15, newsCount: 0 }) as any;
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
    let interval: "1d" | "1wk" | "1mo" = "1d";

    if (isOneDay) {
      period1 = new Date(now - 5 * 24 * 60 * 60 * 1000); // 5 days back for padding
      interval = "1d";
    } else {
      period1 = new Date(now - days * 24 * 60 * 60 * 1000);
      interval = "1d";
    }

    try {
      const data = await yahooFinance.historical(upper, { period1, period2, interval }) as any;
      
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
      console.error(`Yahoo Finance getHistory failed for ${symbol}:`, err);
      return [];
    }
  }
}

// ─── Hybrid Data Provider (routing crypto to CG and stock to Yahoo) ────
class HybridProvider implements MarketDataProvider {
  private cryptoProvider: MarketDataProvider;
  private stockProvider: MarketDataProvider;

  constructor(cryptoProvider: MarketDataProvider, stockProvider: MarketDataProvider) {
    this.cryptoProvider = cryptoProvider;
    this.stockProvider = stockProvider;
  }

  private isCrypto(symbol: string): boolean {
    const s = symbol.toUpperCase().trim();
    const knownCryptos = ["BTC", "ETH", "SOL", "DOGE", "ADA", "DOT", "XRP", "LINK", "AVAX", "MATIC", "POL", "SHIB", "LTC", "UNI", "XLM", "ATOM"];
    return knownCryptos.includes(s) || s.endsWith("-USD") || s.endsWith("-INR");
  }

  async getQuote(symbol: string, bypassCache = false): Promise<PriceQuote> {
    if (this.isCrypto(symbol)) {
      return this.cryptoProvider.getQuote(symbol, bypassCache);
    }
    return this.stockProvider.getQuote(symbol, bypassCache);
  }

  async getQuotes(symbols: string[], bypassCache = false): Promise<PriceQuote[]> {
    const cryptos: string[] = [];
    const stocks: string[] = [];
    
    for (const s of symbols) {
      if (this.isCrypto(s)) cryptos.push(s);
      else stocks.push(s);
    }

    const [cryptoQuotes, stockQuotes] = await Promise.all([
      this.cryptoProvider.getQuotes(cryptos, bypassCache),
      this.stockProvider.getQuotes(stocks, bypassCache)
    ]);

    const quoteMap = new Map<string, PriceQuote>();
    cryptoQuotes.forEach(q => quoteMap.set(q.symbol, q));
    stockQuotes.forEach(q => quoteMap.set(q.symbol, q));

    return symbols.map(s => quoteMap.get(s.toUpperCase()) || {
      symbol: s.toUpperCase(),
      price: 0,
      changePercent: 0,
      asOf: new Date().toISOString()
    });
  }

  async searchAssets(query: string): Promise<AssetSearchResult[]> {
    const [cryptoResults, stockResults] = await Promise.all([
      this.cryptoProvider.searchAssets(query).catch(() => []),
      this.stockProvider.searchAssets(query).catch(() => [])
    ]);
    return [...cryptoResults, ...stockResults];
  }

  async getHistory(symbol: string, days: number): Promise<HistoryPoint[]> {
    if (this.isCrypto(symbol)) {
      return this.cryptoProvider.getHistory(symbol, days);
    }
    return this.stockProvider.getHistory(symbol, days);
  }

  async resolveSymbol(symbol: string): Promise<string> {
    if (this.isCrypto(symbol)) return symbol.toUpperCase().trim();
    return this.stockProvider.resolveSymbol ? this.stockProvider.resolveSymbol(symbol) : symbol.toUpperCase().trim();
  }
}

// ─── Service Singleton ────────────────────────────────────────────────
function createProvider(): MarketDataProvider {
  const provider = env.MARKET_DATA_PROVIDER;
  const key = env.MARKET_DATA_API_KEY;

  const stockProvider = new YahooFinanceProvider();
  let cryptoProvider: MarketDataProvider;

  if (provider === "coingecko" && key) {
    cryptoProvider = new CoinGeckoProvider(key);
  } else {
    cryptoProvider = new StubProvider();
  }

  return new HybridProvider(cryptoProvider, stockProvider);
}

export const MarketDataService: MarketDataProvider = createProvider();

