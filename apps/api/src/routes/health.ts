import { Router } from "express";
import { prisma } from "../db.js";

export const healthRouter = Router();

// GET /api/health → { ok, db, uptime }
healthRouter.get("/", async (_req, res) => {
  let db = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = true;
  } catch {
    // db stays false — still report, don't 500
  }
  res.status(db ? 200 : 503).json({
    ok: db,
    db,
    uptime: Math.floor(process.uptime()),
  });
});
