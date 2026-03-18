import { cn } from "../../lib/utils";

interface StatusBadgeProps {
  status: string;
  variant?: "default" | "outline";
  className?: string;
}

export function StatusBadge({ status, variant = "default", className }: StatusBadgeProps) {
  const s = status.toLowerCase();

  let colorClass = "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]";
  
  if (["success", "active", "paid", "delivered"].includes(s)) {
    colorClass = "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400";
  } else if (["pending", "trialing", "retrying"].includes(s)) {
    colorClass = "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
  } else if (["failed", "past_due", "blocked", "canceled", "cancelled", "revoked"].includes(s)) {
    colorClass = "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
  } else if (["incomplete"].includes(s)) {
    colorClass = "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400";
  } else if (["refunded", "inactive"].includes(s)) {
    colorClass = "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-400";
  }

  if (variant === "outline") {
    // If outline, we might want to just set text and border, but default is usually best for pills
    colorClass = cn(colorClass, "bg-transparent border border-current");
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-tight transition-colors",
        colorClass,
        className
      )}
    >
      {status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ")}
    </span>
  );
}
