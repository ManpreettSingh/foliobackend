import { Router } from "express";
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
portfolioRouter.post("/report/generate", asyncHandler(generateReport));
portfolioRouter.patch("/:portfolioId", validate(updatePortfolioSchema), asyncHandler(controller.update));
portfolioRouter.delete("/:portfolioId", validate(portfolioParamsSchema), asyncHandler(controller.destroy));
portfolioRouter.post("/:portfolioId/holdings", validate(createHoldingSchema), asyncHandler(controller.createHolding));
portfolioRouter.patch("/:portfolioId/holdings/:holdingId", validate(updateHoldingSchema), asyncHandler(controller.patchHolding));
portfolioRouter.delete("/:portfolioId/holdings/:holdingId", validate(holdingParamsSchema), asyncHandler(controller.removeHolding));
