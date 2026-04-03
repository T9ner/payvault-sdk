import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { dashboard, payments } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/formatters";
import type { Transaction } from "@/lib/types";
import {
  DollarSign,
  ArrowLeftRight,
  TrendingUp,
  Link2,
  ArrowRight,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";

export default function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [currencies, setCurrencies] = useState<string[]>([]);
  const [activeLinks, setActiveLinks] = useState(0);
  const [timeRange, setTimeRange] = useState(30);
  const [loading, setLoading] = useState(true);

  // We re-fetch when timeRange changes
  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    async function load() {
      try {
        const [overviewRes, volumeRes, linksRes, txRes] = await Promise.allSettled([
          dashboard.getOverviewStats(timeRange),
          dashboard.getAnalyticsVolume(timeRange),
          dashboard.listPaymentLinks(),
          payments.listTransactions({ limit: 5 }),
        ]);

        if (!isMounted) return;

        const oStats = overviewRes.status === "fulfilled" ? overviewRes.value : null;
        const vPoints = volumeRes.status === "fulfilled" ? volumeRes.value : [];
        const linksData = linksRes.status === "fulfilled" ? linksRes.value : [];
        const txData = txRes.status === "fulfilled" ? txRes.value : { transactions: [] };

        setStats(oStats);
        
        const linksArray = Array.isArray(linksData) ? linksData : ((linksData as any)?.links || []);
        setActiveLinks(linksArray.filter((l: any) => l.is_active).length);
        
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

        // Generate filled timeline window (so 0-volume days are visually represented)
        const today = new Date();
        const timeline = Array.from({ length: timeRange }).map((_, i) => {
          const d = new Date(today);
          d.setDate(d.getDate() - ((timeRange - 1) - i));
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
  }, [timeRange]);

  const columns: ColumnDef<Transaction>[] = [
    {
      header: "Reference",
      accessorKey: (row) => <span className="font-mono text-xs">{row.reference.slice(0, 16)}...</span>,
    },
    { header: "Customer", accessorKey: "email" },
    {
      header: "Amount",
      accessorKey: (row) => <span className="font-medium">{formatCurrency(row.amount, row.currency)}</span>,
    },
    {
      header: "Status",
      accessorKey: (row) => <StatusBadge status={row.status} />,
    },
    {
      header: "Date",
      accessorKey: (row) => <span className="text-[hsl(var(--muted-foreground))]">{formatDate(row.created_at)}</span>,
    },
  ];

  // Colors for multi-currency graph lines
  const CHART_COLORS = [
    "hsl(var(--primary))",
    "hsl(220, 70%, 50%)", 
    "hsl(340, 70%, 50%)",
  ];

  // For the volume stat card, we peek at the primary currency if one exists
  const primaryCurrency = currencies.length > 0 ? currencies[0] : "NGN";
  const displayVol = stats?.total_volume?.[primaryCurrency] || 0;
  
  // Failure rate comes from the backend as 0-100 float, so success is 100 - failure
  const successRate = stats?.failure_rate !== undefined ? Math.max(0, 100 - stats.failure_rate) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Overview of your payment activity"
      />

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={`Volume (${primaryCurrency})`}
          value={formatCurrency(displayVol * 100, primaryCurrency)} // multiply by 100 because formatCurrency expects minor units
          icon={DollarSign}
          loading={loading}
          change={currencies.length > 1 ? { value: `+${currencies.length - 1} more curr`, trend: "neutral" } : undefined}
        />
        <StatCard
          label="Transactions"
          value={String(stats?.total_count ?? 0)}
          icon={ArrowLeftRight}
          loading={loading}
        />
        <StatCard
          label="Success Rate"
          value={`${successRate.toFixed(1)}%`}
          icon={TrendingUp}
          loading={loading}
        />
        <StatCard
          label="Active Links"
          value={String(activeLinks)}
          icon={Link2}
          loading={loading}
        />
      </div>

      {/* Chart */}
      <div className="rounded-xl border bg-[hsl(var(--card))] p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium">Transaction Volume</h3>
          <select 
            className="text-xs bg-transparent border-none text-[hsl(var(--muted-foreground))] cursor-pointer outline-none"
            value={timeRange}
            onChange={(e) => setTimeRange(Number(e.target.value))}
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
        
        {loading ? (
          <div className="h-[250px] w-full animate-pulse bg-[hsl(var(--muted))] rounded-md" />
        ) : chartData.length === 0 || currencies.length === 0 ? (
          <div className="h-[250px] w-full flex items-center justify-center text-[hsl(var(--muted-foreground))] text-sm">
            No transaction data available for this period.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={chartData}>
              {currencies.map((curr, idx) => (
                <defs key={`def-${curr}`}>
                  <linearGradient id={`grad-${curr}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS[idx % CHART_COLORS.length]} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={CHART_COLORS[idx % CHART_COLORS.length]} stopOpacity={0} />
                  </linearGradient>
                </defs>
              ))}

              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis 
                dataKey="name" 
                tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} 
                axisLine={false} 
                tickLine={false} 
                dy={10}
              />
              <YAxis 
                tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} 
                axisLine={false} 
                tickLine={false}
                dx={-10}
                tickFormatter={(val) => val.toLocaleString()}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: "hsl(var(--popover))",
                  borderColor: "hsl(var(--border))",
                  borderRadius: "8px",
                  color: "hsl(var(--popover-foreground))",
                  fontSize: "12px",
                  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)"
                }}
                itemStyle={{ fontWeight: 500 }}
              />
              {currencies.map((curr, idx) => (
                <Area
                  key={curr}
                  type="monotone"
                  dataKey={curr}
                  name={`${curr} Volume`}
                  stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                  fill={`url(#grad-${curr})`}
                  strokeWidth={2}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Recent Transactions */}
      <div className="rounded-xl border bg-[hsl(var(--card))] shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h3 className="text-sm font-medium">Recent Transactions</h3>
          <Link
            to="/dashboard/transactions"
            className="flex items-center gap-1 text-xs font-medium text-[hsl(var(--primary))] hover:underline"
          >
            View all <ArrowRight size={12} />
          </Link>
        </div>
        <div className="p-0">
          <DataTable 
            columns={columns} 
            data={transactions} 
            loading={loading}
            emptyIcon={ArrowLeftRight}
            emptyTitle="No transactions yet"
            emptyDescription="You haven't processed any successful payments."
            onRowClick={(row) => navigate(`/dashboard/transactions?id=${row.id}`)}
          />
        </div>
      </div>
    </div>
  );
}
