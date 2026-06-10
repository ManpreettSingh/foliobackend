import type { Server } from "http";
import WebSocket, { WebSocketServer } from "ws";
import protobuf from "protobufjs";
import { MarketDataService, isMarketOpen } from "./market-data.service.js";

// Reverse-engineered Yahoo Finance Ticker Protobuf Schema
const PROTO_SCHEMA = `
syntax = "proto3";

message PricingData {
  string id = 1;
  float price = 2;
  sint64 time = 3;
  string currency = 4;
  string exchange = 5;
  int32 quoteType = 6;
  int32 marketHours = 7;
  float changePercent = 8;
  sint64 dayVolume = 9;
  float dayHigh = 10;
  float dayLow = 11;
  float change = 12;
  string shortName = 13;
}
`;

const root = protobuf.parse(PROTO_SCHEMA).root;
const PricingData = root.lookupType("PricingData");

export class StockWebSocketService {
  private static wss: WebSocketServer | null = null;
  private static yahooWs: WebSocket | null = null;
  private static clientSubscriptions = new Map<WebSocket, Set<string>>();
  private static activeStockSymbols = new Set<string>();
  private static reconnectTimeout: NodeJS.Timeout | null = null;
  private static pollingTimer: NodeJS.Timeout | null = null;

  public static init(server: Server) {
    console.log("[StockWebSocketService] Initializing WebSocket Server on path /stocks...");
    
    this.wss = new WebSocketServer({ noServer: true });

    server.on("upgrade", (request, socket, head) => {
      const url = new URL(request.url || "", `http://${request.headers.host}`);
      if (url.pathname === "/stocks") {
        this.wss?.handleUpgrade(request, socket, head, (ws) => {
          this.wss?.emit("connection", ws, request);
        });
      }
    });

    this.wss.on("connection", (ws: WebSocket) => {
      console.log("[StockWebSocketService] Client connected.");
      this.clientSubscriptions.set(ws, new Set());

      ws.on("message", (message: string) => {
        try {
          const payload = JSON.parse(message);
          if (payload.type === "subscribe" && Array.isArray(payload.symbols)) {
            this.handleSubscribe(ws, payload.symbols);
          } else if (payload.type === "unsubscribe" && Array.isArray(payload.symbols)) {
            this.handleUnsubscribe(ws, payload.symbols);
          }
        } catch (err) {
          console.error("[StockWebSocketService] Failed to parse client message:", err);
        }
      });

      ws.on("close", () => {
        console.log("[StockWebSocketService] Client disconnected.");
        this.clientSubscriptions.delete(ws);
        this.recalculateActiveSymbols();
      });

      ws.on("error", (err) => {
        console.error("[StockWebSocketService] Client socket error:", err);
      });
    });
  }

  private static normalizeSymbol(symbol: string): string {
    const s = symbol.toUpperCase().trim();
    if (this.isCrypto(s)) return s;
    if (s.includes(".") || s.includes("-") || s.includes("=")) return s;
    if (s.startsWith("^")) return s;
    
    const usEquities = [
      "AAPL", "MSFT", "NVDA", "GOOGL", "GOOG", "TSLA", "AMZN", "META", "NFLX", 
      "AMD", "COIN", "VOO", "VTI", "VWRL", "QQQ", "GS", "JPM", "DIS", "V", "MA", 
      "WMT", "PG", "JNJ", "INTC", "PYPL", "NKE", "SBUX"
    ];
    if (usEquities.includes(s)) return s;
    return `${s}.NS`; // Fallback to NSE for Indian stocks
  }

  private static isCrypto(symbol: string): boolean {
    const s = symbol.toUpperCase().trim();
    const knownCryptos = [
      "BTC", "ETH", "SOL", "ADA", "XRP", "DOT", "DOGE", "SHIB", "AVAX", "LINK", 
      "MATIC", "LTC", "UNI", "XLM", "ATOM", "NEAR", "OP", "ARB", "RENDER", "RNDR",
      "USDT", "USDC", "BNB", "TRX", "TON"
    ];
    return knownCryptos.includes(s) || s.endsWith("-USD") || s.endsWith("-INR");
  }

  private static handleSubscribe(ws: WebSocket, symbols: string[]) {
    const subs = this.clientSubscriptions.get(ws);
    if (!subs) return;

    symbols.forEach((symbol) => {
      const normalized = this.normalizeSymbol(symbol);
      subs.add(normalized);
      // Keep track of the original symbol requested by the client too so we can check both
      subs.add(symbol.toUpperCase().trim());
      
      console.log(`[StockWebSocketService] Subscribed client to ${symbol} (mapped to ${normalized})`);
    });

    this.recalculateActiveSymbols();
  }

  private static handleUnsubscribe(ws: WebSocket, symbols: string[]) {
    const subs = this.clientSubscriptions.get(ws);
    if (!subs) return;

    symbols.forEach((symbol) => {
      subs.delete(symbol.toUpperCase().trim());
      subs.delete(this.normalizeSymbol(symbol));
      console.log(`[StockWebSocketService] Unsubscribed client from ${symbol}`);
    });

    this.recalculateActiveSymbols();
  }

  private static recalculateActiveSymbols() {
    const previousActive = new Set(this.activeStockSymbols);
    this.activeStockSymbols.clear();

    this.clientSubscriptions.forEach((subs) => {
      subs.forEach((sym) => {
        const upper = sym.toUpperCase().trim();
        if (!this.isCrypto(upper) && upper === this.normalizeSymbol(upper)) {
          this.activeStockSymbols.add(upper);
        }
      });
    });

    // Handle connection changes
    if (this.activeStockSymbols.size === 0) {
      this.disconnectFromYahoo();
      this.stopPolling();
    } else {
      this.connectToYahoo();
      
      // Determine what was newly added (only US equities stream on Yahoo WS)
      const newlyAdded = Array.from(this.activeStockSymbols).filter(s => 
        !previousActive.has(s)
      );
      if (newlyAdded.length > 0 && this.yahooWs && this.yahooWs.readyState === WebSocket.OPEN) {
        console.log("[StockWebSocketService] Subscribing Yahoo Finance to new symbols:", newlyAdded);
        this.yahooWs.send(JSON.stringify({ subscribe: newlyAdded }));
      }

      // Disabled fallback polling since all symbols now stream via WS
      const symbolsToPoll: string[] = [];
      if (symbolsToPoll.length > 0) {
        this.startPolling();
      } else {
        this.stopPolling();
      }
    }
  }

  private static connectToYahoo() {
    if (this.yahooWs || this.activeStockSymbols.size === 0) return;

    console.log("[StockWebSocketService] Connecting to Yahoo Finance WebSocket...");
    const ws = new WebSocket("wss://streamer.finance.yahoo.com/");
    this.yahooWs = ws;

    ws.on("open", () => {
      if (this.yahooWs !== ws) return;
      console.log("[StockWebSocketService] Yahoo Finance WebSocket connected.");
      if (this.activeStockSymbols.size > 0) {
        const symbolsArray = Array.from(this.activeStockSymbols);
        if (symbolsArray.length > 0) {
          console.log("[StockWebSocketService] Subscribing to Yahoo symbols:", symbolsArray);
          ws.send(JSON.stringify({ subscribe: symbolsArray }));
        }
      }
    });

    ws.on("message", (data: any) => {
      if (this.yahooWs !== ws) return;
      try {
        const base64Str = data.toString();
        const buffer = Buffer.from(base64Str, "base64");
        const decoded = PricingData.decode(buffer) as any;
        
        if (decoded && decoded.id) {
          const update = {
            symbol: decoded.id.toUpperCase(),
            price: decoded.price,
            changePercent: decoded.changePercent,
          };

          // Broadcast to matching clients
          this.broadcastUpdate(update);
        }
      } catch (err) {
        // Ignore parsing errors
      }
    });

    ws.on("close", () => {
      console.log("[StockWebSocketService] Yahoo Finance WebSocket closed.");
      if (this.yahooWs === ws) {
        this.yahooWs = null;
        if (this.activeStockSymbols.size > 0) {
          if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
          this.reconnectTimeout = setTimeout(() => this.connectToYahoo(), 5000);
        }
      }
    });

    ws.on("error", (err) => {
      console.error("[StockWebSocketService] Yahoo Finance WebSocket error:", err);
    });
  }

  private static disconnectFromYahoo() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.yahooWs) {
      console.log("[StockWebSocketService] Disconnecting from Yahoo Finance (no active clients).");
      try {
        this.yahooWs.close();
      } catch (err) {
        console.error("[StockWebSocketService] Error closing Yahoo Finance WebSocket:", err);
      }
      this.yahooWs = null;
    }
  }

  private static startPolling() {
    if (this.pollingTimer) return;

    console.log("[StockWebSocketService] Starting fallback polling for non-US stocks...");
    this.pollingTimer = setInterval(async () => {
      const symbolsToPoll = Array.from(this.activeStockSymbols).filter(sym => 
        sym.includes(".") || sym.includes("=") || sym.startsWith("^")
      );

      if (symbolsToPoll.length === 0) {
        this.stopPolling();
        return;
      }

      // Only query symbols where the market is open
      const openSymbols = symbolsToPoll.filter(sym => isMarketOpen(sym));
      if (openSymbols.length === 0) {
        return;
      }

      try {
        const quotes = await MarketDataService.getQuotes(openSymbols, true);
        quotes.forEach((quote) => {
          if (quote && quote.price > 0) {
            this.broadcastUpdate({
              symbol: quote.symbol,
              price: quote.price,
              changePercent: quote.changePercent,
            });
          }
        });
      } catch (err) {
        console.error("[StockWebSocketService] Polling fallback error:", err);
      }
    }, 3000); // Tick every 3 seconds for Indian stocks/indices/commodities
  }

  private static stopPolling() {
    if (this.pollingTimer) {
      console.log("[StockWebSocketService] Stopping fallback polling.");
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  private static broadcastUpdate(update: { symbol: string; price: number; changePercent: number }) {
    const rawSymbol = update.symbol.replace(".NS", "");
    const messageStr = JSON.stringify({
      type: "tick",
      data: update,
    });

    this.clientSubscriptions.forEach((subs, ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        // Send if client explicitly subscribed to "RELIANCE.NS" OR "RELIANCE"
        if (subs.has(update.symbol) || subs.has(rawSymbol)) {
          ws.send(messageStr);
        }
      }
    });
  }
}
