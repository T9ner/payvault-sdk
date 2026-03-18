import { useEffect, useState } from "react";
import { dashboard } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/formatters";
import type { Subscription, CreatePlanRequest } from "@/lib/types";
import {
  RefreshCw,
  Plus,
  XCircle,
  Calendar,
  Loader2,
} from "lucide-react";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreatePlan, setShowCreatePlan] = useState(false);
  const [creating, setCreating] = useState(false);
  
  const [subToCancel, setSubToCancel] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  
  const { toast } = useToast();

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
      toast.error("Failed to load subscriptions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      toast.success("Subscription plan created successfully.");
      await loadData();
    } catch {
      toast.error("Failed to create plan.");
    } finally {
      setCreating(false);
    }
  };

  const handleCancel = async () => {
    if (!subToCancel) return;
    setCancelling(true);
    try {
      await dashboard.cancelSubscription(subToCancel);
      toast.success("Subscription cancelled successfully.");
      setSubToCancel(null);
      await loadData();
    } catch {
      toast.error("Failed to cancel subscription.");
    } finally {
      setCancelling(false);
    }
  };

  const columns: ColumnDef<Subscription>[] = [
    {
      header: "Customer",
      accessorKey: "customer_email",
    },
    {
      header: "Plan",
      accessorKey: (row) => <span className="font-mono text-xs text-[hsl(var(--muted-foreground))]">{row.plan_id.slice(0, 12)}...</span>,
    },
    {
      header: "Status",
      accessorKey: (row) => <StatusBadge status={row.status} />,
    },
    {
      header: "Current Period Ends",
      accessorKey: (row) => (
        <div className="flex items-center gap-1.5 text-[hsl(var(--muted-foreground))]">
          <Calendar size={14} />
          <span>{formatDate(row.current_period_end)}</span>
        </div>
      ),
    },
    {
      header: "Created",
      accessorKey: (row) => <span className="text-[hsl(var(--muted-foreground))]">{formatDate(row.created_at)}</span>,
    },
    {
      header: "Actions",
      className: "text-right",
      accessorKey: (row) => (
        row.status === "active" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setSubToCancel(row.id);
            }}
            className="text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity gap-1"
          >
            <XCircle size={14} />
            Cancel
          </Button>
        )
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subscriptions"
        description="Manage subscription plans and active subscribers"
        action={{
          label: "Create Plan",
          icon: Plus,
          onClick: () => setShowCreatePlan(true),
        }}
      />

      <DataTable
        columns={columns}
        data={subscriptions}
        loading={loading}
        emptyIcon={RefreshCw}
        emptyTitle="No active subscriptions"
        emptyDescription="Create a plan first, then customers can subscribe via the API or dashboard."
      />

      {/* Create Plan Modal */}
      <Dialog open={showCreatePlan} onOpenChange={setShowCreatePlan}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create Subscription Plan</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreatePlan} className="space-y-4 pt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Plan Name</label>
              <input
                type="text"
                value={planForm.name}
                onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                placeholder="Pro Monthly"
                required
                className="flex h-10 w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
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
                  className="flex h-10 w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Currency</label>
                <select
                  value={planForm.currency}
                  onChange={(e) => setPlanForm({ ...planForm, currency: e.target.value })}
                  className="flex h-10 w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
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
                className="flex h-10 w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCreatePlan(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={creating}
              >
                {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Plan
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!subToCancel}
        onOpenChange={(open) => !open && setSubToCancel(null)}
        title="Cancel Subscription"
        description="Are you sure you want to cancel this subscription? The customer will lose access at the end of their current billing period."
        confirmLabel="Cancel Subscription"
        variant="destructive"
        loading={cancelling}
        onConfirm={handleCancel}
      />
    </div>
  );
}
