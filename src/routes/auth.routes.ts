import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  login,
  logout,
  me,
  register,
  verifyRegister,
  resendRegisterCode,
  googleAuth,
  updateProfile,
} from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { loginSchema, registerSchema, verifyRegisterSchema, resendRegisterSchema } from "../validators/auth.js";
import { asyncHandler } from "../utils/async-handler.js";

export const authRouter = Router();

// Stricter than the global limiter: slows password guessing and signup abuse.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again in a few minutes." },
});

authRouter.post("/register", authLimiter, validate(registerSchema), asyncHandler(register));
authRouter.post("/register/verify", authLimiter, validate(verifyRegisterSchema), asyncHandler(verifyRegister));
authRouter.post("/register/resend", authLimiter, validate(resendRegisterSchema), asyncHandler(resendRegisterCode));
authRouter.post("/login", authLimiter, validate(loginSchema), asyncHandler(login));
authRouter.post("/logout", requireAuth, asyncHandler(logout));
authRouter.post("/google", authLimiter, asyncHandler(googleAuth));
authRouter.get("/me", requireAuth, asyncHandler(me));
authRouter.patch("/profile", requireAuth, asyncHandler(updateProfile));
