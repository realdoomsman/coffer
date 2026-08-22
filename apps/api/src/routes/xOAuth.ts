// ── X (Twitter) OAuth Integration ───────────────────────────────────
import { Router } from "express";
import { prisma } from "../db.js";
import { getTraderView } from "../services/traders.js";

export const xOAuthRouter = Router();

// X OAuth 2.0 Configuration
const X_OAUTH_CONFIG = {
  clientId: process.env.X_CLIENT_ID || "",
  clientSecret: process.env.X_CLIENT_SECRET || "",
  redirectUri: process.env.X_REDIRECT_URI || `${process.env.FRONTEND_URL}/auth/x/callback`,
  authorizeUrl: "https://twitter.com/i/oauth2/authorize",
  tokenUrl: "https://api.twitter.com/2/oauth2/token",
  scope: "tweet.read users.read",
};

// Simple in-memory state storage (production should use Redis)
const oauthStates = new Map<string, { userId: string; expires: number }>();

/**
 * GET /api/auth/x
 * Initiate X OAuth flow - redirect user to X authorization page
 */
xOAuthRouter.get("/x", async (req, res) => {
  try {
    const { userId, handle } = req.query;
    
    if (!userId || !handle) {
      return res.status(400).json({ error: "userId and handle required" });
    }

    const state = generateState();
    oauthStates.set(state, {
      userId: userId as string,
      expires: Date.now() + 10 * 60 * 1000, // 10 minutes
    });
    
    const params = new URLSearchParams({
      response_type: "code",
      client_id: X_OAUTH_CONFIG.clientId,
      redirect_uri: X_OAUTH_CONFIG.redirectUri,
      scope: X_OAUTH_CONFIG.scope,
      state: state,
      code_challenge: state,
      code_challenge_method: "plain",
    });

    res.redirect(`${X_OAUTH_CONFIG.authorizeUrl}?${params.toString()}`);
  } catch (error) {
    console.error("[X OAuth] Error:", error);
    res.status(500).json({ error: "Failed to initiate X OAuth" });
  }
});

/**
 * GET /api/auth/x/callback
 * Handle X OAuth callback - exchange code for tokens
 */
xOAuthRouter.get("/x/callback", async (req, res) => {
  try {
    const { code, state } = req.query;
    
    // Verify state matches and hasn't expired
    const oauthState = oauthStates.get(state as string);
    if (!oauthState || oauthState.expires < Date.now()) {
      return res.redirect(`${process.env.FRONTEND_URL}/settings?error=invalid_state`);
    }

    // Exchange authorization code for access token
    const tokenResponse = await fetch(X_OAUTH_CONFIG.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${Buffer.from(`${X_OAUTH_CONFIG.clientId}:${X_OAUTH_CONFIG.clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code as string,
        redirect_uri: X_OAUTH_CONFIG.redirectUri,
        code_verifier: state as string,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error("Failed to exchange authorization code");
    }

    const tokens: any = await tokenResponse.json();

    // Fetch user profile from X API
    const userResponse = await fetch("https://api.twitter.com/2/users/me", {
      headers: {
        "Authorization": `Bearer ${tokens.access_token}`,
      },
    });

    if (!userResponse.ok) {
      throw new Error("Failed to fetch X user profile");
    }

    const userData: any = await userResponse.json();
    const xHandle = userData.data.username;
    const xVerified = userData.data.verified || false;

    // Update user's profile with X handle
    await prisma.user.update({
      where: { id: oauthState.userId },
      data: {
        xHandle,
        xVerified,
      },
    });

    // Clean up state
    oauthStates.delete(state as string);

    res.redirect(`${process.env.FRONTEND_URL}/settings?x_connected=true&handle=${xHandle}`);
  } catch (error) {
    console.error("[X OAuth callback] Error:", error);
    res.redirect(`${process.env.FRONTEND_URL}/settings?error=x_oauth_failed`);
  }
});

/**
 * POST /api/auth/x/disconnect
 * Disconnect X account from user profile
 */
xOAuthRouter.post("/x/disconnect", async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: "userId required" });
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        xHandle: null,
        xVerified: false,
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("[X OAuth disconnect] Error:", error);
    res.status(500).json({ error: "Failed to disconnect X account" });
  }
});

/**
 * GET /api/auth/x/status
 * Get current X connection status
 */
xOAuthRouter.get("/x/status", async (req, res) => {
  try {
    const { userId, handle } = req.query;
    
    if (!handle) {
      return res.json({ connected: false });
    }

    const user = await getTraderView(handle as string);
    
    res.json({
      connected: !!user?.trader?.xHandle,
      handle: user?.trader?.xHandle || null,
      verified: user?.trader?.xVerified || false,
    });
  } catch (error) {
    console.error("[X OAuth status] Error:", error);
    res.status(500).json({ error: "Failed to fetch X status" });
  }
});

// ── Helper Functions ─────────────────────────────────────────────────

function generateState(): string {
  return Math.random().toString(36).substring(2, 15) +
         Math.random().toString(36).substring(2, 15);
}