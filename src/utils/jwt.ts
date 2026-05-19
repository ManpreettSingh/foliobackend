import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import { env } from "../config/env.js";

export type JwtPayload = {
  sub: string;
  email: string;
};

export function signToken(payload: JwtPayload) {
  if (!env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured.");
  }
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"] });
}

export function verifyToken(token: string) {
  if (!env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured.");
  }
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}
