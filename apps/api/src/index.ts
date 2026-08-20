// ── Coffer API server ──────────────────────────────────────────────
import "./env.js"; // load .env files before anything reads process.env
import cors from "cors";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { env } from "./env.js";
import { activityRouter } from "./routes/activity.js";
import { dcaRouter } from "./routes/dca.js";
import { healthRouter } from "./routes/health.js";
import { metaRouter } from "./routes/meta.js";
import { ohlcvRouter } from "./routes/ohlcv.js";
import { ordersRouter } from "./routes/orders.js";
import { poolTradesRouter } from "./routes/pooltrades.js";
import { portfolioRouter } from "./routes/portfolio.js";
import { pulseRouter } from "./routes/pulse.js";
import { securityRouter } from "./routes/security.js";
import { tokensRouter } from "./routes/tokens.js";
import { tokenStatsRouter } from "./routes/tokenstats.js";
import { tradersRouter } from "./routes/traders.js";
import { vaultsRouter } from "./routes/vaults.js";
import { walletsRouter } from "./routes/wallets.js";
import { withdrawalsRouter } from "./routes/withdrawals.js";
import { startOrderEngine, stopOrderEngine } from "./services/orderEngine.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "256kb" }));

app.use("/api/health", healthRouter);
app.use("/api/vaults", vaultsRouter);
app.use("/api/tokens", tokensRouter);
app.use("/api/tokenstats", tokenStatsRouter);
app.use("/api/traders", tradersRouter);
app.use("/api/pulse", pulseRouter);
app.use("/api/security", securityRouter);
app.use("/api/ohlcv", ohlcvRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/dca", dcaRouter);
app.use("/api/portfolio", portfolioRouter);
app.use("/api/wallets", walletsRouter);
app.use("/api/activity", activityRouter);
app.use("/api/pooltrades", poolTradesRouter);
app.use("/api/withdrawals", withdrawalsRouter);
app.use("/api/meta", metaRouter);

// 404 — JSON, always
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "not found" });
});

// Error middleware — JSON errors, stack stays server-side.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[api] unhandled error:", err);
  const message = err instanceof Error ? err.message : "internal error";
  res.status(500).json({ error: message });
});

const ROUTES: Array<[string, string]> = [
  ["GET ", "/api/health"],
  ["GET ", "/api/vaults?sort=&type=&mode="],
  ["GET ", "/api/vaults/:id"],
  ["POST", "/api/vaults"],
  ["POST", "/api/vaults/:id/deposit"],
  ["POST", "/api/vaults/:id/withdraw"],
  ["POST", "/api/vaults/:id/trade"],
  ["GET ", "/api/tokens?ids=a,b,c"],
  ["GET ", "/api/tokens/search?q="],
  ["GET ", "/api/tokens/trending"],
  ["GET ", "/api/tokens/:mint"],
  ["GET ", "/api/tokenstats/:mint"],
  ["GET ", "/api/traders/:handle"],
  ["GET ", "/api/pulse"],
  ["GET ", "/api/ohlcv/:mint?tf=1m|5m|15m|1h"],
  ["POST", "/api/orders"],
  ["GET ", "/api/orders?vaultId=&status="],
  ["POST", "/api/orders/:id/cancel"],
  ["*   ", "/api/dca (POST · GET ?vaultId= · POST /:id/cancel)"],
  ["GET ", "/api/portfolio"],
  ["GET ", "/api/wallets/tracked"],
  ["POST", "/api/wallets/tracked"],
  ["POST", "/api/wallets/tracked/:address/scan?force=1"],
  ["GET ", "/api/activity?limit=30&mode="],
  ["GET ", "/api/pooltrades/:mint"],
  ["POST", "/api/withdrawals/:id/execute"],
  ["GET ", "/api/meta"],
  ["GET ", "/api/security/:mint"],
];

const server = app.listen(env.port, () => {
  console.log(`[api] coffer api listening on http://localhost:${env.port}`);
  console.log(`[api] db: ${env.databaseUrl}`);
  for (const [method, path] of ROUTES) console.log(`  ${method} ${path}`);
  // Trigger engine + live revaluation only run alongside the server —
  // never during seed (seed.ts doesn't import this module).
  startOrderEngine();
});

function shutdown(): void {
  stopOrderEngine();
  server.close(() => process.exit(0));
  // failsafe if a keep-alive socket stalls close()
  setTimeout(() => process.exit(0), 3_000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
