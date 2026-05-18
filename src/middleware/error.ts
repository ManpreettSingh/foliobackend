import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { HttpError } from "../utils/http-error.js";

export const errorMiddleware: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    return res.status(400).json({
      error: "Validation failed",
      details: error.flatten(),
    });
  }

  if (error instanceof HttpError) {
    return res.status(error.statusCode).json({
      error: error.message,
      details: error.details,
    });
  }

  console.error(error);
  return res.status(500).json({ error: "Internal server error" });
};
