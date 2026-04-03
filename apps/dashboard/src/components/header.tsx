import { Bell, Search, Menu, ChevronRight } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "./ui/button";

export function Header({ setMobileOpen }: { setMobileOpen?: (open: boolean) => void }) {
  const { pathname } = useLocation();
  const { user } = useAuth();

  const getBreadcrumbs = () => {
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length === 1 && segments[0] === "dashboard") {
      return (
        <>
          <span>Team</span>
          <ChevronRight className="h-4 w-4" />
          <span className="text-foreground">Overview</span>
        </>
      );
    }

    return segments
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .map((label, i, arr) => (
        <span key={label} className="flex items-center gap-2">
          <span className={i === arr.length - 1 ? "text-foreground" : ""}>{label}</span>
          {i < arr.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground/50" />}
        </span>
      ));
  };

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-background/50 px-8 backdrop-blur-xl z-10">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden text-muted-foreground hover:bg-accent"
          onClick={() => setMobileOpen?.(true)}
        >
          <Menu size={20} />
        </Button>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          {getBreadcrumbs()}
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Command Palette Mockup */}
        <div className="hidden md:flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground hover:border-accent cursor-pointer transition-colors group">
          <Search className="h-4 w-4 group-hover:text-foreground" />
          <span>Search...</span>
          <kbd className="ml-2 rounded border border-border bg-muted px-1.5 text-[10px] text-muted-foreground">⌘K</kbd>
        </div>

        <button className="relative rounded-full p-2 hover:bg-accent transition-colors group">
          <Bell className="h-5 w-5 text-muted-foreground group-hover:text-foreground" />
          <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary shadow-[0_0_10px_rgba(var(--primary),0.5)]" />
        </button>

        <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 shadow-lg shadow-indigo-500/20 border border-white/10" title={user?.business_name || "Merchant"} />
      </div>
    </header>
  );
}
