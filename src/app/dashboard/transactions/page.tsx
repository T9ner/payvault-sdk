"use client";

import { useEffect, useState, useCallback } from "react";
import { payments } from "@/lib/api";
import { formatCurrency, formatDate, copyToClipboard } from "@/lib/formatters";
import type { Transaction, TransactionStatus } from "@/lib/types";
import {
  ArrowLeftRight,
  Search,
  Filter,
  Copy,
  Check,
  RotateCcw,
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const statusColors: Record<string, string> = {
  success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  pending: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  failed: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400",
  refunded: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
};

const statusFilters: { label: string; value: string }[] = [
  { label: "All", value: "" },
  { label: "Success", value: "success" },
  { label: "Pending", value: "pending" },
  { label: "Failed", value: "failed" },
  { label: "Refunded", value: "refunded" },
];

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);
  const [refunding, setRefunding] = useState(false);
  const [copied, setCopied] = useState("");
  const perPage = 20;

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await payments.listTransactions({
        page,
        limit: perPage,
        status: statusFilter || undefined,
      });
      setTransactions(Array.isArray(data) ? data : []);
    } catch {
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  const handleRefund = async (reference: string) => {
    if (!confirm("Are you sure you want to refund this transaction?")) return;
    setRefunding(true);
    try {
      await payments.refund({ reference });
      await loadTransactions();
      setSelectedTxn(null);
    } catch {
      alert("Refund failed. Please try again.");
    } finally {
      setRefunding(false);
    }
  };

  const handleCopy = async (text: string, id: string) => {
    await copyToClipboard(text);
    setCopied(id);
    setTimeout(() => setCopied(""), 2000);
  };

  const filtered = transactions.filter((txn) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      txn.reference.toLowerCase().includes(q) ||
      txn.customer_email.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          View and manage all payment transactions
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative max-w-sm flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]"
          />
          <input
            type="text"
            placeholder="Search by reference or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 w-full rounded-lg border bg-transparent pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
          />
        </div>

        {/* Status filter tabs */}
        <div className="flex items-center gap-1 rounded-lg border p-1">
          <Filter size={14} className="ml-2 text-[hsl(var(--muted-foreground))]" />
          {statusFilters.map((sf) => (
            <button
              key={sf.value}
              onClick={() => {
                setStatusFilter(sf.value);
                setPage(1);
              }}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                statusFilter === sf.value
                  ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                  : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"
              }`}
            >
              {sf.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-[hsl(var(--card))]">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--muted-foreground))]" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-[hsl(var(--muted-foreground))]">
              <ArrowLeftRight size={36} className="mb-3 opacity-30" />
              <p className="text-sm">No transactions found</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b text-left text-xs font-medium text-[hsl(var(--muted-foreground))]">
                  <th className="px-6 py-3">Reference</th>
                  <th className="px-6 py-3">Customer</th>
                  <th className="px-6 py-3">Provider</th>
                  <th className="px-6 py-3">Amount</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((txn) => (
                  <tr
                    key={txn.id}
                    className="cursor-pointer border-b last:border-0 transition-colors hover:bg-[hsl(var(--accent))]/50"
                    onClick={() => setSelectedTxn(txn)}
                  >
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm">
                          {txn.reference.slice(0, 16)}...
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopy(txn.reference, txn.id);
                          }}
                          className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                        >
                          {copied === txn.id ? (
                            <Check size={14} className="text-emerald-500" />
                          ) : (
                            <Copy size={14} />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-sm">{txn.customer_email}</td>
                    <td className="px-6 py-3 text-sm capitalize">{txn.provider}</td>
                    <td className="px-6 py-3 text-sm font-medium">
                      {formatCurrency(txn.amount, txn.currency)}
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[txn.status]}`}
                      >
                        {txn.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-sm text-[hsl(var(--muted-foreground))]">
                      {formatDate(txn.created_at)}
                    </td>
                    <td className="px-6 py-3">
                      {txn.status === "success" && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRefund(txn.reference);
                          }}
                          className="rounded-md px-2 py-1 text-xs font-medium text-[hsl(var(--destructive))] hover:bg-red-50 dark:hover:bg-red-950"
                        >
                          <RotateCcw size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {!loading && filtered.length > 0 && (
          <div className="flex items-center justify-between border-t px-6 py-3">
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Page {page}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="rounded-md p-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] disabled:opacity-30"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setPage(page + 1)}
                disabled={transactions.length < perPage}
                className="rounded-md p-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] disabled:opacity-30"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Transaction Detail Modal */}
      {selectedTxn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-[hsl(var(--card))] shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h3 className="font-semibold">Transaction Details</h3>
              <button
                onClick={() => setSelectedTxn(null)}
                className="rounded-md p-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4 px-6 py-4">
              <DetailRow label="Reference" value={selectedTxn.reference} mono />
              <DetailRow label="Customer" value={selectedTxn.customer_email} />
              <DetailRow label="Provider" value={selectedTxn.provider} />
              <DetailRow
                label="Amount"
                value={formatCurrency(selectedTxn.amount, selectedTxn.currency)}
              />
              <DetailRow
                label="Status"
                value={selectedTxn.status}
                badge
              />
              <DetailRow label="Created" value={formatDate(selectedTxn.created_at)} />
              <DetailRow label="Updated" value={formatDate(selectedTxn.updated_at)} />
            </div>
            {selectedTxn.status === "success" && (
              <div className="border-t px-6 py-4">
                <button
                  onClick={() => handleRefund(selectedTxn.reference)}
                  disabled={refunding}
                  className="flex h-9 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {refunding ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <RotateCcw size={14} />
                      Refund Transaction
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
  badge,
}: {
  label: string;
  value: string;
  mono?: boolean;
  badge?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-[hsl(var(--muted-foreground))]">{label}</span>
      {badge ? (
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[value] || ""}`}
        >
          {value}
        </span>
      ) : (
        <span className={`text-sm font-medium ${mono ? "font-mono" : ""}`}>{value}</span>
      )}
    </div>
  );
}
