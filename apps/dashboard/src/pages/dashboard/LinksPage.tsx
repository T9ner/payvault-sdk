import { useEffect, useState } from "react";
import { dashboard } from "@/lib/api";
import { formatCurrency, formatDate, copyToClipboard } from "@/lib/formatters";
import type { PaymentLink, CreatePaymentLinkRequest } from "@/lib/types";
import {
  Link2,
  Plus,
  Copy,
  Check,
  Trash2,
  ExternalLink,
  Loader2,
  Globe,
  Tag,
  ArrowRight,
  Search,
  MoreHorizontal
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

export default function PaymentLinksPage() {
  const [links, setLinks] = useState<PaymentLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState("");
  
  const [linkToDeactivate, setLinkToDeactivate] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  
  const { toast } = useToast();

  const [form, setForm] = useState<CreatePaymentLinkRequest>({
    name: "",
    description: "",
    amount: 0,
    currency: "NGN",
  });

  const checkoutBase = import.meta.env.VITE_API_URL || "";

  const loadLinks = async () => {
    setLoading(true);
    try {
      const data = await dashboard.listPaymentLinks();
      setLinks(Array.isArray(data) ? data : (data as any)?.links || []);
    } catch (err: any) {
      setLinks([]);
      toast.error(err.message || "Failed to load payment links.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLinks();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await dashboard.createPaymentLink({
        ...form,
        amount: Math.round(form.amount * 100), // Convert to minor units
      });
      setShowCreate(false);
      setForm({ name: "", description: "", amount: 0, currency: "NGN" });
      toast.success("Payment link created successfully.");
      await loadLinks();
    } catch (err: any) {
      toast.error(err.message || "Failed to create payment link.");
    } finally {
      setCreating(false);
    }
  };

  const handleDeactivate = async () => {
    if (!linkToDeactivate) return;
    setDeactivating(true);
    try {
      await dashboard.deactivatePaymentLink(linkToDeactivate);
      toast.success("Payment link deactivated.");
      setLinkToDeactivate(null);
      await loadLinks();
    } catch (err: any) {
      toast.error(err.message || "Failed to deactivate payment link.");
    } finally {
      setDeactivating(false);
    }
  };

  const handleCopy = async (text: string, id: string) => {
    await copyToClipboard(text);
    setCopied(id);
    toast.success("Link URL copied to clipboard");
    setTimeout(() => setCopied(""), 2000);
  };

  const columns: ColumnDef<PaymentLink>[] = [
    {
      header: "Product / Service",
      accessorKey: (row) => (
        <div className="flex flex-col gap-0.5 group/link">
          <span className="font-bold text-white group-hover/link:text-indigo-400 transition-colors">{row.name}</span>
          <span className="text-[11px] text-zinc-500 truncate max-w-[240px] italic">
            {row.description || "No description provided"}
          </span>
        </div>
      ),
    },
    {
      header: "Price",
      accessorKey: (row) => (
        <span className="font-bold text-white text-base">
          {formatCurrency(row.amount, row.currency)}
        </span>
      ),
    },
    {
      header: "Checkout URL",
      accessorKey: (row) => {
        const url = `${checkoutBase}/api/v1/checkout/${row.slug}`;
        return (
          <div className="flex items-center gap-2 rounded-xl bg-zinc-950/50 border border-zinc-800/50 px-2 py-1.5 max-w-[280px] group/url">
            <code className="flex-1 truncate text-[10px] font-mono text-zinc-500 group-hover/url:text-zinc-300 transition-colors uppercase tracking-wider">{url}</code>
            <div className="flex items-center gap-1">
                <button
                onClick={(e) => {
                    e.stopPropagation();
                    handleCopy(url, row.id);
                }}
                className="p-1 text-zinc-600 hover:text-indigo-400 hover:bg-zinc-800 rounded transition-all"
                title="Copy link"
                >
                {copied === row.id ? (
                    <Check size={12} className="text-emerald-500" />
                ) : (
                    <Copy size={12} />
                )}
                </button>
                <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 text-zinc-600 hover:text-white hover:bg-zinc-800 rounded transition-all"
                onClick={(e) => e.stopPropagation()}
                title="Open link"
                >
                <ExternalLink size={12} />
                </a>
            </div>
          </div>
        );
      },
    },
    {
      header: "Status",
      accessorKey: (row) => <StatusBadge status={row.is_active ? "active" : "inactive"} className="scale-90" />,
    },
    {
      header: "Created",
      accessorKey: (row) => <span className="text-zinc-500 text-xs">{formatDate(row.created_at)}</span>,
    },
    {
      header: "",
      className: "w-10",
      accessorKey: (row) => (
        row.is_active ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setLinkToDeactivate(row.id);
            }}
            className="p-2 text-zinc-600 hover:text-red-400 hover:bg-zinc-900 rounded-full transition-all opacity-0 group-hover:opacity-100"
            title="Deactivate"
          >
            <Trash2 size={16} />
          </button>
        ) : (
             <button className="p-2 text-zinc-800 cursor-not-allowed">
                <Trash2 size={16} />
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
              <Link2 className="h-4 w-4" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Shareable Payments</span>
           </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Payment Links</h1>
          <p className="text-zinc-400 mt-1">Create instant checkout pages for your products and services.</p>
        </div>
        
        <button 
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-600/20 active:scale-[0.98]"
        >
            <Plus className="h-4 w-4" />
            Create Link
        </button>
      </div>

      <SpotlightCard className="p-0 overflow-hidden border-zinc-800/50 flex flex-col min-h-[500px]">
        <div className="flex flex-col sm:flex-row items-center justify-between p-6 bg-zinc-900/30 border-b border-zinc-800/50 gap-4">
            <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                <Globe className="h-4 w-4 text-indigo-400" />
                Active Links
            </h3>
            
            <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <input 
                    type="text" 
                    placeholder="Filter by name..." 
                    className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl py-2 pl-10 pr-4 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500/50 transition-colors"
                />
            </div>
        </div>

        <div className="flex-1">
            <DataTable
                columns={columns}
                data={links}
                loading={loading}
                emptyIcon={Link2}
                emptyTitle="No payment links"
                emptyDescription="Start collecting payments quickly by sharing a secure payment link."
                emptyCTA={{
                    label: "Create First Link",
                    onClick: () => setShowCreate(true),
                }}
                className="border-none"
            />
        </div>
      </SpotlightCard>

      {/* Create Modal */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-[500px] bg-zinc-950 border-zinc-800 text-white p-0 overflow-hidden rounded-[2.5rem]">
           <div className="p-8 pb-4">
              <DialogHeader className="mb-6">
                 <div className="h-12 w-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-4">
                    <Link2 className="h-6 w-6 text-indigo-400" />
                 </div>
                <DialogTitle className="text-2xl font-bold italic">Forge a Link</DialogTitle>
                <DialogDescription className="text-zinc-500">
                  Configure your payment terms. We'll generate a secure URI for you.
                </DialogDescription>
              </DialogHeader>
           </div>

          <form onSubmit={handleCreate} className="p-8 pt-0 space-y-6">
            <div className="space-y-5">
                <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 px-1">Internal Title</label>
                    <input
                        type="text"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        placeholder="e.g. Design System Consultation"
                        required
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3.5 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all focus:bg-zinc-900/80"
                    />
                </div>
                
                <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 px-1">Checkout Subtext</label>
                    <textarea
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        placeholder="What are they paying for? This appears on the page."
                        rows={2}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3.5 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all focus:bg-zinc-900/80 resize-none"
                    />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 px-1">Fixed Amount</label>
                        <input
                            type="number"
                            value={form.amount || ""}
                            onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })}
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
                            value={form.currency}
                            onChange={(e) => setForm({ ...form, currency: e.target.value })}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3.5 text-sm font-bold text-white focus:outline-none focus:border-indigo-500/50 transition-all appearance-none cursor-pointer"
                        >
                            <option value="NGN">NGN (₦)</option>
                            <option value="USD">USD ($)</option>
                            <option value="GHS">GHS (₵)</option>
                            <option value="KES">KES (KSh)</option>
                        </select>
                    </div>
                </div>
            </div>

            <div className="flex gap-4 pt-4 border-t border-zinc-900">
               <button 
                type="button"
                onClick={() => setShowCreate(false)}
                className="flex-1 py-4 text-sm font-bold text-zinc-500 hover:text-white transition-colors"
                >
                Discard
              </button>
              <button
                type="submit"
                disabled={creating}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 rounded-2xl font-bold py-4 text-white shadow-xl shadow-indigo-600/20 active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {creating ? <Loader2 size={18} className="animate-spin" /> : <><Plus size={18} /> Deploy Link</>}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!linkToDeactivate}
        onOpenChange={(open) => !open && setLinkToDeactivate(null)}
        title="Cease Distribution?"
        description="Customers with this URI will no longer be able to complete checkout. This change propagates instantly across our edge nodes."
        confirmLabel="Deactivate Link"
        variant="destructive"
        loading={deactivating}
        onConfirm={handleDeactivate}
      />
    </div>
  );
}
