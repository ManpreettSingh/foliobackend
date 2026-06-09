import { Router } from "express";
import * as controller from "../controllers/market.controller.js";
import { asyncHandler } from "../utils/async-handler.js";

export const marketRouter = Router();

// Public endpoints — no auth required (supports guest mode)
marketRouter.get("/quote/:symbol", asyncHandler(controller.quote));
marketRouter.get("/quotes", asyncHandler(controller.batchQuotes));
marketRouter.get("/search", asyncHandler(controller.searchAssets));
marketRouter.get("/history/:symbol", asyncHandler(controller.history));
marketRouter.get("/news", asyncHandler(controller.news));
