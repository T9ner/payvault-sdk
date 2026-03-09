"use client";

import { useEffect, useState } from "react";
import { dashboard } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/formatters";
import type { Subscription, Plan, CreatePlanRequest } from "@/lib/types";
import {
  RefreshCw,
  Plus,
  X,
  Loader2,
  XCircle,
  Calendar,
} from "lucide-react";

export default function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreatePlan, setShowCreatePlan] = useState(false);
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState("");
  const [planForm, setPlanForm] = useState<CreatePlanRequest>({
    name: "",
    amount: 0,
    currency: "NGN",
    interval: "monthly",
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await dashboard.listSubscriptions();
      setSubscriptions(Array.isArray(data) ? data : []);
    } catch {
      setSubscriptions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await dashboard.createPlan({
        ...planForm,
        amount: Math.round(planForm.amount * 100),
      });
      setShowCreatePlan(false);
      setPlanForm({ name: "", amount: 0, currency: "NGN", interval: "monthly" });
      await loadData();
    } catch {
      alert("Failed to create plan");
    } finally {
      setCreating(false);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm("Cancel this subscription?")) return;
    setCancelling(id);
    try {
      await dashboard.cancelSubscription(id);
      await loadData();
    } catch {
      alert("Failed to cancel subscription");
    } finally {
      setCancelling("");
    }
  };

  const statusColors: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
    cancelled: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400",
    expired: "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Subscriptions</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Manage subscription plans and active subscribers
          </p>
        </div>
        <button
          onClick={() => setShowCreatePlan(true)}
          className="flex h-9 items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 text-sm font-medium text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90"
        >
          <Plus size={16} />
          Create Plan
        </button>
      </div>

      {/* Subscriptions Table */}
      <div className="rounded-xl border bg-[hsl(var(--card))]">
        <div className="border-b px-6 py-4">
          <h3 className="text-sm font-medium">Active Subscriptions</h3>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--muted-foreground))]" />
            </div>
          ) : subscriptions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-[hsl(var(--muted-foreground))]">
              <RefreshCw size={36} className="mb-3 opacity-30" />
              <p className="text-sm">No subscriptions yet</p>
              <p className="text-xs">Create a plan first, then customers can subscribe via the API</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b text-left text-xs font-medium text-[hsl(var(--muted-foreground))]">
                  <th className="px-6 py-3">Customer</th>
                  <th className="px-6 py-3">Plan</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Current Period Ends</th>
                  <th className="px-6 py-3">Created</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.map((sub) => (
                  <tr key={sub.id} className="border-b last:border-0">
                    <td className="px-6 py-3 text-sm">{sub.customer_email}</td>
                    <td className="px-6 py-3 text-sm font-mono">{sub.plan_id.slice(0, 8)}...</td>
                    <td className="px-6 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[sub.status]}`}
                      >
                        {sub.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-sm">
                      <div className="flex items-center gap-1 text-[hsl(var(--muted-foreground))]">
                        <Calendar size={14} />
                        {formatDate(sub.current_period_end)}
                      </div>
                    </td>
                    <td className="px-6 py-3 text-sm text-[hsl(var(--muted-foreground))]">
                      {formatDate(sub.created_at)}
                    </td>
                    <td className="px-6 py-3">
                      {sub.status === "active" && (
                        <button
                          onClick={() => handleCancel(sub.id)}
                          disabled={cancelling === sub.id}
                          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[hsl(var(--destructive))] hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50"
                        >
                          {cancelling === sub.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <XCircle size={14} />
                          )}
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Create Plan Modal */}
      {showCreatePlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-[hsl(var(--card))] shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h3 className="font-semibold">Create Subscription Plan</h3>
              <button
                onClick={() => setShowCreatePlan(false)}
                className="rounded-md p-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreatePlan} className="space-y-4 px-6 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Plan Name</label>
                <input
                  type="text"
                  value={planForm.name}
                  onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                  placeholder="Pro Monthly"
                  required
                  className="flex h-10 w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Amount</label>
                  <input
                    type="number"
                    value={planForm.amount || ""}
                    onChange={(e) =>
                      setPlanForm({ ...planForm, amount: parseFloat(e.target.value) || 0 })
                    }
                    placeholder="5000.00"
                    min="0"
                    step="0.01"
                    required
                    className="flex h-10 w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Currency</label>
                  <select
                    value={planForm.currency}
                    onChange={(e) => setPlanForm({ ...planForm, currency: e.target.value })}
                    className="flex h-10 w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                  >
                    <option value="NGN">NGN</option>
                    <option value="USD">USD</option>
                    <option value="GHS">GHS</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Billing Interval</label>
                <select
                  value={planForm.interval}
                  onChange={(e) => setPlanForm({ ...planForm, interval: e.target.value })}
                  className="flex h-10 w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreatePlan(false)}
                  className="h-9 rounded-lg border px-4 text-sm font-medium transition-colors hover:bg-[hsl(var(--accent))]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex h-9 items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 text-sm font-medium text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Plan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
