/**
 * Privy auth tree — imported LAZILY by auth.tsx.
 *
 * Privy pulls WalletConnect's entire Ethereum provider stack (~300kB) even
 * though this platform is Solana-only and account-based. Keeping it in its
 * own chunk means users who haven't configured VITE_PRIVY_APP_ID never
 * download it, and users who have get it in parallel with the app shell.
 */
import { useMemo, type ReactNode } from "react";
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import { AuthContext, type AuthState } from "./authContext";

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
              handle: user.email?.address ?? user.google?.email ?? user.id.slice(0, 10),
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

export default function PrivyAuth({
  appId,
  children,
}: {
  appId: string;
  children: ReactNode;
}) {
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email", "google"],
        appearance: { theme: "dark", accentColor: "#ffb000" },
        embeddedWallets: { solana: { createOnLogin: "users-without-wallets" } },
      }}
    >
      <PrivyBridge>{children}</PrivyBridge>
    </PrivyProvider>
  );
}
