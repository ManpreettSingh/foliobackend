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

const MAX_CLIENTS = 500;
const MAX_SYMBOLS_PER_CLIENT = 50;
const MAX_SYMBOL_LENGTH = 20;
const MAX_MESSAGE_BYTES = 8 * 1024;

export class StockWebSocketService {
  private static wss: WebSocketServer | null = null;
  private static yahooWs: WebSocket | null = null;
  // client -> (symbol the client asked for -> exact upstream Yahoo symbol it resolves to)
  private static clientSubscriptions = new Map<WebSocket, Map<string, string>>();
  private static activeStockSymbols = new Set<string>();
  private static reconnectTimeout: NodeJS.Timeout | null = null;
  private static pollingTimer: NodeJS.Timeout | null = null;

  public static init(server: Server) {
    console.log("[StockWebSocketService] Initializing WebSocket Server on path /stocks...");
    
    this.wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });

    server.on("upgrade", (request, socket, head) => {
      let pathname = "";
      try {
        pathname = new URL(request.url || "", `http://${request.headers.host}`).pathname;
      } catch {
        // malformed URL: fall through and reject below
      }

      if (pathname !== "/stocks" || this.clientSubscriptions.size >= MAX_CLIENTS) {
        // Don't leave unrelated or excess upgrade requests hanging open.
        socket.destroy();
        return;
      }

      this.wss?.handleUpgrade(request, socket, head, (ws) => {
        this.wss?.emit("connection", ws, request);
      });
    });

    this.wss.on("connection", (ws: WebSocket) => {
      console.log("[StockWebSocketService] Client connected.");
      this.clientSubscriptions.set(ws, new Map());

      ws.on("message", (message: WebSocket.RawData) => {
        try {
          const payload = JSON.parse(message.toString());
          if (!Array.isArray(payload?.symbols)) return;
          if (payload.type === "subscribe") {
            void this.handleSubscribe(ws, payload.symbols);
          } else if (payload.type === "unsubscribe") {
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

  private static isCrypto(symbol: string): boolean {
    const s = symbol.toUpperCase().trim();
    const knownCryptos = [
      "BTC", "ETH", "SOL", "ADA", "XRP", "DOT", "DOGE", "SHIB", "AVAX", "LINK", 
      "MATIC", "POL", "LTC", "UNI", "XLM", "ATOM", "NEAR", "OP", "ARB", "RENDER", "RNDR",
      "USDT", "USDC", "BNB", "TRX", "TON"
    ];
    return knownCryptos.includes(s) || s.endsWith("-USD") || s.endsWith("-INR");
  }

  private static async handleSubscribe(ws: WebSocket, symbols: unknown[]) {
    const subs = this.clientSubscriptions.get(ws);
    if (!subs) return;

    const requested = symbols
      .filter((s): s is string => typeof s === "string")
      .map((s) => s.toUpperCase().trim())
      .filter((s) => s.length > 0 && s.length <= MAX_SYMBOL_LENGTH && !subs.has(s));

    for (const symbol of requested) {
      if (subs.size >= MAX_SYMBOLS_PER_CLIENT) break;

      // Resolve to ONE upstream symbol, the same way the REST quotes do. Subscribing to both
      // "INFY" and "INFY.NS" streamed a USD and an INR price onto the same client key.
      let resolved = symbol;
      if (!this.isCrypto(symbol)) {
        try {
          resolved = ((await MarketDataService.resolveSymbol?.(symbol)) ?? symbol).toUpperCase();
        } catch {
          resolved = symbol;
        }
      }

      // The client may have disconnected or hit the cap while we were resolving.
      if (!this.clientSubscriptions.has(ws) || subs.size >= MAX_SYMBOLS_PER_CLIENT) break;
      subs.set(symbol, resolved);
      console.log(`[StockWebSocketService] Subscribed client to ${symbol} (mapped to ${resolved})`);
    }

    this.recalculateActiveSymbols();
  }

  private static handleUnsubscribe(ws: WebSocket, symbols: unknown[]) {
    const subs = this.clientSubscriptions.get(ws);
    if (!subs) return;

    symbols.forEach((symbol) => {
      if (typeof symbol !== "string") return;
      subs.delete(symbol.toUpperCase().trim());
      console.log(`[StockWebSocketService] Unsubscribed client from ${symbol}`);
    });

    this.recalculateActiveSymbols();
  }

  private static recalculateActiveSymbols() {
    const previousActive = new Set(this.activeStockSymbols);
    this.activeStockSymbols.clear();

    this.clientSubscriptions.forEach((subs) => {
      subs.forEach((resolved, requested) => {
        if (this.isCrypto(requested)) return;
        this.activeStockSymbols.add(resolved);
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
            currency: decoded.currency ? String(decoded.currency).toUpperCase() : undefined,
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

  private static broadcastUpdate(update: { symbol: string; price: number; changePercent: number; currency?: string }) {
    const upstream = update.symbol.toUpperCase();

    this.clientSubscriptions.forEach((subs, ws) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      // Deliver only to clients whose requested symbol resolves to exactly this upstream symbol,
      // labelled with the symbol they asked for so the client matches it unambiguously.
      subs.forEach((resolved, requested) => {
        if (resolved === upstream) {
          ws.send(JSON.stringify({ type: "tick", data: { ...update, symbol: requested } }));
        }
      });
    });
  }
}
