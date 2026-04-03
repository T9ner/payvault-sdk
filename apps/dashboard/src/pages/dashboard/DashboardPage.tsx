import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { dashboard as dashboardApi, payments } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/formatters";
import type { Transaction } from "@/lib/types";
import {
  DollarSign,
  ArrowLeftRight,
  TrendingUp,
  Link2,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  MoreHorizontal,
  Zap,
  Package
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from "recharts";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { TimeToggle } from "@/components/ui/time-toggle";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export default function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [currencies, setCurrencies] = useState<string[]>([]);
  const [activeLinksCount, setActiveLinksCount] = useState(0);
  const [timeRangeLabel, setTimeRangeLabel] = useState("Monthly");
  const [loading, setLoading] = useState(true);

  // Map user's label to numerical days for API
  const timeRangeDays = useMemo(() => {
    switch (timeRangeLabel) {
      case "Daily": return 7;
      case "Monthly": return 30;
      case "Yearly": return 365;
      default: return 30;
    }
  }, [timeRangeLabel]);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    async function load() {
      try {
        const [overviewRes, volumeRes, linksRes, txRes] = await Promise.allSettled([
          dashboardApi.getOverviewStats(timeRangeDays),
          dashboardApi.getAnalyticsVolume(timeRangeDays),
          dashboardApi.listPaymentLinks(),
          payments.listTransactions({ limit: 6 }),
        ]);

        if (!isMounted) return;

        const oStats = overviewRes.status === "fulfilled" ? overviewRes.value : null;
        const vPoints = volumeRes.status === "fulfilled" ? volumeRes.value : [];
        const linksData = linksRes.status === "fulfilled" ? linksRes.value : [];
        const txData = txRes.status === "fulfilled" ? txRes.value : { transactions: [] };

        setStats(oStats);
        
        const linksArray = Array.isArray(linksData) ? linksData : ((linksData as any)?.links || []);
        setActiveLinksCount(linksArray.filter((l: any) => l.is_active).length);
        
        setTransactions(Array.isArray(txData.transactions) ? txData.transactions : []);

        // Process Volume Points
        const grouped: Record<string, Record<string, number>> = {};
        const currs = new Set<string>();

        if (Array.isArray(vPoints)) {
          vPoints.forEach((pt: any) => {
            if (!grouped[pt.date]) grouped[pt.date] = {};
            grouped[pt.date][pt.currency] = pt.total;
            currs.add(pt.currency);
          });
        }

        const today = new Date();
        const timeline = Array.from({ length: timeRangeDays }).map((_, i) => {
          const d = new Date(today);
          d.setDate(d.getDate() - ((timeRangeDays - 1) - i));
          const dateStr = d.toISOString().split("T")[0];
          const nameStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          
          const dayData: any = { date: dateStr, name: nameStr };
          Array.from(currs).forEach(c => {
             dayData[c] = grouped[dateStr]?.[c] || 0;
          });
          return dayData;
        });

        setCurrencies(Array.from(currs));
        setChartData(timeline);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    load();
    return () => { isMounted = false; };
  }, [timeRangeDays]);

  const primaryCurrency = currencies.length > 0 ? currencies[0] : "NGN";
  const displayVol = stats?.total_volume?.[primaryCurrency] || 0;
  const successRate = stats?.failure_rate !== undefined ? Math.max(0, 100 - stats.failure_rate) : 0;

  const kpis = [
    { label: `${primaryCurrency} Volume`, val: formatCurrency(displayVol * 100, primaryCurrency), trend: "+20.1%", positive: true },
    { label: "Transactions", val: String(stats?.total_count ?? 0), trend: "+12.5%", positive: true },
    { label: "Success Rate", val: `${successRate.toFixed(1)}%`, trend: "+1.2%", positive: true },
    { label: "Active Links", val: String(activeLinksCount), trend: "-0.5%", positive: false },
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Overview</h1>
          <p className="text-zinc-400 mt-1">
            Here&apos;s a summary of your payment activity and performance.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <TimeToggle active={timeRangeLabel} onChange={setTimeRangeLabel} />
          <button className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 transition-colors shadow-sm">
            Download Report
          </button>
        </div>
      </div>

      {/* KPI Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => (
          <SpotlightCard key={i} className="p-6">
            <div className="flex justify-between items-start">
              <p className="text-sm font-medium text-zinc-400">{kpi.label}</p>
              <span className={cn(
                "text-[10px] flex items-center rounded-full px-2 py-0.5 font-bold", 
                kpi.positive ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500 border border-red-500/20"
              )}>
                {kpi.positive ? <ArrowUpRight className="h-3 w-3 mr-1" /> : <ArrowDownRight className="h-3 w-3 mr-1" />}
                {kpi.trend}
              </span>
            </div>
            <div className="mt-4 text-3xl font-bold text-white tracking-tight">
              {loading ? (
                <div className="h-9 w-24 bg-zinc-800 animate-pulse rounded-md" />
              ) : kpi.val}
            </div>
          </SpotlightCard>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <SpotlightCard className="col-span-1 lg:col-span-2 p-6">
          <div className="mb-6 flex justify-between items-center">
            <div>
              <h3 className="text-lg font-medium text-white">Platform Activity Matrix</h3>
              <p className="text-sm text-zinc-500">Transaction volume across currencies</p>
            </div>
            <div className="flex gap-2">
              <Activity className="h-4 w-4 text-indigo-500" />
            </div>
          </div>
          <div className="h-[350px] w-full">
            {loading ? (
              <div className="h-full w-full bg-zinc-900/50 animate-pulse rounded-xl" />
            ) : chartData.length === 0 || currencies.length === 0 ? (
              <div className="h-full w-full flex items-center justify-center border-2 border-dashed border-zinc-800 rounded-xl text-zinc-500 text-sm">
                Insufficient data for visualization
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorPrimary" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorSecondary" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="name" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                  <YAxis stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => val.toLocaleString()} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#09090b", borderColor: "#27272a", borderRadius: "12px", color: "#e4e4e7" }}
                    itemStyle={{ color: "#e4e4e7" }}
                  />
                  {currencies.slice(0, 2).map((curr, idx) => (
                    <Area 
                      key={curr} 
                      type="monotone" 
                      dataKey={curr} 
                      stroke={idx === 0 ? "#6366f1" : "#8b5cf6"} 
                      strokeWidth={3} 
                      fillOpacity={1} 
                      fill={`url(${idx === 0 ? "#colorPrimary" : "#colorSecondary"})`} 
                      animationDuration={1500} 
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </SpotlightCard>

        <SpotlightCard className="col-span-1 p-6 relative flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-medium text-white">System Optimization</h3>
            <Zap className="h-5 w-5 text-indigo-500" />
          </div>
          <div className="space-y-6 flex-1">
             <div className="p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/10 mb-2">
                 <p className="text-xs text-indigo-300 font-medium mb-1">Status Report</p>
                 <p className="text-sm text-zinc-300">Infrastructure is running smoothly. Processing latency stable at <span className="text-white font-bold">12ms</span>.</p>
             </div>
             
             <div className="space-y-4">
                {[
                  { label: "API Throttling", val: "2%", progress: 2, color: "bg-emerald-500" },
                  { label: "Database Load", val: "42%", progress: 42, color: "bg-indigo-500" },
                  { label: "Memory Usage", val: "78%", progress: 78, color: "bg-purple-500" },
                ].map((stat, i) => (
                  <div key={i}>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-zinc-400 font-medium">{stat.label}</span>
                      <span className="text-white font-bold">{stat.val}</span>
                    </div>
                    <div className="w-full bg-zinc-800 rounded-full h-1.5">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${stat.progress}%` }}
                        transition={{ duration: 1, delay: 0.5 }}
                        className={cn("h-full rounded-full", stat.color)} 
                      />
                    </div>
                  </div>
                ))}
             </div>
          </div>
          <button className="w-full mt-auto rounded-lg bg-indigo-600/10 py-2.5 text-xs font-bold text-indigo-400 border border-indigo-600/20 hover:bg-indigo-600 hover:text-white transition-all shadow-lg active:scale-[0.98]">
             View Node Metrics
          </button>
        </SpotlightCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SpotlightCard className="p-0 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-6 py-5 bg-zinc-900/30 border-b border-zinc-800/50">
            <h3 className="text-lg font-medium text-white">Recent Activity</h3>
            <Link to="/dashboard/transactions" className="text-xs text-indigo-400 font-bold hover:text-indigo-300 transition flex items-center gap-1 group">
               View Dashboard <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
          <div className="flex-1 px-2 py-2">
            {loading ? (
                <div className="space-y-4 p-4">
                    {[...Array(5)].map((_, i) => <div key={i} className="h-12 w-full bg-zinc-900 rounded-lg animate-pulse" />)}
                </div>
            ) : transactions.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-zinc-500 text-sm">No recent transactions found</div>
            ) : (
                <div className="space-y-1">
                    {transactions.map((t) => (
                        <div key={t.id} onClick={() => navigate(`/dashboard/transactions?id=${t.id}`)} className="flex items-center justify-between group cursor-pointer p-4 rounded-xl hover:bg-zinc-800/40 transition-all border border-transparent hover:border-zinc-800/50">
                            <div className="flex items-center gap-4">
                                <div className="h-10 w-10 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center group-hover:border-indigo-500/50 transition-colors">
                                    <DollarSign className="h-5 w-5 text-zinc-400 group-hover:text-indigo-400 transition-colors" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-zinc-200 group-hover:text-white transition-colors truncate max-w-[150px]">{t.email || "Unknown Customer"}</p>
                                    <p className="text-[10px] text-zinc-500 font-mono mt-0.5 tracking-tight">{t.reference.slice(0, 12)}...</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-sm font-bold text-white mb-0.5">{formatCurrency(t.amount, t.currency)}</p>
                                <div className="flex justify-end">
                                    <StatusBadge status={t.status} className="scale-75 origin-right" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
          </div>
        </SpotlightCard>

        <SpotlightCard className="p-6 relative overflow-hidden group border-indigo-500/20 bg-gradient-to-br from-zinc-950 via-zinc-950 to-indigo-900/10">
            <div className="absolute top-0 right-0 p-8 opacity-[0.02] group-hover:opacity-[0.08] transition-opacity duration-700 pointer-events-none">
                <Package className="h-64 w-64 text-indigo-500" />
            </div>
            
            <div className="relative z-10">
                <div className="p-3 bg-indigo-600/10 border border-indigo-600/20 w-fit rounded-2xl mb-6 shadow-xl shadow-indigo-600/5">
                    <Package className="w-8 h-8 text-indigo-500" />
                </div>
                
                <h3 className="text-2xl font-bold text-white mb-2">Core Engine Upgrade</h3>
                <p className="text-zinc-400 mb-8 max-w-sm leading-relaxed">
                    Your current processing engine is optimized for high volume. Deploy a custom <span className="text-indigo-400 font-medium">Webhook Pro</span> instance to enable real-time event streaming.
                </p>
                
                <div className="grid grid-cols-2 gap-4 mb-8">
                    <div className="p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800">
                        <p className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 mb-1">Redundancy</p>
                        <p className="text-lg font-bold text-white">99.99%</p>
                    </div>
                    <div className="p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800">
                        <p className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 mb-1">Global Nodes</p>
                        <p className="text-lg font-bold text-white">12 Locations</p>
                    </div>
                </div>
                
                <button className="w-full rounded-2xl bg-indigo-600 py-4 text-sm font-bold text-white hover:bg-indigo-500 transition-all shadow-xl shadow-indigo-600/20 active:scale-[0.99] border-t border-white/20">
                    Deploy Advanced Nodes
                </button>
            </div>
        </SpotlightCard>
      </div>
      
      {/* Footer Branding */}
      <div className="pt-12 pb-8 flex flex-col items-center justify-center opacity-30 select-none pointer-events-none grayscale">
          <div className="flex h-6 items-center gap-2 mb-2 font-mono text-[10px] tracking-[0.2em] uppercase font-bold">
              <Layers className="h-3 w-3" />
              PayVault Protocol
          </div>
          <div className="h-px w-24 bg-gradient-to-r from-transparent via-zinc-500 to-transparent" />
      </div>
    </div>
  );
}

// Internal small components used for design flow
function Layers({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.27a1 1 0 0 0 0 1.83l8.57 4.09a2 2 0 0 0 1.66 0l8.57-4.09a1 1 0 0 0 0-1.83Z" />
            <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" />
            <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />
        </svg>
    );
}
