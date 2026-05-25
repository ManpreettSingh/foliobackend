import { Router } from "express";
import { login, logout, me, register, googleAuth, updateProfile } from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { loginSchema, registerSchema } from "../validators/auth.js";
import { asyncHandler } from "../utils/async-handler.js";

export const authRouter = Router();

authRouter.post("/register", validate(registerSchema), asyncHandler(register));
authRouter.post("/login", validate(loginSchema), asyncHandler(login));
authRouter.post("/logout", requireAuth, asyncHandler(logout));
authRouter.post("/google", asyncHandler(googleAuth));
authRouter.get("/me", requireAuth, asyncHandler(me));
authRouter.patch("/profile", requireAuth, asyncHandler(updateProfile));
