import { Router } from "express";
import { getTraderView } from "../services/traders.js";

export const tradersRouter = Router();

// GET /api/traders/:handle — public trader profile: identity + their
// vaults (full shared Vault shapes) + aggregate totals across them.
tradersRouter.get("/:handle", async (req, res, next) => {
  try {
    const view = await getTraderView(req.params.handle);
    if (!view) {
      res.status(404).json({ error: "trader not found" });
      return;
    }
    res.json(view);
  } catch (err) {
    next(err);
  }
});
