import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { errorMiddleware } from "./middleware/error.js";
import { authRouter } from "./routes/auth.routes.js";
import { marketRouter } from "./routes/market.routes.js";
import { portfolioRouter } from "./routes/portfolio.routes.js";
import { watchlistRouter } from "./routes/watchlist.routes.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN.split(",").map((origin) => origin.trim()), credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
  app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));

  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use("/markets", marketRouter);
  app.use("/auth", authRouter);
  app.use("/portfolios", portfolioRouter);
  app.use("/watchlist", watchlistRouter);
  app.use(errorMiddleware);

  return app;
}
