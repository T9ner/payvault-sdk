import { CreditCard } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      {/* Left branding panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-[hsl(var(--primary))] p-12 text-[hsl(var(--primary-foreground))]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10">
            <CreditCard className="h-5 w-5" />
          </div>
          <span className="text-xl font-semibold tracking-tight">PayVault</span>
        </div>

        <div className="space-y-6">
          <blockquote className="space-y-4">
            <p className="text-2xl font-medium leading-relaxed">
              &ldquo;PayVault made it effortless to accept payments across Africa.
              We went live in under 10 minutes.&rdquo;
            </p>
            <footer className="text-sm opacity-80">
              &mdash; Amara Obi, CTO at Vendora
            </footer>
          </blockquote>
        </div>

        <p className="text-xs opacity-60">
          Secure payments infrastructure for modern businesses
        </p>
      </div>

      {/* Right form panel */}
      <div className="flex w-full flex-col items-center justify-center bg-[hsl(var(--background))] p-6 sm:p-8 lg:w-1/2">
        {/* Mobile logo */}
        <div className="mb-8 flex items-center gap-2 lg:hidden">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[hsl(var(--primary))]">
            <CreditCard className="h-4 w-4 text-[hsl(var(--primary-foreground))]" />
          </div>
          <span className="text-lg font-semibold">PayVault</span>
        </div>

        <div className="w-full max-w-[400px]">{children}</div>
      </div>
    </div>
  );
}
