import type { Request, Response } from "express";
import { addWatchlistAsset, listWatchlist, removeWatchlistAsset, searchAssets } from "../services/watchlist.service.js";
import { HttpError } from "../utils/http-error.js";

function userId(req: Request) {
  if (!req.user) throw new HttpError(401, "Authentication required");
  return req.user.id;
}

function param(req: Request, key: string) {
  return String(req.params[key]);
}

export async function index(req: Request, res: Response) {
  res.json({ watchlist: await listWatchlist(userId(req)) });
}

export async function create(req: Request, res: Response) {
  res.status(201).json({ watchlistItem: await addWatchlistAsset(userId(req), req.body) });
}

export async function destroy(req: Request, res: Response) {
  await removeWatchlistAsset(userId(req), param(req, "assetId"));
  res.status(204).send();
}

export async function search(req: Request, res: Response) {
  res.json({ assets: await searchAssets(String(req.query.q)) });
}
