import { Router } from "express";
import { getOhlcv, isTimeframe, TIMEFRAMES } from "../services/ohlcv.js";

export const ohlcvRouter = Router();

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// GET /api/ohlcv/:mint?tf=1m|5m|15m|1h — real candles for the mint's
// deepest pool. Always 200: chart failures come back as {candles: [],
// pool: null} and the UI shows an empty state.
ohlcvRouter.get("/:mint", async (req, res, next) => {
  try {
    const mint = req.params.mint;
    if (!BASE58_RE.test(mint)) {
      res.status(400).json({ error: "not a valid mint address" });
      return;
    }
    const tf = req.query.tf ?? "1m";
    if (!isTimeframe(tf)) {
      res.status(400).json({ error: `tf must be one of ${TIMEFRAMES.join(", ")}` });
      return;
    }
    res.json(await getOhlcv(mint, tf));
  } catch (err) {
    next(err);
  }
});
