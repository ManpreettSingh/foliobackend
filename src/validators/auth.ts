import { z } from "zod";

export const registerSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().toLowerCase(),
    password: z.string().min(8).max(128),
  }),
});

export const verifyRegisterSchema = z.object({
  body: z.object({
    email: z.string().trim().email(),
    code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from your email"),
  }),
});

export const resendRegisterSchema = z.object({
  body: z.object({ email: z.string().trim().email() }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().trim().email().toLowerCase(),
    password: z.string().min(1),
  }),
});
