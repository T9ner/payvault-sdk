import { cn } from "../../lib/utils";
import { Skeleton } from "./skeleton";

interface StatCardProps {
  label: string;
  value: string | number;
  change?: {
    value: string;
    trend: "up" | "down" | "neutral";
  };
  icon?: React.ElementType;
  loading?: boolean;
}

export function StatCard({ label, value, change, icon: Icon, loading }: StatCardProps) {
  if (loading) {
    return <Skeleton className="h-32 w-full rounded-xl" />;
  }

  return (
    <div className="rounded-xl border bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] shadow-sm p-6 flex flex-col justify-between hover:border-[hsl(var(--accent))] transition-colors duration-150">
      <div className="flex flex-row items-center justify-between space-y-0 pb-2">
        <h3 className="tracking-tight text-sm font-medium text-[hsl(var(--muted-foreground))]">
          {label}
        </h3>
        {Icon && <Icon className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />}
      </div>
      <div className="flex flex-col gap-1">
        <div className="text-2xl font-bold">{value}</div>
        {change && (
          <p className="text-xs flex items-center gap-1 font-medium">
            <span
              className={cn(
                change.trend === "up" && "text-emerald-600 dark:text-emerald-400",
                change.trend === "down" && "text-red-600 dark:text-red-400",
                change.trend === "neutral" && "text-[hsl(var(--muted-foreground))]"
              )}
            >
              {change.trend === "up" && "↑"}
              {change.trend === "down" && "↓"}
              {change.trend === "neutral" && "→"}
              {change.value}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
