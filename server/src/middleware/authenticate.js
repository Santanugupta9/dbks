import jwt from "jsonwebtoken";
import User from "../modules/users/user.model.js";
import { env } from "../config/env.js";

export async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const [scheme, token] = header.split(" ");

    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({
        message: "Authentication required.",
      });
    }

    const payload = jwt.verify(token, env.accessSecret, {
      algorithms: ["HS256"],
    });

    const user = await User.findById(payload.sub);

    if (!user || !user.isActive || user.role !== payload.role) {
      return res.status(401).json({
        message: "Session is invalid or account is inactive.",
      });
    }

    req.user = {
      id: user._id.toString(),
      role: user.role,
      name: user.name,
      loginIdentifier: user.loginIdentifier,
    };

    next();
  } catch {
    return res.status(401).json({
      message: "Invalid or expired access token.",
    });
  }
}