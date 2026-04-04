import { useState, useEffect, useCallback, useMemo } from "react";
import { payments } from "@/lib/api";
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
      
      const data = await payments.listTransactions(params);
      
      let txs = data.transactions || [];
      if (advFilters.minAmount) {
        txs = txs.filter((t: any) => (t.amount / 100) >= parseFloat(advFilters.minAmount));
      }
      if (advFilters.maxAmount) {
        txs = txs.filter((t: any) => (t.amount / 100) <= parseFloat(advFilters.maxAmount));
      }

      setTransactions(txs);
      setTotal(data.total || 0);
    } catch (err: any) {
      console.error("Ledger Sync Failure:", err);
      setTransactions([]);
      setTotal(0);
      toast.error("Gateway unstable. Reverts to local cache.");
    } finally {
      setLoading(false);
    }
  }, [page, filter, advFilters, toast]);

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
      console.error("Refund Action Denied:", err);
      toast.error("Reversal request blocked by provider gateway.");
    } finally {
      setRefunding(false);
    }
  };

  const handleCreateTransaction = async () => {
    if (!form.email || form.amount <= 0) {
      toast.error("Insufficient customer data to open vector.");
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
      toast.success("Flow initialized successfully.");
      await loadTransactions();
    } catch (err: any) {
      console.error("Flow Initialization Failed:", err);
      toast.error("Gateway node unresponsive. Please retry.");
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
      resetCreateForm
  };
}
