// ── env loading (no dotenv dependency) ─────────────────────────────
// Precedence, lowest → highest:  repo-root .env  →  apps/api/.env  →
// real process.env. We parse the files ourselves (tiny KEY=VALUE
// grammar, quotes stripped, # comments ignored) so the API has zero
// config dependencies.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url)); // apps/api/src
const API_DIR = resolve(HERE, "..");
const REPO_ROOT = resolve(API_DIR, "..", "..");

function parseEnvFile(path: string): Record<string, string> {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return {};
  }
  const out: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, "");
    let value = line.slice(eq + 1).trim();
    // strip surrounding quotes, then trailing inline comments on unquoted values
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      const hash = value.indexOf(" #");
      if (hash >= 0) value = value.slice(0, hash).trim();
    }
    if (key) out[key] = value;
  }
  return out;
}

const fileEnv: Record<string, string> = {
  ...parseEnvFile(resolve(REPO_ROOT, ".env")), // root first (lowest)
  ...parseEnvFile(resolve(API_DIR, ".env")), // app overrides root
};

// Real environment always wins over files.
for (const [k, v] of Object.entries(fileEnv)) {
  if (process.env[k] === undefined) process.env[k] = v;
}

// Prisma reads DATABASE_URL from process.env — guarantee the dev default.
if (!process.env.DATABASE_URL) process.env.DATABASE_URL = "file:./dev.db";

function str(key: string, fallback = ""): string {
  const v = process.env[key];
  return v === undefined || v === "" ? fallback : v;
}

function int(key: string, fallback: number): number {
  const v = Number.parseInt(str(key), 10);
  return Number.isFinite(v) ? v : fallback;
}

// ── typed accessors ────────────────────────────────────────────────

export const env = {
  get databaseUrl(): string {
    return str("DATABASE_URL", "file:./dev.db");
  },
  get port(): number {
    return int("PORT", 8787);
  },
  /** Jupiter Price v3 — keyless works at low rate; key raises limits. */
  get jupiterApiKey(): string | undefined {
    return str("JUPITER_API_KEY") || undefined;
  },
  /** Birdeye — tier 2 of the price oracle; skipped entirely without a key. */
  get birdeyeApiKey(): string | undefined {
    return str("BIRDEYE_API_KEY") || undefined;
  },
  get solanaRpcUrl(): string {
    return str("SOLANA_RPC_URL", "https://api.devnet.solana.com");
  },
  /** Public mainnet RPC for read-only wallet scans (keyless works, rate-limited). */
  get mainnetRpcUrl(): string {
    return str("MAINNET_RPC_URL", "https://api.mainnet-beta.solana.com");
  },
  get nodeEnv(): string {
    return str("NODE_ENV", "development");
  },
} as const;
