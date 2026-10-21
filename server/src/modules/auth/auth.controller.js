import {
  loginUser,
  refreshUserSession,
  logoutUser,
  publicUser,
} from "./auth.service.js";
import User from "../users/user.model.js";
import { env } from "../../config/env.js";

const cookieName = "distribution_refresh";

const cookieOptions = {
  httpOnly: true,
  secure: env.nodeEnv === "production",
  sameSite: "strict",
  path: "/api/v1/auth",
  maxAge: env.refreshDays * 24 * 60 * 60 * 1000,
};

function setRefreshCookie(res, token) {
  res.cookie(cookieName, token, cookieOptions);
}

function clearRefreshCookie(res) {
  res.clearCookie(cookieName, {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: "strict",
    path: "/api/v1/auth",
  });
}

export async function login(req, res, next) {
  try {
    const { identifier, password } = req.body;
    const result = await loginUser(identifier, password);

    setRefreshCookie(res, result.refreshToken);

    res.json({
      accessToken: result.accessToken,
      user: result.user,
    });
  } catch (error) {
    next(error);
  }
}

export async function logout(req, res, next) {
  try {
    await logoutUser(req.cookies?.[cookieName]);
    clearRefreshCookie(res);
    res.json({ message: "Logged out successfully." });
  } catch (error) {
    next(error);
  }
}

export async function refresh(req, res, next) {
  try {
    const result = await refreshUserSession(
      req.cookies?.[cookieName]
    );

    setRefreshCookie(res, result.refreshToken);

    res.json({
      accessToken: result.accessToken,
      user: result.user,
    });
  } catch (error) {
    clearRefreshCookie(res);
    next(error);
  }
}

export async function me(req, res, next) {
  try {
    const user = await User.findById(req.user.id);

    if (!user || !user.isActive) {
      return res.status(401).json({ message: "Account unavailable." });
    }

    res.json({ user: publicUser(user) });
  } catch (error) {
    next(error);
  }
}