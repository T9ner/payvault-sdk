import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { dashboard, payments } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/formatters";
import type { Transaction, DashboardStats } from "@/lib/types";
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
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [chartData, setChartData] = useState<{ name: string; volume: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    async function load() {
      try {
        const results = await Promise.allSettled([
          dashboard.listPaymentLinks(),
          payments.listTransactions({ limit: 100 }),
        ]);

        const linksRaw = results[0].status === "fulfilled" ? results[0].value : { links: [] };
        const txPayload = results[1].status === "fulfilled" ? results[1].value : { transactions: [], total: 0 };
        
        const txns = txPayload.transactions || [];
        const txArray = Array.isArray(txns) ? txns : [];
        const linksArray = Array.isArray(linksRaw) ? linksRaw : ((linksRaw as any)?.links || []);

        const totalVolume = txArray.reduce((sum, t) => sum + (t.status === "success" ? t.amount : 0), 0);
        const successCount = txArray.filter((t) => t.status === "success").length;
        
        const today = new Date();
        const last7DaysData = Array.from({ length: 7 }).map((_, i) => {
          const d = new Date(today);
          d.setDate(d.getDate() - (6 - i));
          return {
            date: d.toISOString().split("T")[0],
            name: d.toLocaleDateString("en-US", { weekday: "short" }),
            volume: 0,
          };
        });

        txArray.forEach((tx) => {
          if (tx.status === "success") {
            const txDate = new Date(tx.created_at).toISOString().split("T")[0];
            const dayData = last7DaysData.find((d) => d.date === txDate);
            if (dayData) {
              dayData.volume += tx.amount / 100;
            }
          }
        });
        setChartData(last7DaysData.map(({ name, volume }) => ({ name, volume })));

        setStats({
          total_volume: totalVolume,
          total_transactions: txPayload.total || txArray.length,
          success_rate: txPayload.total > 0 ? (successCount / txPayload.total) * 100 : 0,
          active_links: linksArray.filter((l: any) => l.is_active).length,
          recent_transactions: txArray.slice(0, 5),
        });
        setTransactions(txArray.slice(0, 5));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Overview of your payment activity"
      />

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Volume"
          value={formatCurrency(stats?.total_volume ?? 0)}
          icon={DollarSign}
          loading={loading}
          change={{ value: "12%", trend: "up" }}
        />
        <StatCard
          label="Transactions"
          value={String(stats?.total_transactions ?? 0)}
          icon={ArrowLeftRight}
          loading={loading}
        />
        <StatCard
          label="Success Rate"
          value={`${(stats?.success_rate ?? 0).toFixed(1)}%`}
          icon={TrendingUp}
          loading={loading}
        />
        <StatCard
          label="Active Links"
          value={String(stats?.active_links ?? 0)}
          icon={Link2}
          loading={loading}
        />
      </div>

      {/* Chart */}
      <div className="rounded-xl border bg-[hsl(var(--card))] p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium">Weekly Volume</h3>
          <select className="text-xs bg-transparent border-none text-[hsl(var(--muted-foreground))] cursor-pointer outline-none">
            <option>Last 7 days</option>
            <option>Last 30 days</option>
          </select>
        </div>
        
        {loading ? (
          <div className="h-[250px] w-full animate-pulse bg-[hsl(var(--muted))] rounded-md" />
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="volumeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
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
                tickFormatter={(val) => `₦${(val as number).toLocaleString()}`}
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
                itemStyle={{ color: "hsl(var(--foreground))", fontWeight: 500 }}
              />
              <Area
                type="monotone"
                dataKey="volume"
                stroke="hsl(var(--primary))"
                fill="url(#volumeGrad)"
                strokeWidth={2}
              />
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
