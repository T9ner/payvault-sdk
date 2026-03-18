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
      setLinks(Array.isArray(data) ? data : []);
    } catch {
      setLinks([]);
      toast.error("Failed to load payment links.");
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
    } catch {
      toast.error("Failed to create payment link.");
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
    } catch {
      toast.error("Failed to deactivate payment link.");
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
      header: "Name",
      accessorKey: (row) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.name}</span>
          <span className="text-xs text-[hsl(var(--muted-foreground))] truncate max-w-[200px]">
            {row.description}
          </span>
        </div>
      ),
    },
    {
      header: "Amount",
      accessorKey: (row) => (
        <span className="font-medium text-base">
          {formatCurrency(row.amount, row.currency)}
        </span>
      ),
    },
    {
      header: "URL Link",
      accessorKey: (row) => {
        const url = `${checkoutBase}/api/v1/checkout/${row.slug}`;
        return (
          <div className="flex items-center gap-2 rounded-md bg-[hsl(var(--accent))]/50 px-2 py-1 max-w-[220px]">
            <code className="flex-1 truncate text-xs text-[hsl(var(--muted-foreground))]">{url}</code>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleCopy(url, row.id);
              }}
              className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
              title="Copy link"
            >
              {copied === row.id ? (
                <Check size={14} className="text-emerald-500" />
              ) : (
                <Copy size={14} />
              )}
            </button>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
              onClick={(e) => e.stopPropagation()}
              title="Open link"
            >
              <ExternalLink size={14} />
            </a>
          </div>
        );
      },
    },
    {
      header: "Status",
      accessorKey: (row) => <StatusBadge status={row.active ? "active" : "inactive"} />,
    },
    {
      header: "Created",
      accessorKey: (row) => <span className="text-[hsl(var(--muted-foreground))]">{formatDate(row.created_at)}</span>,
    },
    {
      header: "Actions",
      className: "text-right",
      accessorKey: (row) => (
        row.active && (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setLinkToDeactivate(row.id);
            }}
            className="text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Deactivate"
          >
            <Trash2 size={16} />
          </Button>
        )
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payment Links"
        description="Create and manage shareable payment links"
        action={{
          label: "Create Link",
          icon: Plus,
          onClick: () => setShowCreate(true),
        }}
      />

      <DataTable
        columns={columns}
        data={links}
        loading={loading}
        emptyIcon={Link2}
        emptyTitle="Create your first payment link"
        emptyDescription="Start collecting payments quickly by sharing a secure payment link."
        emptyCTA={{
          label: "Create Payment Link",
          onClick: () => setShowCreate(true),
        }}
      />

      {/* Create Modal */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create Payment Link</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 pt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Premium Plan Payment"
                required
                className="flex h-10 w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="One-time payment for premium features"
                rows={2}
                className="flex w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Amount</label>
                <input
                  type="number"
                  value={form.amount || ""}
                  onChange={(e) =>
                    setForm({ ...form, amount: parseFloat(e.target.value) || 0 })
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
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  className="flex h-10 w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                >
                  <option value="NGN">NGN</option>
                  <option value="USD">USD</option>
                  <option value="GHS">GHS</option>
                  <option value="KES">KES</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={creating}
              >
                {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Link
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!linkToDeactivate}
        onOpenChange={(open) => !open && setLinkToDeactivate(null)}
        title="Deactivate Payment Link"
        description="Are you sure you want to deactivate this link? Customers will no longer be able to use it to make payments."
        confirmLabel="Deactivate"
        variant="destructive"
        loading={deactivating}
        onConfirm={handleDeactivate}
      />
    </div>
  );
}
