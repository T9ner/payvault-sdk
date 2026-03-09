import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { auth } from "@/lib/api";
import type { RegisterRequest } from "@/lib/types";
import { Loader2 } from "lucide-react";

export default function RegisterPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<RegisterRequest>({
    business_name: "",
    email: "",
    password: "",
  });
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (form.password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);
    try {
      const res = await auth.register(form);
      auth.setToken(res.token);
      navigate("/dashboard", { replace: true });
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Registration failed. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-semibold tracking-tight">
          Create your account
        </h2>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Start accepting payments in minutes
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Business Name</label>
          <input
            type="text"
            value={form.business_name}
            onChange={(e) =>
              setForm({ ...form, business_name: e.target.value })
            }
            placeholder="Acme Inc."
            required
            className="flex h-10 w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Email</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="merchant@example.com"
            required
            className="flex h-10 w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Password</label>
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="Min. 8 characters"
            required
            className="flex h-10 w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Confirm Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter your password"
            required
            className="flex h-10 w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="flex h-10 w-full items-center justify-center rounded-lg bg-[hsl(var(--primary))] text-sm font-medium text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Create Account"
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
        Already have an account?{" "}
        <Link
          to="/auth/login"
          className="font-medium text-[hsl(var(--primary))] hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
