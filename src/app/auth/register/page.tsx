"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/api";
import { Eye, EyeOff, Loader2, ArrowRight } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await auth.register({
        business_name: businessName,
        email,
        password,
      });
      auth.setToken(res.token);
      router.push("/dashboard");
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data
              ?.error
          : undefined;
      setError(msg || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Start accepting payments in under 10 minutes
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400">
            <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="businessName">
            Business name
          </label>
          <input
            id="businessName"
            type="text"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="Acme Inc."
            required
            className="flex h-11 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3.5 py-2 text-sm outline-none transition-all placeholder:text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--muted-foreground))]/30 focus:border-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--ring))]/20"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="email">
            Work email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@business.com"
            required
            className="flex h-11 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3.5 py-2 text-sm outline-none transition-all placeholder:text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--muted-foreground))]/30 focus:border-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--ring))]/20"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="password">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 characters"
              required
              minLength={8}
              className="flex h-11 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3.5 py-2 pr-10 text-sm outline-none transition-all placeholder:text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--muted-foreground))]/30 focus:border-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--ring))]/20"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Must contain at least 8 characters
          </p>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[hsl(var(--primary))] text-sm font-medium text-[hsl(var(--primary-foreground))] shadow-sm transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              Get started
              <ArrowRight size={16} />
            </>
          )}
        </button>

        <p className="text-xs text-center text-[hsl(var(--muted-foreground))]">
          By creating an account, you agree to our{" "}
          <span className="underline underline-offset-2 cursor-pointer hover:text-[hsl(var(--foreground))] transition-colors">
            Terms of Service
          </span>{" "}
          and{" "}
          <span className="underline underline-offset-2 cursor-pointer hover:text-[hsl(var(--foreground))] transition-colors">
            Privacy Policy
          </span>
        </p>
      </form>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-[hsl(var(--border))]" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-[hsl(var(--background))] px-3 text-[hsl(var(--muted-foreground))]">
            Already have an account?
          </span>
        </div>
      </div>

      {/* Sign in CTA */}
      <Link
        href="/auth/login"
        className="flex h-11 w-full items-center justify-center rounded-lg border-2 border-[hsl(var(--border))] bg-transparent text-sm font-medium text-[hsl(var(--foreground))] shadow-sm transition-all hover:bg-[hsl(var(--accent))] hover:border-[hsl(var(--muted-foreground))]/30 active:scale-[0.98]"
      >
        Sign in instead
      </Link>
    </div>
  );
}
