import { useState, useEffect } from "react";
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
    Layers,
    LogOut,
    Activity,
    Box,
    CreditCard,
    Users
} from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "../contexts/AuthContext";
import { cn } from "../lib/utils";

interface SidebarItemProps {
    icon: any;
    label: string;
    to: string;
    active: boolean;
    collapsed: boolean;
    onClick?: () => void;
}

function SidebarItem({ icon: Icon, label, to, active, collapsed, onClick }: SidebarItemProps) {
    return (
        <Link
            to={to}
            onClick={onClick}
            className={cn(
                "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
        >
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{label}</span>}
            {active && !collapsed && (
                <motion.div
                    layoutId="active-pill"
                    className="ml-auto h-1.5 w-1.5 rounded-full bg-sidebar-primary"
                />
            )}
        </Link>
    );
}

export function Sidebar({
    mobileOpen,
    setMobileOpen,
}: {
    mobileOpen?: boolean;
    setMobileOpen?: (open: boolean) => void;
}) {
    const { pathname } = useLocation();
    const { logout } = useAuth();
    
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

    const navGroups = [
        {
            title: "Main",
            items: [
                { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
                { label: "Transactions", to: "/dashboard/transactions", icon: ArrowLeftRight },
                { label: "Payment Links", to: "/dashboard/links", icon: Link2 },
                { label: "Subscriptions", to: "/dashboard/subscriptions", icon: RefreshCw },
            ]
        },
        {
            title: "System",
            items: [
                { label: "Fraud", to: "/dashboard/fraud", icon: ShieldAlert },
                { label: "Webhooks", to: "/dashboard/webhooks", icon: Webhook },
            ]
        }
    ];

    return (
        <>
            {/* Mobile Overlay */}
            {mobileOpen && (
                <div 
                    className="fixed inset-0 z-40 bg-black/60 md:hidden backdrop-blur-sm" 
                    onClick={() => setMobileOpen?.(false)}
                />
            )}

            <motion.aside
                initial={false}
                animate={{ 
                    width: collapsed ? 80 : 250,
                    x: mobileOpen ? 0 : (window.innerWidth < 768 ? -250 : 0)
                }}
                className={cn(
                    "fixed inset-y-0 left-0 z-50 flex h-full flex-col border-r border-sidebar-border bg-sidebar px-3 py-4 md:static transition-all duration-300",
                    !mobileOpen && "-translate-x-full md:translate-x-0"
                )}
            >
                <div className={cn("mb-8 flex items-center px-2", collapsed ? "justify-center" : "")}>
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary">
                        <Layers className="h-5 w-5 text-sidebar-primary-foreground" />
                    </div>
                    {!collapsed && (
                        <motion.span
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="ml-3 text-lg font-bold tracking-tight text-white"
                        >
                            PayVault<span className="text-zinc-500">UI</span>
                        </motion.span>
                    )}
                </div>

                <div className="flex flex-1 flex-col gap-8 overflow-y-auto overflow-x-hidden custom-scrollbar">
                    {navGroups.map((group, idx) => (
                        <div key={idx} className="flex flex-col gap-1">
                            {!collapsed && (
                                <h4 className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                                    {group.title}
                                </h4>
                            )}
                            {group.items.map((item) => (
                                <SidebarItem 
                                    key={item.to}
                                    icon={item.icon}
                                    label={item.label}
                                    to={item.to}
                                    active={item.to === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.to)}
                                    collapsed={collapsed}
                                    onClick={() => setMobileOpen?.(false)}
                                />
                            ))}
                        </div>
                    ))}
                </div>

                <div className="mt-auto flex flex-col gap-1 pt-4 border-t border-sidebar-border">
                    <SidebarItem 
                        icon={Settings} 
                        label="Settings" 
                        to="/dashboard/settings"
                        active={pathname.startsWith("/dashboard/settings")} 
                        collapsed={collapsed} 
                    />
                    <button
                        onClick={logout}
                        className={cn(
                            "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-zinc-400 hover:bg-red-500/10 hover:text-red-400 transition-colors",
                            collapsed && "justify-center"
                        )}
                    >
                        <LogOut className="h-4 w-4 shrink-0" />
                        {!collapsed && <span>Log out</span>}
                    </button>

                    <button
                        onClick={toggleCollapse}
                        className="mt-4 hidden md:flex h-8 w-full items-center justify-center rounded-md border border-sidebar-border bg-sidebar-accent/50 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all"
                    >
                        {collapsed ? <ChevronRight className="h-4 w-4" /> : <span className="text-xs">Collapse Sidebar</span>}
                    </button>
                </div>
            </motion.aside>
        </>
    );
}
