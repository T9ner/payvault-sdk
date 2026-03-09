"use client";

import { useEffect, useState, useRef } from "react";
import {
  DollarSign,
  ArrowLeftRight,
  TrendingUp,
  Link2,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { payments, dashboard } from "@/lib/api";
import { formatCurrency, formatRelative } from "@/lib/formatters";
import type { Transaction, PaymentLink } from "@/lib/types";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// Mock chart data (will be replaced with real aggregation endpoint later)
const chartData = [
  { date: "Mon", volume: 125000 },
  { date: "Tue", volume: 230000 },
  { date: "Wed", volume: 185000 },
  { date: "Thu", volume: 340000 },
  { date: "Fri", volume: 290000 },
  { date: "Sat", volume: 180000 },
  { date: "Sun", volume: 220000 },
];

interface KPICardProps {
  title: string;
  value: string;
  change?: string;
  changeType?: "up" | "down";
  icon: React.ReactNode;
}

function KPICard({ title, value, change, changeType, icon }: KPICardProps) {
  return (
    <div className="rounded-xl border bg-[hsl(var(--card))] p-6">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-[hsl(var(--muted-foreground))]">{title}</p>
        <div className="text-[hsl(var(--muted-foreground))]">{icon}</div>
      </div>
      <div className="mt-3">
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
        {change && (
          <div className="mt-1 flex items-center gap-1 text-xs">
            {changeType === "up" ? (
              <ArrowUpRight size={14} className="text-emerald-500" />
            ) : (
              <ArrowDownRight size={14} className="text-red-500" />
            )}
            <span
              className={changeType === "up" ? "text-emerald-500" : "text-red-500"}
            >
              {change}
            </span>
            <span className="text-[hsl(var(--muted-foreground))]">vs last week</span>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
    pending: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
    failed: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400",
    refunded: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] || colors.pending}`}
    >
      {status}
    </span>
  );
}

export default function DashboardPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [links, setLinks] = useState<PaymentLink[]>([]);
  const [loading, setLoading] = useState(true);
  const hasFetched = useRef(false);

  useEffect(() => {
    // Guard: only fetch once. Prevents the constant re-fetching bug
    // caused by React re-renders (layout auth check, strict mode, etc.)
    if (hasFetched.current) return;
    hasFetched.current = true;

    async function load() {
      try {
        const [txns, payLinks] = await Promise.allSettled([
          payments.listTransactions({ limit: 10 }),
          dashboard.listPaymentLinks(),
        ]);
        if (txns.status === "fulfilled") {
          const data = txns.value;
          setTransactions(Array.isArray(data) ? data : []);
        }
        if (payLinks.status === "fulfilled") {
          const data = payLinks.value;
          setLinks(Array.isArray(data) ? data : []);
        }
      } catch {
        // API might not be connected yet -- show empty state
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const totalVolume = transactions.reduce((sum, t) => sum + t.amount, 0);
  const successCount = transactions.filter((t) => t.status === "success").length;
  const successRate =
    transactions.length > 0
      ? ((successCount / transactions.length) * 100).toFixed(1)
      : "0";
  const activeLinks = links.filter((l) => l.active).length;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Your payment activity at a glance
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Total Volume"
          value={formatCurrency(totalVolume)}
          change="+12.5%"
          changeType="up"
          icon={<DollarSign size={18} />}
        />
        <KPICard
          title="Transactions"
          value={transactions.length.toString()}
          change="+8.2%"
          changeType="up"
          icon={<ArrowLeftRight size={18} />}
        />
        <KPICard
          title="Success Rate"
          value={`${successRate}%`}
          change="+2.1%"
          changeType="up"
          icon={<TrendingUp size={18} />}
        />
        <KPICard
          title="Active Links"
          value={activeLinks.toString()}
          icon={<Link2 size={18} />}
        />
      </div>

      {/* Revenue Chart */}
      <div className="rounded-xl border bg-[hsl(var(--card))] p-6">
        <h3 className="mb-4 text-sm font-medium text-[hsl(var(--muted-foreground))]">Revenue (7 days)</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="volumeGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.1} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${(v / 100).toLocaleString()}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                formatter={(value: number) => [formatCurrency(value), "Volume"]}
              />
              <Area
                type="monotone"
                dataKey="volume"
                stroke="hsl(var(--primary))"
                fill="url(#volumeGradient)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="rounded-xl border bg-[hsl(var(--card))]">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h3 className="text-sm font-medium">Recent Transactions</h3>
          <a
            href="/dashboard/transactions"
            className="text-xs font-medium text-[hsl(var(--primary))] hover:underline"
          >
            View all
          </a>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-[hsl(var(--muted-foreground))]">
              Loading transactions...
            </div>
          ) : transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-sm text-[hsl(var(--muted-foreground))]">
              <ArrowLeftRight size={32} className="mb-2 opacity-30" />
              <p>No transactions yet</p>
              <p className="text-xs">Transactions will appear here once you start processing payments</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b text-left text-xs font-medium text-[hsl(var(--muted-foreground))]">
                  <th className="px-6 py-3">Reference</th>
                  <th className="px-6 py-3">Customer</th>
                  <th className="px-6 py-3">Amount</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {transactions.slice(0, 5).map((txn) => (
                  <tr key={txn.id} className="border-b last:border-0">
                    <td className="px-6 py-3 text-sm font-mono">
                      {txn.reference.slice(0, 12)}...
                    </td>
                    <td className="px-6 py-3 text-sm">{txn.customer_email}</td>
                    <td className="px-6 py-3 text-sm font-medium">
                      {formatCurrency(txn.amount, txn.currency)}
                    </td>
                    <td className="px-6 py-3">
                      <StatusBadge status={txn.status} />
                    </td>
                    <td className="px-6 py-3 text-sm text-[hsl(var(--muted-foreground))]">
                      {formatRelative(txn.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
