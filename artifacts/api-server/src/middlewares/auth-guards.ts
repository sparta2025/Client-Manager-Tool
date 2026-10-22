import type { RequestHandler } from "express";
import type { CurrentAppUser } from "./auth.js";

export const requireActiveUser: RequestHandler = (req, res, next): void => {
  if (req.appUser?.status !== "active") {
    res.status(403).json({
      error: req.appUser?.status === "disabled" ? "Account disabled" : "Administrator approval required",
      code: req.appUser?.status === "disabled" ? "ACCOUNT_DISABLED" : "ACCOUNT_PENDING",
    });
    return;
  }
  next();
};

export const requireAdministrator: RequestHandler = (req, res, next): void => {
  if (req.appUser?.role !== "admin") {
    res.status(403).json({ error: "Administrator access required" });
    return;
  }
  next();
};

declare global {
  namespace Express {
    interface Request {
      appUser?: CurrentAppUser;
    }
  }
}
