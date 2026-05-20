import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "../config/prisma.js";
import { HttpError } from "../utils/http-error.js";
import { signToken } from "../utils/jwt.js";
import { env } from "../config/env.js";

const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);

function toAuthResponse(user: { id: string; name: string; email: string }) {
  return {
    user,
    token: signToken({ sub: user.id, email: user.email }),
  };
}

export async function registerUser(input: { name: string; email: string; password: string }) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new HttpError(409, "An account with that email already exists");

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      portfolios: { create: { name: "Primary Portfolio", baseCurrency: "USD" } },
    },
    select: { id: true, name: true, email: true },
  });

  return toAuthResponse(user);
}

export async function loginUser(input: { email: string; password: string }) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) throw new HttpError(401, "Invalid email or password");

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) throw new HttpError(401, "Invalid email or password");

  return toAuthResponse({ id: user.id, name: user.name, email: user.email });
}

export async function updateProfile(userId: string, input: { name?: string; email?: string }) {
  if (input.email) {
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing && existing.id !== userId) {
      throw new HttpError(409, "An account with that email already exists");
    }
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.name ? { name: input.name } : {}),
      ...(input.email ? { email: input.email } : {}),
    },
    select: { id: true, name: true, email: true },
  });

  return { user };
}

export async function googleLoginOrRegister(token: string) {
  if (!env.GOOGLE_CLIENT_ID) {
    throw new HttpError(500, "Google Auth is not configured on the server");
  }

  let payload;
  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch (err) {
    console.error("Google token verification failed:", err);
    throw new HttpError(401, "Invalid Google token");
  }

  if (!payload || !payload.email) {
    throw new HttpError(401, "Invalid Google token payload");
  }

  const { email, name } = payload;

  let user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true },
  });

  if (!user) {
    // Google Sign-Up: Generate secure random password hash
    const randomPassword = Math.random().toString(36) + Date.now().toString();
    const passwordHash = await bcrypt.hash(randomPassword, 12);
    user = await prisma.user.create({
      data: {
        name: name || email.split("@")[0],
        email,
        passwordHash,
        portfolios: { create: { name: "Primary Portfolio", baseCurrency: "USD" } },
      },
      select: { id: true, name: true, email: true },
    });
  }

  return toAuthResponse(user);
}
