/** Auth context split out so the Privy chunk and the app share one type. */
import { createContext } from "react";

export interface AuthUser {
  id: string;
  handle: string;
  wallet?: string;
}

export interface AuthState {
  ready: boolean;
  user: AuthUser | null;
  demo: boolean;
  login: () => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthState>({
  ready: false,
  user: null,
  demo: true,
  login: () => {},
  logout: () => {},
});
