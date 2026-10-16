import crypto from "node:crypto";
import { env } from "../config/env.js";
import { HttpError } from "../utils/http-error.js";

/**
 * Pending sign-ups awaiting an emailed one-time code.
 *
 * Held in memory on purpose: nothing touches the database until the email is proven, and no schema
 * change is needed. Trade-off: pending sign-ups are lost on a server restart (the user just asks
 * for a new code) and are not shared across multiple server instances. If you scale out, move this
 * Map to a database table or Redis behind the same functions.
 */

export const CODE_TTL_MS = 10 * 60 * 1000; // code is valid for 10 minutes
export const RESEND_COOLDOWN_MS = 60 * 1000; // at most one email per address per minute
const MAX_ATTEMPTS = 5; // wrong guesses before the code is burned
const MAX_PENDING = 5000; // cap memory use under abuse

type PendingSignup = {
  name: string;
  email: string;
  passwordHash: string;
  codeHash: string;
  expiresAt: number;
  attempts: number;
  lastSentAt: number;
};

const pending = new Map<string, PendingSignup>();

// Drop expired entries so abandoned sign-ups don't accumulate.
setInterval(() => {
  const now = Date.now();
  for (const [email, entry] of pending) {
    if (entry.expiresAt < now) pending.delete(email);
  }
}, 60 * 1000).unref();

function generateCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

// Keyed hash so a code is never stored in plain text and can't be brute-forced from a memory dump.
function hashCode(email: string, code: string): string {
  return crypto.createHmac("sha256", env.JWT_SECRET).update(`${email}:${code}`).digest("hex");
}

function secondsLeft(ms: number) {
  return Math.max(1, Math.ceil(ms / 1000));
}

function assertCooldown(existing: PendingSignup | undefined) {
  if (!existing) return;
  const wait = existing.lastSentAt + RESEND_COOLDOWN_MS - Date.now();
  if (wait > 0) {
    throw new HttpError(429, `Please wait ${secondsLeft(wait)}s before requesting another code.`, {
      retryAfterSeconds: secondsLeft(wait),
    });
  }
}

/** Store a new pending sign-up and return the plain code to email. */
export function createPendingSignup(data: { name: string; email: string; passwordHash: string }): string {
  const email = data.email.toLowerCase();
  const existing = pending.get(email);
  assertCooldown(existing);
  if (!existing && pending.size >= MAX_PENDING) {
    throw new HttpError(503, "Too many sign-ups in progress. Please try again shortly.");
  }

  const code = generateCode();
  pending.set(email, {
    name: data.name,
    email,
    passwordHash: data.passwordHash,
    codeHash: hashCode(email, code),
    expiresAt: Date.now() + CODE_TTL_MS,
    attempts: 0,
    lastSentAt: Date.now(),
  });
  return code;
}

/** Issue a fresh code for an existing pending sign-up. */
export function refreshPendingCode(rawEmail: string): string {
  const email = rawEmail.toLowerCase();
  const entry = pending.get(email);
  if (!entry || entry.expiresAt < Date.now()) {
    pending.delete(email);
    throw new HttpError(404, "Your sign-up expired. Please start again.");
  }
  assertCooldown(entry);

  const code = generateCode();
  entry.codeHash = hashCode(email, code);
  entry.expiresAt = Date.now() + CODE_TTL_MS;
  entry.attempts = 0;
  entry.lastSentAt = Date.now();
  return code;
}

/** Roll back a pending sign-up whose email could not be sent. */
export function discardPendingSignup(rawEmail: string) {
  pending.delete(rawEmail.toLowerCase());
}

/** Check a submitted code; on success remove and return the pending sign-up. */
export function consumePendingSignup(rawEmail: string, code: string): PendingSignup {
  const email = rawEmail.toLowerCase();
  const entry = pending.get(email);
  if (!entry || entry.expiresAt < Date.now()) {
    pending.delete(email);
    throw new HttpError(400, "That code has expired. Please request a new one.");
  }

  const expected = Buffer.from(entry.codeHash, "hex");
  const actual = Buffer.from(hashCode(email, code), "hex");
  const ok = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);

  if (!ok) {
    entry.attempts += 1;
    if (entry.attempts >= MAX_ATTEMPTS) {
      pending.delete(email);
      throw new HttpError(429, "Too many incorrect codes. Please request a new one.");
    }
    throw new HttpError(400, `Incorrect code. ${MAX_ATTEMPTS - entry.attempts} attempt(s) left.`);
  }

  pending.delete(email);
  return entry;
}
