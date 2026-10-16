import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "../config/prisma.js";
import { HttpError } from "../utils/http-error.js";
import { signToken } from "../utils/jwt.js";
import { env } from "../config/env.js";
import { sendEmail, verificationEmail } from "./email.service.js";
import {
  CODE_TTL_MS,
  RESEND_COOLDOWN_MS,
  consumePendingSignup,
  createPendingSignup,
  discardPendingSignup,
  refreshPendingCode,
} from "./otp.service.js";

const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);

function toAuthResponse(user: { id: string; name: string; email: string }) {
  return {
    user,
    token: signToken({ sub: user.id, email: user.email }),
  };
}

// Emails compare case-insensitively: request validation does not rewrite the body, so
// "Me@x.com" and "me@x.com" must resolve to the same account.
function findUserByEmail(email: string) {
  return prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
}

const CODE_MINUTES = CODE_TTL_MS / 60000;

async function emailCode(email: string, code: string) {
  await sendEmail({ to: email, ...verificationEmail(code, CODE_MINUTES) });
}

const verificationStarted = (email: string) => ({
  verificationRequired: true as const,
  email,
  expiresInSeconds: CODE_TTL_MS / 1000,
  resendAfterSeconds: RESEND_COOLDOWN_MS / 1000,
});

/** Step 1 of sign-up: validate, then email a 6-digit code. No account exists until it is verified. */
export async function startRegistration(input: { name: string; email: string; password: string }) {
  const email = input.email.trim().toLowerCase();
  if (await findUserByEmail(email)) throw new HttpError(409, "An account with that email already exists");

  const passwordHash = await bcrypt.hash(input.password, 12);
  const code = createPendingSignup({ name: input.name, email, passwordHash });
  try {
    await emailCode(email, code);
  } catch (err) {
    discardPendingSignup(email); // don't leave a pending sign-up the user never received a code for
    throw err;
  }
  return verificationStarted(email);
}

export async function resendRegistrationCode(rawEmail: string) {
  const email = rawEmail.trim().toLowerCase();
  const code = refreshPendingCode(email);
  await emailCode(email, code);
  return verificationStarted(email);
}

/** Step 2 of sign-up: check the code, then create the account and sign the user in. */
export async function verifyRegistration(input: { email: string; code: string }) {
  const entry = consumePendingSignup(input.email, input.code);

  // Someone could have registered the same email (e.g. via Google) while the code was pending.
  if (await findUserByEmail(entry.email)) throw new HttpError(409, "An account with that email already exists");

  const user = await prisma.user.create({
    data: {
      name: entry.name,
      email: entry.email,
      passwordHash: entry.passwordHash,
      portfolios: { create: { name: "Primary Portfolio", baseCurrency: "USD" } },
    },
    select: { id: true, name: true, email: true },
  });

  return toAuthResponse(user);
}

export async function loginUser(input: { email: string; password: string }) {
  const user = await findUserByEmail(input.email.trim());
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

  // An unverified Google email must not be able to sign in as an existing account.
  if (payload.email_verified === false) {
    throw new HttpError(401, "Google email address is not verified");
  }

  const email = payload.email.toLowerCase();
  const { name } = payload;

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
