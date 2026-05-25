import type { Request, Response } from "express";
import { loginUser, registerUser, googleLoginOrRegister, updateProfile as updateProfileService } from "../services/auth.service.js";

export async function register(req: Request, res: Response) {
  const result = await registerUser(req.body);
  res.status(201).json(result);
}

export async function login(req: Request, res: Response) {
  const result = await loginUser(req.body);
  res.json(result);
}

export async function logout(_req: Request, res: Response) {
  res.status(204).send();
}

export async function me(req: Request, res: Response) {
  res.json({ user: req.user });
}

export async function googleAuth(req: Request, res: Response) {
  const result = await googleLoginOrRegister(req.body.token);
  res.json(result);
}

export async function updateProfile(req: Request, res: Response) {
  const result = await updateProfileService(req.user!.id, req.body);
  res.json(result);
}
