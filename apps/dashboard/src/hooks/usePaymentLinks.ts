import { useState, useEffect, useCallback } from "react";
import { dashboard } from "@/lib/api";
import { toast } from "sonner";
import type { PaymentLink, CreatePaymentLinkRequest } from "@/lib/types";
import { copyToClipboard } from "@/lib/formatters";

/** Checkout URL base: API origin + checkout path */
const CHECKOUT_BASE = `${import.meta.env.VITE_API_URL}/api/v1/checkout`;

export function usePaymentLinks() {
  const [links, setLinks] = useState<PaymentLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState("");
  
  const [linkToDeactivate, setLinkToDeactivate] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  const [linkToDelete, setLinkToDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  

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
      setLinks(Array.isArray(data) ? data : (data as any)?.items || []);
    } catch (err: any) {
      console.error("Failed to load payment links:", err);
      setLinks([]);
      toast.error("Couldn't load payment links. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLinks();
  }, [loadLinks]);

  /** Build the shareable checkout URL for a link */
  const getCheckoutUrl = (link: PaymentLink) =>
    `${CHECKOUT_BASE}/${link.slug || link.id}`;

  /** Copy checkout URL to clipboard */
  const handleCopyLink = async (link: PaymentLink) => {
    const url = getCheckoutUrl(link);
    const ok = await copyToClipboard(url);
    if (ok) {
      setCopied(link.id);
      toast.success("Link copied to clipboard.");
      setTimeout(() => setCopied(""), 2000);
    } else {
      toast.error("Failed to copy link.");
    }
  };

  /** Open checkout URL in a new tab */
  const handleOpenLink = (link: PaymentLink) => {
    window.open(getCheckoutUrl(link), "_blank");
  };

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
      toast.success("Payment link created.");
      await loadLinks();
    } catch (err: any) {
      console.error("Failed to create payment link:", err);
      toast.error("Failed to create payment link. Please try again.");
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
      console.error("Failed to deactivate link:", err);
      toast.error("Failed to deactivate payment link.");
    } finally {
      setDeactivating(false);
    }
  };

  const handleDelete = async () => {
    if (!linkToDelete) return;
    setDeleting(true);
    try {
      await dashboard.deletePaymentLink(linkToDelete);
      toast.success("Payment link deleted.");
      setLinkToDelete(null);
      await loadLinks();
    } catch (err: any) {
      console.error("Failed to delete link:", err);
      toast.error("Failed to delete payment link.");
    } finally {
      setDeleting(false);
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
    linkToDelete,
    setLinkToDelete,
    deleting,
    form,
    setForm,
    handleCreate,
    handleDeactivate,
    handleDelete,
    getCheckoutUrl,
    handleCopyLink,
    handleOpenLink
  };
}
