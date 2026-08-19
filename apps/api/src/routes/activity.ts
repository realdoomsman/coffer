import { Router } from "express";
import { getActivity } from "../services/activity.js";

export const activityRouter = Router();

// GET /api/activity?limit=30 — newest-first merged platform feed with
// pre-rendered ticker lines. Always {events: ActivityEvent[]}.
activityRouter.get("/", async (req, res, next) => {
  try {
    const raw = Number(req.query.limit);
    const limit = Number.isFinite(raw) && raw > 0 ? raw : 30;
    res.json({ events: await getActivity(limit) });
  } catch (err) {
    next(err);
  }
});
