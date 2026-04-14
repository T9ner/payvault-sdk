import { useState, useEffect } from "react";
import { dashboard } from "@/lib/api";
import { toast } from "sonner";
import type { APIKey } from "@/lib/types";

export function useSystemSettings() {
  const [apiKey, setApiKey] = useState<APIKey | null>(null);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const [provider, setProvider] = useState<"paystack" | "flutterwave">("paystack");
  const [secretKey, setSecretKey] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [savingProvider, setSavingProvider] = useState(false);

  const [apiKeys, setApiKeys] = useState<APIKey[]>([]);

  const fetchKeys = async () => {
    try {
      const keys = await dashboard.listAPIKeys();
      setApiKeys(keys || []);
    } catch (err: any) {
      console.error("Failed to load API keys:", err);
    }
  };


  useEffect(() => {
    fetchKeys();
  }, []);

  const handleGenerateKey = async () => {
    if (
      apiKeys.length > 0 &&
      !confirm(
        "Generating a new API key will invalidate your current one. Any application using the old key will lose access. Continue?"
      )
    ) {
      return;
    }

    setGeneratingKey(true);
    try {
      const key = await dashboard.generateAPIKey();
      setApiKey(key);
      setShowKey(true);
      await fetchKeys();
      toast.success("API key generated successfully.");
    } catch (err: any) {
      console.error("Failed to generate API key:", err);
      toast.error("Failed to generate API key. Please try again.");
    } finally {
      setGeneratingKey(false);
    }
  };

  const handleSaveProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProvider(true);
    try {
      await dashboard.saveProviderCredentials({
        provider,
        secret_key: secretKey,
      });
      setSecretKey("");
      toast.success("Provider credentials saved.");
    } catch (err: any) {
      console.error("Failed to save provider credentials:", err);
      toast.error("Failed to save credentials. Please try again.");
    } finally {
      setSavingProvider(false);
    }
  };

  return {
    apiKey,
    generatingKey,
    keyCopied,
    setKeyCopied,
    showKey,
    setShowKey,
    provider,
    setProvider,
    secretKey,
    setSecretKey,
    showSecret,
    setShowSecret,
    savingProvider,
    handleGenerateKey,
    handleSaveProvider,
    apiKeys
  };
}
