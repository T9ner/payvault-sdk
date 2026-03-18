import React, { createContext, useContext, useEffect, useState } from "react";
import { auth } from "@/lib/api";
import type { Merchant } from "@/lib/types";

interface AuthContextType {
  user: Merchant | null;
  loading: boolean;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: () => {},
  refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Merchant | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUser = async () => {
    try {
      if (auth.isAuthenticated()) {
        const merchant = await auth.getMe();
        setUser(merchant);
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error("Failed to load user:", err);
      setUser(null);
      auth.logout(); // Clear invalid token
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUser();
  }, []);

  const logout = () => {
    setUser(null);
    auth.logout();
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout, refreshUser: loadUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
