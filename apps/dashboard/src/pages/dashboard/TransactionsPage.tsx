import { useEffect, useState, useRef } from "react";
import { payments } from "@/lib/api";
import { formatCurrency, formatDate, copyToClipboard } from "@/lib/formatters";
import type { Transaction } from "@/lib/types";
import {
  ArrowLeftRight,
  Copy,
  Check,
  RotateCcw,
} from "lucide-react";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between py-3">
      <span className="text-sm text-[hsl(var(--muted-foreground))]">{label}</span>
      <span className="text-sm font-medium text-right max-w-[60%] break-all">{value}</span>
    </div>
  );
}

const statusTabs = ["all", "success", "pending", "failed", "refunded"];

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
  
  const { toast } = useToast();
  const perPage = 20;
  const hasFetched = useRef(false);

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
    if (!hasFetched.current) {
      hasFetched.current = true;
    }
    loadTransactions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    } catch {
      toast.error("Refund failed to process.");
    } finally {
      setRefunding(false);
    }
  };

  const columns: ColumnDef<Transaction>[] = [
    {
      header: "Reference",
      accessorKey: (row) => (
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs">{row.reference.slice(0, 16)}...</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCopy(row.reference, row.id);
            }}
            className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
            title="Copy reference"
          >
            {copied === row.id ? (
              <Check size={14} className="text-emerald-500" />
            ) : (
              <Copy size={14} />
            )}
          </button>
        </div>
      ),
    },
    { header: "Customer", accessorKey: "email" },
    {
      header: "Amount",
      accessorKey: (row) => <span className="font-medium">{formatCurrency(row.amount, row.currency)}</span>,
    },
    {
      header: "Provider",
      accessorKey: (row) => <span className="capitalize">{row.provider}</span>,
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
        title="Transactions"
        description="View and manage all payment transactions"
      />

      {/* Status Filter Tabs */}
      <div className="flex w-fit gap-1 rounded-lg border bg-[hsl(var(--card))] p-1">
        {statusTabs.map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setFilter(tab);
              setPage(1);
            }}
            className={`rounded-md px-4 py-1.5 text-xs font-medium capitalize transition-colors duration-150 ${
              filter === tab
                ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-sm"
                : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))]"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={transactions}
        loading={loading}
        emptyIcon={ArrowLeftRight}
        emptyTitle="No transactions found"
        emptyDescription={filter === "all" ? "You haven't processed any payments yet." : `No partial matches found for ${filter} transactions.`}
        pagination={{
          page,
          total,
          limit: perPage,
          onPageChange: (newPage) => setPage(newPage),
        }}
        onRowClick={(row) => setSelected(row)}
      />

      {/* Transaction Detail Slide-over */}
      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent side="right" className="w-[400px] sm:w-[500px] overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>Transaction Details</SheetTitle>
            <SheetDescription>
              View detailed information and manage this transaction.
            </SheetDescription>
          </SheetHeader>
          
          {selected && (
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-1 items-center justify-center p-6 border rounded-xl bg-[hsl(var(--muted))]/50">
                <StatusBadge status={selected.status} className="mb-2" />
                <span className="text-3xl font-bold">{formatCurrency(selected.amount, selected.currency)}</span>
                <span className="text-sm text-[hsl(var(--muted-foreground))]">{selected.email}</span>
              </div>
              
              <div className="rounded-xl border bg-[hsl(var(--card))] divide-y p-4 px-6 shadow-sm">
                <DetailRow label="Reference" value={selected.reference} />
                <DetailRow label="Provider" value={selected.provider.toUpperCase()} />
                <DetailRow label="Created At" value={formatDate(selected.created_at)} />
                <DetailRow label="Last Updated" value={formatDate(selected.updated_at)} />
              </div>

              {selected.status === "success" && (
                <div className="mt-4 border-t pt-6">
                  <button
                    onClick={() => setConfirmRefundOpen(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-900/20"
                  >
                    <RotateCcw size={16} />
                    Refund Transaction
                  </button>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirmRefundOpen}
        onOpenChange={setConfirmRefundOpen}
        title="Refund Transaction"
        description={`Are you sure you want to refund ${
          selected ? formatCurrency(selected.amount, selected.currency) : ""
        } to the customer? This action cannot be undone.`}
        confirmLabel="Process Refund"
        variant="destructive"
        loading={refunding}
        onConfirm={handleRefund}
      />
    </div>
  );
}
