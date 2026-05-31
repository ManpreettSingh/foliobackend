import { Router } from "express";
import * as controller from "../controllers/watchlist.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { searchSchema, watchlistAssetSchema, watchlistParamsSchema } from "../validators/watchlist.js";
import { asyncHandler } from "../utils/async-handler.js";

export const watchlistRouter = Router();

watchlistRouter.use(requireAuth);
watchlistRouter.get("/", asyncHandler(controller.index));
watchlistRouter.post("/", validate(watchlistAssetSchema), asyncHandler(controller.create));
watchlistRouter.delete("/:assetId", validate(watchlistParamsSchema), asyncHandler(controller.destroy));
watchlistRouter.get("/search/assets", validate(searchSchema), asyncHandler(controller.search));
