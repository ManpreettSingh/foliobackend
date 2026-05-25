import type { NextFunction, Request, Response } from "express";
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
    next(error instanceof HttpError ? error : new HttpError(401, "Invalid authentication token"));
  }
}
