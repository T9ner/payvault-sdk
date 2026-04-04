import { cn } from "../../lib/utils";

interface StatusBadgeProps {
  status: string;
  variant?: "default" | "outline" | "minimal";
  className?: string;
}

/**
 * NOTHING DESIGN — Status Indicator
 * No rounded corners. Minimal styling.
 * Color applied to VALUE, not background.
 */
export function StatusBadge({ status, variant = "default", className }: StatusBadgeProps) {
  const s = status.toLowerCase();

  // Success: green (data status color)
  if (["success", "active", "paid", "delivered"].includes(s)) {
    const colors = {
      default: "bg-emerald-100 text-emerald-800",
      minimal: "text-emerald-700",
      outline: "border border-emerald-300 text-emerald-700",
    };
    return <Badge colors={colors} variant={variant} status={status} className={className} />;
  }

  // Pending: amber (warning)
  if (["pending", "trialing", "retrying"].includes(s)) {
    const colors = {
      default: "bg-amber-100 text-amber-800",
      minimal: "text-amber-700",
      outline: "border border-amber-300 text-amber-700",
    };
    return <Badge colors={colors} variant={variant} status={status} className={className} />;
  }

  // Failed: RED — the interrupt color
  if (["failed", "past_due", "blocked", "canceled", "cancelled", "revoked"].includes(s)) {
    const colors = {
      default: "bg-red-100 text-red-800",
      minimal: "text-red-700 font-semibold",
      outline: "border border-red-300 text-red-700",
    };
    return <Badge colors={colors} variant={variant} status={status} className={className} />;
  }

  // Incomplete: orange
  if (["incomplete"].includes(s)) {
    const colors = {
      default: "bg-orange-100 text-orange-800",
      minimal: "text-orange-700",
      outline: "border border-orange-300 text-orange-700",
    };
    return <Badge colors={colors} variant={variant} status={status} className={className} />;
  }

  // Refunded/Inactive: gray
  if (["refunded", "inactive"].includes(s)) {
    const colors = {
      default: "bg-zinc-100 text-zinc-600",
      minimal: "text-zinc-500",
      outline: "border border-zinc-300 text-zinc-600",
    };
    return <Badge colors={colors} variant={variant} status={status} className={className} />;
  }

  // Default fallback
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-xs font-medium",
        "bg-zinc-100 text-zinc-600",
        className
      )}
    >
      {status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ")}
    </span>
  );
}

function Badge({
  colors,
  variant,
  status,
  className
}: {
  colors: { default: string; minimal: string; outline: string };
  variant: string;
  status: string;
  className?: string;
}) {
  const colorClass = variant === "minimal" ? colors.minimal : colors.default;

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-xs font-medium transition-colors",
        colorClass,
        className
      )}
    >
      {status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ")}
    </span>
  );
}