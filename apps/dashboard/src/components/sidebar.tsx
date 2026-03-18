import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Link2,
  RefreshCw,
  ShieldAlert,
  Webhook,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Separator } from "./ui/separator";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { useAuth } from "../contexts/AuthContext";
import { cn } from "../lib/utils";

const mainNavItems = [
  { label: "Overview", to: "/dashboard", icon: LayoutDashboard },
  { label: "Transactions", to: "/dashboard/transactions", icon: ArrowLeftRight },
  { label: "Payment Links", to: "/dashboard/links", icon: Link2 },
  { label: "Subscriptions", to: "/dashboard/subscriptions", icon: RefreshCw },
];

const systemNavItems = [
  { label: "Fraud", to: "/dashboard/fraud", icon: ShieldAlert },
  { label: "Webhooks", to: "/dashboard/webhooks", icon: Webhook },
  { label: "Settings", to: "/dashboard/settings", icon: Settings },
];

export function Sidebar({
  mobileOpen,
  setMobileOpen,
}: {
  mobileOpen?: boolean;
  setMobileOpen?: (open: boolean) => void;
}) {
  const { pathname } = useLocation();
  const { user } = useAuth();
  
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem("payvault:sidebar:collapsed") === "true";
  });

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("payvault:sidebar:collapsed", String(next));
      return next;
    });
  };

  const NavItem = ({ item }: { item: any }) => {
    const isActive = item.to === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.to);
    
    const linkContent = (
      <Link
        to={item.to}
        onClick={() => setMobileOpen?.(false)}
        className={cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150 border-l-2",
          isActive
            ? "bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] border-primary"
            : "border-transparent text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))]",
          collapsed && "justify-center px-0"
        )}
      >
        <item.icon size={18} className="shrink-0" />
        {!collapsed && <span>{item.label}</span>}
      </Link>
    );

    if (collapsed) {
      return (
        <TooltipProvider>
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
            <TooltipContent side="right" className="font-medium">{item.label}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return linkContent;
  };

  return (
    <>
      {/* Mobile Overlay */}
      {mobileOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 md:hidden" 
          onClick={() => setMobileOpen?.(false)}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-full flex-col border-r bg-[hsl(var(--card))] transition-all duration-300 md:static",
          collapsed ? "w-20" : "w-60",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
      {/* Logo */}
      <div className={cn("flex h-16 items-center border-b px-4", collapsed ? "justify-center" : "gap-3")}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
          PV
        </div>
        {!collapsed && <span className="text-xl font-semibold tracking-tight">PayVault</span>}
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col justify-between">
        {/* Navigation */}
        <div className="space-y-6 px-3 py-6">
          <div>
            {!collapsed && (
              <h4 className="mb-2 px-4 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                Main
              </h4>
            )}
            <nav className="space-y-1">
              {mainNavItems.map((item) => <NavItem key={item.to} item={item} />)}
            </nav>
          </div>

          <div>
            {!collapsed && (
              <h4 className="mb-2 px-4 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                System
              </h4>
            )}
            <nav className="space-y-1">
              {systemNavItems.map((item) => <NavItem key={item.to} item={item} />)}
            </nav>
          </div>
        </div>

        {/* Bottom User Area */}
        <div className="p-3">
          <Separator className="mb-3" />
          <div className="flex items-center justify-between">
            <div className={cn("flex items-center gap-3", collapsed && "justify-center w-full")}>
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] text-xs font-bold">
                  {user?.business_name?.substring(0, 2).toUpperCase() || "PV"}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <div className="flex flex-col truncate">
                  <span className="text-sm font-medium truncate">{user?.business_name || "Merchant"}</span>
                  <span className="text-xs text-[hsl(var(--muted-foreground))] truncate">{user?.email}</span>
                </div>
              )}
            </div>
            
            {/* Desktop Collapse Toggle */}
            <div className="hidden md:block">
              <button
                onClick={toggleCollapse}
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))] transition-colors",
                  collapsed && "mt-4 w-full h-8"
                )}
              >
                {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                <span className="sr-only">Toggle Sidebar</span>
              </button>
            </div>
          </div>
        </div>
      </div>
      </aside>
    </>
  );
}
