import type { Request, Response } from "express";
import {
  loginUser,
  startRegistration,
  resendRegistrationCode,
  verifyRegistration,
  googleLoginOrRegister,
  updateProfile as updateProfileService,
} from "../services/auth.service.js";

// Sign-up is two steps: this emails a code (202 = accepted, not created yet)...
export async function register(req: Request, res: Response) {
  const result = await startRegistration(req.body);
  res.status(202).json(result);
}

// ...and this checks it, creates the account and returns the session token.
export async function verifyRegister(req: Request, res: Response) {
  const result = await verifyRegistration(req.body);
  res.status(201).json(result);
}

export async function resendRegisterCode(req: Request, res: Response) {
  const result = await resendRegistrationCode(req.body.email);
  res.json(result);
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
