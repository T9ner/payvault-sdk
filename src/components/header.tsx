import { Moon, Sun, Bell, Search, LogOut, Menu } from "lucide-react";
import { useTheme } from "@/lib/theme-provider";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger 
} from "./ui/dropdown-menu";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Button } from "./ui/button";

export function Header({ setMobileOpen }: { setMobileOpen?: (open: boolean) => void }) {
  const { theme, setTheme } = useTheme();
  const { pathname } = useLocation();
  const { logout, user } = useAuth();

  const getBreadcrumb = () => {
    const path = pathname.split("/").filter(Boolean);
    if (path.length <= 1) return "Overview";
    
    return path
      .filter((p) => p !== "dashboard")
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" / ");
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-[hsl(var(--background))] px-6 gap-4">
      <div className="flex flex-1 items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden text-[hsl(var(--muted-foreground))]"
          onClick={() => setMobileOpen?.(true)}
        >
          <Menu size={20} />
        </Button>
        <div className="text-sm font-medium text-[hsl(var(--muted-foreground))] hidden sm:block">
          Dashboard <span className="mx-2">/</span> <span className="text-[hsl(var(--foreground))]">{getBreadcrumb()}</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Search Command Palette Triger (Visual Only) */}
        <button className="hidden sm:flex items-center gap-2 h-9 w-64 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--accent))]">
          <Search size={14} className="opacity-50" />
          <span className="flex-1 text-left">Search...</span>
          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-[hsl(var(--muted))] px-1.5 font-mono text-[10px] font-medium opacity-100">
            <span className="text-xs">⌘</span>K
          </kbd>
        </button>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="text-[hsl(var(--muted-foreground))]"
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          <span className="sr-only">Toggle theme</span>
        </Button>

        <Button variant="ghost" size="icon" className="text-[hsl(var(--muted-foreground))]">
          <Bell size={18} />
          <span className="sr-only">Notifications</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-[hsl(var(--primary))] text-primary-foreground text-xs font-bold">
                  {user?.business_name?.substring(0, 2).toUpperCase() || "PV"}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{user?.business_name || "Merchant"}</p>
                <p className="text-xs leading-none text-[hsl(var(--muted-foreground))]">
                  {user?.email}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-red-500 focus:text-red-500 cursor-pointer">
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
