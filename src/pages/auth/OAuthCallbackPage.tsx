import { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { auth } from "@/lib/api";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function OAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [error, setError] = useState("");
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const token = searchParams.get("token");
    const errParam = searchParams.get("error");

    if (errParam) {
      setError(errParam);
      return;
    }

    if (!token) {
      setError("Authentication failed. No token received.");
      return;
    }

    const processLogin = async () => {
      try {
        auth.setToken(token);
        await refreshUser();
        navigate("/dashboard", { replace: true });
      } catch (err) {
        console.error("Callback processing error:", err);
        setError("Failed to initialize session.");
      }
    };

    processLogin();
  }, [searchParams, navigate, refreshUser]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 py-12">
        <div className="rounded-full bg-red-100 p-3 text-red-600 dark:bg-red-900/30">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-red-600">Authentication Error</h2>
        <p className="max-w-xs text-center text-sm text-[hsl(var(--muted-foreground))]">{error}</p>
        <button
          onClick={() => navigate("/auth/login", { replace: true })}
          className="mt-4 rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-opacity"
        >
          Return to Login
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center space-y-4 py-20">
      <Loader2 className="h-10 w-10 animate-spin text-[hsl(var(--primary))]" />
      <p className="text-sm font-medium text-[hsl(var(--muted-foreground))]">
        Authenticating with GitHub...
      </p>
    </div>
  );
}
