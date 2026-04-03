import { useEffect, useState } from "react";
import { dashboard } from "@/lib/api";
import { formatDate, formatCurrency } from "@/lib/formatters";
import type { Subscription, CreatePlanRequest } from "@/lib/types";
import {
  RefreshCw,
  Plus,
  XCircle,
  Calendar,
  Loader2,
  Users,
  Layers,
  ArrowRight,
  TrendingUp,
  Search,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export default function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
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
      const [subsRaw, plansRaw] = await Promise.all([
        dashboard.listSubscriptions().catch(() => null),
        dashboard.listPlans().catch(() => []),
      ]);
      setSubscriptions(Array.isArray(subsRaw) ? subsRaw : (subsRaw as any)?.subscriptions || []);
      setPlans(Array.isArray(plansRaw) ? plansRaw : []);
    } catch (err: any) {
      setSubscriptions([]);
      setPlans([]);
      toast.error(err.message || "Failed to load subscriptions.");
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
    } catch (err: any) {
      toast.error(err.message || "Failed to create plan.");
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
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel subscription.");
    } finally {
      setCancelling(false);
    }
  };

  const columns: ColumnDef<Subscription>[] = [
    {
      header: "Subscriber",
      accessorKey: (row) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-bold text-white">{row.customer_email}</span>
          <span className="text-[10px] text-zinc-500 font-mono tracking-tighter uppercase">{row.id}</span>
        </div>
      ),
    },
    {
      header: "Active Plan",
      accessorKey: (row) => (
        <div className="flex items-center gap-2">
            <div className="p-1.5 bg-zinc-800 rounded-lg">
                <Layers className="h-3.5 w-3.5 text-zinc-400" />
            </div>
            <span className="font-mono text-xs text-zinc-300">
                {row.plan_id.slice(0, 12)}...
            </span>
        </div>
      ),
    },
    {
      header: "Status",
      accessorKey: (row) => <StatusBadge status={row.status} className="scale-90" />,
    },
    {
      header: "Renews On",
      accessorKey: (row) => (
        <div className="flex items-center gap-2 text-zinc-500 text-xs">
          <Calendar size={14} className="text-zinc-600" />
          <span>{formatDate(row.current_period_end)}</span>
        </div>
      ),
    },
    {
      header: "Started",
      accessorKey: (row) => <span className="text-zinc-500 text-xs">{formatDate(row.created_at)}</span>,
    },
    {
      header: "",
      className: "w-10",
      accessorKey: (row) => (
        row.status === "active" && (
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    setSubToCancel(row.id);
                }}
                className="p-2 text-zinc-600 hover:text-red-400 hover:bg-zinc-900 rounded-full transition-all opacity-0 group-hover:opacity-100 flex items-center gap-1.5 whitespace-nowrap text-xs font-bold"
                title="Cancel Subscription"
            >
                <XCircle size={14} />
                Terminate
            </button>
        )
      ),
    },
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
           <div className="flex items-center gap-2 text-indigo-400 mb-1">
              <RefreshCw className="h-4 w-4" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Recurring Revenue</span>
           </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Subscriptions</h1>
          <p className="text-zinc-400 mt-1">Automate your billing cycles and manage recurring customers.</p>
        </div>
        
        <button 
            onClick={() => setShowCreatePlan(true)}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-600/20 active:scale-[0.98]"
        >
            <Plus className="h-4 w-4" />
            Create Plan
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <SpotlightCard className="lg:col-span-1 p-6 border-zinc-800/50 bg-zinc-900/20 flex flex-col justify-between overflow-hidden relative">
              <div className="absolute -top-6 -right-6 h-24 w-24 bg-indigo-500/10 rounded-full blur-3xl" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-4">Total Subscribers</p>
                <h4 className="text-3xl font-bold text-white">{subscriptions.length}</h4>
                <div className="flex items-center gap-1.5 text-emerald-500 mt-2">
                    <TrendingUp size={14} />
                    <span className="text-xs font-bold">+12% from last month</span>
                </div>
              </div>
              <div className="mt-8 pt-8 border-t border-zinc-800/50">
                  <div className="flex justify-between items-center mb-1">
                      <span className="text-xs text-zinc-500 font-medium">Retention Rate</span>
                      <span className="text-xs text-white font-bold">94.2%</span>
                  </div>
                  <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                      <motion.div initial={{ width: 0 }} animate={{ width: "94.2%" }} className="h-full bg-indigo-500" />
                  </div>
              </div>
          </SpotlightCard>

          <SpotlightCard className="lg:col-span-3 p-0 overflow-hidden border-zinc-800/50 flex flex-col">
              <div className="p-6 border-b border-zinc-800/50 bg-zinc-900/30 flex items-center justify-between">
                <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                    <Layers className="h-4 w-4 text-indigo-400" />
                    Product Blueprints
                </h3>
                <span className="text-[10px] font-mono text-zinc-600 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
                    {plans.length} TEMPLATES
                </span>
              </div>
              
              <div className="p-6 grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                {plans.map((plan: any) => (
                    <div key={plan.id} className="group relative rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4 hover:border-indigo-500/50 transition-all cursor-default">
                        <div className="flex justify-between items-start mb-3">
                            <div className="p-2 bg-zinc-900 rounded-xl border border-zinc-800 group-hover:bg-indigo-500/10 group-hover:border-indigo-500/20 transition-all">
                                <CheckCircle2 className="h-4 w-4 text-zinc-500 group-hover:text-indigo-400" />
                            </div>
                            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{plan.interval}</span>
                        </div>
                        <p className="font-bold text-white group-hover:text-indigo-400 transition-colors uppercase tracking-tight truncate">{plan.name}</p>
                        <p className="mt-1 text-xs text-zinc-500 font-mono">
                            {plan.prices?.length || 0} pricing tiers
                        </p>
                    </div>
                ))}
                {plans.length === 0 && (
                    <div className="col-span-full py-12 flex flex-col items-center justify-center border-2 border-dashed border-zinc-800 rounded-3xl opacity-50">
                        <Layers className="h-8 w-8 text-zinc-600 mb-3" />
                        <p className="text-sm text-zinc-500 font-medium tracking-tight">No plan blueprints found</p>
                    </div>
                )}
              </div>
          </SpotlightCard>
      </div>

      <SpotlightCard className="p-0 overflow-hidden border-zinc-800/50 flex flex-col min-h-[400px]">
        <div className="flex flex-col sm:flex-row items-center justify-between p-6 bg-zinc-900/30 border-b border-zinc-800/50 gap-4">
            <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                <Users className="h-4 w-4 text-indigo-400" />
                Active Subscribers
            </h3>
            
            <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <input 
                    type="text" 
                    placeholder="Search subscribers..." 
                    className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl py-2 pl-10 pr-4 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500/50 transition-colors"
                />
            </div>
        </div>

        <div className="flex-1 overflow-x-auto">
            <DataTable
                columns={columns}
                data={subscriptions}
                loading={loading}
                emptyIcon={RefreshCw}
                emptyTitle="The audience is empty"
                emptyDescription="No subscribers detected on your platform. Create a plan to begin onboarding."
                className="border-none"
            />
        </div>
      </SpotlightCard>

      {/* Create Plan Modal */}
      <Dialog open={showCreatePlan} onOpenChange={setShowCreatePlan}>
        <DialogContent className="sm:max-w-[480px] bg-zinc-950 border-zinc-800 text-white p-0 overflow-hidden rounded-[2.5rem]">
           <div className="p-8 pb-4">
              <DialogHeader className="mb-6">
                 <div className="h-12 w-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-4">
                    <Layers className="h-6 w-6 text-indigo-400" />
                 </div>
                <DialogTitle className="text-2xl font-bold italic">Define New Plan</DialogTitle>
                <DialogDescription className="text-zinc-500">
                   Establish billing parameters and recurrence rules for a product.
                </DialogDescription>
              </DialogHeader>
           </div>

          <form onSubmit={handleCreatePlan} className="p-8 pt-0 space-y-6">
            <div className="space-y-4">
                <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 px-1">Subscription Name</label>
                    <input
                        type="text"
                        value={planForm.name}
                        onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                        placeholder="e.g. Enterprise Monthly"
                        required
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3.5 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all focus:bg-zinc-900/80"
                    />
                </div>
            
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 px-1">Recurring Amount</label>
                        <input
                            type="number"
                            value={planForm.amount || ""}
                            onChange={(e) => setPlanForm({ ...planForm, amount: parseFloat(e.target.value) || 0 })}
                            placeholder="0.00"
                            min="0"
                            step="0.01"
                            required
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3.5 text-sm font-bold text-white focus:outline-none focus:border-indigo-500/50 transition-all"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 px-1">Currency</label>
                        <select
                            value={planForm.currency}
                            onChange={(e) => setPlanForm({ ...planForm, currency: e.target.value })}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3.5 text-sm font-bold text-white focus:outline-none focus:border-indigo-500/50 transition-all appearance-none cursor-pointer"
                        >
                            <option value="NGN">NGN (₦)</option>
                            <option value="USD">USD ($)</option>
                            <option value="GHS">GHS (₵)</option>
                        </select>
                    </div>
                </div>
            
                <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 px-1">Billing Frequency</label>
                    <select
                        value={planForm.interval}
                        onChange={(e) => setPlanForm({ ...planForm, interval: e.target.value })}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3.5 text-sm font-bold text-white focus:outline-none focus:border-indigo-500/50 transition-all appearance-none cursor-pointer"
                    >
                        <option value="daily">Every Day</option>
                        <option value="weekly">Every Week</option>
                        <option value="monthly">Every Month</option>
                        <option value="yearly">Every Year</option>
                    </select>
                </div>
            </div>

            <div className="flex gap-4 pt-4 border-t border-zinc-900">
               <button 
                type="button"
                onClick={() => setShowCreatePlan(false)}
                className="flex-1 py-4 text-sm font-bold text-zinc-500 hover:text-white transition-colors"
                >
                Discard
              </button>
              <button
                type="submit"
                disabled={creating}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 rounded-2xl font-bold py-4 text-white shadow-xl shadow-indigo-600/20 active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {creating ? <Loader2 size={18} className="animate-spin" /> : <><Plus size={18} /> Initialize Template</>}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!subToCancel}
        onOpenChange={(open) => !open && setSubToCancel(null)}
        title="Immediate De-provisioning?"
        description="The system will stop generating invoices and access tokens. This customer's integration may break at the end of the current period."
        confirmLabel="Terminate Agreement"
        variant="destructive"
        loading={cancelling}
        onConfirm={handleCancel}
      />
    </div>
  );
}
