import { useEffect, useState, useRef } from "react";
import { payments } from "@/lib/api";
import { formatCurrency, formatDate, copyToClipboard } from "@/lib/formatters";
import type { Transaction, ChargeRequest } from "@/lib/types";
import {
  ArrowLeftRight,
  Copy,
  Check,
  RotateCcw,
  Plus,
  ExternalLink,
  Loader2,
  Filter,
  Search,
  MoreHorizontal,
  ChevronRight,
  ChevronLeft,
  X,
  CreditCard as CardIcon,
  DollarSign,
  ArrowRight
} from "lucide-react";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

function DetailRow({ label, value, icon: Icon }: { label: string; value: string; icon?: any }) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-zinc-800/50 last:border-0 group">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-3.5 w-3.5 text-zinc-500 group-hover:text-indigo-400 transition-colors" />}
        <span className="text-sm text-zinc-400 group-hover:text-zinc-300 transition-colors">{label}</span>
      </div>
      <span className="text-sm font-medium text-zinc-100 text-right max-w-[60%] truncate">{value}</span>
    </div>
  );
}

const statusTabs = [
  { value: "all", label: "All" },
  { value: "success", label: "Success" },
  { value: "pending", label: "Pending" },
  { value: "failed", label: "Failed" },
  { value: "refunded", label: "Refunded" },
];

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [copied, setCopied] = useState("");
  const [selected, setSelected] = useState<Transaction | null>(null);
  
  const [refunding, setRefunding] = useState(false);
  const [confirmRefundOpen, setConfirmRefundOpen] = useState(false);
  
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createdTx, setCreatedTx] = useState<{ reference: string; authorization_url: string } | null>(null);
  
  const { toast } = useToast();
  const perPage = 20;
  const hasFetched = useRef(false);
  
  const [form, setForm] = useState<ChargeRequest>({
    amount: 0,
    currency: "NGN",
    email: "",
    provider: "paystack",
  });

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const params: { page: number; limit: number; status?: string } = {
        page,
        limit: perPage,
      };
      if (filter !== "all") params.status = filter;
      const data = await payments.listTransactions(params);
      setTransactions(data.transactions || []);
      setTotal(data.total || 0);
    } catch {
      setTransactions([]);
      setTotal(0);
      toast.error("Failed to load transactions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTransactions();
  }, [page, filter]);

  const handleCopy = async (text: string, id: string) => {
    await copyToClipboard(text);
    setCopied(id);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(""), 2000);
  };

  const handleRefund = async () => {
    if (!selected) return;
    setRefunding(true);
    try {
      await payments.refund({ reference: selected.reference });
      toast.success("Refund processed successfully.");
      setConfirmRefundOpen(false);
      setSelected(null);
      await loadTransactions();
    } catch (err: any) {
      toast.error(err.message || "Failed to process refund.");
    } finally {
      setRefunding(false);
    }
  };

  const handleCreateTransaction = async () => {
    if (!form.email || form.amount <= 0) {
      toast.error("Please fill in all required fields.");
      return;
    }
    setCreating(true);
    try {
      const response = await payments.charge({
        ...form,
        amount: Math.round(form.amount * 100), // Convert to kobo
      });
      setCreatedTx({
        reference: response.reference,
        authorization_url: response.authorization_url,
      });
      toast.success("Transaction created! Ready for payment.");
      await loadTransactions();
    } catch (err: any) {
      toast.error(err.message || "Failed to create transaction.");
    } finally {
      setCreating(false);
    }
  };

  const resetCreateForm = () => {
    setForm({
      amount: 0,
      currency: "NGN",
      email: "",
      provider: "paystack",
    });
    setCreatedTx(null);
    setCreateModalOpen(false);
  };

  const columns: ColumnDef<Transaction>[] = [
    {
      header: "Reference",
      accessorKey: (row) => (
        <div className="flex items-center gap-2 group/ref">
          <span className="font-mono text-[11px] text-zinc-400 group-hover/ref:text-zinc-200 transition-colors">{row.reference.slice(0, 12)}...</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCopy(row.reference, row.id);
            }}
            className="opacity-0 group-hover/ref:opacity-100 text-zinc-500 hover:text-indigo-400 transition-all p-1 hover:bg-zinc-800 rounded"
            title="Copy reference"
          >
            {copied === row.id ? (
              <Check size={12} className="text-emerald-500" />
            ) : (
              <Copy size={12} />
            )}
          </button>
        </div>
      ),
    },
    { header: "Customer Email", accessorKey: "email", cellClassName: "font-medium text-zinc-200" },
    {
      header: "Amount",
      accessorKey: (row) => <span className="font-bold text-white">{formatCurrency(row.amount, row.currency)}</span>,
    },
    {
      header: "Gateway",
      accessorKey: (row) => <span className="capitalize text-zinc-400 text-xs px-2 py-1 bg-zinc-800 rounded-md border border-zinc-700/50">{row.provider}</span>,
    },
    {
      header: "Status",
      accessorKey: (row) => <StatusBadge status={row.status} className="scale-90" />,
    },
    {
      header: "Timestamp",
      accessorKey: (row) => <span className="text-zinc-500 text-xs">{formatDate(row.created_at)}</span>,
    },
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
           <div className="flex items-center gap-2 text-indigo-400 mb-1">
              <ArrowLeftRight className="h-4 w-4" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Payment History</span>
           </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Transactions</h1>
          <p className="text-zinc-400 mt-1">Manage and track your global payment activity.</p>
        </div>
        
        <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-400 hover:text-white hover:border-zinc-700 transition font-medium text-sm">
                <Filter className="h-4 w-4" />
                Advanced Filters
            </button>
            <button 
                onClick={() => setCreateModalOpen(true)}
                className="flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-600/20 active:scale-[0.98]"
            >
                <Plus className="h-4 w-4" />
                New Payment
            </button>
        </div>
      </div>

      <SpotlightCard className="p-0 overflow-hidden border-zinc-800/50 flex flex-col min-h-[600px]">
        {/* Table Header / Tabs */}
        <div className="flex flex-col sm:flex-row items-center justify-between p-6 bg-zinc-900/30 border-b border-zinc-800/50 gap-4">
            <div className="flex bg-zinc-950/50 border border-zinc-800 p-1 rounded-xl w-full sm:w-fit overflow-x-auto no-scrollbar">
                {statusTabs.map((tab) => (
                    <button
                        key={tab.value}
                        onClick={() => { setFilter(tab.value); setPage(1); }}
                        className={cn(
                            "relative px-5 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap",
                            filter === tab.value ? "text-white" : "text-zinc-500 hover:text-zinc-300"
                        )}
                    >
                        {filter === tab.value && (
                            <motion.div
                                layoutId="status-toggle"
                                className="absolute inset-0 bg-zinc-800 rounded-lg shadow-inner -z-0"
                                transition={{ type: "spring", bounce: 0.1, duration: 0.4 }}
                            />
                        )}
                        <span className="relative z-10">{tab.label}</span>
                    </button>
                ))}
            </div>
            
            <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <input 
                    type="text" 
                    placeholder="Search by reference or email" 
                    className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl py-2 pl-10 pr-4 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500/50 transition-colors"
                />
            </div>
        </div>

        <div className="flex-1 overflow-x-auto">
            <DataTable
                columns={columns}
                data={transactions}
                loading={loading}
                emptyIcon={ArrowLeftRight}
                emptyTitle="No transactions found"
                emptyDescription={filter === "all" ? "You haven't processed any payments yet." : `No matches for '${filter}' status filter.`}
                pagination={{
                    page,
                    total,
                    limit: perPage,
                    onPageChange: (newPage) => setPage(newPage),
                }}
                onRowClick={(row) => setSelected(row)}
                className="border-none"
            />
        </div>
      </SpotlightCard>

      {/* Detail Sheet */}
      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent side="right" className="w-[400px] sm:w-[500px] bg-zinc-950 border-l border-zinc-800 p-0 text-white flex flex-col">
          {selected && (
            <>
              <div className="p-8 border-b border-zinc-800/50">
                  <div className="flex justify-between items-center mb-10">
                      <div className="flex items-center gap-3">
                          <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                              <CardIcon className="h-5 w-5 text-indigo-400" />
                          </div>
                          <div>
                              <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">Transaction Record</p>
                              <h2 className="text-xl font-bold tracking-tight">Receipt Detail</h2>
                          </div>
                      </div>
                      <button onClick={() => setSelected(null)} className="p-2 hover:bg-zinc-900 rounded-full transition-colors">
                          <X className="h-5 w-5 text-zinc-500" />
                      </button>
                  </div>
                  
                  <div className="flex flex-col items-center py-8 rounded-3xl bg-zinc-900/40 border border-zinc-800 shadow-2xl">
                      <StatusBadge status={selected.status} className="mb-4 scale-110" />
                      <h3 className="text-4xl font-extrabold tracking-tight mb-1">{formatCurrency(selected.amount, selected.currency)}</h3>
                      <p className="text-zinc-500 font-medium text-sm">{selected.email}</p>
                  </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                  <div className="space-y-1 mb-8">
                      <DetailRow label="Transaction Reference" value={selected.reference} icon={Search} />
                      <DetailRow label="Processing Gateway" value={selected.provider.toUpperCase()} icon={Activity} />
                      <DetailRow label="Initiated At" value={formatDate(selected.created_at)} icon={RotateCcw} />
                      <DetailRow label="Settlement Date" value={formatDate(selected.updated_at || selected.created_at)} icon={Check} />
                      {selected.payment_method && <DetailRow label="Payment Method" value={selected.payment_method} icon={CardIcon} />}
                  </div>
                  
                  <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800 group cursor-default">
                      <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4 group-hover:text-indigo-400 transition-colors">Metadata & Audit</h4>
                      <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 font-mono text-[11px] text-zinc-400 break-all leading-relaxed whitespace-pre-wrap">
                          {JSON.stringify({
                             provider: selected.provider,
                             channel: selected.channel || "card",
                             currency: selected.currency,
                             environment: "production",
                             audit_id: selected.id
                          }, null, 2)}
                      </div>
                  </div>
              </div>

              <div className="p-8 border-t border-zinc-800/50 bg-zinc-950/80 backdrop-blur-md">
                {selected.status === "success" ? (
                  <button
                    onClick={() => setConfirmRefundOpen(true)}
                    className="flex w-full items-center justify-center gap-3 rounded-2xl bg-red-500/5 border border-red-500/20 py-4 text-sm font-bold text-red-500 hover:bg-red-500 hover:text-white transition-all shadow-lg active:scale-[0.98]"
                  >
                    <RotateCcw size={18} />
                    Initiate Partial/Full Refund
                  </button>
                ) : (
                    <button className="flex w-full items-center justify-center gap-3 rounded-2xl bg-zinc-900 border border-zinc-800 py-4 text-sm font-bold text-zinc-500 cursor-not-allowed">
                        Actions unavailable for this status
                    </button>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirmRefundOpen}
        onOpenChange={setConfirmRefundOpen}
        title="Approve Refund"
        description={`This will reverse ${selected ? formatCurrency(selected.amount, selected.currency) : ""} to the customer. This action is irreversible for PayVault clients.`}
        confirmLabel="Finalize Refund"
        variant="destructive"
        loading={refunding}
        onConfirm={handleRefund}
      />

      <Dialog open={createModalOpen} onOpenChange={(open) => !open && resetCreateForm()}>
        <DialogContent className="sm:max-w-[480px] bg-zinc-950 border-zinc-800 text-white p-0 overflow-hidden rounded-[2.5rem]">
           <div className="p-8 pb-4">
              <DialogHeader className="mb-6">
                 <div className="h-12 w-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-4">
                    <Plus className="h-6 w-6 text-indigo-400" />
                 </div>
                <DialogTitle className="text-2xl font-bold">New Transaction</DialogTitle>
                <DialogDescription className="text-zinc-500">
                  Initialize a manual charge. Ensure customer details are accurate.
                </DialogDescription>
              </DialogHeader>
           </div>
          
          {createdTx ? (
            <div className="p-8 pt-0 space-y-6">
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="rounded-[2rem] bg-emerald-500/5 border border-emerald-500/20 p-8 text-center">
                <div className="h-16 w-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/30">
                    <Check className="h-8 w-8 text-emerald-400" />
                </div>
                <p className="text-lg font-bold text-emerald-400 mb-1">Creation Successful</p>
                <p className="text-xs text-zinc-500 mb-8">Ref: <span className="font-mono text-emerald-500/70">{createdTx.reference}</span></p>
                
                <a
                  href={createdTx.authorization_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-emerald-500 px-6 py-4 text-sm font-extrabold text-white hover:bg-emerald-600 transition-all shadow-xl shadow-emerald-500/20"
                >
                  <ExternalLink size={18} />
                  Redirect to Checkout
                </a>
              </motion.div>
              <Button variant="ghost" onClick={resetCreateForm} className="w-full text-zinc-500 hover:text-white rounded-xl">
                Finish & Create New
              </Button>
            </div>
          ) : (
            <div className="p-8 pt-0 space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 px-1">Customer Email</label>
                    <div className="relative group">
                        <input
                            type="email"
                            value={form.email}
                            onChange={(e) => setForm({ ...form, email: e.target.value })}
                            placeholder="customer@billing.com"
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3.5 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all focus:bg-zinc-900/80"
                        />
                    </div>
                </div>
              
                <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 px-1">Amount (NGN)</label>
                    <div className="relative">
                        <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600" />
                        <input
                            type="number"
                            value={form.amount || ""}
                            onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })}
                            placeholder="0.00"
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl pl-10 pr-4 py-3.5 text-sm font-bold text-white focus:outline-none focus:border-indigo-500/50 transition-all"
                        />
                    </div>
                </div>
              
                <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 px-1">Preferred Gateway</label>
                    <select
                        value={form.provider}
                        onChange={(e) => setForm({ ...form, provider: e.target.value })}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3.5 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all"
                    >
                        <option value="paystack">Paystack Core</option>
                        <option value="flutterwave">Flutterwave Standard</option>
                    </select>
                </div>
              </div>
              
              <div className="flex gap-4 pt-4 border-t border-zinc-900">
                <Button variant="ghost" onClick={() => setCreateModalOpen(false)} className="flex-1 rounded-2xl font-bold text-zinc-500">
                  Cancel
                </Button>
                <Button onClick={handleCreateTransaction} disabled={creating} className="flex-1 bg-indigo-600 hover:bg-indigo-500 rounded-2xl font-bold py-6 shadow-xl shadow-indigo-600/20 active:scale-[0.98]">
                  {creating ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : (
                    "Authorize Payment"
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
