import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme-provider";

export function Header() {
  const { theme, setTheme } = useTheme();

  return (
    <header className="flex h-14 items-center justify-between border-b px-6">
      <div />
      <button
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        className="rounded-md p-2 text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))]"
      >
        {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        <span className="sr-only">Toggle theme</span>
      </button>
    </header>
  );
}
