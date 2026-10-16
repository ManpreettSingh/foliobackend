import { Router } from "express";
import rateLimit from "express-rate-limit";
import * as controller from "../controllers/portfolio.controller.js";
import { generateReport } from "../controllers/ai.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  createHoldingSchema,
  createPortfolioSchema,
  holdingParamsSchema,
  portfolioParamsSchema,
  updateHoldingSchema,
  updatePortfolioSchema,
} from "../validators/portfolio.js";
import { asyncHandler } from "../utils/async-handler.js";

export const portfolioRouter = Router();

portfolioRouter.use(requireAuth);
portfolioRouter.get("/", asyncHandler(controller.index));
portfolioRouter.post("/", validate(createPortfolioSchema), asyncHandler(controller.create));
portfolioRouter.get("/dashboard/summary", asyncHandler(controller.dashboard));
// The AI report calls a paid external API, so cap it per user.
const reportLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? "anonymous",
  message: { error: "Too many report requests. Please wait a few minutes and try again." },
});
portfolioRouter.post("/report/generate", reportLimiter, asyncHandler(generateReport));
portfolioRouter.patch("/:portfolioId", validate(updatePortfolioSchema), asyncHandler(controller.update));
portfolioRouter.delete("/:portfolioId", validate(portfolioParamsSchema), asyncHandler(controller.destroy));
portfolioRouter.post("/:portfolioId/holdings", validate(createHoldingSchema), asyncHandler(controller.createHolding));
portfolioRouter.patch("/:portfolioId/holdings/:holdingId", validate(updateHoldingSchema), asyncHandler(controller.patchHolding));
portfolioRouter.delete("/:portfolioId/holdings/:holdingId", validate(holdingParamsSchema), asyncHandler(controller.removeHolding));
