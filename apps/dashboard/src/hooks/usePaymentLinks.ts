import { useState, useEffect, useCallback } from "react";
import { dashboard } from "@/lib/api";
import { toast } from "sonner";
import type { PaymentLink, CreatePaymentLinkRequest } from "@/lib/types";

export function usePaymentLinks() {
  const [links, setLinks] = useState<PaymentLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState("");
  
  const [linkToDeactivate, setLinkToDeactivate] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  
  

  const [form, setForm] = useState<CreatePaymentLinkRequest>({
    name: "",
    description: "",
    amount: 0,
    currency: "NGN",
  });

  const loadLinks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await dashboard.listPaymentLinks();
      setLinks(Array.isArray(data) ? data : (data as any)?.links || []);
    } catch (err: any) {
      console.error("Vector Registry Load Error:", err);
      setLinks([]);
      toast.error("Distribution nodes unreachable. Retrying quietly.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadLinks();
  }, [loadLinks]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await dashboard.createPaymentLink({
        ...form,
        amount: Math.round(form.amount * 100),
      });
      setShowCreate(false);
      setForm({ name: "", description: "", amount: 0, currency: "NGN" });
      toast.success("Deployment successful. Vector active.");
      await loadLinks();
    } catch (err: any) {
      console.error("Vector Deployment Sequence Failed:", err);
      toast.error("Failed to propagate payment vector. Verification needed.");
    } finally {
      setCreating(false);
    }
  };

  const handleDeactivate = async () => {
    if (!linkToDeactivate) return;
    setDeactivating(true);
    try {
      await dashboard.deactivatePaymentLink(linkToDeactivate);
      toast.success("Vector distribution terminated.");
      setLinkToDeactivate(null);
      await loadLinks();
    } catch (err: any) {
      console.error("Vector Teardown Error:", err);
      toast.error("Termination request timed out.");
    } finally {
      setDeactivating(false);
    }
  };

  return {
      links,
      loading,
      showCreate,
      setShowCreate,
      creating,
      copied,
      setCopied,
      linkToDeactivate,
      setLinkToDeactivate,
      deactivating,
      form,
      setForm,
      handleCreate,
      handleDeactivate
  };
}
