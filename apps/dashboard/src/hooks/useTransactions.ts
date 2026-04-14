import { useState, useEffect, useCallback, useMemo } from "react";
import { payments, dashboard } from "@/lib/api";
import { toast } from "sonner";
import type { Transaction, ChargeRequest } from "@/lib/types";

export function useTransactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [copied, setCopied] = useState("");
  const [selected, setSelected] = useState<Transaction | null>(null);
  
  const [refunding, setRefunding] = useState(false);
  const [confirmRefundOpen, setConfirmRefundOpen] = useState(false);
  
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createdTx, setCreatedTx] = useState<{ reference: string; authorization_url: string } | null>(null);
  
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [advFilters, setAdvFilters] = useState({
    provider: "all",
    currency: "all",
    minAmount: "",
    maxAmount: "",
  });

  
  const [stats, setStats] = useState<{ total_volume: Record<string, number>; total_count: number; failure_rate: number } | null>(null);
  const perPage = 20;

  const [form, setForm] = useState<ChargeRequest>({
    amount: 0,
    currency: "NGN",
    email: "",
    provider: "paystack",
  });

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: perPage };
      if (filter !== "all") params.status = filter;
      if (advFilters.provider !== "all") params.provider = advFilters.provider;
      if (advFilters.currency !== "all") params.currency = advFilters.currency;
      
      // Fetch both transactions and stats
      const [data, overviewStats] = await Promise.all([
        payments.listTransactions(params),
        dashboard.getOverviewStats()
      ]);
      
      let txs = data?.items || [];
      if (advFilters.minAmount) {
        txs = txs.filter((t: any) => (t.amount / 100) >= parseFloat(advFilters.minAmount));
      }
      if (advFilters.maxAmount) {
        txs = txs.filter((t: any) => (t.amount / 100) <= parseFloat(advFilters.maxAmount));
      }

      setTransactions(txs);
      setTotal(data?.total || 0);
      setStats(overviewStats);
    } catch (err: any) {
      console.error("Failed to load transactions:", err);
      setTransactions([]);
      setTotal(0);
      toast.error("Failed to load transactions. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [page, filter, advFilters]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  const filteredTransactions = useMemo(() => {
    if (!searchQuery) return transactions;
    const q = searchQuery.toLowerCase();
    return transactions.filter(t => 
      t.reference.toLowerCase().includes(q) || 
      t.email?.toLowerCase().includes(q)
    );
  }, [transactions, searchQuery]);

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
      console.error("Refund failed:", err);
      toast.error("Refund request failed. Please try again.");
    } finally {
      setRefunding(false);
    }
  };

  const handleCreateTransaction = async () => {
    if (!form.email || form.amount <= 0) {
      toast.error("Please provide a valid email and amount.");
      return;
    }
    setCreating(true);
    try {
      const response = await payments.charge({
        ...form,
        amount: Math.round(form.amount * 100),
      });
      setCreatedTx({
        reference: response.reference,
        authorization_url: response.authorization_url,
      });
      toast.success("Payment initialized successfully.");
      await loadTransactions();
    } catch (err: any) {
      console.error("Payment initialization failed:", err);
      toast.error("Failed to initialize payment. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  const resetCreateForm = () => {
    setForm({ amount: 0, currency: "NGN", email: "", provider: "paystack" });
    setCreatedTx(null);
    setCreateModalOpen(false);
  };

  return {
      transactions,
      loading,
      filter,
      setFilter,
      searchQuery,
      setSearchQuery,
      page,
      setPage,
      total,
      perPage,
      copied,
      setCopied,
      selected,
      setSelected,
      refunding,
      confirmRefundOpen,
      setConfirmRefundOpen,
      createModalOpen,
      setCreateModalOpen,
      creating,
      createdTx,
      filterSheetOpen,
      setFilterSheetOpen,
      advFilters,
      setAdvFilters,
      form,
      setForm,
      filteredTransactions,
      handleRefund,
      handleCreateTransaction,
      resetCreateForm,
      stats
  };
}
