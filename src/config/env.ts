import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required. Add a PostgreSQL connection string to the backend environment."),
  JWT_SECRET: z.string().min(32, "JWT_SECRET is required and must be at least 32 characters."),
  JWT_EXPIRES_IN: z.string().default("7d"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  MARKET_DATA_PROVIDER: z.string().default("stub"),
  MARKET_DATA_API_KEY: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  // Email (Resend) for signup verification codes. Without a key, codes are printed to the server
  // console in development and signup is refused in production.
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Folio <onboarding@resend.dev>"),
});

export const env = envSchema.parse(process.env);

export function assertRuntimeSecrets() {
  if (!env.JWT_SECRET) {
    throw new Error("JWT_SECRET is required. Add a long random value to the backend environment.");
  }
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required. Add a PostgreSQL connection string to the backend environment.");
  }
}
