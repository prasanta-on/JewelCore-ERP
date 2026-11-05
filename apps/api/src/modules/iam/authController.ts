import type { Request, Response, NextFunction } from "express";
import {
  registerUserSchema,
  loginSchema,
  UnauthorizedError,
} from "@jewelcore/shared";
import {
  registerUserService,
  loginService,
  getCurrentUserService,
} from "./authService.js";
import { verifyJwt } from "./authUtils.js";

export async function registerHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const validated = registerUserSchema.parse(req.body);
    const user = await registerUserService(validated);
    res.status(201).json({
      data: user,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function loginHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const validated = loginSchema.parse(req.body);
    const { accessToken, refreshToken, user } = await loginService(validated);

    // Set secure HTTP-only refresh cookie
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/v1/iam/auth",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.status(200).json({
      data: {
        accessToken,
        user,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function meHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedError("Authorization header with Bearer token is required");
    }

    const token = authHeader.substring(7);
    const claims = await verifyJwt(token);

    const user = await getCurrentUserService(claims.userId);
    res.status(200).json({
      data: user,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}
