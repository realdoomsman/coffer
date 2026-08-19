/**
 * Account creation, not wallet-connect.
 *
 * With VITE_PRIVY_APP_ID set, Privy handles email/Google/passkey signup and
 * silently provisions an embedded self-custodial Solana wallet (exportable
 * key — the Axiom/Photon trust pattern). Without it, a local demo user is
 * signed in so the whole UI works before any keys exist.
 */
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";

export interface AuthUser {
  id: string;
  handle: string;
  wallet?: string;
}

interface AuthState {
  ready: boolean;
  user: AuthUser | null;
  demo: boolean;
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState>({
  ready: false,
  user: null,
  demo: true,
  login: () => {},
  logout: () => {},
});

export const useAuth = () => useContext(AuthContext);

const PRIVY_APP_ID: string | undefined = import.meta.env.VITE_PRIVY_APP_ID;

function PrivyBridge({ children }: { children: ReactNode }) {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const value = useMemo<AuthState>(
    () => ({
      ready,
      demo: false,
      user:
        ready && authenticated && user
          ? {
              id: user.id,
              handle:
                user.email?.address ??
                user.google?.email ??
                user.id.slice(0, 10),
              wallet: user.wallet?.address,
            }
          : null,
      login,
      logout,
    }),
    [ready, authenticated, user, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function DemoAuth({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState(true);
  const value = useMemo<AuthState>(
    () => ({
      ready: true,
      demo: true,
      user: signedIn
        ? { id: "demo-user", handle: "you", wallet: "DemoWa11etAddr355xxxxxxxxxxxxxxxxxxxxxxxxxx" }
        : null,
      login: () => setSignedIn(true),
      logout: () => setSignedIn(false),
    }),
    [signedIn],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  if (!PRIVY_APP_ID) return <DemoAuth>{children}</DemoAuth>;
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ["email", "google"],
        appearance: { theme: "dark", accentColor: "#43d9a3" },
        embeddedWallets: {
          solana: { createOnLogin: "users-without-wallets" },
        },
      }}
    >
      <PrivyBridge>{children}</PrivyBridge>
    </PrivyProvider>
  );
}
