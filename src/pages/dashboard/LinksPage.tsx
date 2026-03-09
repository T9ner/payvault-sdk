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
  X,
} from "lucide-react";

export default function PaymentLinksPage() {
  const [links, setLinks] = useState<PaymentLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState("");
  const [form, setForm] = useState<CreatePaymentLinkRequest>({
    name: "",
    description: "",
    amount: 0,
    currency: "NGN",
  });

  const checkoutBase =
    import.meta.env.VITE_API_URL || "";

  const loadLinks = async () => {
    setLoading(true);
    try {
      const data = await dashboard.listPaymentLinks();
      setLinks(Array.isArray(data) ? data : []);
    } catch {
      setLinks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLinks();
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
      await loadLinks();
    } catch {
      alert("Failed to create payment link");
    } finally {
      setCreating(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    if (!confirm("Deactivate this payment link?")) return;
    try {
      await dashboard.deactivatePaymentLink(id);
      await loadLinks();
    } catch {
      alert("Failed to deactivate link");
    }
  };

  const handleCopy = async (text: string, id: string) => {
    await copyToClipboard(text);
    setCopied(id);
    setTimeout(() => setCopied(""), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Payment Links</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Create and manage shareable payment links
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex h-9 items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 text-sm font-medium text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90"
        >
          <Plus size={16} />
          Create Link
        </button>
      </div>

      {/* Links Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--muted-foreground))]" />
        </div>
      ) : links.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border bg-[hsl(var(--card))] py-16">
          <Link2 size={40} className="mb-3 text-[hsl(var(--muted-foreground))] opacity-30" />
          <p className="text-sm text-[hsl(var(--muted-foreground))]">No payment links yet</p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Create your first payment link to start collecting payments</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {links.map((link) => {
            const url = `${checkoutBase}/api/v1/checkout/${link.slug}`;
            return (
              <div
                key={link.id}
                className={`rounded-xl border bg-[hsl(var(--card))] p-5 transition-shadow hover:shadow-md ${
                  !link.active ? "opacity-60" : ""
                }`}
              >
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <h3 className="font-medium">{link.name}</h3>
                    <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                      {link.description}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      link.active
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                        : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
                    }`}
                  >
                    {link.active ? "Active" : "Inactive"}
                  </span>
                </div>

                <p className="mb-4 text-2xl font-semibold tracking-tight">
                  {formatCurrency(link.amount, link.currency)}
                </p>

                {/* Link URL */}
                <div className="mb-3 flex items-center gap-2 rounded-lg bg-[hsl(var(--accent))] px-3 py-2">
                  <code className="flex-1 truncate text-xs">{url}</code>
                  <button
                    onClick={() => handleCopy(url, link.id)}
                    className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                  >
                    {copied === link.id ? (
                      <Check size={14} className="text-emerald-500" />
                    ) : (
                      <Copy size={14} />
                    )}
                  </button>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                  >
                    <ExternalLink size={14} />
                  </a>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">
                    Created {formatDate(link.created_at)}
                  </span>
                  {link.active && (
                    <button
                      onClick={() => handleDeactivate(link.id)}
                      className="rounded-md p-1 text-[hsl(var(--muted-foreground))] hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-[hsl(var(--card))] shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h3 className="font-semibold">Create Payment Link</h3>
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-md p-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4 px-6 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Premium Plan Payment"
                  required
                  className="flex h-10 w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="One-time payment for premium features"
                  rows={2}
                  className="flex w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
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
                    className="flex h-10 w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Currency</label>
                  <select
                    value={form.currency}
                    onChange={(e) => setForm({ ...form, currency: e.target.value })}
                    className="flex h-10 w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                  >
                    <option value="NGN">NGN</option>
                    <option value="USD">USD</option>
                    <option value="GHS">GHS</option>
                    <option value="KES">KES</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="h-9 rounded-lg border px-4 text-sm font-medium transition-colors hover:bg-[hsl(var(--accent))]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex h-9 items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 text-sm font-medium text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
