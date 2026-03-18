import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { auth } from "@/lib/api";

export default function AuthLayout() {
  const navigate = useNavigate();

  useEffect(() => {
    if (auth.isAuthenticated()) {
      navigate("/dashboard", { replace: true });
    }
  }, [navigate]);

  return (
    <div className="flex min-h-screen">
      {/* Left panel - Branding */}
      <div className="hidden w-1/2 flex-col justify-between bg-[hsl(var(--primary))] p-10 text-[hsl(var(--primary-foreground))] lg:flex">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="PayVault Logo" className="h-12 w-auto object-contain rounded-xl shadow-sm" />
          <span className="text-3xl font-semibold tracking-tight">PayVault</span>
        </div>
        <div>
          <h1 className="mb-4 text-4xl font-bold tracking-tight">
            Payment infrastructure for Africa
          </h1>
          <p className="text-lg opacity-80">
            Accept payments, manage subscriptions, and prevent fraud — all from a single API.
          </p>
        </div>
        <p className="text-sm opacity-60">
          Trusted by 500+ businesses across 12 African countries.
        </p>
      </div>

      {/* Right panel - Form */}
      <div className="flex w-full items-center justify-center px-6 lg:w-1/2">
        <div className="w-full max-w-md">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
