import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../config/prisma.js";
import { verifyToken } from "../utils/jwt.js";
import { HttpError } from "../utils/http-error.js";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string; name: string };
    }
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.header("authorization");
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (!token) throw new HttpError(401, "Authentication required");

    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true },
    });
    if (!user) throw new HttpError(401, "Invalid authentication token");
    req.user = user;
    next();
  } catch (error) {
    if (error instanceof HttpError) return next(error);
    if (error instanceof jwt.TokenExpiredError) {
      return next(new HttpError(401, "Your session has expired. Please sign in again."));
    }
    if (error instanceof jwt.JsonWebTokenError) {
      // Bad signature (token issued by a different JWT_SECRET/server) or malformed token.
      console.warn(`[auth] Rejected token: ${error.message}`);
      return next(new HttpError(401, "Invalid authentication token. Please sign in again."));
    }
    // Anything else (e.g. database unreachable) is a server problem, not a bad login.
    console.error("[auth] Unexpected error while authenticating:", error);
    next(new HttpError(503, "Could not verify your session right now. Please try again in a moment."));
  }
}
