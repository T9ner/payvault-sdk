import { cn } from "../../lib/utils";
import { Button } from "./button";

interface EmptyStateProps {
  icon: React.ElementType;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12 text-center", className)}>
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[hsl(var(--muted))] mb-4">
        <Icon className="h-10 w-10 text-[hsl(var(--muted-foreground))]" />
      </div>
      <h3 className="text-lg font-medium text-[hsl(var(--foreground))]">{title}</h3>
      <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))] max-w-sm">
        {description}
      </p>
      {action && (
        <Button onClick={action.onClick} className="mt-6">
          {action.label}
        </Button>
      )}
    </div>
  );
}
