import type { Request, Response } from "express";
import {
  addHolding,
  createPortfolio,
  deleteHolding,
  deletePortfolio,
  getDashboard,
  listPortfolios,
  updateHolding,
  updatePortfolio,
} from "../services/portfolio.service.js";
import { HttpError } from "../utils/http-error.js";

function userId(req: Request) {
  if (!req.user) throw new HttpError(401, "Authentication required");
  return req.user.id;
}

function param(req: Request, key: string) {
  return String(req.params[key]);
}

export async function index(req: Request, res: Response) {
  res.json({ portfolios: await listPortfolios(userId(req)) });
}

export async function create(req: Request, res: Response) {
  res.status(201).json({ portfolio: await createPortfolio(userId(req), req.body) });
}

export async function update(req: Request, res: Response) {
  res.json({ portfolio: await updatePortfolio(userId(req), param(req, "portfolioId"), req.body) });
}

export async function destroy(req: Request, res: Response) {
  await deletePortfolio(userId(req), param(req, "portfolioId"));
  res.status(204).send();
}

export async function createHolding(req: Request, res: Response) {
  res.status(201).json({
    holding: await addHolding(userId(req), param(req, "portfolioId"), req.body),
  });
}

export async function patchHolding(req: Request, res: Response) {
  res.json({
    holding: await updateHolding(userId(req), param(req, "portfolioId"), param(req, "holdingId"), req.body),
  });
}

export async function removeHolding(req: Request, res: Response) {
  await deleteHolding(userId(req), param(req, "portfolioId"), param(req, "holdingId"));
  res.status(204).send();
}

export async function dashboard(req: Request, res: Response) {
  res.json(await getDashboard(userId(req)));
}
